-- ADR 0003: migrate legacy data into the normalized schema.
--
-- Sources:
-- - shared_trips (JSON columns) → trips + child tables. Trip UUIDs are
--   PRESERVED, so existing trip_members / trip_invites rows stay valid.
-- - user_data.data (one JSON blob per user) → trips + child tables. Personal
--   trip IDs were deterministic strings ('destination|start|end'); they get
--   fresh UUIDs via a mapping table, and the owner gets a trip_members row
--   (a personal trip is just a trip with one member).
--
-- Dropped intentionally (ADR 0002): journal, photos, feed.
--
-- Runs in one transaction (supabase db push wraps each file). Verify with the
-- queries at the bottom before applying 20260706000002_drop_legacy.sql.

-- ─── Safe-cast helpers (bad legacy values become NULL, not errors) ───────────

create or replace function safe_date(t text) returns date
language plpgsql immutable as $$
begin
  return t::date;
exception when others then
  return null;
end;
$$;

create or replace function safe_timestamptz(t text) returns timestamptz
language plpgsql immutable as $$
begin
  return t::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function safe_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

create or replace function safe_numeric(t text) returns numeric
language plpgsql immutable as $$
begin
  return t::numeric;
exception when others then
  return null;
end;
$$;

-- ─── 1. Shared trips → trips (UUIDs preserved) ───────────────────────────────

insert into trips (id, destination, start_date, end_date, created_by, created_at, updated_at)
select
  s.id,
  coalesce(s.trip->>'destination', 'Trip'),
  safe_date(s.trip->>'startDate'),
  safe_date(s.trip->>'endDate'),
  s.owner_id,
  coalesce(safe_timestamptz(to_jsonb(s)->>'created_at'), now()),
  coalesce(safe_timestamptz(to_jsonb(s)->>'updated_at'), now())
from shared_trips s
on conflict (id) do nothing;

-- ─── 2. Rewire trip_members / trip_invites FKs → trips ──────────────────────

