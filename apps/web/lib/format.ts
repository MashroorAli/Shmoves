import { CURRENCY_SYMBOLS } from '@/constants/currencies';

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    // Unknown/legacy currency code — fall back to symbol map.
    const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }
}
