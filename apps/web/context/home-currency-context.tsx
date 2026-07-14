'use client';

// Web port of apps/mobile/context/home-currency-context.tsx — keep the two in
// sync. localStorage here instead of AsyncStorage; same keys, cache TTL, and
// rate semantics so both platforms convert identically (ADR 0006).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'USER_HOME_CURRENCY';
const RATES_CACHE_KEY_PREFIX = 'EXCHANGE_RATES_';
const RATES_TTL_MS = 60 * 60 * 1000; // 1 hour

interface RatesCache {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

interface HomeCurrencyContextValue {
  homeCurrency: string;
  setHomeCurrency: (code: string) => void;
  // Returns the converted amount, or null if rates aren't loaded yet.
  convertToHome: (amount: number, fromCurrency: string) => number | null;
  ratesReady: boolean;
}

const HomeCurrencyContext = createContext<HomeCurrencyContextValue>({
  homeCurrency: 'USD',
  setHomeCurrency: () => {},
  convertToHome: () => null,
  ratesReady: false,
});

async function fetchRates(base: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.result !== 'success') return null;
    return json.rates as Record<string, number>;
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function HomeCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [homeCurrency, setHomeCurrencyState] = useState('USD');
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesReady, setRatesReady] = useState(false);
  const loadedBase = useRef<string | null>(null);

  const loadRates = useCallback(async (base: string) => {
    if (loadedBase.current === base && ratesReady) return;
    loadedBase.current = base;
    setRatesReady(false);

    const cacheKey = `${RATES_CACHE_KEY_PREFIX}${base}`;
    const raw = readStorage(cacheKey);
    if (raw) {
      try {
        const cached: RatesCache = JSON.parse(raw);
        if (cached.base === base && Date.now() - cached.fetchedAt < RATES_TTL_MS) {
          setRates(cached.rates);
          setRatesReady(true);
          return;
        }
      } catch {}
    }

    const fresh = await fetchRates(base);
    if (fresh) {
      setRates(fresh);
      setRatesReady(true);
      const cache: RatesCache = { base, rates: fresh, fetchedAt: Date.now() };
      writeStorage(cacheKey, JSON.stringify(cache));
    } else if (raw) {
      // Network failed — use stale cache if available
      try {
        const cached: RatesCache = JSON.parse(raw);
        setRates(cached.rates);
        setRatesReady(true);
      } catch {}
    }
  }, [ratesReady]);

  useEffect(() => {
    const base = readStorage(STORAGE_KEY) ?? 'USD';
    setHomeCurrencyState(base);
    loadRates(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setHomeCurrency = useCallback(
    (code: string) => {
      setHomeCurrencyState(code);
      loadedBase.current = null;
      writeStorage(STORAGE_KEY, code);
      loadRates(code);
    },
    [loadRates],
  );

  const convertToHome = useCallback(
    (amount: number, fromCurrency: string): number | null => {
      if (fromCurrency === homeCurrency) return amount;
      if (!rates) return null;
      const rate = rates[fromCurrency];
      if (!rate) return null;
      // rates[X] = "how many X per 1 home unit", so amount_home = amount_foreign / rate
      return amount / rate;
    },
    [homeCurrency, rates],
  );

  return (
    <HomeCurrencyContext.Provider value={{ homeCurrency, setHomeCurrency, convertToHome, ratesReady }}>
      {children}
    </HomeCurrencyContext.Provider>
  );
}

export function useHomeCurrency() {
  return useContext(HomeCurrencyContext);
}
