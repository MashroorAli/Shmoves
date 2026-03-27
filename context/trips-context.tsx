import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/config/supabase';

export interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export interface TicketAttachment {
  id: string;
  name: string;
  url: string;
  type: 'pdf' | 'image';
}

export interface ItineraryEvent {
  id: string;
  name: string;
  time: string;
  location?: string;
  notes?: string;
  tickets?: TicketAttachment[];
}

export interface ItineraryDay {
  id: string;
  label: string;
  date?: string;
  events: ItineraryEvent[];
}

export interface FlightInfo {
  id: string;
  segment?: 'auto' | 'going' | 'mid' | 'return';
  departureDate: string;
  departureTime: string;
  arrivalDate?: string;
  arrivalTime?: string;
  airline?: string;
  flightNumber?: string;
  from?: string;
  fromCity?: string;
  to?: string;
  toCity?: string;
}

export interface TripExpense {
  id: string;
  name: string;
  amount: number;
  currency: string;
  isSplit: boolean;
  createdAt: string;
}

export interface TripHousing {
  id: string;
  location: string;
  startDate: string;
  endDate: string;
  checkInTime?: string;
  checkOutTime?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  text: string;
  isShared?: boolean;
  authorId?: string;
}

interface TripsContextValue {
  trips: Trip[];
  addTrip: (trip: Omit<Trip, 'id'>) => Trip;
  deleteTrip: (tripId: string) => void;
  flightsByTripId: Record<string, FlightInfo[]>;
  addFlight: (tripId: string, flight: Omit<FlightInfo, 'id'>) => FlightInfo;
  updateFlight: (tripId: string, flightId: string, flight: Omit<FlightInfo, 'id'>) => void;
  deleteFlight: (tripId: string, flightId: string) => void;
  clearFlights: (tripId: string) => void;
  itineraryByTripId: Record<string, ItineraryDay[]>;
  addItineraryDay: (tripId: string, label: string, date?: string) => ItineraryDay;
  addItineraryEvent: (tripId: string, dayId: string, name: string, time: string, location?: string, notes?: string, tickets?: TicketAttachment[]) => ItineraryEvent;
  updateItineraryDay: (tripId: string, dayId: string, label: string) => void;
  deleteItineraryDay: (tripId: string, dayId: string) => void;
  updateItineraryEvent: (
    tripId: string,
    dayId: string,
    eventId: string,
    updates: { name: string; time: string; location?: string; notes?: string; tickets?: TicketAttachment[] }
  ) => void;
  deleteItineraryEvent: (tripId: string, dayId: string, eventId: string) => void;

  expensesByTripId: Record<string, TripExpense[]>;
  addExpense: (
    tripId: string,
    expense: { name: string; amount: number; currency: string; isSplit: boolean }
  ) => TripExpense;
  updateExpense: (
    tripId: string,
    expenseId: string,
    updates: { name: string; amount: number; currency: string; isSplit: boolean }
  ) => void;
  deleteExpense: (tripId: string, expenseId: string) => void;

  journalByTripId: Record<string, JournalEntry[]>;
  addJournalEntry: (tripId: string, entry: { date: string; text: string; isShared?: boolean; authorId?: string }) => JournalEntry;
  updateJournalEntry: (tripId: string, entryId: string, updates: { text: string; isShared?: boolean }) => void;
  deleteJournalEntry: (tripId: string, entryId: string) => void;

  housingByTripId: Record<string, TripHousing[]>;
  addHousing: (
    tripId: string,
    housing: Omit<TripHousing, 'id'>
  ) => TripHousing;
  deleteHousing: (tripId: string, housingId: string) => void;
}

const TripsContext = createContext<TripsContextValue | undefined>(undefined);

type PersistedTripsState = {
  trips: Trip[];
  flightsByTripId: Record<string, FlightInfo[]>;
  flightByTripId?: Record<string, Omit<FlightInfo, 'id'> | undefined>;
  itineraryByTripId: Record<string, ItineraryDay[]>;
  expensesByTripId: Record<string, TripExpense[]>;
  journalByTripId: Record<string, JournalEntry[]>;
  housingByTripId?: Record<string, TripHousing[]>;
};

type TripsProviderProps = {
  children: React.ReactNode;
  userKey: string | null;
};

