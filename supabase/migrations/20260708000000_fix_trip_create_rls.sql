-- Fix: creating a trip failed with "new row violates row-level security
-- policy for table trips".
--
-- createTrip inserts the trip first and the owner's trip_members row second.
-- Between the two, the creator has no membership row, which broke two things:
--   1. INSERT ... RETURNING (PostgREST .insert().select()) applies the SELECT
--      policy to the returned row; can_view_trip() was false with no member
--      row yet, so the insert itself errored.
--   2. The owner path of trip_members_insert subqueries trips under the same
--      SELECT policy, so the owner row insert would have failed next.
--
-- Letting the creator always see their own trips row fixes both. Child-table
-- access still requires accepted membership, so a creator who later leaves a
-- trip would see only the bare trips row — acceptable, and impossible today
-- since owners can't leave.

drop policy if exists trips_select on trips;
create policy trips_select on trips
  for select using (can_view_trip(id) or created_by = auth.uid());
