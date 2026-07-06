// Data access for the normalized schema (ADR 0003). Every function takes a
// SupabaseClient so each platform brings its own client (session storage
// differs between RN and web). RLS scopes all reads/writes to trip members;
// these functions throw the Supabase error on failure, matching how the old
// contexts surfaced errors.

import type { SupabaseClient } from '@supabase/supabase-js';
import { evenShare } from './finance';
import type {
  Expense,
  ExpenseSplit,
  ExpenseWithSplits,
  Flight,
  Housing,
  ItineraryDay,
  ItineraryDayWithItems,
  ItineraryItem,
  MemberStatus,
  PendingInvite,
  Profile,
  Settlement,
  Trip,
  TripBundle,
  TripMember,
} from './types';

type Row = Record<string, any>;

// ── Mappers (snake_case rows → camelCase app types) ──────────────────────────

function mapTrip(r: Row): Trip {
  return {
    id: r.id,
    destination: r.destination,
    startDate: r.start_date,
    endDate: r.end_date,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMember(r: Row, profile?: Profile): TripMember {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    role: r.role,
    status: r.status,
    invitedBy: r.invited_by ?? null,
    displayName: profile?.name ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    phone: profile?.phone ?? null,
  };
}

function mapProfile(r: Row): Profile {
  return {
    id: r.id,
    email: r.email ?? null,
    name: r.name ?? null,
    username: r.username ?? null,
    phone: r.phone ?? null,
    avatarUrl: r.avatar_url ?? null,
  };
}

function mapFlight(r: Row): Flight {
  return {
    id: r.id,
    tripId: r.trip_id,
    segment: r.segment,
    departureDate: r.departure_date,
    departureTime: r.departure_time,
    arrivalDate: r.arrival_date,
    arrivalTime: r.arrival_time,
    airline: r.airline,
    flightNumber: r.flight_number,
    fromAirport: r.from_airport,
    fromCity: r.from_city,
    toAirport: r.to_airport,
    toCity: r.to_city,
    estimatedCost: r.estimated_cost === null ? null : Number(r.estimated_cost),
    costType: r.cost_type,
    currency: r.currency,
  };
}

function mapDay(r: Row): ItineraryDay {
  return {
    id: r.id,
    tripId: r.trip_id,
    label: r.label,
    date: r.date,
    position: r.position,
  };
}

function mapItem(r: Row): ItineraryItem {
  return {
    id: r.id,
    dayId: r.day_id,
    tripId: r.trip_id,
    name: r.name,
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location,
    notes: r.notes,
    tickets: Array.isArray(r.tickets) ? r.tickets : [],
    estimatedCost: r.estimated_cost === null ? null : Number(r.estimated_cost),
    costType: r.cost_type,
    currency: r.currency,
    position: r.position,
  };
}

function mapExpense(r: Row): Expense {
  return {
    id: r.id,
    tripId: r.trip_id,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    splitType: r.split_type,
    paidBy: r.paid_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function mapSplit(r: Row): ExpenseSplit {
  return {
    expenseId: r.expense_id,
    tripId: r.trip_id,
    userId: r.user_id,
    shareAmount: Number(r.share_amount),
  };
}

function mapHousing(r: Row): Housing {
  return {
    id: r.id,
    tripId: r.trip_id,
    location: r.location,
    startDate: r.start_date,
    endDate: r.end_date,
    checkInTime: r.check_in_time,
    checkOutTime: r.check_out_time,
    earlyCheckInRequested: !!r.early_check_in_requested,
    estimatedCost: r.estimated_cost === null ? null : Number(r.estimated_cost),
    costType: r.cost_type,
    currency: r.currency,
  };
}

function mapSettlement(r: Row): Settlement {
  return {
    id: r.id,
    tripId: r.trip_id,
    fromUser: r.from_user,
    toUser: r.to_user,
    settledAt: r.settled_at,
    settledBy: r.settled_by,
  };
}

function throwing<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export interface FetchResult {
  trips: TripBundle[];
  pendingInvites: PendingInvite[];
}

/** One round of fetches for everything the user can see. Used on login, app
 * foreground, realtime reconnect, and as the coarse fallback refresh. */
export async function fetchAllTrips(
  client: SupabaseClient,
  userId: string,
): Promise<FetchResult> {
  const myMemberships = throwing<Row[]>(
    await client.from('trip_members').select('*').eq('user_id', userId),
  );

  const acceptedIds = myMemberships.filter((m) => m.status === 'accepted').map((m) => m.trip_id);
  const pendingRows = myMemberships.filter((m) => m.status === 'pending');
  const visibleIds = [...acceptedIds, ...pendingRows.map((m) => m.trip_id)];

  if (visibleIds.length === 0) return { trips: [], pendingInvites: [] };

  const tripRows = throwing<Row[]>(
    await client.from('trips').select('*').in('id', visibleIds),
  );

  const noChildren = acceptedIds.length === 0;
  const [memberRows, flightRows, dayRows, itemRows, expenseRows, splitRows, housingRows, settlementRows] =
    await Promise.all(
      noChildren
        ? [[], [], [], [], [], [], [], []].map((x) => Promise.resolve(x as Row[]))
        : [
            client.from('trip_members').select('*').in('trip_id', acceptedIds).then(throwing<Row[]>),
            client.from('flights').select('*').in('trip_id', acceptedIds).then(throwing<Row[]>),
            client.from('itinerary_days').select('*').in('trip_id', acceptedIds).order('position').then(throwing<Row[]>),
            client.from('itinerary_items').select('*').in('trip_id', acceptedIds).order('position').then(throwing<Row[]>),
            client.from('expenses').select('*').in('trip_id', acceptedIds).order('created_at').then(throwing<Row[]>),
            client.from('expense_splits').select('*').in('trip_id', acceptedIds).then(throwing<Row[]>),
            client.from('housing').select('*').in('trip_id', acceptedIds).then(throwing<Row[]>),
            client.from('settlements').select('*').in('trip_id', acceptedIds).then(throwing<Row[]>),
          ],
    );

  // Profiles for co-members and inviters, fetched once and joined in memory
  // (avoids depending on a PostgREST FK relationship name).
  const profileIds = [
    ...new Set([
      ...memberRows.map((m) => m.user_id as string),
      ...pendingRows.map((m) => m.invited_by as string).filter(Boolean),
    ]),
  ];
  const profileRows = profileIds.length
    ? throwing<Row[]>(
        await client
          .from('profiles')
          .select('id, email, name, username, phone, avatar_url')
          .in('id', profileIds),
      )
    : [];
  const profilesById = new Map(profileRows.map((r) => [r.id as string, mapProfile(r)]));

  const trips: TripBundle[] = tripRows
    .filter((t) => acceptedIds.includes(t.id))
    .map((t) => {
      const days: ItineraryDayWithItems[] = dayRows
        .filter((d) => d.trip_id === t.id)
        .map((d) => ({
          ...mapDay(d),
          items: itemRows.filter((i) => i.day_id === d.id).map(mapItem),
        }));
      const expenses: ExpenseWithSplits[] = expenseRows
        .filter((e) => e.trip_id === t.id)
        .map((e) => ({
          ...mapExpense(e),
          splits: splitRows.filter((s) => s.expense_id === e.id).map(mapSplit),
        }));
      return {
        trip: mapTrip(t),
        members: memberRows
          .filter((m) => m.trip_id === t.id)
          .map((m) => mapMember(m, profilesById.get(m.user_id))),
        flights: flightRows.filter((f) => f.trip_id === t.id).map(mapFlight),
        itinerary: days,
        expenses,
        housing: housingRows.filter((h) => h.trip_id === t.id).map(mapHousing),
        settlements: settlementRows.filter((s) => s.trip_id === t.id).map(mapSettlement),
      };
    });

  const pendingInvites: PendingInvite[] = pendingRows.flatMap((m) => {
    const t = tripRows.find((tr) => tr.id === m.trip_id);
    if (!t) return [];
    return [
      {
        memberRowId: m.id,
        tripId: m.trip_id,
        destination: t.destination,
        startDate: t.start_date,
        endDate: t.end_date,
        inviterName: m.invited_by ? (profilesById.get(m.invited_by)?.name ?? null) : null,
      },
    ];
  });

  return { trips, pendingInvites };
}

// ── Trips ─────────────────────────────────────────────────────────────────────

export interface TripInput {
  destination: string;
  startDate: string | null;
  endDate: string | null;
}

/** Creates the trip and the creator's owner membership (a personal trip is
 * just a trip with one member). */
export async function createTrip(
  client: SupabaseClient,
  userId: string,
  input: TripInput,
): Promise<Trip> {
  const row = throwing<Row>(
    await client
      .from('trips')
      .insert({
        destination: input.destination,
        start_date: input.startDate,
        end_date: input.endDate,
        created_by: userId,
      })
      .select('*')
      .single(),
  );
  throwing(
    await client
      .from('trip_members')
      .insert({ trip_id: row.id, user_id: userId, role: 'owner', status: 'accepted' })
      .select('id')
      .single(),
  );
  return mapTrip(row);
}

export async function updateTripDetails(
  client: SupabaseClient,
  tripId: string,
  input: TripInput,
): Promise<Trip> {
  const row = throwing<Row>(
    await client
      .from('trips')
      .update({
        destination: input.destination,
        start_date: input.startDate,
        end_date: input.endDate,
      })
      .eq('id', tripId)
      .select('*')
      .single(),
  );
  return mapTrip(row);
}

/** Owner-only (RLS enforced). Children cascade in the database. */
export async function deleteTrip(client: SupabaseClient, tripId: string): Promise<void> {
  throwing(await client.from('trips').delete().eq('id', tripId).select('id'));
}

// ── Membership & invites ─────────────────────────────────────────────────────

async function setMemberStatus(
  client: SupabaseClient,
  memberRowId: string,
  status: MemberStatus,
): Promise<void> {
  throwing(
    await client
      .from('trip_members')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', memberRowId)
      .select('id'),
  );
}

export function acceptInvite(client: SupabaseClient, memberRowId: string): Promise<void> {
  return setMemberStatus(client, memberRowId, 'accepted');
}

export function declineInvite(client: SupabaseClient, memberRowId: string): Promise<void> {
  return setMemberStatus(client, memberRowId, 'declined');
}

export async function leaveTrip(
  client: SupabaseClient,
  tripId: string,
  userId: string,
): Promise<void> {
  throwing(
    await client.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId).select('id'),
  );
}

/** Creates a link invite; returns the token to embed in the invite URL. */
export async function createInviteToken(
  client: SupabaseClient,
  tripId: string,
  inviterId: string,
): Promise<string> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  throwing(
    await client
      .from('trip_invites')
      .insert({ trip_id: tripId, inviter_id: inviterId, token, status: 'pending' })
      .select('id')
      .single(),
  );
  return token;
}

async function insertPendingMember(
  client: SupabaseClient,
  tripId: string,
  targetUserId: string,
  invitedBy: string,
): Promise<void> {
  const existing = throwing<Row | null>(
    await client
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', targetUserId)
      .maybeSingle(),
  );
  if (existing) throw new Error('That user is already part of this trip.');
  throwing(
    await client
      .from('trip_members')
      .insert({ trip_id: tripId, user_id: targetUserId, role: 'member', status: 'pending', invited_by: invitedBy })
      .select('id')
      .single(),
  );
}

export async function inviteByUsername(
  client: SupabaseClient,
  tripId: string,
  inviterId: string,
  username: string,
): Promise<void> {
  const profile = throwing<Row | null>(
    await client.from('profiles').select('id').eq('username', username).maybeSingle(),
  );
  if (!profile) throw new Error('No user found with that username.');
  if (profile.id === inviterId) throw new Error("You can't invite yourself.");
  await insertPendingMember(client, tripId, profile.id, inviterId);
}

export async function inviteByUserId(
  client: SupabaseClient,
  tripId: string,
  inviterId: string,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === inviterId) throw new Error("You can't invite yourself.");
  await insertPendingMember(client, tripId, targetUserId, inviterId);
}

