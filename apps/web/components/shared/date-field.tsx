'use client';

import { format, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Dates are local calendar dates as 'yyyy-MM-dd' strings end to end.
// parse/format keep everything in local time — never toISOString(), which
// shifts to UTC and produces off-by-one dates (repo-wide rule).
const DATE_FMT = 'yyyy-MM-dd';

export function toDate(value: string): Date {
  return parse(value, DATE_FMT, new Date());
}

export function toDateString(date: Date): string {
  return format(date, DATE_FMT);
}

export function DateField({
  value,
  onChange,
  placeholder = 'Pick a date',
  clearable = false,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const selected = value ? toDate(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 size-4" />
        {selected ? format(selected, 'PPP') : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d?: Date) => onChange(d ? toDateString(d) : null)}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(null)}>
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
