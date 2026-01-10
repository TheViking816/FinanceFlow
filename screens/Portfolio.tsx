import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listHoldings, createHolding, deleteAllHoldings } from '../data/holdings';
import { listBrokers, createBroker } from '../data/brokers';
import { getLatestPrices, getPriceKey, getSheetPricesMeta } from '../data/prices';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { formatCurrency, formatNumber } from '../lib/format';
import { useToast } from '../components/ToastProvider';
import { deleteAllSnapshots, getLatestSnapshot } from '../data/snapshots';
import { useFxRates } from '../hooks/useFxRates';

const Portfolio: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: '',
    name: '',
    broker_id: '',
    new_broker: '',
    market: '',
    currency: 'USD',
    quantity: '0',
    avg_price: '0',
    fees_total: '0',
  });
  const [filterBroker, setFilterBroker] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, brokers, holdings, latestSnapshot] = await Promise.all([
      getProfile(),
      listBrokers(),
      listHoldings(),
      getLatestSnapshot(),
    ]);
    const latestPrices = await getLatestPrices(holdings);
    return { profile, brokers, holdings, latestPrices, latestSnapshot };
  }, []);

  const handleRefreshPrices = () => {
    refetch();
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      refetch();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [refetch]);

  const baseCurrency = (data?.profile?.base_currency ?? 'EUR').toUpperCase();

  const holdingsWithValue = useMemo(() => {
    if (!data) return [];
    return data.holdings.map((holding) => {
      const key = getPriceKey(holding.ticker, holding.market ?? null);
      const priceEntry = data.latestPrices.get(key);
      const price = priceEntry?.close_price ?? 0;
      const source = String(priceEntry?.id ?? '').startsWith('sheet-') ? 'sheet' : 'supabase';
      const value = Number(holding.quantity) * Number(price);
      return { holding, price, value, source };
    });
  }, [data]);

  const filteredHoldings = useMemo(() => {
    return holdingsWithValue.filter(({ holding }) => {
      if (filterBroker && holding.broker_id !== filterBroker) return false;
      if (filterCurrency && holding.currency !== filterCurrency) return false;
      return true;
    });
  }, [holdingsWithValue, filterBroker, filterCurrency]);

  const { rates: fxSheetRates } = useFxRates(baseCurrency);
  const fxSnapshotRates = (data?.latestSnapshot?.breakdown_json as Record<string, unknown> | undefined)?.fxRates as
    | Record<string, number>
    | undefined;
  const fxRates = Object.keys(fxSheetRates).length ? fxSheetRates : fxSnapshotRates ?? {};
  const totalValue = filteredHoldings.reduce((sum, item) => sum + item.value, 0);
  const totalValueBase = filteredHoldings.reduce((sum, item) => {
    const currency = item.holding.currency || baseCurrency;
    if (currency === baseCurrency) {
      return sum + item.value;
    }
    const rate = fxRates?.[currency];
    if (rate) {
      return sum + item.value * rate;
    }
    return sum + item.value;
  }, 0);
  const missingFx = useMemo(() => {
    if (!fxRates) return [];
    const set = new Set<string>();
    filteredHoldings.forEach(({ holding }) => {
      const currency = holding.currency || baseCurrency;
      if (currency !== baseCurrency && !fxRates[currency]) {
        set.add(currency);
      }
    });
    return Array.from(set);
  }, [filteredHoldings, fxRates, baseCurrency]);
  const totalsByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    filteredHoldings.forEach(({ holding, value }) => {
      const currency = holding.currency || baseCurrency;
      map[currency] = (map[currency] ?? 0) + value;
    });
    return map;
  }, [filteredHoldings, baseCurrency]);
  const sheetMeta = getSheetPricesMeta();
  const sheetTime = sheetMeta?.updatedAt
    ? new Date(sheetMeta.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;
  const hasSheetPrices = data?.latestPrices
    ? Array.from(data.latestPrices.values()).some((price) => String(price.id).startsWith('sheet-'))
    : false;

  const handleCreateHolding = async () => {
    if (!form.ticker.trim()) {
      showToast('El ticker es obligatorio.', 'error');
      return;
    }
    try {
      let brokerId = form.broker_id || null;
      if (!brokerId && form.new_broker.trim()) {
        const broker = await createBroker(form.new_broker.trim());
        brokerId = broker.id;
      }
      await createHolding({
        ticker: form.ticker.trim().toUpperCase(),
        name: form.name.trim() || null,
        broker_id: brokerId,
        market: form.market.trim() || null,
        currency: form.currency.trim().toUpperCase() || 'USD',
        quantity: Number(form.quantity || 0),
        avg_price: Number(form.avg_price || 0),
        fees_total: Number(form.fees_total || 0),
      });
      showToast('Holding creado.', 'success');
      setForm({
        ticker: '',
        name: '',
        broker_id: '',
        new_broker: '',
        market: '',
        currency: 'USD',
        quantity: '0',
        avg_price: '0',
        fees_total: '0',
      });
      setShowForm(false);
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear el holding.', 'error');
    }
  };

  const handleDeletePortfolio = async () => {
    if (!data?.holdings.length) {
      showToast('No hay holdings para eliminar.', 'info');
      return;
    }
    const confirmed = window.confirm('Vas a eliminar toda la cartera y sus snapshots. Esta accion no se puede deshacer.');
    if (!confirmed) return;
    try {
      await deleteAllHoldings();
      await deleteAllSnapshots();
      showToast('Cartera eliminada.', 'success');
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar la cartera.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando cartera..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar la cartera" description={error} />
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
        <h2 className="text-lg font-bold">Cartera</h2>
        <div className="flex items-center gap-2">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full text-primary bg-primary/10"
            onClick={() => navigate('/import-portfolio')}
            title="Importar cartera"
          >
            <span className="material-symbols-outlined">upload_file</span>
          </button>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full text-primary"
            onClick={() => setShowForm((prev) => !prev)}
          >
            <span className="material-symbols-outlined">{showForm ? 'close' : 'add'}</span>
          </button>
        </div>
      </header>

      <main className="px-4 space-y-6">
        <div className="flex flex-col items-center py-6">
          <p className="text-slate-500 text-sm font-medium mb-1">Valor Total</p>
          <h1 className="text-[40px] font-bold tracking-tight mb-3">{formatCurrency(totalValueBase, baseCurrency)}</h1>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-slate-500 text-[18px]">timeline</span>
            <span className="text-slate-500 text-sm font-semibold">Actualiza precios desde cada activo</span>
          </div>
          <button
            className="mt-3 h-9 px-4 rounded-full text-xs font-bold uppercase tracking-widest border border-slate-200 dark:border-slate-700 text-slate-500"
            onClick={handleRefreshPrices}
          >
            Actualizar precios ahora
          </button>
          {(sheetTime || hasSheetPrices) && (
            <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">
              Precios desde Sheets · {sheetTime ?? 'sincronizado'}
            </div>
          )}
          {missingFx.length > 0 && (
            <div className="mt-2 text-[10px] uppercase tracking-widest text-amber-500">
              Faltan FX para {missingFx.join(', ')} (usando valor original)
            </div>
          )}
          {Object.keys(totalsByCurrency).length > 1 && (
            <div className="mt-3 text-xs text-slate-400 space-y-1">
              {Object.entries(totalsByCurrency).map(([currency, value]) => (
                <div key={currency}>
                  {currency}: {formatCurrency(value, currency)}
                </div>
              ))}
              <div className="text-[10px] uppercase tracking-widest">Totales sin FX</div>
            </div>
          )}
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          <select
            className="px-4 h-9 rounded-full text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            value={filterBroker}
            onChange={(event) => setFilterBroker(event.target.value)}
          >
            <option value="">Todos los brokers</option>
            {data?.brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.name}
              </option>
            ))}
          </select>
          <select
            className="px-4 h-9 rounded-full text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            value={filterCurrency}
            onChange={(event) => setFilterCurrency(event.target.value)}
          >
            <option value="">Todas las monedas</option>
            {Array.from(new Set(data?.holdings.map((holding) => holding.currency) ?? [])).map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>

        {showForm && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-bold">Nuevo holding</h3>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Ticker"
              value={form.ticker}
              onChange={(event) => setForm((prev) => ({ ...prev, ticker: event.target.value }))}
            />
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Nombre (opcional)"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Mercado"
                value={form.market}
                onChange={(event) => setForm((prev) => ({ ...prev, market: event.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Moneda"
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Cantidad"
                type="number"
                value={form.quantity}
                onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Precio medio"
                type="number"
                value={form.avg_price}
                onChange={(event) => setForm((prev) => ({ ...prev, avg_price: event.target.value }))}
              />
            </div>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Comisiones"
              type="number"
              value={form.fees_total}
              onChange={(event) => setForm((prev) => ({ ...prev, fees_total: event.target.value }))}
            />
            <select
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              value={form.broker_id}
              onChange={(event) => setForm((prev) => ({ ...prev, broker_id: event.target.value }))}
            >
              <option value="">Sin broker</option>
              {data?.brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Nuevo broker (opcional)"
              value={form.new_broker}
              onChange={(event) => setForm((prev) => ({ ...prev, new_broker: event.target.value }))}
            />
            <button className="w-full h-11 rounded-xl bg-primary text-white font-bold text-sm" onClick={handleCreateHolding}>
              Guardar holding
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex justify-between items-end px-1">
            <h3 className="text-lg font-bold">Posiciones</h3>
            <span className="text-xs text-slate-500">Ordenado por valor</span>
          </div>
          {filteredHoldings.length ? (
            filteredHoldings
              .sort((a, b) => b.value - a.value)
              .map(({ holding, price, value, source }) => (
                <div
                  key={holding.id}
                  onClick={() => navigate(`/asset/${holding.id}`)}
                  className="flex gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm cursor-pointer active:scale-[0.99] transition-all"
                >
                  <div className="size-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
                    {holding.ticker}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <p className="font-bold truncate pr-2">{holding.name || holding.ticker}</p>
                      <p className="font-bold">{formatCurrency(value, holding.currency)}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-slate-500 text-sm">
                        {formatNumber(Number(holding.quantity))} · {formatCurrency(Number(price), holding.currency)}
                      </p>
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">
                        {source === 'sheet' ? 'Sheets' : 'Guardado'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <EmptyState title="Aun no tienes holdings" description="Agrega una posicion para ver su valor." />
          )}
        </div>
        <button
          className="w-full h-11 rounded-xl border border-rose-200 text-rose-500 text-xs font-bold uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/20"
          onClick={handleDeletePortfolio}
        >
          Eliminar cartera
        </button>
      </main>
    </div>
  );
};

export default Portfolio;
