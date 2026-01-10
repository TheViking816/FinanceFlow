import { useEffect, useState } from 'react';
import { loadCachedFxRates, loadFxRatesFromSheet } from '../lib/fxRates';

const DEFAULT_SHEET_URL =
  (import.meta.env.VITE_FX_SHEET_URL || '').trim() ||
  (import.meta.env.VITE_PRICES_SHEET_URL || '').trim() ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?gid=1414892855&single=true&output=csv';

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
