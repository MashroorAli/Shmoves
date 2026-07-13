'use client';

import { CURRENCIES } from '@/constants/currencies';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function CurrencySelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v: string | null) => v && onChange(v)} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} — {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