-- Drop whatever FK constraints currently point these tables at shared_trips
-- (names unknown — created via dashboard), remove any orphans, re-point at
-- trips. Membership data itself is preserved as-is.
do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class fref on fref.oid = con.confrelid
    where con.contype = 'f'
      and rel.relname in ('trip_members', 'trip_invites')
      and fref.relname = 'shared_trips'
  loop
    execute format('alter table %I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

delete from trip_members m where not exists (select 1 from trips t where t.id = m.trip_id);
delete from trip_invites i where not exists (select 1 from trips t where t.id = i.trip_id);

-- Defensive dedupe before the unique index (keeps the oldest row per pair).
delete from trip_members a using trip_members b
where a.trip_id = b.trip_id and a.user_id = b.user_id and a.ctid > b.ctid;

alter table trip_members
  add constraint trip_members_trip_id_fkey
  foreign key (trip_id) references trips(id) on delete cascade;
alter table trip_invites
  add constraint trip_invites_trip_id_fkey
  foreign key (trip_id) references trips(id) on delete cascade;

create unique index if not exists trip_members_trip_user_idx
  on trip_members(trip_id, user_id);

-- ─── 3. Personal trips → trips + owner membership ────────────────────────────

create temporary table tmp_trip_map (
  user_id uuid not null,
  old_id text not null,
  new_id uuid not null default gen_random_uuid(),
  primary key (user_id, old_id)
) on commit drop;

insert into tmp_trip_map (user_id, old_id)
select u.user_id, t->>'id'
from user_data u
cross join lateral jsonb_array_elements(coalesce(u.data->'trips', '[]'::jsonb)) t
where t->>'id' is not null;

insert into trips (id, destination, start_date, end_date, created_by)
select
  m.new_id,
  coalesce(t->>'destination', 'Trip'),
  safe_date(t->>'startDate'),
  safe_date(t->>'endDate'),
  u.user_id
from user_data u
cross join lateral jsonb_array_elements(coalesce(u.data->'trips', '[]'::jsonb)) t
join tmp_trip_map m on m.user_id = u.user_id and m.old_id = t->>'id';

insert into trip_members (trip_id, user_id, role, status)
select m.new_id, m.user_id, 'owner', 'accepted'
from tmp_trip_map m
on conflict do nothing;

-- ─── 4. Unified per-trip JSON source for child data ──────────────────────────

-- One (trip_id uuid, key jsonb-array) view of both legacy systems, so each
-- child migration below is written once.
create temporary table tmp_src (
  trip_id uuid not null,
  flights jsonb not null default '[]'::jsonb,
  itinerary jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  housing jsonb not null default '[]'::jsonb,
  settlements jsonb not null default '[]'::jsonb
) on commit drop;

insert into tmp_src (trip_id, flights, itinerary, expenses, housing, settlements)
select
  s.id,
  coalesce(s.flights, '[]'::jsonb),
  coalesce(s.itinerary, '[]'::jsonb),
  coalesce(s.expenses, '[]'::jsonb),
  coalesce(s.housing, '[]'::jsonb),
  coalesce(s.settlements, '[]'::jsonb)
from shared_trips s;

insert into tmp_src (trip_id, flights, itinerary, expenses, housing)
select
  m.new_id,
  coalesce(u.data->'flightsByTripId'->m.old_id, '[]'::jsonb),
  coalesce(u.data->'itineraryByTripId'->m.old_id, '[]'::jsonb),
  coalesce(u.data->'expensesByTripId'->m.old_id, '[]'::jsonb),
  coalesce(u.data->'housingByTripId'->m.old_id, '[]'::jsonb)
from tmp_trip_map m
join user_data u on u.user_id = m.user_id;

-- Legacy single-flight format (flightByTripId: { tripId: flight }): fold the
-- object into the flights array for affected trips.
update tmp_src ts
set flights = ts.flights || jsonb_build_array(u.data->'flightByTripId'->m.old_id)
from tmp_trip_map m
join user_data u on u.user_id = m.user_id
where ts.trip_id = m.new_id
  and jsonb_typeof(u.data->'flightByTripId'->m.old_id) = 'object';

-- Guard against per-trip values that aren't arrays (corrupt blobs).
update tmp_src set flights = '[]'::jsonb where jsonb_typeof(flights) <> 'array';
update tmp_src set itinerary = '[]'::jsonb where jsonb_typeof(itinerary) <> 'array';
update tmp_src set expenses = '[]'::jsonb where jsonb_typeof(expenses) <> 'array';
update tmp_src set housing = '[]'::jsonb where jsonb_typeof(housing) <> 'array';
update tmp_src set settlements = '[]'::jsonb where jsonb_typeof(settlements) <> 'array';

-- ─── 5. Flights ──────────────────────────────────────────────────────────────

insert into flights (
  trip_id, segment, departure_date, departure_time, arrival_date, arrival_time,
  airline, flight_number, from_airport, from_city, to_airport, to_city
)
select
  ts.trip_id,
  case when f->>'segment' in ('auto', 'going', 'mid', 'return') then f->>'segment' end,
  safe_date(f->>'departureDate'),
  f->>'departureTime',
  safe_date(f->>'arrivalDate'),
  f->>'arrivalTime',
  f->>'airline',
  f->>'flightNumber',
  f->>'from',
  f->>'fromCity',
  f->>'to',
  f->>'toCity'
from tmp_src ts
cross join lateral jsonb_array_elements(ts.flights) f;

-- ─── 6. Itinerary days + items ───────────────────────────────────────────────

create temporary table tmp_days (
  new_id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  day jsonb not null,
  position int not null
) on commit drop;

insert into tmp_days (trip_id, day, position)
select ts.trip_id, d.value, d.ordinality
from tmp_src ts
cross join lateral jsonb_array_elements(ts.itinerary) with ordinality d;

insert into itinerary_days (id, trip_id, label, date, position)
select new_id, trip_id, coalesce(day->>'label', ''), safe_date(day->>'date'), position
from tmp_days;

insert into itinerary_items (
  day_id, trip_id, name, start_time, end_time, location, notes, tickets, position
)
select
  td.new_id,
  td.trip_id,
  coalesce(e.value->>'name', ''),
  e.value->>'time',
  e.value->>'endTime',
  e.value->>'location',
  e.value->>'notes',
  case when jsonb_typeof(e.value->'tickets') = 'array'
       then e.value->'tickets' else '[]'::jsonb end,
  e.ordinality
from tmp_days td
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(td.day->'events') = 'array'
       then td.day->'events' else '[]'::jsonb end
) with ordinality e;

-- ─── 7. Expenses + splits ────────────────────────────────────────────────────

create temporary table tmp_expenses (
  new_id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  ex jsonb not null
) on commit drop;

insert into tmp_expenses (trip_id, ex)
select ts.trip_id, e.value
from tmp_src ts
cross join lateral jsonb_array_elements(ts.expenses) e;

insert into expenses (id, trip_id, name, amount, currency, split_type, paid_by, created_by, created_at)
select
  new_id,
  trip_id,
  coalesce(ex->>'name', 'Expense'),
  coalesce(safe_numeric(ex->>'amount'), 0),
  coalesce(nullif(ex->>'currency', ''), 'USD'),
  case when coalesce(ex->>'isSplit', 'false') = 'true' then 'even' else 'none' end,
  safe_uuid(coalesce(ex->>'paidBy', ex->>'createdBy')),
  safe_uuid(ex->>'createdBy'),
  coalesce(safe_timestamptz(ex->>'createdAt'), now())
from tmp_expenses;

