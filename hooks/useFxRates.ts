import { useEffect, useState } from 'react';
import { loadCachedFxRates, loadFxRatesFromSheet } from '../lib/fxRates';

const DEFAULT_SHEET_URL =
  (import.meta.env.VITE_FX_SHEET_URL || '').trim() ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYJOJWwE8W3CK9l69jvJWsyqtnAwcc6egDIALEnsb0l1U5NJ9LZBem1xzO7IM0cEOX-47GtryFBBIk/pub?output=csv';

export const useFxRates = (baseCurrency: string) => {
  const normalizedBase = baseCurrency.toUpperCase();
  const [rates, setRates] = useState<Record<string, number>>(() => loadCachedFxRates() ?? {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadFxRatesFromSheet(DEFAULT_SHEET_URL, normalizedBase)
      .then((fxRates) => {
        if (!active) return;
        setRates(fxRates);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar FX.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [normalizedBase]);

  return { rates, loading, error, sheetUrl: DEFAULT_SHEET_URL };
};
