import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'financeflow-theme';

const getSystemPrefersDark = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

type DarkModeContextValue = {
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const DarkModeContext = createContext<DarkModeContextValue | undefined>(undefined);

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return saved ?? 'system';
  });

  const isDark = useMemo(() => {
    if (preference === 'system') {
      return getSystemPrefersDark();
    }
    return preference === 'dark';
  }, [preference]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (preference === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
  }, [preference]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (preference === 'system') {
        const root = document.documentElement;
        if (media.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', handler);
    } else {
      media.addListener(handler);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', handler);
      } else {
        media.removeListener(handler);
      }
    };
  }, [preference]);

  const value = useMemo(() => ({ isDark, preference, setPreference }), [isDark, preference]);

  return <DarkModeContext.Provider value={value}>{children}</DarkModeContext.Provider>;
};

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within DarkModeProvider.');
  }
  return context;
};
