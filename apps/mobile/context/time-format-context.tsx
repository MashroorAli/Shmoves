import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type TimeFormat = '12h' | '24h';

const STORAGE_KEY = 'USER_TIME_FORMAT';
const DEFAULT_FORMAT: TimeFormat = '12h';

interface TimeFormatContextValue {
  timeFormat: TimeFormat;
  setTimeFormat: (format: TimeFormat) => void;
  formatTime: (time24: string) => string;
}

const TimeFormatContext = createContext<TimeFormatContextValue>({
  timeFormat: DEFAULT_FORMAT,
  setTimeFormat: () => {},
  formatTime: (t) => {
    const [hStr, mStr] = t.split(':');
    const h = Number(hStr);
    const m = mStr ?? '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  },
});

export function TimeFormatProvider({ children }: { children: React.ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(DEFAULT_FORMAT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === '12h' || stored === '24h') setTimeFormatState(stored);
    });
  }, []);

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setTimeFormatState(format);
    AsyncStorage.setItem(STORAGE_KEY, format);
  }, []);

  const formatTime = useCallback((time24: string): string => {
    const [hStr, mStr] = time24.split(':');
    const h = Number(hStr);
    const m = mStr ?? '00';
    if (timeFormat === '24h') {
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  }, [timeFormat]);

  return (
    <TimeFormatContext.Provider value={{ timeFormat, setTimeFormat, formatTime }}>
      {children}
    </TimeFormatContext.Provider>
  );
}

export function useTimeFormat() {
  return useContext(TimeFormatContext);
}
