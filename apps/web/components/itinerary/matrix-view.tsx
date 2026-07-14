'use client';

// Spreadsheet-style itinerary grid: one column per trip day, 30-minute rows,
// and a color-coded housing banner across the top (the layout of the group's
// original Google Sheets planner). Items render at their scheduled times;
// clicking an empty slot adds an item at that time, clicking an item edits it.

import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';

import { toDate, toDateString } from '@/components/shared/date-field';
import { ItemDialog } from '@/components/itinerary/item-dialog';
import {
  type Housing,
  type ItineraryDayWithItems,
  type ItineraryItem,
  type TripBundle,
} from '@/context/trips-context';

const DAY_START_MIN = 6 * 60 + 30; // grid starts 6:30 AM
const DAY_END_MIN = 24 * 60; // …and ends at midnight
const SLOT_MIN = 30;
const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;
const SLOT_PX = 24;

// Housing banner colors — saturated enough to carry white text in both themes.
const STAY_COLORS = [
  'oklch(0.46 0.10 262)', // slate blue
  'oklch(0.42 0.12 318)', // plum
  'oklch(0.45 0.09 195)', // teal
  'oklch(0.52 0.10 82)', // bronze
  'oklch(0.46 0.11 150)', // pine
];

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function slotLabel(slot: number): string {
  const min = DAY_START_MIN + slot * SLOT_MIN;
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function slotToTime(slot: number): string {
  const min = DAY_START_MIN + slot * SLOT_MIN;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

interface DayColumn {
  date: string; // yyyy-MM-dd
  day: ItineraryDayWithItems | null; // matching itinerary day, if one exists
}

/** Timed items with computed rows, plus a lane so overlaps sit side by side. */
interface PlacedItem {
  item: ItineraryItem;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

function placeItems(items: ItineraryItem[]): { placed: PlacedItem[]; untimed: ItineraryItem[] } {
  const untimed: ItineraryItem[] = [];
  const timed: { item: ItineraryItem; start: number; end: number }[] = [];
  for (const item of items) {
    const start = toMinutes(item.startTime);
    if (start === null) {
      untimed.push(item);
      continue;
    }
    const end = toMinutes(item.endTime) ?? start + 60; // no end time → 1-hour block
    timed.push({
      item,
      start: Math.max(start, DAY_START_MIN),
      end: Math.min(Math.max(end, start + SLOT_MIN), DAY_END_MIN),
    });
  }
  timed.sort((a, b) => a.start - b.start || a.end - b.end);

  // Greedy lane assignment for overlapping blocks.
  const laneEnds: number[] = [];
  const withLanes = timed.map((t) => {
    let lane = laneEnds.findIndex((end) => end <= t.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = t.end;
    return { ...t, lane };
  });
  const lanes = Math.max(1, laneEnds.length);

  const placed = withLanes.map((t) => ({
    item: t.item,
    top: ((t.start - DAY_START_MIN) / SLOT_MIN) * SLOT_PX,
    height: Math.max(((t.end - t.start) / SLOT_MIN) * SLOT_PX - 2, SLOT_PX - 2),
    lane: t.lane,
    lanes,
  }));
  return { placed, untimed };
}

export function MatrixView({ bundle }: { bundle: TripBundle }) {
  const { trip } = bundle;
  const [addTarget, setAddTarget] = useState<{ dayId: string; time: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ dayId: string; item: ItineraryItem } | null>(
    null,
  );

  const columns = useMemo<DayColumn[]>(() => {
    const byDate = new Map(bundle.itinerary.filter((d) => d.date).map((d) => [d.date!, d]));
    const dates: string[] = [];
    if (trip.startDate && trip.endDate && trip.startDate <= trip.endDate) {
      for (
        let d = toDate(trip.startDate), end = toDate(trip.endDate);
        d <= end;
        d = addDays(d, 1)
      ) {
        dates.push(toDateString(d));
      }
    }
    for (const date of byDate.keys()) if (!dates.includes(date)) dates.push(date);
    dates.sort();
    return dates.map((date) => ({ date, day: byDate.get(date) ?? null }));
  }, [trip.startDate, trip.endDate, bundle.itinerary]);

  // A day belongs to the stay whose [check-in, check-out) covers that night;
  // on a moving day the departing stay's checkout column is claimed by the
  // arriving stay, like the split day in the original sheet.
  const stayBlocks = useMemo(() => {
    const stays = [...bundle.housing]
      .filter((h) => h.startDate)
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
    const blocks: { stay: Housing; color: string; from: number; to: number }[] = [];
    stays.forEach((stay, i) => {
      const from = columns.findIndex((c) => c.date >= stay.startDate!);
      if (from === -1) return;
      let to = stay.endDate
        ? columns.findIndex((c) => c.date >= stay.endDate!)
        : columns.length - 1;
      if (to === -1) to = columns.length - 1;
      // Give the checkout column to the next stay when it starts that day.
      const next = stays[i + 1];
      if (next && stay.endDate && next.startDate === stay.endDate) to = to - 1;
      if (to < from) to = from;
      blocks.push({ stay, color: STAY_COLORS[i % STAY_COLORS.length], from, to });
    });
    return blocks;
  }, [bundle.housing, columns]);

  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Set the trip dates (or give itinerary days dates) to use the matrix view.
      </p>
    );
  }

  const handleSlotClick = (col: DayColumn, e: React.MouseEvent<HTMLDivElement>) => {
    if (!col.day) return; // no itinerary day for this date yet
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = Math.min(
      Math.max(Math.floor((e.clientY - rect.top) / SLOT_PX), 0),
      SLOT_COUNT - 1,
    );
    setAddTarget({ dayId: col.day.id, time: slotToTime(slot) });
  };

  return (
    <div className="overflow-auto rounded-lg border" style={{ maxHeight: '72vh' }}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `6rem repeat(${columns.length}, minmax(10rem, 1fr))`,
          gridTemplateRows: `2.75rem 2.5rem auto ${SLOT_COUNT * SLOT_PX}px`,
          minWidth: `${6 + columns.length * 10}rem`,
        }}
      >
        {/* ── Row 1: housing banner ── */}
        <div className="sticky top-0 left-0 z-30 flex items-center border-r border-b bg-card px-2 text-xs font-semibold">
          Housing
        </div>
        {columns.map((c, i) => (
          <div
            key={`hbg-${c.date}`}
            className="sticky top-0 z-10 border-b bg-card"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          />
        ))}
        {stayBlocks.map(({ stay, color, from, to }) => (
          <a
            key={stay.id}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.location)}`}
            target="_blank"
            rel="noreferrer"
            title={`${stay.location} — open in Google Maps`}
            className="sticky top-0 z-20 m-0.5 flex items-center justify-center truncate rounded-sm px-2 text-center text-xs font-medium text-white hover:opacity-90"
            style={{ gridColumn: `${from + 2} / ${to + 3}`, gridRow: 1, backgroundColor: color }}
          >
            <span className="truncate">{stay.location}</span>
          </a>
        ))}

        {/* ── Row 2: day headers ── */}
        <div className="sticky top-11 left-0 z-30 border-r border-b bg-card" />
        {columns.map((c, i) => (
          <div
            key={`day-${c.date}`}
            className="sticky top-11 z-10 flex flex-col items-center justify-center border-r border-b bg-card px-1 text-center"
            style={{ gridColumn: i + 2, gridRow: 2 }}
          >
            <span className="text-xs font-semibold">{format(toDate(c.date), 'EEEE')}</span>
            <span className="text-xs text-muted-foreground">
              {format(toDate(c.date), 'MMM d')}
              {c.day ? '' : ' · no day yet'}
            </span>
          </div>
        ))}

        {/* ── Row 3: untimed items ── */}
        <div className="sticky left-0 z-20 border-r border-b bg-card px-2 py-1 text-[10px] text-muted-foreground">
          Anytime
        </div>
        {columns.map((c, i) => {
          const untimed = c.day ? placeItems(c.day.items).untimed : [];
          return (
            <div
              key={`any-${c.date}`}
              className="flex min-h-6 flex-wrap gap-1 border-r border-b bg-background/50 p-1"
              style={{ gridColumn: i + 2, gridRow: 3 }}
            >
              {untimed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => c.day && setEditTarget({ dayId: c.day.id, item })}
                  className="max-w-full truncate rounded-sm bg-secondary px-1.5 py-0.5 text-left text-[11px] hover:bg-accent"
                >
                  {item.name}
                </button>
              ))}
            </div>
          );
        })}

        {/* ── Row 4: time labels + day columns ── */}
        <div className="sticky left-0 z-20 border-r bg-card" style={{ gridColumn: 1, gridRow: 4 }}>
          {Array.from({ length: SLOT_COUNT }, (_, s) => (
            <div
              key={s}
              className="flex items-start justify-end border-b pt-0.5 pr-2 text-[10px] text-muted-foreground tabular-nums"
              style={{ height: SLOT_PX }}
            >
              {slotLabel(s)}
            </div>
          ))}
        </div>
        {columns.map((c, i) => {
          const placed = c.day ? placeItems(c.day.items).placed : [];
          return (
            <div
              key={`col-${c.date}`}
              className="relative cursor-pointer border-r"
              style={{
                gridColumn: i + 2,
                gridRow: 4,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${SLOT_PX - 1}px, var(--border) ${SLOT_PX - 1}px, var(--border) ${SLOT_PX}px)`,
              }}
              onClick={(e) => handleSlotClick(c, e)}
            >
              {placed.map(({ item, top, height, lane, lanes }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (c.day) setEditTarget({ dayId: c.day.id, item });
                  }}
                  className="absolute overflow-hidden rounded-sm border-l-2 border-primary bg-primary/15 px-1.5 py-0.5 text-left text-[11px] leading-tight hover:bg-primary/25"
                  style={{
                    top,
                    height,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${(1 / lanes) * 100}% - 4px)`,
                  }}
                  title={item.name}
                >
                  <span className="font-medium">{item.name}</span>
                  {item.location && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {item.location}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <ItemDialog
        open={addTarget !== null}
        onOpenChange={(o) => !o && setAddTarget(null)}
        tripId={trip.id}
        dayId={addTarget?.dayId ?? ''}
        destination={trip.destination}
        defaultStartTime={addTarget?.time}
      />
      <ItemDialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        tripId={trip.id}
        dayId={editTarget?.dayId ?? ''}
        destination={trip.destination}
        item={editTarget?.item}
      />
    </div>
  );
}
