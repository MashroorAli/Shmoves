-- Add settlements column to shared_trips.
-- Stores an array of { from, to, settledAt, settledBy } objects.
-- No separate table needed — debts are computed dynamically from expenses,
-- and settlements just mark which computed pairs have been resolved.

alter table shared_trips
  add column if not exists settlements jsonb not null default '[]'::jsonb;