-- Splits: legacy splitWith excludes the payer; the new model stores one row
-- per participant INCLUDING the payer, each with an even share.
with participants as (
  select
    te.new_id as expense_id,
    te.trip_id,
    coalesce(safe_numeric(te.ex->>'amount'), 0) as amount,
    p.user_id
  from tmp_expenses te
  cross join lateral (
    select safe_uuid(coalesce(te.ex->>'paidBy', te.ex->>'createdBy')) as user_id
    union
    select safe_uuid(w.value)
    from jsonb_array_elements_text(
      case when jsonb_typeof(te.ex->'splitWith') = 'array'
           then te.ex->'splitWith' else '[]'::jsonb end
    ) w
  ) p
  where coalesce(te.ex->>'isSplit', 'false') = 'true'
    and p.user_id is not null
    and exists (select 1 from profiles pr where pr.id = p.user_id)
)
insert into expense_splits (expense_id, trip_id, user_id, share_amount)
select
  expense_id,
  trip_id,
  user_id,
  amount / count(*) over (partition by expense_id)
from participants
on conflict do nothing;

-- ─── 8. Housing ──────────────────────────────────────────────────────────────

insert into housing (
  trip_id, location, start_date, end_date,
  check_in_time, check_out_time, early_check_in_requested
)
select
  ts.trip_id,
  coalesce(h->>'location', ''),
  safe_date(h->>'startDate'),
  safe_date(h->>'endDate'),
  h->>'checkInTime',
  h->>'checkOutTime',
  coalesce(h->>'earlyCheckInRequested', 'false') = 'true'
from tmp_src ts
cross join lateral jsonb_array_elements(ts.housing) h;

-- ─── 9. Settlements ──────────────────────────────────────────────────────────

insert into settlements (trip_id, from_user, to_user, settled_at, settled_by)
select
  ts.trip_id,
  safe_uuid(x->>'from'),
  safe_uuid(x->>'to'),
  coalesce(safe_timestamptz(x->>'settledAt'), now()),
  safe_uuid(x->>'settledBy')
from tmp_src ts
cross join lateral jsonb_array_elements(ts.settlements) x
where safe_uuid(x->>'from') is not null
  and safe_uuid(x->>'to') is not null
  and exists (select 1 from profiles p where p.id = safe_uuid(x->>'from'))
  and exists (select 1 from profiles p where p.id = safe_uuid(x->>'to'));

-- ─── 10. Fresh, complete RLS on trip_members / trip_invites ─────────────────

-- Replace whatever policies exist (names unknown, and DELETE coverage has
-- been missing before) with a complete set against the new trips table.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('trip_members', 'trip_invites')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

alter table trip_members enable row level security;

-- Members (and pending invitees) of a trip can see who's on it; you can
-- always see your own rows.
create policy trip_members_select on trip_members
  for select using (user_id = auth.uid() or can_view_trip(trip_id));

-- Three insert paths: trip creator adds their own owner row; an accepted
-- member invites someone (pending member row); a user adds their own pending
-- row when resolving an invite token. The token path is client-trusted for
-- now — ADR 0007 moves invite resolution behind an edge function.
create policy trip_members_insert on trip_members
  for insert with check (
    (user_id = auth.uid() and role = 'owner' and status = 'accepted'
      and exists (select 1 from trips t where t.id = trip_id and t.created_by = auth.uid()))
    or (is_trip_member(trip_id) and role = 'member' and status = 'pending')
    or (user_id = auth.uid() and role = 'member' and status = 'pending')
  );

-- Accept/decline your own invite.
create policy trip_members_update on trip_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Leave a trip, or the owner removes members.
create policy trip_members_delete on trip_members
  for delete using (user_id = auth.uid() or is_trip_owner(trip_id));

alter table trip_invites enable row level security;

-- The token is the secret; any signed-in user can look one up to resolve it.
-- Tightened to an edge function in ADR 0007.
create policy trip_invites_select on trip_invites
  for select using (auth.uid() is not null);

create policy trip_invites_insert on trip_invites
  for insert with check (inviter_id = auth.uid() and is_trip_member(trip_id));

-- Invitee marks the invite accepted while resolving it.
create policy trip_invites_update on trip_invites
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

create policy trip_invites_delete on trip_invites
  for delete using (inviter_id = auth.uid() or is_trip_owner(trip_id));

-- Realtime on membership changes (invites appearing, accepts) — trip_members
-- may already be in the publication; the exception handler makes it idempotent.
alter table trip_members replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table trip_members;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ─── Verification (run manually after this migration, before drop_legacy) ────
--
-- Trip counts should satisfy:
--   select count(*) from trips;                       -- = shared + personal
--   select count(*) from shared_trips;
--   select (select count(*) from user_data u,
--           jsonb_array_elements(coalesce(u.data->'trips','[]'::jsonb)));
--
-- Child counts, e.g.:
--   select count(*) from expenses;
--   select (select coalesce(sum(jsonb_array_length(coalesce(s.expenses,'[]'::jsonb))),0) from shared_trips s)
--        + (select count(*) from user_data u,
--           jsonb_each(coalesce(u.data->'expensesByTripId','{}'::jsonb)) kv,
--           jsonb_array_elements(kv.value));
--
-- Every trip has ≥1 accepted member:
--   select t.id from trips t where not exists
--     (select 1 from trip_members m where m.trip_id = t.id and m.status = 'accepted');
