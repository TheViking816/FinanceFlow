import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHolding, updateHolding } from '../data/holdings';
import { getPriceKey, getSheetPrices, insertPrice, listPricesForHolding } from '../data/prices';
import { useQuery } from '../hooks/useQuery';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

const buildLinePath = (values: number[], width: number, height: number) => {
  if (values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
};

const AssetDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useToast();
  const [editForm, setEditForm] = useState({ quantity: '', avg_price: '', fees_total: '' });
  const [priceForm, setPriceForm] = useState({
    price_date: new Date().toISOString().slice(0, 10),
    close_price: '',
    currency: '',
    market: '',
  });

  const { data, loading, error, refetch } = useQuery(async () => {
    if (!id) throw new Error('Activo no encontrado.');
    const holding = await getHolding(id);
    const prices = await listPricesForHolding(holding.ticker, holding.market ?? null);
    const sheetPrices = await getSheetPrices();
    return { holding, prices, sheetPrices };
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refetch();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [refetch]);

  const latestPrice = data?.prices[data.prices.length - 1];
  const sheetPrice = data?.sheetPrices?.get(getPriceKey(data?.holding.ticker ?? '', data?.holding.market ?? null));
  const livePrice = sheetPrice ?? latestPrice;
  const currentValue = livePrice ? Number(livePrice.close_price) * Number(data?.holding.quantity ?? 0) : 0;

  const chartPath = useMemo(() => {
    if (!data?.prices.length) return '';
    const values = data.prices.map((price) => Number(price.close_price));
    return buildLinePath(values, 375, 220);
  }, [data]);

  const handleSaveHolding = async () => {
    if (!data?.holding) return;
    try {
      await updateHolding(data.holding.id, {
        quantity: Number(editForm.quantity || data.holding.quantity),
        avg_price: Number(editForm.avg_price || data.holding.avg_price),
        fees_total: Number(editForm.fees_total || data.holding.fees_total),
      });
      showToast('Holding actualizado.', 'success');
      setEditForm({ quantity: '', avg_price: '', fees_total: '' });
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    }
  };

  const handleAddPrice = async () => {
    if (!data?.holding) return;
    if (!priceForm.close_price) {
      showToast('El precio es obligatorio.', 'error');
      return;
    }
    try {
      await insertPrice({
        ticker: data.holding.ticker,
        market: priceForm.market || data.holding.market || null,
        currency: priceForm.currency || data.holding.currency,
        price_date: priceForm.price_date,
        close_price: Number(priceForm.close_price),
      });
      showToast('Precio guardado.', 'success');
      setPriceForm((prev) => ({ ...prev, close_price: '' }));
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el precio.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando activo..." />;
  }

  if (error || !data?.holding) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar el activo" description={error ?? 'Revisa el identificador.'} />
      </div>
    );
  }

  const { holding } = data;

  return (
    <div className="flex flex-col flex-1 pb-28 min-h-screen bg-background-light dark:bg-background-dark page-transition overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-transparent">
        <button
          onClick={() => navigate(-1)}
          className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h2 className="text-lg font-bold text-center flex-1 uppercase tracking-widest">{holding.ticker}</h2>
        <button className="size-10 flex items-center justify-center rounded-full">
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </header>
      <main className="flex flex-col items-center">
        <div className="flex flex-col items-center pt-4 pb-2 px-4 text-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.1em] mb-2">
            {holding.name || holding.market || 'Activo'}
          </p>
          <h1 className="text-[48px] font-extrabold tracking-tighter mb-2">
            {formatCurrency(currentValue, holding.currency)}
          </h1>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-slate-500 text-[18px]">timeline</span>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-bold">
              {livePrice
                ? `${sheetPrice ? 'Precio Sheets' : 'Ultimo precio'} ${formatDate(livePrice.price_date)}`
                : 'Sin precios cargados'}
            </p>
          </div>
        </div>

        <div className="w-full h-56 mt-6 mb-4 px-2">
          {chartPath ? (
            <svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 375 220">
              <path d={chartPath} stroke="#0d6cf2" strokeWidth="4" strokeLinecap="round" />
            </svg>
          ) : (
            <EmptyState title="Sin historial" description="Agrega precios manuales para ver la evolucion." />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 w-full">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">account_balance_wallet</span> Cantidad
            </p>
            <p className="text-2xl font-extrabold tracking-tight">{formatNumber(Number(holding.quantity))}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">trending_up</span> Precio medio
            </p>
            <p className="text-xl font-extrabold tracking-tight">{formatCurrency(Number(holding.avg_price), holding.currency)}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm col-span-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">query_stats</span> Precio actual
            </p>
            <p className="text-2xl font-extrabold tracking-tight">
              {livePrice ? formatCurrency(Number(livePrice.close_price), holding.currency) : '--'}
            </p>
          </div>
        </div>

        <div className="w-full px-4 mt-6 space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/50 p-4 space-y-3">
            <h3 className="text-sm font-bold">Editar holding</h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder={String(holding.quantity)}
                value={editForm.quantity}
                onChange={(event) => setEditForm((prev) => ({ ...prev, quantity: event.target.value }))}
                type="number"
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder={String(holding.avg_price)}
                value={editForm.avg_price}
                onChange={(event) => setEditForm((prev) => ({ ...prev, avg_price: event.target.value }))}
                type="number"
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder={String(holding.fees_total)}
                value={editForm.fees_total}
                onChange={(event) => setEditForm((prev) => ({ ...prev, fees_total: event.target.value }))}
                type="number"
              />
            </div>
            <button className="w-full h-10 rounded-xl bg-primary text-white text-xs font-bold" onClick={handleSaveHolding}>
              Guardar cambios
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/50 p-4 space-y-3">
            <h3 className="text-sm font-bold">Agregar precio manual</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                type="date"
                value={priceForm.price_date}
                onChange={(event) => setPriceForm((prev) => ({ ...prev, price_date: event.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder="Precio"
                type="number"
                value={priceForm.close_price}
                onChange={(event) => setPriceForm((prev) => ({ ...prev, close_price: event.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder="Moneda"
                value={priceForm.currency}
                onChange={(event) => setPriceForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                placeholder="Mercado"
                value={priceForm.market}
                onChange={(event) => setPriceForm((prev) => ({ ...prev, market: event.target.value }))}
              />
            </div>
            <button className="w-full h-10 rounded-xl bg-primary text-white text-xs font-bold" onClick={handleAddPrice}>
              Guardar precio
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AssetDetail;
