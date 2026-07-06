// Unified trips context (ADR 0003): every trip — personal or group — is a
// TripBundle from the normalized schema, fetched and mutated through
// @shmoves/core. Replaces the old trips-context (user_data blob) and
// shared-trips-context (shared_trips JSON columns).
//
// Sync model (ADR 0005): mutations write to Supabase then update local state
// optimistically; a debounced refresh() runs on any realtime event, on app
// foreground, and on channel reconnect as the reliability backstop.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/config/supabase';
import {
  acceptInvite as coreAcceptInvite,
  addExpense as coreAddExpense,
  addFlight as coreAddFlight,
  addHousing as coreAddHousing,
  addItineraryDay as coreAddItineraryDay,
  addItineraryItem as coreAddItineraryItem,
  createInviteToken,
  createTrip,
  declineInvite as coreDeclineInvite,
  deleteExpense as coreDeleteExpense,
  deleteFlight as coreDeleteFlight,
  deleteHousing as coreDeleteHousing,
  deleteItineraryDay as coreDeleteItineraryDay,
  deleteItineraryItem as coreDeleteItineraryItem,
  deleteTrip as coreDeleteTrip,
  clearFlights as coreClearFlights,
  fetchAllTrips,
  inviteByUserId as coreInviteByUserId,
  inviteByUsername as coreInviteByUsername,
  leaveTrip as coreLeaveTrip,
  markSettled as coreMarkSettled,
  replaceItinerary,
  resolveInviteToken as coreResolveInviteToken,
  unmarkSettled as coreUnmarkSettled,
  updateExpense as coreUpdateExpense,
  updateFlight as coreUpdateFlight,
  updateItineraryDay as coreUpdateItineraryDay,
  updateItineraryItem as coreUpdateItineraryItem,
  updateTripDetails,
  type ExpenseInput,
  type FlightInput,
  type HousingInput,
  type ItineraryItem,
  type ItineraryItemInput,
  type PendingInvite,
  type Trip,
  type TripBundle,
  type TripInput,
} from '@shmoves/core';

export type {
  Expense,
  ExpenseInput,
  ExpenseSplit,
  ExpenseWithSplits,
  Flight,
  FlightInput,
  Housing,
  HousingInput,
  ItineraryDay,
  ItineraryDayWithItems,
  ItineraryItem,
  ItineraryItemInput,
  PendingInvite,
  Settlement,
  TicketAttachment,
  Trip,
  TripBundle,
  TripMember,
} from '@shmoves/core';

interface TripsContextValue {
  trips: TripBundle[];
  pendingInvites: PendingInvite[];
  isLoading: boolean;
  refresh: () => Promise<void>;

  addTrip: (input: TripInput) => Promise<Trip>;
  updateTrip: (tripId: string, input: TripInput) => Promise<void>;
  deleteTrip: (tripId: string) => Promise<void>;
  leaveTrip: (tripId: string) => Promise<void>;

  acceptInvite: (tripId: string) => Promise<void>;
  declineInvite: (tripId: string) => Promise<void>;
  inviteToTrip: (tripId: string) => Promise<string>;
  inviteByUsername: (tripId: string, username: string) => Promise<void>;
  inviteByUserId: (tripId: string, targetUserId: string) => Promise<void>;
  resolveInviteToken: (token: string) => Promise<void>;

  addFlight: (tripId: string, input: FlightInput) => Promise<void>;
  updateFlight: (tripId: string, flightId: string, input: FlightInput) => Promise<void>;
  deleteFlight: (tripId: string, flightId: string) => Promise<void>;
  clearFlights: (tripId: string) => Promise<void>;

  addItineraryDay: (tripId: string, label: string, date: string | null) => Promise<void>;
  updateItineraryDay: (tripId: string, dayId: string, label: string) => Promise<void>;
  deleteItineraryDay: (tripId: string, dayId: string) => Promise<void>;
  addItineraryItem: (tripId: string, dayId: string, input: ItineraryItemInput) => Promise<void>;
  updateItineraryItem: (
    tripId: string,
    dayId: string,
    itemId: string,
    input: ItineraryItemInput,
  ) => Promise<void>;
  deleteItineraryItem: (tripId: string, dayId: string, itemId: string) => Promise<void>;
  /** Replaces the whole itinerary (day renumbering after trip-date edits). */
  setItinerary: (
    tripId: string,
    days: {
      label: string;
      date: string | null;
      items: Omit<ItineraryItem, 'id' | 'dayId' | 'tripId' | 'position'>[];
    }[],
  ) => Promise<void>;

  addExpense: (tripId: string, input: ExpenseInput) => Promise<void>;
  updateExpense: (tripId: string, expenseId: string, input: ExpenseInput) => Promise<void>;
  deleteExpense: (tripId: string, expenseId: string) => Promise<void>;

