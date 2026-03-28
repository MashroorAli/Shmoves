import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/config/supabase';
import type {
  FlightInfo,
  ItineraryDay,
  ItineraryEvent,
  JournalEntry,
  Trip,
  TripExpense,
  TripHousing,
} from '@/context/trips-context';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TripMember {
  id: string;
  userId: string;
  role: 'owner' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  displayName?: string;
  avatarUri?: string;
  phone?: string;
}

export interface FeedEntry {
  id: string;
  actorId: string;
  action: string;
  section: string;
  detail?: string;
  timestamp: string;
}

export interface PendingInvite {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  inviterPhone?: string;
  inviterName?: string;
  memberRowId: string;
}

export interface SharedTripData {
  id: string; // shared_trips UUID
  trip: Trip;
  flights: FlightInfo[];
  itinerary: ItineraryDay[];
  expenses: TripExpense[];
  housing: TripHousing[];
  journal: JournalEntry[];
  feed: FeedEntry[];
  members: TripMember[];
  ownerId: string;
}

interface SharedTripsContextValue {
  sharedTrips: SharedTripData[];
  pendingInvites: PendingInvite[];
  isLoading: boolean;
  refresh: () => Promise<void>;

  acceptInvite: (tripId: string) => Promise<void>;
  declineInvite: (tripId: string) => Promise<void>;

  migrateToShared: (
    trip: Trip,
    flights: FlightInfo[],
    itinerary: ItineraryDay[],
    expenses: TripExpense[],
    housing: TripHousing[],
    journal: JournalEntry[],
  ) => Promise<string>;

  inviteToTrip: (sharedTripId: string) => Promise<string>;
  inviteByUsername: (sharedTripId: string, username: string) => Promise<void>;
  resolveInviteToken: (token: string) => Promise<void>;
  deleteSharedTrip: (sharedTripId: string) => Promise<void>;
  leaveSharedTrip: (sharedTripId: string) => Promise<void>;

  // CRUD — mirrors TripsContext but writes to shared_trips table
  addSharedFlight: (sharedTripId: string, flight: Omit<FlightInfo, 'id'>) => Promise<FlightInfo>;
  updateSharedFlight: (sharedTripId: string, flightId: string, flight: Omit<FlightInfo, 'id'>) => Promise<void>;
  deleteSharedFlight: (sharedTripId: string, flightId: string) => Promise<void>;
  clearSharedFlights: (sharedTripId: string) => Promise<void>;

  addSharedItineraryDay: (sharedTripId: string, label: string, date?: string) => Promise<ItineraryDay>;
  addSharedItineraryEvent: (sharedTripId: string, dayId: string, name: string, time: string, location?: string) => Promise<ItineraryEvent>;
  updateSharedItineraryDay: (sharedTripId: string, dayId: string, label: string) => Promise<void>;
  deleteSharedItineraryDay: (sharedTripId: string, dayId: string) => Promise<void>;
  updateSharedItineraryEvent: (sharedTripId: string, dayId: string, eventId: string, updates: { name: string; time: string; location?: string }) => Promise<void>;
  deleteSharedItineraryEvent: (sharedTripId: string, dayId: string, eventId: string) => Promise<void>;

  addSharedExpense: (sharedTripId: string, expense: { name: string; amount: number; currency: string; isSplit: boolean }) => Promise<TripExpense>;
  updateSharedExpense: (sharedTripId: string, expenseId: string, updates: { name: string; amount: number; currency: string; isSplit: boolean }) => Promise<void>;
  deleteSharedExpense: (sharedTripId: string, expenseId: string) => Promise<void>;

  addSharedJournalEntry: (sharedTripId: string, entry: { date: string; text: string; isShared?: boolean; authorId?: string }) => Promise<JournalEntry>;
  updateSharedJournalEntry: (sharedTripId: string, entryId: string, updates: { text: string; isShared?: boolean }) => Promise<void>;
  deleteSharedJournalEntry: (sharedTripId: string, entryId: string) => Promise<void>;

