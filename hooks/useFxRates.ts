import { useEffect, useState } from 'react';
import { loadCachedFxRates, loadFxRatesFromSheet } from '../lib/fxRates';

const DEFAULT_SHEET_URL =
  (import.meta.env.VITE_FX_SHEET_URL || '').trim() ||
  'https://docs.google.com/spreadsheets/d/1qAbm-hZsbCsmgw5udyF7rPB1C2dK59S3qF4kQ-BHy9I/edit?gid=0';

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
