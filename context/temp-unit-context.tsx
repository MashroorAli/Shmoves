import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type TempUnit = 'F' | 'C';

const STORAGE_KEY = 'USER_TEMP_UNIT';
const DEFAULT_UNIT: TempUnit = 'F';

interface TempUnitContextValue {
  tempUnit: TempUnit;
  setTempUnit: (unit: TempUnit) => void;
  formatTemp: (celsius: number) => string;
}

const TempUnitContext = createContext<TempUnitContextValue>({
  tempUnit: DEFAULT_UNIT,
  setTempUnit: () => {},
  formatTemp: (c) => `${Math.round(c * 9 / 5 + 32)}°F`,
});

export function TempUnitProvider({ children }: { children: React.ReactNode }) {
  const [tempUnit, setTempUnitState] = useState<TempUnit>(DEFAULT_UNIT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'F' || stored === 'C') setTempUnitState(stored);
    });
  }, []);

  const setTempUnit = useCallback((unit: TempUnit) => {
    setTempUnitState(unit);
    AsyncStorage.setItem(STORAGE_KEY, unit);
  }, []);

  const formatTemp = useCallback((celsius: number) => {
    if (tempUnit === 'F') return `${Math.round(celsius * 9 / 5 + 32)}°F`;
    return `${Math.round(celsius)}°C`;
  }, [tempUnit]);

  return (
    <TempUnitContext.Provider value={{ tempUnit, setTempUnit, formatTemp }}>
      {children}
    </TempUnitContext.Provider>
  );
}

export function useTempUnit() {
  return useContext(TempUnitContext);
}
