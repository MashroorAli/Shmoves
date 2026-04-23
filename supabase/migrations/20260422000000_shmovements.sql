-- Shmovements: friends + public trip posts
--
-- Personal trip privacy (isPublic) lives inside the user_data JSON blob
-- and does not require a schema change. Shared trips get a dedicated column.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── friendships ─────────────────────────────────────────────────────────────

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_requester_idx on friendships(requester_id);
create index if not exists friendships_addressee_idx on friendships(addressee_id);

drop trigger if exists friendships_set_updated_at on friendships;
create trigger friendships_set_updated_at before update on friendships
  for each row execute function set_updated_at();

-- Reusable friendship check used by RLS on posts/likes/comments.
-- SECURITY DEFINER so policies on trip_posts don't recurse into friendships RLS.
create or replace function are_friends(a uuid, b uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

-- ─── trip_posts ──────────────────────────────────────────────────────────────

create table if not exists trip_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  -- Trip reference is polymorphic: personal trips live in a JSON blob
  -- (trip_id is the `destination|start|end` key); shared trips have uuids.
  trip_source text not null check (trip_source in ('personal', 'shared')),
  trip_id text not null,
  -- Denormalized snapshot so the feed can render without joining back into
  -- the user_data blob or checking shared_trips row access.
  destination text not null,
  start_date date,
  end_date date,
  body text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(array_length(photos, 1), 0) <= 5)
);

create index if not exists trip_posts_author_created_idx
  on trip_posts(author_id, created_at desc);
create index if not exists trip_posts_created_idx
  on trip_posts(created_at desc);

drop trigger if exists trip_posts_set_updated_at on trip_posts;
create trigger trip_posts_set_updated_at before update on trip_posts
  for each row execute function set_updated_at();

-- ─── post_likes ──────────────────────────────────────────────────────────────

create table if not exists post_likes (
  post_id uuid not null references trip_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on post_likes(user_id);

-- ─── post_comments ───────────────────────────────────────────────────────────

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references trip_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on post_comments(post_id, created_at asc);

drop trigger if exists post_comments_set_updated_at on post_comments;
create trigger post_comments_set_updated_at before update on post_comments
  for each row execute function set_updated_at();

-- ─── shared_trips.is_public ──────────────────────────────────────────────────

alter table shared_trips
  add column if not exists is_public boolean not null default true;

-- ─── RLS: friendships ────────────────────────────────────────────────────────

alter table friendships enable row level security;

drop policy if exists friendships_select_self on friendships;
create policy friendships_select_self on friendships
  for select using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

drop policy if exists friendships_insert_requester on friendships;
create policy friendships_insert_requester on friendships
  for insert with check (
    auth.uid() = requester_id and status = 'pending'
  );

-- Addressee accepts: pending → accepted
drop policy if exists friendships_update_accept on friendships;
create policy friendships_update_accept on friendships
  for update
  using (auth.uid() = addressee_id and status = 'pending')
  with check (status = 'accepted');

-- Either side can cancel (pending) or unfriend (accepted)
drop policy if exists friendships_delete_either on friendships;
create policy friendships_delete_either on friendships
  for delete using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

-- ─── RLS: trip_posts ─────────────────────────────────────────────────────────

alter table trip_posts enable row level security;

drop policy if exists trip_posts_select on trip_posts;
create policy trip_posts_select on trip_posts
  for select using (
    auth.uid() = author_id or are_friends(auth.uid(), author_id)
  );

drop policy if exists trip_posts_insert on trip_posts;
create policy trip_posts_insert on trip_posts
  for insert with check (auth.uid() = author_id);

drop policy if exists trip_posts_update on trip_posts;
create policy trip_posts_update on trip_posts
  for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists trip_posts_delete on trip_posts;
create policy trip_posts_delete on trip_posts
  for delete using (auth.uid() = author_id);

-- ─── RLS: post_likes ─────────────────────────────────────────────────────────

alter table post_likes enable row level security;

drop policy if exists post_likes_select on post_likes;
create policy post_likes_select on post_likes
  for select using (
    exists (
      select 1 from trip_posts p
      where p.id = post_likes.post_id
        and (auth.uid() = p.author_id or are_friends(auth.uid(), p.author_id))
    )
  );

drop policy if exists post_likes_insert on post_likes;
create policy post_likes_insert on post_likes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from trip_posts p
      where p.id = post_id
        and (auth.uid() = p.author_id or are_friends(auth.uid(), p.author_id))
    )
  );

drop policy if exists post_likes_delete on post_likes;
create policy post_likes_delete on post_likes
  for delete using (auth.uid() = user_id);

-- ─── RLS: post_comments ──────────────────────────────────────────────────────

alter table post_comments enable row level security;

drop policy if exists post_comments_select on post_comments;
create policy post_comments_select on post_comments
  for select using (
    exists (
      select 1 from trip_posts p
      where p.id = post_comments.post_id
        and (auth.uid() = p.author_id or are_friends(auth.uid(), p.author_id))
    )
  );

drop policy if exists post_comments_insert on post_comments;
create policy post_comments_insert on post_comments
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from trip_posts p
      where p.id = post_id
        and (auth.uid() = p.author_id or are_friends(auth.uid(), p.author_id))
    )
  );

drop policy if exists post_comments_update on post_comments;
create policy post_comments_update on post_comments
  for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists post_comments_delete on post_comments;
create policy post_comments_delete on post_comments
  for delete using (auth.uid() = author_id);

-- ─── Realtime publication ────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table friendships;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table trip_posts;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table post_likes;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table post_comments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
