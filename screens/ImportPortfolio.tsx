import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  parseDegiroPortfolioCsv,
  parseIbkrPositionsCsv,
  detectProviderFromText,
  buildIsinMapFromIbkr,
  type ImportPreview,
} from '../lib/importers';
import PreviewTable from '../components/PreviewTable';
import { useQuery } from '../hooks/useQuery';
import { getProfile } from '../data/profiles';
import { useToast } from '../components/ToastProvider';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import { formatCurrency } from '../lib/format';
import { useFxRates } from '../hooks/useFxRates';

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const ImportPortfolio: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [includeCash, setIncludeCash] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<'IBKR' | 'DEGIRO' | null>(null);
  const [includeNonBase, setIncludeNonBase] = useState(false);
  const [isinMap, setIsinMap] = useState<Map<string, { symbol: string; market: string; currency: string }> | null>(null);

  const { data, loading: profileLoading, error } = useQuery(async () => {
    const profile = await getProfile();
    return { profile };
  }, []);

  const baseCurrency = (data?.profile?.base_currency ?? 'EUR').toUpperCase();
  const { rates: fxRates, loading: fxLoading } = useFxRates(baseCurrency);

  const totals = useMemo(() => {
    if (!preview) {
      return {
        total: 0,
        byBroker: {} as Record<string, number>,
        byCurrency: {} as Record<string, number>,
        warnings: [] as string[],
        missingFx: [] as string[],
      };
    }
    const brokerTotals: Record<string, number> = {};
    const currencyTotals: Record<string, number> = {};
    const warnings: string[] = [];
    const missingFx: string[] = [];
    if (preview.provider === 'DEGIRO' && baseCurrency !== 'EUR') {
      warnings.push('DEGIRO: el CSV usa EUR como base. El total puede no coincidir con tu moneda.');
    }
    const nonBaseCount: Record<string, number> = {};
    const includedWithoutFx = new Set<string>();
    preview.rows.forEach((row) => {
      const currency = row.currency || baseCurrency;
      const valueLocal = row.valueLocal ?? row.value;
      currencyTotals[currency] = (currencyTotals[currency] ?? 0) + valueLocal;

      if (preview.provider === 'DEGIRO' && row.valueBase !== undefined) {
        brokerTotals[row.broker] = (brokerTotals[row.broker] ?? 0) + row.valueBase;
        return;
      }
      if (currency === baseCurrency) {
        brokerTotals[row.broker] = (brokerTotals[row.broker] ?? 0) + valueLocal;
        return;
      }

      const rate = fxRates[currency];
      if (Number.isFinite(rate) && rate > 0) {
        brokerTotals[row.broker] = (brokerTotals[row.broker] ?? 0) + valueLocal * rate;
        return;
      }

      if (includeNonBase) {
        brokerTotals[row.broker] = (brokerTotals[row.broker] ?? 0) + valueLocal;
        includedWithoutFx.add(currency);
        return;
      }

      nonBaseCount[currency] = (nonBaseCount[currency] ?? 0) + 1;
    });
    Object.entries(nonBaseCount).forEach(([currency, count]) => {
      missingFx.push(`${count} posiciones en ${currency} sin FX.`);
    });
    includedWithoutFx.forEach((currency) => {
      warnings.push(`Incluyendo ${currency} sin conversion FX.`);
    });
    const total = Object.values(brokerTotals).reduce((sum, value) => sum + value, 0);
    return { total, byBroker: brokerTotals, byCurrency: currencyTotals, warnings, missingFx };
  }, [preview, baseCurrency, includeNonBase, fxRates]);

  const parseFile = (text: string) => {
    const detected = detectProviderFromText(text);
    const provider = detected ?? preferredProvider;
    if (!provider) {
      showToast('No se pudo detectar el broker.', 'error');
      setPreview(null);
      return;
    }
    if (detected && preferredProvider && detected !== preferredProvider) {
      showToast('El CSV no coincide con el broker seleccionado.', 'error');
      setPreview(null);
      return;
    }
    if (provider === 'IBKR') {
      setPreview(parseIbkrPositionsCsv(text, includeCash));
      return;
    }
    if (!selectedDate) {
      showToast('Selecciona la fecha del snapshot.', 'error');
      return;
    }
    const nextPreview = parseDegiroPortfolioCsv(text, selectedDate, includeCash);
    if (isinMap) {
      nextPreview.rows = nextPreview.rows.map((row) => {
        if (!row.isin) return row;
        const mapped = isinMap.get(row.isin.toUpperCase());
        if (!mapped) return row;
        return {
          ...row,
          symbol: mapped.symbol,
          market: mapped.market,
          currency: mapped.currency || row.currency,
        };
      });
    }
    setPreview(nextPreview);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setRawText(text);
    parseFile(text);
  };

  const handleIsinMapFile = async (file: File) => {
    const text = await file.text();
    setIsinMap(buildIsinMapFromIbkr(text));
    if (rawText) {
      parseFile(rawText);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const user = await requireAuth();
      const brokerName = preview.provider === 'IBKR' ? 'IBKR' : 'DEGIRO';
      const { data: broker, error: brokerError } = await supabase
        .from('brokers')
        .upsert({ user_id: user.id, name: brokerName })
        .select('id')
        .single();
      if (brokerError) throw brokerError;
      const brokerId = broker.id;

      const holdingsPayload = preview.rows.map((row) => {
        const payload: Record<string, unknown> = {
          user_id: user.id,
          broker_id: brokerId,
          ticker: row.symbol,
          name: row.name || null,
          market: row.market || '',
          currency: row.currency || baseCurrency,
          quantity: row.qty,
          fees_total: 0,
        };
        if (row.avgPrice !== undefined) {
          payload.avg_price = row.avgPrice;
        }
        return payload;
      });

      const pricePayload = preview.rows.map((row) => ({
        ticker: row.symbol,
        market: row.market || '',
        currency: row.currency || baseCurrency,
        price_date: row.reportDate,
        close_price: row.price,
      }));

      for (const batch of chunk(holdingsPayload, 100)) {
        const { error: upsertError } = await supabase
          .from('holdings')
          .upsert(batch, { onConflict: 'user_id,broker_id,ticker,market' });
        if (upsertError) throw upsertError;
      }

      for (const batch of chunk(pricePayload, 200)) {
        const { error: priceError } = await supabase
          .from('security_prices')
          .upsert(batch, { onConflict: 'ticker,market,price_date' });
        if (priceError) throw priceError;
      }

      const totalValueBase = totals.total;
      const breakdownJson = {
        investments: totalValueBase,
        byBroker: totals.byBroker,
        byCurrency: totals.byCurrency,
        fxRates,
        positionsCount: preview.rows.length,
      };

      const { error: snapshotError } = await supabase
        .from('portfolio_snapshots')
        .upsert({
          user_id: user.id,
          snap_date: preview.reportDate,
          total_value_base: totalValueBase,
          breakdown_json: breakdownJson,
        })
        .select('id')
        .single();
      if (snapshotError) throw snapshotError;

      showToast(`Importacion completada. ${preview.rows.length} posiciones.`, 'success');
      navigate('/portfolio');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo importar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (profileLoading) {
    return <LoadingState label="Cargando importador..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar el importador" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-30 flex items-center justify-between p-4 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="size-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold flex-1 text-center">Importar cartera</h2>
        <div className="w-10"></div>
      </header>

      <main className="p-4 space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                preferredProvider === 'IBKR' ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
              }`}
              onClick={() => {
                setPreferredProvider('IBKR');
                if (rawText) parseFile(rawText);
              }}
            >
              Importar IBKR (snapshot)
            </button>
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                preferredProvider === 'DEGIRO' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
              }`}
              onClick={() => {
                setPreferredProvider('DEGIRO');
                if (rawText) parseFile(rawText);
              }}
            >
              Importar DEGIRO (snapshot)
            </button>
          </div>
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 cursor-pointer hover:border-primary/40"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
          >
            <span className="material-symbols-outlined text-3xl">upload_file</span>
            <span className="text-xs font-bold uppercase tracking-widest">Arrastra el CSV o haz click</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {preferredProvider === 'DEGIRO' && (
            <div className="flex flex-col gap-2 text-xs text-slate-500">
              <span className="font-semibold">CSV IBKR (opcional para mapear ISIN)</span>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleIsinMapFile(file);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
              />
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={includeCash}
              onChange={(event) => {
                setIncludeCash(event.target.checked);
                if (rawText) parseFile(rawText);
              }}
            />
            Incluir filas de cash
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">      
            <input
              type="checkbox"
              checked={includeNonBase}
              onChange={(event) => setIncludeNonBase(event.target.checked)}     
            />
            Sumar otras monedas al total (sin FX)
          </div>
          {preview && Object.keys(totals.byCurrency).some((currency) => currency !== baseCurrency) && (
            <div className="text-xs text-slate-400">
              {fxLoading ? 'Cargando FX desde Google Sheets...' : 'FX activo desde Google Sheets.'}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold">Fecha DEGIRO:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                if (rawText) parseFile(rawText);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
            />
          </div>
        </div>

        {preview ? (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Resumen</p>
              <p className="text-sm font-semibold">Broker: {preview.provider}</p>
              <p className="text-sm font-semibold">Posiciones: {preview.rows.length}</p>
              <p className="text-sm font-semibold">Ignoradas: {preview.ignored.length}</p>
              <p className="text-sm font-semibold">
                Con advertencias: {preview.rows.filter((row) => row.warnings.length).length}
              </p>
              <p className="text-sm font-semibold">Total base (con FX si aplica): {formatCurrency(totals.total, baseCurrency)}</p>
              {Object.entries(totals.byBroker).map(([broker, value]) => (
                <p key={broker} className="text-xs text-slate-400">
                  {broker}: {formatCurrency(value, baseCurrency)}
                </p>
              ))}
              {Object.entries(totals.byCurrency).map(([currency, value]) => (
                <p key={currency} className="text-xs text-slate-400">
                  {currency}: {formatCurrency(value, currency)}
                </p>
              ))}
            </div>

            {(preview.warnings.length > 0 || totals.warnings.length > 0 || totals.missingFx.length > 0) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                {preview.warnings.map((warning, index) => (
                  <p key={`warn-${index}`}>{warning}</p>
                ))}
                {totals.warnings.map((warning, index) => (
                  <p key={`total-${index}`}>{warning}</p>
                ))}
                {totals.missingFx.map((warning, index) => (
                  <p key={`fx-${index}`}>{warning}</p>
                ))}
                {preview.rows.some((row) => row.warnings.length) && <p>Hay filas con advertencias en la tabla.</p>}
              </div>
            )}
            {preview.ignored.length > 0 && (
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-500">
                {preview.ignored.length} filas ignoradas (cash o incompletas).
              </div>
            )}

            <PreviewTable rows={preview.rows} baseCurrency={baseCurrency} />

            <button
              className="w-full h-12 rounded-2xl bg-primary text-white font-bold shadow-xl shadow-primary/20"
              onClick={handleImport}
              disabled={loading}
            >
              {loading ? 'Importando...' : 'Confirmar importacion'}
            </button>
          </div>
        ) : (
          <EmptyState title="Sube un CSV para ver el preview" description="La app detecta IBKR o DEGIRO automaticamente." />
        )}
      </main>
    </div>
  );
};

export default ImportPortfolio;
