import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { type AccentKey, ACCENT_PALETTES } from '@/constants/theme';

const STORAGE_KEY = 'USER_ACCENT_KEY';
const DEFAULT_ACCENT: AccentKey = 'lavender';

interface AccentContextValue {
  accentKey: AccentKey;
  setAccent: (key: AccentKey) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accentKey: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setAccentKey] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in ACCENT_PALETTES) setAccentKey(stored as AccentKey);
    });
  }, []);

  const setAccent = useCallback((key: AccentKey) => {
    setAccentKey(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }, []);

  return (
    <AccentContext.Provider value={{ accentKey, setAccent }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  return useContext(AccentContext);
}
