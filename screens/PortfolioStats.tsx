import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listHoldings } from '../data/holdings';
import { getLatestPrices, getPriceKey, getSheetHoldings } from '../data/prices';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { formatCurrency, formatNumber } from '../lib/format';

const PortfolioStats: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(async () => {
    const [profile, holdings, sheetHoldings] = await Promise.all([
      getProfile(),
      listHoldings(),
      getSheetHoldings(),
    ]);
    const latestPrices = await getLatestPrices(holdings);
    return { profile, holdings, latestPrices, sheetHoldings };
  }, []);

  const baseCurrency = (data?.profile?.base_currency ?? 'EUR').toUpperCase();
  const sheetMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { changePercent: number | null; low52w: number | null; high52w: number | null }
    >();
    (data?.sheetHoldings ?? []).forEach((entry) => {
      const key = getPriceKey(entry.ticker, entry.market ?? null);
      map.set(key, {
        changePercent: entry.changePercent,
        low52w: entry.low52w,
        high52w: entry.high52w,
      });
    });
    return map;
  }, [data?.sheetHoldings]);

  const items = useMemo(() => {
    if (!data) return [];
    return data.holdings.map((holding) => {
      const key = getPriceKey(holding.ticker, holding.market ?? null);
      const priceEntry = data.latestPrices.get(key);
      const price = priceEntry?.close_price ?? 0;
      const meta = sheetMetaMap.get(key);
      return {
        holding,
        price,
        changePercent: meta?.changePercent ?? null,
        low52w: meta?.low52w ?? null,
        high52w: meta?.high52w ?? null,
      };
    });
  }, [data, sheetMetaMap]);

  const movers = useMemo(() => {
    return items.filter((item) => item.changePercent !== null && Number.isFinite(item.changePercent));
  }, [items]);
  const losers = useMemo(() => {
    return [...movers].sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0)).slice(0, 5);
  }, [movers]);
  const gainers = useMemo(() => {
    return [...movers].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0)).slice(0, 5);
  }, [movers]);

  const low52 = useMemo(() => {
    return items
      .filter((item) => item.price > 0 && item.low52w && item.low52w > 0 && item.high52w && item.high52w > 0)
      .map((item) => {
        const distance = ((item.price - (item.low52w ?? 0)) / (item.low52w ?? 1)) * 100;
        return { ...item, distance };
      })
      .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
      .slice(0, 5);
  }, [items]);

  const high52 = useMemo(() => {
    return items
      .filter((item) => item.price > 0 && item.low52w && item.low52w > 0 && item.high52w && item.high52w > 0)
      .map((item) => {
        const distance = (((item.high52w ?? 0) - item.price) / (item.high52w ?? 1)) * 100;
        return { ...item, distance };
      })
      .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
      .slice(0, 5);
  }, [items]);

  const renderRange = (price: number, low: number, high: number, currency: string) => {
    const range = high - low;
    const ratio = range > 0 ? (price - low) / range : 0.5;
    const clamped = Math.min(1, Math.max(0, ratio));
    return (
      <div className="space-y-2">
        <div className="relative h-2 rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="absolute -top-1 h-3 w-3 rounded-full bg-primary"
            style={{ left: `calc(${clamped * 100}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-slate-400">
          <span>Low {formatCurrency(low, currency)}</span>
          <span>High {formatCurrency(high, currency)}</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingState label="Cargando estadisticas..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar estadisticas" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md">
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          onClick={() => navigate(-1)}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </div>
        <h2 className="text-lg font-bold">Estadisticas</h2>
        <div className="w-10 h-10" />
      </header>

      <main className="px-4 space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-bold">Movimientos del dia</h3>
            <span className="text-xs text-slate-500">Top 5</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-rose-500">Bajando</h4>
              {losers.length ? (
                losers.map(({ holding, changePercent }) => (
                  <div key={holding.id} className="flex justify-between text-sm">
                    <span className="text-slate-500">{holding.ticker}</span>
                    <span className="text-rose-500 font-semibold">
                      {formatNumber(changePercent ?? 0)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">Sin cambios diarios desde Sheets.</p>
              )}
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-emerald-500">Subiendo</h4>
              {gainers.length ? (
                gainers.map(({ holding, changePercent }) => (
                  <div key={holding.id} className="flex justify-between text-sm">
                    <span className="text-slate-500">{holding.ticker}</span>
                    <span className="text-emerald-500 font-semibold">
                      +{formatNumber(changePercent ?? 0)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">Sin cambios diarios desde Sheets.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-end px-1">
            <h3 className="text-lg font-bold">Cerca del low 52w</h3>
            <span className="text-xs text-slate-500">Top 5</span>
          </div>
          {low52.length ? (
            low52.map(({ holding, price, low52w, high52w, distance }) => (
              <div
                key={holding.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold">{holding.name || holding.ticker}</p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(price, holding.currency || baseCurrency)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                    {distance >= 0 ? '+' : ''}
                    {formatNumber(distance)}%
                  </span>
                </div>
                {low52w && high52w ? renderRange(price, low52w, high52w, holding.currency || baseCurrency) : null}
              </div>
            ))
          ) : (
            <EmptyState title="Sin datos low 52w" description="Completa low52w y high52w en Sheets." />
          )}
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-end px-1">
            <h3 className="text-lg font-bold">Cerca del high 52w</h3>
            <span className="text-xs text-slate-500">Top 5</span>
          </div>
          {high52.length ? (
            high52.map(({ holding, price, low52w, high52w, distance }) => (
              <div
                key={holding.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold">{holding.name || holding.ticker}</p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(price, holding.currency || baseCurrency)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                    {distance >= 0 ? '' : '-'}
                    {formatNumber(Math.abs(distance))}%
                  </span>
                </div>
                {low52w && high52w ? renderRange(price, low52w, high52w, holding.currency || baseCurrency) : null}
              </div>
            ))
          ) : (
            <EmptyState title="Sin datos high 52w" description="Completa low52w y high52w en Sheets." />
          )}
        </div>
      </main>
    </div>
  );
};

export default PortfolioStats;
