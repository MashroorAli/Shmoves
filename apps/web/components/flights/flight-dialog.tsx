'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CurrencySelect } from '@/components/shared/currency-select';
import { DateField } from '@/components/shared/date-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inferDestinationCurrency } from '@/constants/currencies';
import {
  type Flight,
  type FlightInput,
  useTrips,
} from '@/context/trips-context';

const SEGMENT_LABELS: Record<string, string> = {
  going: 'Outbound',
  mid: 'Mid-trip',
  return: 'Return',
};

export function FlightDialog({
  open,
  onOpenChange,
  tripId,
  destination,
  flight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Used to pick a sensible default currency for new flights. */
  destination: string;
  /** Present = edit, absent = create. */
  flight?: Flight;
}) {
  const { addFlight, updateFlight } = useTrips();

  const [segment, setSegment] = useState<'going' | 'mid' | 'return'>('going');
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [fromCity, setFromCity] = useState('');
  const [fromAirport, setFromAirport] = useState('');
  const [toCity, setToCity] = useState('');
  const [toAirport, setToAirport] = useState('');
  const [departureDate, setDepartureDate] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalDate, setArrivalDate] = useState<string | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [cost, setCost] = useState('');
  const [costType, setCostType] = useState<'total' | 'per_person'>('per_person');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSegment(
        flight?.segment && flight.segment !== 'auto' ? flight.segment : 'going',
      );
      setAirline(flight?.airline ?? '');
      setFlightNumber(flight?.flightNumber ?? '');
      setFromCity(flight?.fromCity ?? '');
      setFromAirport(flight?.fromAirport ?? '');
      setToCity(flight?.toCity ?? '');
      setToAirport(flight?.toAirport ?? '');
      setDepartureDate(flight?.departureDate ?? null);
      setDepartureTime(flight?.departureTime ?? '');
      setArrivalDate(flight?.arrivalDate ?? null);
      setArrivalTime(flight?.arrivalTime ?? '');
      setCost(flight?.estimatedCost != null ? String(flight.estimatedCost) : '');
      setCostType(flight?.costType ?? 'per_person');
      setCurrency(flight?.currency ?? inferDestinationCurrency(destination) ?? 'USD');
    }
  }, [open, flight, destination]);

  const save = async () => {
    const parsedCost = cost.trim() === '' ? null : Number(cost);
    if (parsedCost != null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      toast.error('Estimated cost must be a positive number.');
      return;
    }
    setBusy(true);
    try {
      const input: FlightInput = {
        segment,
        departureDate,
        departureTime: departureTime || null,
        arrivalDate,
        arrivalTime: arrivalTime || null,
        airline: airline.trim() || null,
        flightNumber: flightNumber.trim().toUpperCase() || null,
        fromCity: fromCity.trim() || null,
        fromAirport: fromAirport.trim().toUpperCase() || null,
        toCity: toCity.trim() || null,
        toAirport: toAirport.trim().toUpperCase() || null,
        estimatedCost: parsedCost,
        costType: parsedCost != null ? costType : null,
        currency: parsedCost != null ? currency : null,
      };
      if (flight) {
        await updateFlight(tripId, flight.id, input);
      } else {
        await addFlight(tripId, input);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the flight.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{flight ? 'Edit flight' : 'Add a flight'}</DialogTitle>
          <DialogDescription>Flight details for the group to see.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Leg</Label>
              <Select
                value={segment}
                items={SEGMENT_LABELS}
                onValueChange={(v: string | null) =>
                  v && setSegment(v as 'going' | 'mid' | 'return')
                }
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="flight-airline">Airline</Label>
              <Input
                id="flight-airline"
                placeholder="ANA"
                value={airline}
                onChange={(e) => setAirline(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="flight-number">Flight #</Label>
              <Input
                id="flight-number"
                placeholder="NH 7"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="flight-from-city">From</Label>
              <Input
                id="flight-from-city"
                placeholder="Chicago"
                value={fromCity}
                onChange={(e) => setFromCity(e.target.value)}
                disabled={busy}
              />
              <Input
                aria-label="From airport code"
                placeholder="ORD"
                value={fromAirport}
                onChange={(e) => setFromAirport(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="flight-to-city">To</Label>
              <Input
                id="flight-to-city"
                placeholder="Tokyo"
                value={toCity}
                onChange={(e) => setToCity(e.target.value)}
                disabled={busy}
              />
              <Input
                aria-label="To airport code"
                placeholder="HND"
                value={toAirport}
                onChange={(e) => setToAirport(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Departure</Label>
              <DateField value={departureDate} onChange={setDepartureDate} disabled={busy} />
              <Input
                aria-label="Departure time"
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Arrival</Label>
              <DateField value={arrivalDate} onChange={setArrivalDate} clearable disabled={busy} />
              <Input
                aria-label="Arrival time"
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="flight-cost">Est. cost</Label>
              <Input
                id="flight-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Cost type</Label>
              <Select
                value={costType}
                items={{ total: 'Total', per_person: 'Per person' }}
                onValueChange={(v: string | null) => v && setCostType(v as 'total' | 'per_person')}
                disabled={busy || cost.trim() === ''}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="per_person">Per person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Currency</Label>
              <CurrencySelect
                value={currency}
                onChange={setCurrency}
                disabled={busy || cost.trim() === ''}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : flight ? 'Save' : 'Add flight'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
