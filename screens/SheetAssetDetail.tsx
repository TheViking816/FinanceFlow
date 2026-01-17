import React, { useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getSheetHoldings } from '../data/prices';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import { useFxRates } from '../hooks/useFxRates';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { formatCurrency, formatNumber } from '../lib/format';

const slugifyLogoKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const logoModules = import.meta.glob('../assets/logos/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  as: 'url',
});
const logosByName = new Map(
  Object.entries(logoModules).map(([path, url]) => {
    const filename = path.split('/').pop() ?? '';
    const name = slugifyLogoKey(filename.replace(/\.[^.]+$/, ''));
    return [name, url as string];
  }),
);

const MARKET_LOGO_SUFFIX: Record<string, string> = {
  BME: 'mc',
  AMS: 'as',
  EPA: 'pa',
  LON: 'l',
  HKG: 'hk',
};

const resolveLogoUrl = (name: string | null | undefined, ticker: string, market: string | null | undefined) => {
  const marketCode = (market ?? '').toUpperCase();
  const suffix = MARKET_LOGO_SUFFIX[marketCode];
  const candidates = [
    name ? slugifyLogoKey(name) : '',
    slugifyLogoKey(ticker),
    suffix ? slugifyLogoKey(`${ticker}-${suffix}`) : '',
    suffix ? slugifyLogoKey(`${suffix}-${ticker}`) : '',
    market ? slugifyLogoKey(`${ticker}-${market}`) : '',
    market ? slugifyLogoKey(`${market}-${ticker}`) : '',
  ].filter(Boolean);
  for (const key of candidates) {
    const url = logosByName.get(key);
    if (url) return url;
  }
  return undefined;
};

const SheetAssetDetail: React.FC = () => {
  const navigate = useNavigate();
  const { ticker } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const market = params.get('market') || null;

  const { data, loading, error } = useQuery(async () => {
    const [profile, sheetHoldings] = await Promise.all([getProfile(), getSheetHoldings()]);
    return { profile, sheetHoldings };
  }, []);

  const baseCurrency = (data?.profile?.base_currency ?? 'EUR').toUpperCase();
  const { rates: fxRates } = useFxRates(baseCurrency);

  const selected = useMemo(() => {
    if (!data || !ticker) return null;
    const normalizedTicker = ticker.toUpperCase();
    return data.sheetHoldings.find((entry) => {
      const sameTicker = entry.ticker.toUpperCase() === normalizedTicker;
      const sameMarket = (entry.market ?? '') === (market ?? '');
      return sameTicker && sameMarket;
    }) ?? null;
  }, [data, ticker, market]);

  const totals = useMemo(() => {
    if (!data) return { totalBase: 0 };
    const totalBase = data.sheetHoldings.reduce((sum, entry) => {
      const value = Number(entry.price) * Number(entry.quantity);
      const currency = (entry.currency || baseCurrency).toUpperCase();
      const rate = currency === baseCurrency ? 1 : fxRates?.[currency];
      return sum + (rate ? value * rate : value);
    }, 0);
    return { totalBase };
  }, [data, baseCurrency, fxRates]);

  if (loading) {
    return <LoadingState label="Cargando posicion..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar la posicion" description={error} />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="p-6">
        <EmptyState title="Posicion no encontrada" description="No hay datos de este ticker en Sheets." />
      </div>
    );
  }

  const value = Number(selected.price) * Number(selected.quantity);
  const currency = (selected.currency || baseCurrency).toUpperCase();
  const rate = currency === baseCurrency ? 1 : fxRates?.[currency];
  const valueBase = rate ? value * rate : value;
  const weight = totals.totalBase ? (valueBase / totals.totalBase) * 100 : 0;
  const logoUrl = resolveLogoUrl(selected.name, selected.ticker, selected.market);

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md">
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          onClick={() => navigate(-1)}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </div>
        <h2 className="text-lg font-bold">{selected.ticker}</h2>
        <div className="w-10 h-10" />
      </header>

      <main className="px-4 space-y-6">
        <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt={selected.name ?? selected.ticker} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <span className="text-sm font-bold text-slate-400">{selected.ticker}</span>
              )}
            </div>
            <div>
              <p className="text-lg font-bold">{selected.name ?? selected.ticker}</p>
              <p className="text-xs text-slate-500">
                {selected.market ?? 'Mercado'} · {currency}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Valor (EUR)</p>
              <p className="text-sm font-bold">{formatCurrency(valueBase, baseCurrency)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Peso</p>
              <p className="text-sm font-bold">{formatNumber(weight)}%</p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Yield</p>
              <p className="text-sm font-bold">
                {selected.yieldPct !== null ? `${formatNumber(selected.yieldPct)}%` : 'N/D'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Ganancia</p>
              <p className="text-sm font-bold">
                {selected.gainRel !== null ? `${selected.gainRel >= 0 ? '+' : ''}${formatNumber(selected.gainRel)}%` : 'N/D'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Precio</p>
              <p className="text-sm font-bold">{formatCurrency(selected.price, currency)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Precio Medio</p>
              <p className="text-sm font-bold">
                {selected.buyIn !== null ? formatCurrency(selected.buyIn, currency) : 'N/D'}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SheetAssetDetail;
