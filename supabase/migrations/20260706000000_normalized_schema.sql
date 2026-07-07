-- ADR 0003: unified normalized schema.
-- Creates the new tables + RLS + realtime. Does NOT touch existing data or
-- tables; the data migration (20260706000001) and legacy drop (20260706000002)
-- run afterwards, in that order.
--
-- Conventions:
-- - Every child table carries trip_id so RLS is a single indexed membership
--   check and realtime clients can filter `trip_id=eq.<uuid>` on every table.
-- - Times of day are text (e.g. '14:30', '7:30 PM') to match what the app
--   collects today; dates are real `date` columns.
-- - RLS covers all four operations on every table (a missing DELETE policy
--   has silently broken sync before).

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Membership checks are SECURITY DEFINER so policies on trip_members itself
-- (and on child tables) don't recurse into trip_members RLS.

-- Parameter is named p_trip_id to match the function that already exists in
-- the live DB (created via the dashboard, April 2026) — `create or replace`
-- cannot rename parameters, only swap the body.
create or replace function is_trip_member(p_trip_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.status = 'accepted'
  );
$$;

-- Pending invitees may see the trip row (name/dates for the invite card),
-- but not child data.
create or replace function can_view_trip(p_trip_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
      and m.status in ('pending', 'accepted')
  );
$$;

create or replace function is_trip_owner(p_trip_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
      and m.role = 'owner' and m.status = 'accepted'
  );
$$;

-- ─── trips ───────────────────────────────────────────────────────────────────

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  destination text not null,
  start_date date,
  end_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trips_set_updated_at on trips;
create trigger trips_set_updated_at before update on trips
  for each row execute function set_updated_at();

-- ─── flights ─────────────────────────────────────────────────────────────────

create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  segment text check (segment in ('auto', 'going', 'mid', 'return')),
  departure_date date,
  departure_time text,
  arrival_date date,
  arrival_time text,
  airline text,
  flight_number text,
  from_airport text,
  from_city text,
  to_airport text,
  to_city text,
  estimated_cost numeric(12,2),
  cost_type text check (cost_type in ('total', 'per_person')),
  currency text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flights_trip_idx on flights(trip_id);

drop trigger if exists flights_set_updated_at on flights;
create trigger flights_set_updated_at before update on flights
  for each row execute function set_updated_at();

-- ─── itinerary_days / itinerary_items ────────────────────────────────────────

create table if not exists itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  label text not null default '',
  date date,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists itinerary_days_trip_idx on itinerary_days(trip_id, position);

drop trigger if exists itinerary_days_set_updated_at on itinerary_days;
create trigger itinerary_days_set_updated_at before update on itinerary_days
  for each row execute function set_updated_at();

create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references itinerary_days(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  start_time text,
  end_time text,
  location text,
  notes text,
  -- Ticket attachments: [{ id, name, url, type: 'pdf' | 'image' }].
  -- Edited as a unit with the event, so a nested array is fine here.
  tickets jsonb not null default '[]'::jsonb,
  estimated_cost numeric(12,2),
  cost_type text check (cost_type in ('total', 'per_person')),
  currency text,
  position int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists itinerary_items_day_idx on itinerary_items(day_id, position);
create index if not exists itinerary_items_trip_idx on itinerary_items(trip_id);

drop trigger if exists itinerary_items_set_updated_at on itinerary_items;
create trigger itinerary_items_set_updated_at before update on itinerary_items
  for each row execute function set_updated_at();

-- ─── expenses / expense_splits ───────────────────────────────────────────────

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  split_type text not null default 'none' check (split_type in ('none', 'even', 'custom')),
  paid_by uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_trip_idx on expenses(trip_id);

drop trigger if exists expenses_set_updated_at on expenses;
create trigger expenses_set_updated_at before update on expenses
  for each row execute function set_updated_at();

-- One row per participant per expense, payer included. Balance for a user is
-- sum(amount paid) - sum(share_amount). share_amount is stored (not derived)
-- so uneven splits need no schema change.
create table if not exists expense_splits (
  expense_id uuid not null references expenses(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  share_amount numeric not null,
  primary key (expense_id, user_id)
);

create index if not exists expense_splits_trip_idx on expense_splits(trip_id);
create index if not exists expense_splits_user_idx on expense_splits(user_id);

-- ─── housing ─────────────────────────────────────────────────────────────────

create table if not exists housing (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  location text not null,
  start_date date,
  end_date date,
  check_in_time text,
  check_out_time text,
  early_check_in_requested boolean not null default false,
  estimated_cost numeric(12,2),
  cost_type text check (cost_type in ('total', 'per_person')),
  currency text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists housing_trip_idx on housing(trip_id);

drop trigger if exists housing_set_updated_at on housing;
create trigger housing_set_updated_at before update on housing
  for each row execute function set_updated_at();

-- ─── settlements ─────────────────────────────────────────────────────────────

-- Debts are computed from expenses; a settlement row marks a computed
-- debtor→creditor pair as resolved (replaces shared_trips.settlements jsonb).
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  from_user uuid not null references profiles(id) on delete cascade,
  to_user uuid not null references profiles(id) on delete cascade,
  settled_at timestamptz not null default now(),
  settled_by uuid references profiles(id) on delete set null
);

create index if not exists settlements_trip_idx on settlements(trip_id);

-- ─── documents ───────────────────────────────────────────────────────────────

-- Schema-only in Phase 0 (ADR 0003); UI ships with web v1. The Supabase
-- Storage bucket + storage.objects policies are created in Phase 2 alongside
-- the upload UI.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists documents_trip_idx on documents(trip_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table trips enable row level security;

drop policy if exists trips_select on trips;
create policy trips_select on trips
  for select using (can_view_trip(id));

drop policy if exists trips_insert on trips;
create policy trips_insert on trips
  for insert with check (created_by = auth.uid());

drop policy if exists trips_update on trips;
create policy trips_update on trips
  for update using (is_trip_member(id)) with check (is_trip_member(id));

drop policy if exists trips_delete on trips;
create policy trips_delete on trips
  for delete using (is_trip_owner(id));

-- Child tables share one policy shape: accepted members get all four
-- operations. Pending invitees see the trip row only, never child data.
do $$
declare
  t text;
begin
  foreach t in array array[
    'flights', 'itinerary_days', 'itinerary_items',
    'expenses', 'expense_splits', 'housing', 'settlements', 'documents'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select using (is_trip_member(trip_id))',
      t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format(
      'create policy %I on %I for insert with check (is_trip_member(trip_id))',
      t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for update using (is_trip_member(trip_id)) with check (is_trip_member(trip_id))',
      t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format(
      'create policy %I on %I for delete using (is_trip_member(trip_id))',
      t || '_delete', t);
  end loop;
end $$;

-- ─── Realtime ────────────────────────────────────────────────────────────────

-- REPLICA IDENTITY FULL so DELETE events carry the whole old row (with
-- trip_id) — the default replica identity is PK-only, which breaks per-trip
-- filtered delete handling (ADR 0005).
alter table trips replica identity full;
alter table flights replica identity full;
alter table itinerary_days replica identity full;
alter table itinerary_items replica identity full;
alter table expenses replica identity full;
alter table expense_splits replica identity full;
alter table housing replica identity full;
alter table settlements replica identity full;
alter table documents replica identity full;

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'trips', 'flights', 'itinerary_days', 'itinerary_items',
      'expenses', 'expense_splits', 'housing', 'settlements', 'documents'
    ] loop
      begin
        execute format('alter publication supabase_realtime add table %I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