/** Redeems an invite link: adds the user as a pending member of the trip.
 * Client-trusted for now; ADR 0007 moves this behind an edge function. */
export async function resolveInviteToken(
  client: SupabaseClient,
  userId: string,
  token: string,
): Promise<void> {
  const invite = throwing<Row | null>(
    await client
      .from('trip_invites')
      .select('id, trip_id, inviter_id')
      .eq('token', token)
      .eq('status', 'pending')
      .maybeSingle(),
  );
  if (!invite) throw new Error('Invite not found or already used.');

  const existing = throwing<Row | null>(
    await client
      .from('trip_members')
      .select('id')
      .eq('trip_id', invite.trip_id)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  if (!existing) {
    throwing(
      await client
        .from('trip_members')
        .insert({
          trip_id: invite.trip_id,
          user_id: userId,
          role: 'member',
          status: 'pending',
          invited_by: invite.inviter_id,
        })
        .select('id')
        .single(),
    );
  }
  throwing(await client.from('trip_invites').update({ status: 'accepted' }).eq('id', invite.id).select('id'));
}

// ── Flights ───────────────────────────────────────────────────────────────────

export interface FlightInput {
  segment?: Flight['segment'];
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  airline?: string | null;
  flightNumber?: string | null;
  fromAirport?: string | null;
  fromCity?: string | null;
  toAirport?: string | null;
  toCity?: string | null;
  estimatedCost?: number | null;
  costType?: Flight['costType'];
  currency?: string | null;
}

function flightRow(input: FlightInput): Row {
  return {
    segment: input.segment ?? null,
    departure_date: input.departureDate,
    departure_time: input.departureTime,
    arrival_date: input.arrivalDate ?? null,
    arrival_time: input.arrivalTime ?? null,
    airline: input.airline ?? null,
    flight_number: input.flightNumber ?? null,
    from_airport: input.fromAirport ?? null,
    from_city: input.fromCity ?? null,
    to_airport: input.toAirport ?? null,
    to_city: input.toCity ?? null,
    estimated_cost: input.estimatedCost ?? null,
    cost_type: input.costType ?? null,
    currency: input.currency ?? null,
  };
}

export async function addFlight(
  client: SupabaseClient,
  tripId: string,
  userId: string,
  input: FlightInput,
): Promise<Flight> {
  const row = throwing<Row>(
    await client
      .from('flights')
      .insert({ trip_id: tripId, created_by: userId, ...flightRow(input) })
      .select('*')
      .single(),
  );
  return mapFlight(row);
}

export async function updateFlight(
  client: SupabaseClient,
  flightId: string,
  input: FlightInput,
): Promise<Flight> {
  const row = throwing<Row>(
    await client.from('flights').update(flightRow(input)).eq('id', flightId).select('*').single(),
  );
  return mapFlight(row);
}

export async function deleteFlight(client: SupabaseClient, flightId: string): Promise<void> {
  throwing(await client.from('flights').delete().eq('id', flightId).select('id'));
}

export async function clearFlights(client: SupabaseClient, tripId: string): Promise<void> {
  throwing(await client.from('flights').delete().eq('trip_id', tripId).select('id'));
}

// ── Itinerary ─────────────────────────────────────────────────────────────────

export async function addItineraryDay(
  client: SupabaseClient,
  tripId: string,
  label: string,
  date: string | null,
  position: number,
): Promise<ItineraryDay> {
  const row = throwing<Row>(
    await client
      .from('itinerary_days')
      .insert({ trip_id: tripId, label, date, position })
      .select('*')
      .single(),
  );
  return mapDay(row);
}

export async function updateItineraryDay(
  client: SupabaseClient,
  dayId: string,
  updates: { label?: string; date?: string | null; position?: number },
): Promise<void> {
  const row: Row = {};
  if (updates.label !== undefined) row.label = updates.label;
  if (updates.date !== undefined) row.date = updates.date;
  if (updates.position !== undefined) row.position = updates.position;
  throwing(await client.from('itinerary_days').update(row).eq('id', dayId).select('id'));
}

export async function deleteItineraryDay(client: SupabaseClient, dayId: string): Promise<void> {
  throwing(await client.from('itinerary_days').delete().eq('id', dayId).select('id'));
}

/** Replaces a trip's whole itinerary (used by day renumbering after trip-date
 * edits). Items move with their day objects. */
export async function replaceItinerary(
  client: SupabaseClient,
  tripId: string,
  days: {
    label: string;
    date: string | null;
    items: Omit<ItineraryItem, 'id' | 'dayId' | 'tripId' | 'position'>[];
  }[],
): Promise<void> {
  throwing(await client.from('itinerary_days').delete().eq('trip_id', tripId).select('id'));
  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const dayRow = throwing<Row>(
      await client
        .from('itinerary_days')
        .insert({ trip_id: tripId, label: day.label, date: day.date, position: d + 1 })
        .select('id')
        .single(),
    );
    if (day.items.length) {
      throwing(
        await client
          .from('itinerary_items')
          .insert(
            day.items.map((item, i) => ({
              day_id: dayRow.id,
              trip_id: tripId,
              name: item.name,
              start_time: item.startTime,
              end_time: item.endTime,
              location: item.location,
              notes: item.notes,
              tickets: item.tickets,
              estimated_cost: item.estimatedCost,
              cost_type: item.costType,
              currency: item.currency,
              position: i + 1,
            })),
          )
          .select('id'),
      );
    }
  }
}

