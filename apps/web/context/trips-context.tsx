'use client';

// Web port of apps/mobile/context/trips-context.tsx (keep the two in sync —
// same names/signatures, diffable against the mobile file).
//
// v1 scope: trips, itinerary, expenses, settlements. Flights, housing, and
// the invite mutations exist in the mobile file and land here with those
// features. Realtime is deferred too: the mobile realtime-channel effect
// plugs back into debouncedRefresh below; until then, refetch on window
// focus/visibility is the ADR 0005 backstop.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import {
  addExpense as coreAddExpense,
  addItineraryDay as coreAddItineraryDay,
  addItineraryItem as coreAddItineraryItem,
  createTrip,
  deleteExpense as coreDeleteExpense,
  deleteItineraryDay as coreDeleteItineraryDay,
  deleteItineraryItem as coreDeleteItineraryItem,
  deleteTrip as coreDeleteTrip,
  fetchAllTrips,
  markSettled as coreMarkSettled,
  replaceItinerary,
  unmarkSettled as coreUnmarkSettled,
  updateExpense as coreUpdateExpense,
  updateItineraryDay as coreUpdateItineraryDay,
  updateItineraryItem as coreUpdateItineraryItem,
  updateTripDetails,
  type ExpenseInput,
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

  // Refetch when the tab regains focus/visibility (ADR 0005 backstop; the
  // web equivalent of mobile's AppState-foreground refetch).
  useEffect(() => {
    if (!uid) return;
    const onFocus = () => debouncedRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') debouncedRefresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