  addHousing: (tripId: string, input: HousingInput) => Promise<void>;
  deleteHousing: (tripId: string, housingId: string) => Promise<void>;

  markSettled: (tripId: string, from: string, to: string) => Promise<void>;
  unmarkSettled: (tripId: string, from: string, to: string) => Promise<void>;
}

const TripsContext = createContext<TripsContextValue | undefined>(undefined);

const REFRESH_DEBOUNCE_MS = 300;

export function TripsProvider({ children, uid }: { children: React.ReactNode; uid: string | null }) {
  const [trips, setTrips] = useState<TripBundle[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) {
      setTrips([]);
      setPendingInvites([]);
      setIsLoading(false);
      return;
    }
    try {
      const result = await fetchAllTrips(supabase, uid);
      setTrips(result.trips);
      setPendingInvites(result.pendingInvites);
    } catch (err) {
      console.warn('TripsProvider refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    setIsLoading(true);
    refresh();
  }, [refresh]);

  // Debounce: one action fans out to several realtime events (expense +
  // splits, day + items); collapse them into a single refetch.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Realtime: coarse refetch on any change to any trip table. Granular
  // per-event patching is a later optimization; correctness first (ADR 0005).
  useEffect(() => {
    if (!uid) return;
    const tables = [
      'trips',
      'trip_members',
      'flights',
      'itinerary_days',
      'itinerary_items',
      'expenses',
      'expense_splits',
      'housing',
      'settlements',
    ];
    let channel = supabase.channel('trips_realtime');
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        debouncedRefresh,
      );
    }
    channel.subscribe((status) => {
      // Events during a disconnect are lost, not replayed — refetch on every
      // (re)join as the backstop (ADR 0005).
      if (status === 'SUBSCRIBED') debouncedRefresh();
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, debouncedRefresh]);

  // Refetch on app foreground (ADR 0005 backstop).
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') debouncedRefresh();
    });
    return () => sub.remove();
  }, [uid, debouncedRefresh]);

  const updateLocalTrip = useCallback(
    (tripId: string, updater: (t: TripBundle) => TripBundle) => {
      setTrips((prev) => prev.map((t) => (t.trip.id === tripId ? updater(t) : t)));
    },
    [],
  );

  const requireUid = useCallback((): string => {
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }, [uid]);

  const value = useMemo<TripsContextValue>(() => {
    return {
      trips,
      pendingInvites,
      isLoading,
      refresh,

      // ── Trips ──────────────────────────────────────────────────────────
      addTrip: async (input) => {
        const userId = requireUid();
        const trip = await createTrip(supabase, userId, input);
        await refresh();
        return trip;
      },
      updateTrip: async (tripId, input) => {
        const trip = await updateTripDetails(supabase, tripId, input);
        updateLocalTrip(tripId, (t) => ({ ...t, trip }));
      },
      deleteTrip: async (tripId) => {
        await coreDeleteTrip(supabase, tripId);
        setTrips((prev) => prev.filter((t) => t.trip.id !== tripId));
      },
      leaveTrip: async (tripId) => {
        await coreLeaveTrip(supabase, tripId, requireUid());
        setTrips((prev) => prev.filter((t) => t.trip.id !== tripId));
      },

      // ── Invites & membership ───────────────────────────────────────────
      acceptInvite: async (tripId) => {
        const invite = pendingInvites.find((i) => i.tripId === tripId);
        if (!invite) throw new Error('Invite not found.');
        await coreAcceptInvite(supabase, invite.memberRowId);
        await refresh();
      },
      declineInvite: async (tripId) => {
        const invite = pendingInvites.find((i) => i.tripId === tripId);
        if (!invite) throw new Error('Invite not found.');
        await coreDeclineInvite(supabase, invite.memberRowId);
        setPendingInvites((prev) => prev.filter((i) => i.tripId !== tripId));
      },
      inviteToTrip: (tripId) => createInviteToken(supabase, tripId, requireUid()),
      inviteByUsername: async (tripId, username) => {
        await coreInviteByUsername(supabase, tripId, requireUid(), username);
        await refresh();
      },
      inviteByUserId: async (tripId, targetUserId) => {
        await coreInviteByUserId(supabase, tripId, requireUid(), targetUserId);
        await refresh();
      },
      resolveInviteToken: async (token) => {
        await coreResolveInviteToken(supabase, requireUid(), token);
        await refresh();
      },

      // ── Flights ────────────────────────────────────────────────────────
      addFlight: async (tripId, input) => {
        const flight = await coreAddFlight(supabase, tripId, requireUid(), input);
        updateLocalTrip(tripId, (t) => ({ ...t, flights: [...t.flights, flight] }));
      },
      updateFlight: async (tripId, flightId, input) => {
        const flight = await coreUpdateFlight(supabase, flightId, input);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          flights: t.flights.map((f) => (f.id === flightId ? flight : f)),
        }));
      },
      deleteFlight: async (tripId, flightId) => {
        await coreDeleteFlight(supabase, flightId);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          flights: t.flights.filter((f) => f.id !== flightId),
        }));
      },
      clearFlights: async (tripId) => {
        await coreClearFlights(supabase, tripId);
        updateLocalTrip(tripId, (t) => ({ ...t, flights: [] }));
      },

      // ── Itinerary ──────────────────────────────────────────────────────
      addItineraryDay: async (tripId, label, date) => {
        const trip = trips.find((t) => t.trip.id === tripId);
        const position = (trip?.itinerary.length ?? 0) + 1;
        const day = await coreAddItineraryDay(supabase, tripId, label, date, position);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: [...t.itinerary, { ...day, items: [] }],
        }));
      },
      updateItineraryDay: async (tripId, dayId, label) => {
        await coreUpdateItineraryDay(supabase, dayId, { label });
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: t.itinerary.map((d) => (d.id === dayId ? { ...d, label } : d)),
        }));
      },
      deleteItineraryDay: async (tripId, dayId) => {
        await coreDeleteItineraryDay(supabase, dayId);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: t.itinerary.filter((d) => d.id !== dayId),
        }));
      },
      addItineraryItem: async (tripId, dayId, input) => {
        const trip = trips.find((t) => t.trip.id === tripId);
        const day = trip?.itinerary.find((d) => d.id === dayId);
        const position = (day?.items.length ?? 0) + 1;
        const item = await coreAddItineraryItem(
          supabase,
          tripId,
          dayId,
          requireUid(),
          input,
          position,
        );
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: t.itinerary.map((d) =>
            d.id === dayId ? { ...d, items: [...d.items, item] } : d,
          ),
        }));
      },
      updateItineraryItem: async (tripId, dayId, itemId, input) => {
        await coreUpdateItineraryItem(supabase, itemId, input);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: t.itinerary.map((d) =>
            d.id === dayId
              ? {
                  ...d,
                  items: d.items.map((i) =>
                    i.id === itemId
                      ? {
                          ...i,
                          name: input.name,
                          startTime: input.startTime,
                          endTime: input.endTime ?? null,
                          location: input.location ?? null,
                          notes: input.notes ?? null,
                          tickets: input.tickets ?? [],
                          estimatedCost: input.estimatedCost ?? null,
                          costType: input.costType ?? null,
                          currency: input.currency ?? null,
                        }
                      : i,
                  ),
                }
              : d,
          ),
        }));
      },
      deleteItineraryItem: async (tripId, dayId, itemId) => {
        await coreDeleteItineraryItem(supabase, itemId);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          itinerary: t.itinerary.map((d) =>
            d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d,
          ),
        }));
      },
      setItinerary: async (tripId, days) => {
        await replaceItinerary(supabase, tripId, days);
        await refresh();
      },

      // ── Expenses ───────────────────────────────────────────────────────
      addExpense: async (tripId, input) => {
        const expense = await coreAddExpense(supabase, tripId, requireUid(), input);
        updateLocalTrip(tripId, (t) => ({ ...t, expenses: [...t.expenses, expense] }));
      },
      updateExpense: async (tripId, expenseId, input) => {
        await coreUpdateExpense(supabase, tripId, expenseId, input);
        await refresh();
      },
      deleteExpense: async (tripId, expenseId) => {
        await coreDeleteExpense(supabase, expenseId);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          expenses: t.expenses.filter((e) => e.id !== expenseId),
        }));
      },

      // ── Housing ────────────────────────────────────────────────────────
      addHousing: async (tripId, input) => {
        const housing = await coreAddHousing(supabase, tripId, requireUid(), input);
        updateLocalTrip(tripId, (t) => ({ ...t, housing: [...t.housing, housing] }));
      },
      deleteHousing: async (tripId, housingId) => {
        await coreDeleteHousing(supabase, housingId);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          housing: t.housing.filter((h) => h.id !== housingId),
        }));
      },

      // ── Settlements ────────────────────────────────────────────────────
      markSettled: async (tripId, from, to) => {
        const settlement = await coreMarkSettled(supabase, tripId, from, to, requireUid());
        updateLocalTrip(tripId, (t) => ({ ...t, settlements: [...t.settlements, settlement] }));
      },
      unmarkSettled: async (tripId, from, to) => {
        await coreUnmarkSettled(supabase, tripId, from, to);
        updateLocalTrip(tripId, (t) => ({
          ...t,
          settlements: t.settlements.filter((s) => !(s.fromUser === from && s.toUser === to)),
        }));
      },
    };
  }, [trips, pendingInvites, isLoading, refresh, requireUid, updateLocalTrip]);

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTrips must be used within TripsProvider');
  return ctx;
}