  addSharedHousing: (sharedTripId: string, housing: Omit<TripHousing, 'id'>) => Promise<TripHousing>;
  deleteSharedHousing: (sharedTripId: string, housingId: string) => Promise<void>;
}

const SharedTripsContext = createContext<SharedTripsContextValue | undefined>(undefined);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function readColumn<T>(sharedTripId: string, column: string): Promise<T> {
  const { data, error } = await supabase
    .from('shared_trips')
    .select(column)
    .eq('id', sharedTripId)
    .single();
  if (error) throw error;
  return (data as any)[column] as T;
}

async function writeColumn(sharedTripId: string, column: string, value: unknown) {
  const { error } = await supabase
    .from('shared_trips')
    .update({ [column]: value, updated_at: new Date().toISOString() })
    .eq('id', sharedTripId);
  if (error) throw error;
}

async function appendFeedEntry(sharedTripId: string, entry: Omit<FeedEntry, 'id'>) {
  try {
    const current = await readColumn<FeedEntry[]>(sharedTripId, 'feed').catch(() => []);
    const next = [{ id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...entry }, ...current].slice(0, 200);
    await writeColumn(sharedTripId, 'feed', next);
  } catch {
    // feed failures are non-blocking
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SharedTripsProvider({ children, uid: userId }: { children: React.ReactNode; uid: string | null }) {
  const [sharedTrips, setSharedTrips] = useState<SharedTripData[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSharedTrips([]);
      setPendingInvites([]);
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch all trip_members rows for this user
      const { data: memberships, error: memErr } = await supabase
        .from('trip_members')
        .select('id, trip_id, role, status, invited_by')
        .eq('user_id', userId);
      if (memErr) throw memErr;
      if (!memberships?.length) {
        setSharedTrips([]);
        setPendingInvites([]);
        return;
      }

      // 3. Separate accepted vs pending
      const accepted = memberships.filter((m) => m.status === 'accepted');
      const pending = memberships.filter((m) => m.status === 'pending');

      // 4. Fetch shared trips for accepted memberships
      const acceptedIds = accepted.map((m) => m.trip_id);
      let trips: SharedTripData[] = [];

      if (acceptedIds.length) {
        const { data: rows, error: tripErr } = await supabase
          .from('shared_trips')
          .select('*')
          .in('id', acceptedIds);
        if (tripErr) throw tripErr;

        if (rows) {
          // Fetch all members for these trips in one query
          const { data: allMembers } = await supabase
            .from('trip_members')
            .select('trip_id, user_id, role, status')
            .in('trip_id', acceptedIds)
            .eq('status', 'accepted');

          // Fetch profiles for member display names
          const memberUserIds = [...new Set((allMembers ?? []).map((m) => m.user_id))];
          const { data: profiles } = memberUserIds.length
            ? await supabase.from('profiles').select('id, phone, name, avatar_url').in('id', memberUserIds)
            : { data: [] };
          const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

          trips = rows.map((row) => {
            const tripMembers = (allMembers ?? [])
              .filter((m) => m.trip_id === row.id)
              .map((m) => {
                const prof = profileMap.get(m.user_id);
                return {
                  id: m.user_id,
                  userId: m.user_id,
                  role: m.role as 'owner' | 'member',
                  status: m.status as 'accepted',
                  displayName: prof?.name ?? undefined,
                  avatarUri: prof?.avatar_url ?? undefined,
                  phone: prof?.phone ?? undefined,
                } satisfies TripMember;
              });

            const trip = row.trip as any;
            return {
              id: row.id,
              trip: {
                id: trip.id ?? row.id,
                destination: trip.destination ?? '',
                startDate: trip.startDate ?? '',
                endDate: trip.endDate ?? '',
              },
              flights: (row.flights as FlightInfo[]) ?? [],
              itinerary: (row.itinerary as ItineraryDay[]) ?? [],
              expenses: (row.expenses as TripExpense[]) ?? [],
              housing: (row.housing as TripHousing[]) ?? [],
              journal: (row.journal as JournalEntry[]) ?? [],
              feed: (row.feed as FeedEntry[]) ?? [],
              members: tripMembers,
              ownerId: row.owner_id,
            };
          });
        }
      }

      setSharedTrips(trips);

      // 5. Build pending invites list
      if (pending.length) {
        const pendingTripIds = pending.map((m) => m.trip_id);
        const { data: pendingRows } = await supabase
          .from('shared_trips')
          .select('id, trip, owner_id')
          .in('id', pendingTripIds);

        // Fetch inviter profiles
        const inviterIds = [...new Set(pending.map((m) => m.invited_by).filter(Boolean))];
        const { data: inviterProfiles } = inviterIds.length
          ? await supabase.from('profiles').select('id, phone, name').in('id', inviterIds)
          : { data: [] };
        const inviterMap = new Map((inviterProfiles ?? []).map((p) => [p.id, p]));

        const invites: PendingInvite[] = pending
          .map((m) => {
            const row = pendingRows?.find((r) => r.id === m.trip_id);
            if (!row) return null;
            const trip = row.trip as any;
            const inviter = m.invited_by ? inviterMap.get(m.invited_by) : undefined;
            return {
              tripId: row.id,
              destination: trip.destination ?? '',
              startDate: trip.startDate ?? '',
              endDate: trip.endDate ?? '',
              inviterPhone: inviter?.phone ?? undefined,
              inviterName: inviter?.name ?? undefined,
              memberRowId: m.id,
            };
          })
          .filter(Boolean) as PendingInvite[];

        setPendingInvites(invites);
      } else {
        setPendingInvites([]);
      }
    } catch (err) {
      console.warn('SharedTripsProvider refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Local state updater helper ──────────────────────────────────────────
  const updateLocalTrip = useCallback(
    (sharedTripId: string, updater: (t: SharedTripData) => SharedTripData) => {
      setSharedTrips((prev) => prev.map((t) => (t.id === sharedTripId ? updater(t) : t)));
    },
    [],
  );

  const value = useMemo<SharedTripsContextValue>(() => {
    // ── Accept / Decline ────────────────────────────────────────────────
    const acceptInvite = async (tripId: string) => {
      if (!userId) return;
      await supabase
        .from('trip_members')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('trip_id', tripId)
        .eq('user_id', userId);
      await refresh();
    };

    const declineInvite = async (tripId: string) => {
      if (!userId) return;
      await supabase
        .from('trip_members')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('trip_id', tripId)
        .eq('user_id', userId);
      setPendingInvites((prev) => prev.filter((i) => i.tripId !== tripId));
    };

    // ── Migrate personal trip to shared ─────────────────────────────────
    const migrateToShared = async (
      trip: Trip,
      flights: FlightInfo[],
      itinerary: ItineraryDay[],
      expenses: TripExpense[],
      housing: TripHousing[],
      journal: JournalEntry[],
    ): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('shared_trips')
        .insert({
          owner_id: userId,
          trip: { id: trip.id, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate },
          flights,
          itinerary,
          expenses,
          housing,
          journal,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Add owner as accepted member
      await supabase.from('trip_members').insert({
        trip_id: data.id,
        user_id: userId,
        role: 'owner',
        status: 'accepted',
      });

      await refresh();
      return data.id;
    };

    // ── Invite (link-based) ──────────────────────────────────────────────
    const inviteToTrip = async (sharedTripId: string): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');

      const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

      const { error } = await supabase.from('trip_invites').insert({
        trip_id: sharedTripId,
        inviter_id: userId,
        token,
        status: 'pending',
      });
      if (error) throw error;

      return token;
    };

    // ── Invite by username (direct invite) ────────────────────────────────
    const inviteByUsername = async (sharedTripId: string, username: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');

      const { data: profile, error: lookupErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!profile) throw new Error('No user found with that username.');
      if (profile.id === userId) throw new Error("You can't invite yourself.");

      // Check if already a member
      const { data: existing } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', sharedTripId)
        .eq('user_id', profile.id)
        .maybeSingle();
      if (existing) throw new Error('That user is already part of this trip.');

      const { error } = await supabase.from('trip_members').insert({
        trip_id: sharedTripId,
        user_id: profile.id,
        role: 'member',
        status: 'pending',
        invited_by: userId,
      });
      if (error) throw error;

      await refresh();
    };

    // ── Resolve invite token (from deep link) ────────────────────────────
    const resolveInviteToken = async (token: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');

      const { data: invite, error } = await supabase
        .from('trip_invites')
        .select('id, trip_id, inviter_id')
        .eq('token', token)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) throw error;
      if (!invite) throw new Error('Invite not found or already used.');

      // Check if already a member
      const { data: existing } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', invite.trip_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('trip_members').insert({
          trip_id: invite.trip_id,
          user_id: userId,
          role: 'member',
          status: 'pending',
          invited_by: invite.inviter_id,
        });
      }

      await supabase
        .from('trip_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

      await refresh();
    };

    // ── Delete / Leave ──────────────────────────────────────────────────
    const deleteSharedTrip = async (sharedTripId: string) => {
      if (!userId) throw new Error('Not authenticated');
      await supabase.from('trip_members').delete().eq('trip_id', sharedTripId);
      await supabase.from('trip_invites').delete().eq('trip_id', sharedTripId);
      const { error } = await supabase.from('shared_trips').delete().eq('id', sharedTripId);
      if (error) throw error;
      setSharedTrips((prev) => prev.filter((t) => t.id !== sharedTripId));
    };

    const leaveSharedTrip = async (sharedTripId: string) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', sharedTripId)
        .eq('user_id', userId);
      if (error) throw error;
      setSharedTrips((prev) => prev.filter((t) => t.id !== sharedTripId));
    };

    // ── Flights CRUD ────────────────────────────────────────────────────
    const addSharedFlight = async (sharedTripId: string, flight: Omit<FlightInfo, 'id'>): Promise<FlightInfo> => {
      const created: FlightInfo = { id: `flight-${uid()}`, ...flight };
      const current = await readColumn<FlightInfo[]>(sharedTripId, 'flights');
      const next = [...current, created];
      await writeColumn(sharedTripId, 'flights', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, flights: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'added', section: 'Flight', detail: [flight.airline, flight.flightNumber].filter(Boolean).join(' '), timestamp: new Date().toISOString() });
      return created;
    };

    const updateSharedFlight = async (sharedTripId: string, flightId: string, flight: Omit<FlightInfo, 'id'>) => {
      const current = await readColumn<FlightInfo[]>(sharedTripId, 'flights');
      const next = current.map((f) => (f.id === flightId ? { ...f, ...flight } : f));
      await writeColumn(sharedTripId, 'flights', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, flights: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'edited', section: 'Flight', detail: [flight.airline, flight.flightNumber].filter(Boolean).join(' '), timestamp: new Date().toISOString() });
    };

    const deleteSharedFlight = async (sharedTripId: string, flightId: string) => {
      const current = await readColumn<FlightInfo[]>(sharedTripId, 'flights');
      const next = current.filter((f) => f.id !== flightId);
      await writeColumn(sharedTripId, 'flights', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, flights: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'removed', section: 'Flight', timestamp: new Date().toISOString() });
    };

    const clearSharedFlights = async (sharedTripId: string) => {
      await writeColumn(sharedTripId, 'flights', []);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, flights: [] }));
    };

    // ── Itinerary CRUD ──────────────────────────────────────────────────
    const addSharedItineraryDay = async (sharedTripId: string, label: string, date?: string): Promise<ItineraryDay> => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const created: ItineraryDay = {
        id: `day-${uid()}`,
        label: label.trim() || `Day ${current.length + 1}`,
        ...(date ? { date } : {}),
        events: [],
      };
      const next = [...current, created];
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'added', section: 'Itinerary', detail: created.label, timestamp: new Date().toISOString() });
      return created;
    };

    const addSharedItineraryEvent = async (sharedTripId: string, dayId: string, name: string, time: string, location?: string): Promise<ItineraryEvent> => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const created: ItineraryEvent = { id: `event-${Date.now()}`, name, time, location };
      const next = current.map((d) => (d.id === dayId ? { ...d, events: [...d.events, created] } : d));
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'added', section: 'Itinerary', detail: name, timestamp: new Date().toISOString() });
      return created;
    };

    const updateSharedItineraryDay = async (sharedTripId: string, dayId: string, label: string) => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const next = current.map((d) => (d.id === dayId ? { ...d, label: label.trim() || d.label } : d));
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
    };

    const deleteSharedItineraryDay = async (sharedTripId: string, dayId: string) => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const next = current.filter((d) => d.id !== dayId);
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
    };

    const updateSharedItineraryEvent = async (sharedTripId: string, dayId: string, eventId: string, updates: { name: string; time: string; location?: string }) => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const next = current.map((d) => {
        if (d.id !== dayId) return d;
        return { ...d, events: d.events.map((e) => (e.id === eventId ? { ...e, ...updates } : e)) };
      });
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
    };

    const deleteSharedItineraryEvent = async (sharedTripId: string, dayId: string, eventId: string) => {
      const current = await readColumn<ItineraryDay[]>(sharedTripId, 'itinerary');
      const next = current.map((d) => {
        if (d.id !== dayId) return d;
        return { ...d, events: d.events.filter((e) => e.id !== eventId) };
      });
      await writeColumn(sharedTripId, 'itinerary', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, itinerary: next }));
    };

    // ── Expenses CRUD ───────────────────────────────────────────────────
    const addSharedExpense = async (sharedTripId: string, expense: { name: string; amount: number; currency: string; isSplit: boolean }): Promise<TripExpense> => {
      const created: TripExpense = {
        id: `expense-${Date.now()}`,
        name: expense.name.trim(),
        amount: expense.amount,
        currency: expense.currency.trim().toUpperCase(),
        isSplit: expense.isSplit,
        createdAt: new Date().toISOString(),
      };
      const current = await readColumn<TripExpense[]>(sharedTripId, 'expenses');
      const next = [created, ...current];
      await writeColumn(sharedTripId, 'expenses', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, expenses: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'added', section: 'Expense', detail: `${expense.name.trim()} (${expense.currency.trim().toUpperCase()} ${expense.amount})`, timestamp: new Date().toISOString() });
      return created;
    };

    const updateSharedExpense = async (sharedTripId: string, expenseId: string, updates: { name: string; amount: number; currency: string; isSplit: boolean }) => {
      const current = await readColumn<TripExpense[]>(sharedTripId, 'expenses');
      const next = current.map((e) => (e.id === expenseId ? { ...e, ...updates, name: updates.name.trim(), currency: updates.currency.trim().toUpperCase() } : e));
      await writeColumn(sharedTripId, 'expenses', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, expenses: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'edited', section: 'Expense', detail: updates.name.trim(), timestamp: new Date().toISOString() });
    };

    const deleteSharedExpense = async (sharedTripId: string, expenseId: string) => {
      const current = await readColumn<TripExpense[]>(sharedTripId, 'expenses');
      const next = current.filter((e) => e.id !== expenseId);
      await writeColumn(sharedTripId, 'expenses', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, expenses: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'removed', section: 'Expense', timestamp: new Date().toISOString() });
    };

    // ── Journal CRUD ────────────────────────────────────────────────────
    const addSharedJournalEntry = async (sharedTripId: string, entry: { date: string; text: string; isShared?: boolean; authorId?: string }): Promise<JournalEntry> => {
      const created: JournalEntry = {
        id: `journal-${Date.now()}`,
        date: entry.date,
        text: entry.text,
        isShared: entry.isShared ?? false,
        authorId: entry.authorId ?? userId ?? undefined,
      };
      const current = await readColumn<JournalEntry[]>(sharedTripId, 'journal');
      const next = [created, ...current];
      await writeColumn(sharedTripId, 'journal', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, journal: next }));
      return created;
    };

    const updateSharedJournalEntry = async (sharedTripId: string, entryId: string, updates: { text: string; isShared?: boolean }) => {
      const current = await readColumn<JournalEntry[]>(sharedTripId, 'journal');
      const next = current.map((e) => (e.id === entryId ? { ...e, text: updates.text, ...(updates.isShared !== undefined ? { isShared: updates.isShared } : {}) } : e));
      await writeColumn(sharedTripId, 'journal', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, journal: next }));
    };

    const deleteSharedJournalEntry = async (sharedTripId: string, entryId: string) => {
      const current = await readColumn<JournalEntry[]>(sharedTripId, 'journal');
      const next = current.filter((e) => e.id !== entryId);
      await writeColumn(sharedTripId, 'journal', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, journal: next }));
    };

    // ── Housing CRUD ────────────────────────────────────────────────────
    const addSharedHousing = async (sharedTripId: string, housing: Omit<TripHousing, 'id'>): Promise<TripHousing> => {
      const created: TripHousing = {
        id: `housing-${uid()}`,
        location: housing.location.trim(),
        startDate: housing.startDate,
        endDate: housing.endDate,
        checkInTime: housing.checkInTime?.trim() || undefined,
        checkOutTime: housing.checkOutTime?.trim() || undefined,
      };
      const current = await readColumn<TripHousing[]>(sharedTripId, 'housing');
      const next = [...current, created];
      await writeColumn(sharedTripId, 'housing', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, housing: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'added', section: 'Housing', detail: housing.location.trim(), timestamp: new Date().toISOString() });
      return created;
    };

    const deleteSharedHousing = async (sharedTripId: string, housingId: string) => {
      const current = await readColumn<TripHousing[]>(sharedTripId, 'housing');
      const next = current.filter((h) => h.id !== housingId);
      await writeColumn(sharedTripId, 'housing', next);
      updateLocalTrip(sharedTripId, (t) => ({ ...t, housing: next }));
      appendFeedEntry(sharedTripId, { actorId: userId!, action: 'removed', section: 'Housing', timestamp: new Date().toISOString() });
    };

    return {
      sharedTrips,
      pendingInvites,
      isLoading,
      refresh,
      acceptInvite,
      declineInvite,
      migrateToShared,
      inviteToTrip,
      inviteByUsername,
      resolveInviteToken,
      deleteSharedTrip,
      leaveSharedTrip,
      addSharedFlight,
      updateSharedFlight,
      deleteSharedFlight,
      clearSharedFlights,
      addSharedItineraryDay,
      addSharedItineraryEvent,
      updateSharedItineraryDay,
      deleteSharedItineraryDay,
      updateSharedItineraryEvent,
      deleteSharedItineraryEvent,
      addSharedExpense,
      updateSharedExpense,
      deleteSharedExpense,
      addSharedJournalEntry,
      updateSharedJournalEntry,
      deleteSharedJournalEntry,
      addSharedHousing,
      deleteSharedHousing,
    };
  }, [sharedTrips, pendingInvites, isLoading, refresh, userId, updateLocalTrip]);

  return <SharedTripsContext.Provider value={value}>{children}</SharedTripsContext.Provider>;
}

export function useSharedTrips() {
  const ctx = useContext(SharedTripsContext);
  if (!ctx) {
    throw new Error('useSharedTrips must be used within a SharedTripsProvider');
  }
  return ctx;
}
