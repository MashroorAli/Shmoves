// App-level types for the normalized schema (ADR 0003). camelCase here;
// snake_case only at the DB boundary (see the mappers in data.ts).

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

export interface Trip {
  id: string;
  destination: string;
  startDate: string | null; // ISO date
  endDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = 'owner' | 'member';
export type MemberStatus = 'pending' | 'accepted' | 'declined';

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string | null;
  // Denormalized from profiles at fetch time.
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
}

export type CostType = 'total' | 'per_person';

/** Fields shared by every plannable item that carries an estimate (ADR 0006). */
export interface EstimatedCostFields {
  estimatedCost: number | null;
  costType: CostType | null;
  currency: string | null;
}

export type FlightSegment = 'auto' | 'going' | 'mid' | 'return';

export interface Flight extends EstimatedCostFields {
  id: string;
  tripId: string;
  segment: FlightSegment | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  airline: string | null;
  flightNumber: string | null;
  fromAirport: string | null;
  fromCity: string | null;
  toAirport: string | null;
  toCity: string | null;
}

export interface TicketAttachment {
  id: string;
  name: string;
  url: string;
  type: 'pdf' | 'image';
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  label: string;
  date: string | null;
  position: number;
}

export interface ItineraryItem extends EstimatedCostFields {
  id: string;
  dayId: string;
  tripId: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  tickets: TicketAttachment[];
  position: number;
}

export interface ItineraryDayWithItems extends ItineraryDay {
  items: ItineraryItem[];
}

export type SplitType = 'none' | 'even' | 'custom';

export interface Expense {
  id: string;
  tripId: string;
  name: string;
  amount: number;
  currency: string;
  splitType: SplitType;
  paidBy: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** One row per participant per expense, payer included. */
export interface ExpenseSplit {
  expenseId: string;
  tripId: string;
  userId: string;
  shareAmount: number;
}

export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
}

export interface Housing extends EstimatedCostFields {
  id: string;
  tripId: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  earlyCheckInRequested: boolean;
}

export interface Settlement {
  id: string;
  tripId: string;
  fromUser: string;
  toUser: string;
  settledAt: string;
  settledBy: string | null;
}

export interface TripDocument {
  id: string;
  tripId: string;
  name: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

/** Everything a client needs to render one trip. */
export interface TripBundle {
  trip: Trip;
  members: TripMember[];
  flights: Flight[];
  itinerary: ItineraryDayWithItems[];
  expenses: ExpenseWithSplits[];
  housing: Housing[];
  settlements: Settlement[];
}

/** A trip the user has been invited to but hasn't accepted yet. */
export interface PendingInvite {
  memberRowId: string;
  tripId: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  inviterName: string | null;
}