export interface ItineraryItemInput {
  name: string;
  startTime: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  tickets?: ItineraryItem['tickets'];
  estimatedCost?: number | null;
  costType?: ItineraryItem['costType'];
  currency?: string | null;
}

function itemRow(input: ItineraryItemInput): Row {
  return {
    name: input.name,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
    tickets: input.tickets ?? [],
    estimated_cost: input.estimatedCost ?? null,
    cost_type: input.costType ?? null,
    currency: input.currency ?? null,
  };
}

export async function addItineraryItem(
  client: SupabaseClient,
  tripId: string,
  dayId: string,
  userId: string,
  input: ItineraryItemInput,
  position: number,
): Promise<ItineraryItem> {
  const row = throwing<Row>(
    await client
      .from('itinerary_items')
      .insert({ day_id: dayId, trip_id: tripId, created_by: userId, position, ...itemRow(input) })
      .select('*')
      .single(),
  );
  return mapItem(row);
}

export async function updateItineraryItem(
  client: SupabaseClient,
  itemId: string,
  input: ItineraryItemInput,
): Promise<void> {
  throwing(await client.from('itinerary_items').update(itemRow(input)).eq('id', itemId).select('id'));
}

export async function deleteItineraryItem(client: SupabaseClient, itemId: string): Promise<void> {
  throwing(await client.from('itinerary_items').delete().eq('id', itemId).select('id'));
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface ExpenseInput {
  name: string;
  amount: number;
  currency: string;
  paidBy: string | null;
  /** Everyone sharing the cost, payer included. Empty/1 → unsplit expense. */
  participantIds: string[];
}

function buildSplitRows(expenseId: string, tripId: string, input: ExpenseInput): Row[] {
  const unique = [...new Set(input.participantIds)];
  if (unique.length < 2) return [];
  const share = evenShare(input.amount, unique.length);
  return unique.map((userId) => ({
    expense_id: expenseId,
    trip_id: tripId,
    user_id: userId,
    share_amount: share,
  }));
}

export async function addExpense(
  client: SupabaseClient,
  tripId: string,
  userId: string,
  input: ExpenseInput,
): Promise<ExpenseWithSplits> {
  const splitRows = buildSplitRows('', tripId, input); // expense_id filled below
  const row = throwing<Row>(
    await client
      .from('expenses')
      .insert({
        trip_id: tripId,
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        split_type: splitRows.length ? 'even' : 'none',
        paid_by: input.paidBy,
        created_by: userId,
      })
      .select('*')
      .single(),
  );
  let splits: ExpenseSplit[] = [];
  if (splitRows.length) {
    const inserted = throwing<Row[]>(
      await client
        .from('expense_splits')
        .insert(splitRows.map((s) => ({ ...s, expense_id: row.id })))
        .select('*'),
    );
    splits = inserted.map(mapSplit);
  }
  return { ...mapExpense(row), splits };
}

export async function updateExpense(
  client: SupabaseClient,
  tripId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<void> {
  const splitRows = buildSplitRows(expenseId, tripId, input);
  throwing(
    await client
      .from('expenses')
      .update({
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        split_type: splitRows.length ? 'even' : 'none',
        paid_by: input.paidBy,
      })
      .eq('id', expenseId)
      .select('id'),
  );
  // Replace splits wholesale — participant sets are tiny.
  throwing(await client.from('expense_splits').delete().eq('expense_id', expenseId).select('expense_id'));
  if (splitRows.length) {
    throwing(await client.from('expense_splits').insert(splitRows).select('expense_id'));
  }
}

export async function deleteExpense(client: SupabaseClient, expenseId: string): Promise<void> {
  throwing(await client.from('expenses').delete().eq('id', expenseId).select('id'));
}

// ── Housing ───────────────────────────────────────────────────────────────────

export interface HousingInput {
  location: string;
  startDate: string | null;
  endDate: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  earlyCheckInRequested?: boolean;
  estimatedCost?: number | null;
  costType?: Housing['costType'];
  currency?: string | null;
}

export async function addHousing(
  client: SupabaseClient,
  tripId: string,
  userId: string,
  input: HousingInput,
): Promise<Housing> {
  const row = throwing<Row>(
    await client
      .from('housing')
      .insert({
        trip_id: tripId,
        created_by: userId,
        location: input.location,
        start_date: input.startDate,
        end_date: input.endDate,
        check_in_time: input.checkInTime ?? null,
        check_out_time: input.checkOutTime ?? null,
        early_check_in_requested: input.earlyCheckInRequested ?? false,
        estimated_cost: input.estimatedCost ?? null,
        cost_type: input.costType ?? null,
        currency: input.currency ?? null,
      })
      .select('*')
      .single(),
  );
  return mapHousing(row);
}

export async function deleteHousing(client: SupabaseClient, housingId: string): Promise<void> {
  throwing(await client.from('housing').delete().eq('id', housingId).select('id'));
}

// ── Settlements ───────────────────────────────────────────────────────────────

export async function markSettled(
  client: SupabaseClient,
  tripId: string,
  fromUser: string,
  toUser: string,
  settledBy: string,
): Promise<Settlement> {
  const row = throwing<Row>(
    await client
      .from('settlements')
      .insert({ trip_id: tripId, from_user: fromUser, to_user: toUser, settled_by: settledBy })
      .select('*')
      .single(),
  );
  return mapSettlement(row);
}

export async function unmarkSettled(
  client: SupabaseClient,
  tripId: string,
  fromUser: string,
  toUser: string,
): Promise<void> {
  throwing(
    await client
      .from('settlements')
      .delete()
      .eq('trip_id', tripId)
      .eq('from_user', fromUser)
      .eq('to_user', toUser)
      .select('id'),
  );
}