export function TripsProvider({ children, userKey }: TripsProviderProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [flightsByTripId, setFlightsByTripId] = useState<Record<string, FlightInfo[]>>({});
  const [itineraryByTripId, setItineraryByTripId] = useState<Record<string, ItineraryDay[]>>({});
  const [expensesByTripId, setExpensesByTripId] = useState<Record<string, TripExpense[]>>({});
  const [journalByTripId, setJournalByTripId] = useState<Record<string, JournalEntry[]>>({});
  const [housingByTripId, setHousingByTripId] = useState<Record<string, TripHousing[]>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  // Only true when hydration completed successfully — prevents persist from
  // overwriting DB with empty state on a failed read.
  const [hydrationOk, setHydrationOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!userKey) {
        setTrips([]);
        setFlightsByTripId({});
        setItineraryByTripId({});
        setExpensesByTripId({});
        setJournalByTripId({});
        setHousingByTripId({});
        setHydrationOk(true);
        setIsHydrated(true);
        return;
      }

      setIsHydrated(false);
      setHydrationOk(false);
      try {
        const { data, error } = await supabase
          .from('user_data')
          .select('data')
          .eq('user_id', userKey)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;

        if (!data) {
          setTrips([]);
          setFlightsByTripId({});
          setItineraryByTripId({});
          setExpensesByTripId({});
          setJournalByTripId({});
          setHousingByTripId({});
          if (!cancelled) setHydrationOk(true);
          return;
        }

        const parsed = data.data as Partial<PersistedTripsState>;
        setTrips(Array.isArray(parsed.trips) ? parsed.trips : []);
        const nextFlights =
          parsed.flightsByTripId && typeof parsed.flightsByTripId === 'object' ? parsed.flightsByTripId : undefined;

        if (nextFlights) {
          setFlightsByTripId(nextFlights);
        } else if (parsed.flightByTripId && typeof parsed.flightByTripId === 'object') {
          const migrated: Record<string, FlightInfo[]> = {};
          for (const [tripId, flight] of Object.entries(parsed.flightByTripId)) {
            if (!flight || typeof flight !== 'object') continue;
            migrated[tripId] = [
              {
                id: `flight-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                departureDate: String((flight as any).departureDate ?? ''),
                departureTime: String((flight as any).departureTime ?? ''),
                arrivalDate: (flight as any).arrivalDate ? String((flight as any).arrivalDate) : undefined,
                arrivalTime: (flight as any).arrivalTime ? String((flight as any).arrivalTime) : undefined,
                airline: (flight as any).airline ? String((flight as any).airline) : undefined,
                flightNumber: (flight as any).flightNumber ? String((flight as any).flightNumber) : undefined,
                from: (flight as any).from ? String((flight as any).from) : undefined,
                fromCity: (flight as any).fromCity ? String((flight as any).fromCity) : undefined,
                to: (flight as any).to ? String((flight as any).to) : undefined,
                toCity: (flight as any).toCity ? String((flight as any).toCity) : undefined,
              },
            ];
          }
          setFlightsByTripId(migrated);
        } else {
          setFlightsByTripId({});
        }
        setItineraryByTripId(
          parsed.itineraryByTripId && typeof parsed.itineraryByTripId === 'object' ? parsed.itineraryByTripId : {}
        );
        setExpensesByTripId(
          parsed.expensesByTripId && typeof parsed.expensesByTripId === 'object' ? parsed.expensesByTripId : {}
        );
        setJournalByTripId(parsed.journalByTripId && typeof parsed.journalByTripId === 'object' ? parsed.journalByTripId : {});
        setHousingByTripId(
          parsed.housingByTripId && typeof parsed.housingByTripId === 'object' ? parsed.housingByTripId : {}
        );
        if (!cancelled) setHydrationOk(true);
      } catch {
        // Do NOT set hydrationOk — prevents persist from overwriting DB with empty state
        if (cancelled) return;
        setTrips([]);
        setFlightsByTripId({});
        setItineraryByTripId({});
        setExpensesByTripId({});
        setJournalByTripId({});
        setHousingByTripId({});
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [userKey]);

  useEffect(() => {
    if (!userKey) return;
    if (!hydrationOk) return;

    const persist = async () => {
      const nextState: PersistedTripsState = {
        trips,
        flightsByTripId,
        itineraryByTripId,
        expensesByTripId,
        journalByTripId,
        housingByTripId,
      };
      await supabase
        .from('user_data')
        .upsert({ user_id: userKey, data: nextState });
    };

    persist();
  }, [expensesByTripId, flightsByTripId, housingByTripId, hydrationOk, itineraryByTripId, journalByTripId, trips, userKey]);

  const value = useMemo<TripsContextValue>(() => {
    const addTrip: TripsContextValue['addTrip'] = (trip) => {
      const id = `${trip.destination}|${trip.startDate}|${trip.endDate}`;
      const newTrip: Trip = { id, ...trip };

      setTrips((prev) => {
        const exists = prev.some((t) => t.id === id);
        return exists ? prev : [newTrip, ...prev];
      });

      return newTrip;
    };

    const deleteTrip: TripsContextValue['deleteTrip'] = (tripId) => {
      setTrips((prev) => prev.filter((t) => t.id !== tripId));

      setFlightsByTripId((prev) => {
        if (!prev[tripId]) return prev;
        const { [tripId]: _removed, ...rest } = prev;
        return rest;
      });

      setItineraryByTripId((prev) => {
        if (!prev[tripId]) return prev;
        const { [tripId]: _removed, ...rest } = prev;
        return rest;
      });

      setExpensesByTripId((prev) => {
        if (!prev[tripId]) return prev;
        const { [tripId]: _removed, ...rest } = prev;
        return rest;
      });

      setJournalByTripId((prev) => {
        if (!prev[tripId]) return prev;
        const { [tripId]: _removed, ...rest } = prev;
        return rest;
      });

      setHousingByTripId((prev) => {
        if (!prev[tripId]) return prev;
        const { [tripId]: _removed, ...rest } = prev;
        return rest;
      });
    };

    const normalizeFlight = (flight: Omit<FlightInfo, 'id'>): Omit<FlightInfo, 'id'> => ({
      segment: flight.segment ?? 'auto',
      departureDate: flight.departureDate.trim(),
      departureTime: flight.departureTime.trim(),
      arrivalDate: flight.arrivalDate?.trim() ? flight.arrivalDate.trim() : undefined,
      arrivalTime: flight.arrivalTime?.trim() ? flight.arrivalTime.trim() : undefined,
      airline: flight.airline?.trim() ? flight.airline.trim() : undefined,
      flightNumber: flight.flightNumber?.trim() ? flight.flightNumber.trim() : undefined,
      from: flight.from?.trim() ? flight.from.trim() : undefined,
      fromCity: flight.fromCity?.trim() ? flight.fromCity.trim() : undefined,
      to: flight.to?.trim() ? flight.to.trim() : undefined,
      toCity: flight.toCity?.trim() ? flight.toCity.trim() : undefined,
    });

    const addFlight: TripsContextValue['addFlight'] = (tripId, flight) => {
      const created: FlightInfo = {
        id: `flight-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...normalizeFlight(flight),
      };

      setFlightsByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: [...current, created] };
      });

      return created;
    };

    const updateFlight: TripsContextValue['updateFlight'] = (tripId, flightId, flight) => {
      setFlightsByTripId((prev) => {
        const current = prev[tripId] ?? [];
        const next = current.map((f) => (f.id === flightId ? { ...f, ...normalizeFlight(flight) } : f));
        return { ...prev, [tripId]: next };
      });
    };

    const deleteFlight: TripsContextValue['deleteFlight'] = (tripId, flightId) => {
      setFlightsByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: current.filter((f) => f.id !== flightId) };
      });
    };

    const clearFlights: TripsContextValue['clearFlights'] = (tripId) => {
      setFlightsByTripId((prev) => ({ ...prev, [tripId]: [] }));
    };

    const addItineraryDay: TripsContextValue['addItineraryDay'] = (tripId, label, date) => {
      const currentCount = itineraryByTripId[tripId]?.length ?? 0;
      const createdDay: ItineraryDay = {
        id: `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: label.trim() ? label.trim() : `Day ${currentCount + 1}`,
        ...(date ? { date } : {}),
        events: [],
      };

      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        return {
          ...prev,
          [tripId]: [...currentDays, createdDay],
        };
      });

      return createdDay;
    };

    const addItineraryEvent: TripsContextValue['addItineraryEvent'] = (tripId, dayId, name, time, location, notes, tickets) => {
      const createdEvent: ItineraryEvent = {
        id: `event-${Date.now()}`,
        name,
        time,
        location,
        notes: notes?.trim() || undefined,
        tickets: tickets && tickets.length > 0 ? tickets : undefined,
      };

      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        const nextDays = currentDays.map((day) => {
          if (day.id !== dayId) return day;
          return {
            ...day,
            events: [...day.events, createdEvent],
          };
        });
        return {
          ...prev,
          [tripId]: nextDays,
        };
      });

      return createdEvent;
    };

    const updateItineraryDay: TripsContextValue['updateItineraryDay'] = (tripId, dayId, label) => {
      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        const nextLabel = label.trim();
        const nextDays = currentDays.map((day) => (day.id === dayId ? { ...day, label: nextLabel || day.label } : day));
        return { ...prev, [tripId]: nextDays };
      });
    };

    const deleteItineraryDay: TripsContextValue['deleteItineraryDay'] = (tripId, dayId) => {
      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        const nextDays = currentDays.filter((day) => day.id !== dayId);
        return { ...prev, [tripId]: nextDays };
      });
    };

    const updateItineraryEvent: TripsContextValue['updateItineraryEvent'] = (tripId, dayId, eventId, updates) => {
      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        const nextDays = currentDays.map((day) => {
          if (day.id !== dayId) return day;
          const nextEvents = day.events.map((e) => {
            if (e.id !== eventId) return e;
            const nextName = updates.name.trim();
            const nextTime = updates.time.trim();
            const nextLocation = updates.location?.trim();
            return {
              ...e,
              name: nextName || e.name,
              time: nextTime || e.time,
              location: nextLocation ? nextLocation : undefined,
              notes: updates.notes?.trim() || undefined,
              tickets: updates.tickets !== undefined ? updates.tickets : e.tickets,
            };
          });
          return { ...day, events: nextEvents };
        });
        return { ...prev, [tripId]: nextDays };
      });
    };

    const deleteItineraryEvent: TripsContextValue['deleteItineraryEvent'] = (tripId, dayId, eventId) => {
      setItineraryByTripId((prev) => {
        const currentDays = prev[tripId] ?? [];
        const nextDays = currentDays.map((day) => {
          if (day.id !== dayId) return day;
          return { ...day, events: day.events.filter((e) => e.id !== eventId) };
        });
        return { ...prev, [tripId]: nextDays };
      });
    };

    const addExpense: TripsContextValue['addExpense'] = (tripId, expense) => {
      const createdExpense: TripExpense = {
        id: `expense-${Date.now()}`,
        name: expense.name.trim(),
        amount: expense.amount,
        currency: expense.currency.trim().toUpperCase(),
        isSplit: expense.isSplit,
        createdAt: new Date().toISOString(),
      };

      setExpensesByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return {
          ...prev,
          [tripId]: [createdExpense, ...current],
        };
      });

      return createdExpense;
    };

    const updateExpense: TripsContextValue['updateExpense'] = (tripId, expenseId, updates) => {
      setExpensesByTripId((prev) => {
        const current = prev[tripId] ?? [];
        const nextName = updates.name.trim();
        const nextCurrency = updates.currency.trim().toUpperCase();
        const nextAmount = updates.amount;
        const nextIsSplit = updates.isSplit;
        const next = current.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                name: nextName,
                amount: nextAmount,
                currency: nextCurrency,
                isSplit: nextIsSplit,
              }
            : e
        );
        return { ...prev, [tripId]: next };
      });
    };

    const deleteExpense: TripsContextValue['deleteExpense'] = (tripId, expenseId) => {
      setExpensesByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: current.filter((e) => e.id !== expenseId) };
      });
    };

    const addJournalEntry: TripsContextValue['addJournalEntry'] = (tripId, entry) => {
      const createdEntry: JournalEntry = {
        id: `journal-${Date.now()}`,
        date: entry.date,
        text: entry.text,
        isShared: entry.isShared,
        authorId: entry.authorId,
      };

      setJournalByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return {
          ...prev,
          [tripId]: [createdEntry, ...current],
        };
      });

      return createdEntry;
    };

    const updateJournalEntry: TripsContextValue['updateJournalEntry'] = (tripId, entryId, updates) => {
      setJournalByTripId((prev) => {
        const current = prev[tripId] ?? [];
        const next = current.map((e) =>
          e.id === entryId ? { ...e, text: updates.text, isShared: updates.isShared } : e,
        );
        return { ...prev, [tripId]: next };
      });
    };

    const deleteJournalEntry: TripsContextValue['deleteJournalEntry'] = (tripId, entryId) => {
      setJournalByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: current.filter((e) => e.id !== entryId) };
      });
    };

    const addHousing: TripsContextValue['addHousing'] = (tripId, housing) => {
      const created: TripHousing = {
        id: `housing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        location: housing.location.trim(),
        startDate: housing.startDate,
        endDate: housing.endDate,
        checkInTime: housing.checkInTime?.trim() || undefined,
        checkOutTime: housing.checkOutTime?.trim() || undefined,
      };

      setHousingByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: [...current, created] };
      });

      return created;
    };

    const deleteHousing: TripsContextValue['deleteHousing'] = (tripId, housingId) => {
      setHousingByTripId((prev) => {
        const current = prev[tripId] ?? [];
        return { ...prev, [tripId]: current.filter((h) => h.id !== housingId) };
      });
    };

    return {
      trips,
      addTrip,
      deleteTrip,
      flightsByTripId,
      addFlight,
      updateFlight,
      deleteFlight,
      clearFlights,
      itineraryByTripId,
      addItineraryDay,
      addItineraryEvent,
      updateItineraryDay,
      deleteItineraryDay,
      updateItineraryEvent,
      deleteItineraryEvent,
      expensesByTripId,
      addExpense,
      updateExpense,
      deleteExpense,
      journalByTripId,
      addJournalEntry,
      updateJournalEntry,
      deleteJournalEntry,
      housingByTripId,
      addHousing,
      deleteHousing,
    };
  }, [expensesByTripId, flightsByTripId, housingByTripId, itineraryByTripId, journalByTripId, trips]);

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) {
    throw new Error('useTrips must be used within a TripsProvider');
  }
  return ctx;
}
