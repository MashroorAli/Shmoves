-- ADR 0002 + 0003: drop the legacy data systems and the Shmovements social
-- tables.
--
-- ⚠ APPLY ONLY AFTER verifying the data migration (see the verification
-- queries at the bottom of 20260706000001_migrate_data.sql) AND after the
-- app is running on the new contexts. Until then the old app version still
-- reads/writes these tables. Everything here is recoverable from a Supabase
-- backup, and the feature code is recoverable from git history.

-- Legacy trip storage (replaced by the normalized schema).
drop table if exists shared_trips cascade;
drop table if exists user_data cascade;

-- Shmovements social system (removed by the pivot, ADR 0002).
drop table if exists post_comments cascade;
drop table if exists post_likes cascade;
drop table if exists trip_posts cascade;
drop table if exists friendships cascade;
drop function if exists are_friends(uuid, uuid);

-- Cloudinary photos referenced by shared_trips.photos are NOT deleted here —
-- per ADR 0002, warn users before removing uploaded photos, then clean up in
-- the Cloudinary console.
