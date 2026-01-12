import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAccounts } from '../data/accounts';
import { listCategories } from '../data/categories';
import { listHoldings } from '../data/holdings';
import { getLatestPrices, getPriceKey } from '../data/prices';
import { listRecentTransactions } from '../data/transactions';
import { listSnapshots, upsertSnapshot, getLatestSnapshot } from '../data/snapshots';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import { formatCurrency, formatShortDate } from '../lib/format';
import { calculateAccountBalances } from '../lib/calculations';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';
import { useFxRates } from '../hooks/useFxRates';

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

const buildSparklinePath = (values: number[], width: number, height: number) => {
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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, accounts, categories, transactions, holdings, snapshots, latestSnapshot] = await Promise.all([
      getProfile(),
      listAccounts(),
      listCategories(),
      listRecentTransactions(10),
      listHoldings(),
      listSnapshots(),
      getLatestSnapshot(),
    ]);
    const latestPrices = await getLatestPrices(holdings);
    return { profile, accounts, categories, transactions, holdings, latestPrices, snapshots, latestSnapshot };
  }, []);

  const baseCurrency = (data?.profile?.base_currency ?? 'EUR').toUpperCase();
  const displayName = data?.profile?.display_name || 'Tu perfil';
  const initials = displayName.trim()
    ? displayName
        .trim()
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'FF';

  const balances = useMemo(() => {
    if (!data) return new Map<string, number>();
    return calculateAccountBalances(data.accounts, data.transactions);
  }, [data]);

  const accountTotal = useMemo(() => {
    if (!data) return 0;
    return Array.from(balances.values()).reduce((sum, value) => sum + value, 0);
  }, [balances, data]);

  const { rates: fxSheetRates } = useFxRates(baseCurrency);
  const investmentsTotal = useMemo(() => {
    if (!data) return 0;
    const fxSnapshotRates = (data.latestSnapshot?.breakdown_json as Record<string, unknown> | undefined)?.fxRates as
      | Record<string, number>
      | undefined;
    const fxRates = Object.keys(fxSheetRates).length ? fxSheetRates : fxSnapshotRates ?? {};
    return data.holdings.reduce((sum, holding) => {
      const key = getPriceKey(holding.ticker, holding.market ?? null);
      const latest = data.latestPrices.get(key);
      const price = latest ? Number(latest.close_price) : 0;
      const value = Number(holding.quantity) * price;
      if (holding.currency === baseCurrency) {
        return sum + value;
      }
      const rate = fxRates?.[holding.currency];
      if (rate) {
        return sum + value * rate;
      }
      return sum + value;
    }, 0);
  }, [data, baseCurrency, fxSheetRates]);

  const netWorth = accountTotal + investmentsTotal;

  const breakdown = useMemo(() => {
    if (!data) return { bank: 0, savings: 0, cash: 0, investments: 0 };
    const result = { bank: 0, savings: 0, cash: 0, investments: investmentsTotal };
    data.accounts.forEach((account) => {
      const balance = balances.get(account.id) ?? 0;
      if (account.type === 'bank') result.bank += balance;
      if (account.type === 'savings') result.savings += balance;
      if (account.type === 'cash') result.cash += balance;
    });
    return result;
  }, [data, balances, investmentsTotal]);

  const breakdownEntries = useMemo(() => {
    const entries = [
      { label: 'Banco', value: breakdown.bank, color: '#0d6cf2' },
      { label: 'Ahorro', value: breakdown.savings, color: '#22c55e' },
      { label: 'Efectivo', value: breakdown.cash, color: '#f59e0b' },
      { label: 'Inversiones', value: breakdown.investments, color: '#6366f1' },
    ];
    const total = entries.reduce((sum, item) => sum + item.value, 0) || 1;
    let offset = 0;
    const segments = entries.map((entry) => {
      const pct = entry.value / total;
      const segment = { ...entry, pct, offset };
      offset += pct;
      return segment;
    });
    return { segments, total };
  }, [breakdown]);
  const activeDistribution = activeSegment
    ? breakdownEntries.segments.find((segment) => segment.label === activeSegment)
    : null;

  const recentTransactions = useMemo(() => {
    if (!data) return [];
    const accountMap = new Map(data.accounts.map((account) => [account.id, account]));
    const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
    return data.transactions.map((transaction) => {
      const account = accountMap.get(transaction.account_id);
      const category = transaction.category_id ? categoryMap.get(transaction.category_id) : null;
      return { transaction, account, category };
    });
  }, [data]);

  const snapshotPoints = useMemo(() => {
    if (!data?.snapshots.length) return [];
    return data.snapshots.slice(-12).map((snap) => snap.total_value_base);
  }, [data]);

  const handleSnapshot = async () => {
    if (!data) return;
    setSnapshotLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await upsertSnapshot(today, netWorth, breakdown);
      showToast('Snapshot actualizado.', 'success');
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el snapshot.', 'error');
    } finally {
      setSnapshotLoading(false);
    }
  };

  if (loading) {
    return <LoadingState label="Cargando panel..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar el dashboard" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-800 shadow-sm overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-bold">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Buenos dias</p>
            <h2 className="text-lg font-bold leading-tight">{displayName}</h2>
          </div>
        </div>
        <div className="w-10 h-10" />
      </header>

      <main className="flex-1 px-4 space-y-6 mt-2">
        <section className="space-y-1">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            Patrimonio Neto <span className="material-symbols-outlined text-[18px]">visibility</span>
          </div>
          <h1 className="text-[40px] font-extrabold tracking-tight">{formatCurrency(netWorth, baseCurrency)}</h1>
          <div className="flex items-center gap-2 pt-2">
            <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">insights</span>
              Actualiza tus snapshots
            </span>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold">Distribucion</h3>
              <p className="text-sm text-slate-500">Cuentas y cartera</p>
            </div>
            <div
              className="relative w-28 h-28 sm:w-32 sm:h-32"
              onMouseLeave={() => setActiveSegment(null)}
            >
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="3"></circle>
                {breakdownEntries.segments.map((segment) => (
                  <circle
                    key={segment.label}
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="3"
                    strokeDasharray={`${segment.pct * 100} ${100 - segment.pct * 100}`}
                    strokeDashoffset={`${25 - segment.offset * 100}`}
                    onMouseEnter={() => setActiveSegment(segment.label)}
                    onClick={() => setActiveSegment(segment.label)}
                    onTouchStart={() => setActiveSegment(segment.label)}
                  ></circle>
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] uppercase tracking-widest text-slate-400">%</span>
                <span className="text-lg font-extrabold">
                  {activeDistribution ? Math.round(activeDistribution.pct * 100) : 100}
                </span>
                <span className="text-[10px] text-slate-400">
                  {activeDistribution ? activeDistribution.label : 'Total'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-600">
            {breakdownEntries.segments.map((segment) => (
              <button
                key={segment.label}
                className="flex items-center gap-2 text-left"
                onMouseEnter={() => setActiveSegment(segment.label)}
                onClick={() => setActiveSegment(segment.label)}
                onTouchStart={() => setActiveSegment(segment.label)}
                type="button"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: segment.color }}></span>
                <span>{segment.label}</span>
                <span className="text-slate-400 ml-auto">{formatCurrency(segment.value, baseCurrency)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4">
          <div
            onClick={() => navigate('/reports')}
            className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/50 cursor-pointer active:scale-[0.98] transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-sm">Evolucion 1 ano</h3>
                <p className="text-xs text-slate-500">Total activos</p>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleSnapshot();
                }}
                className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/20"
                disabled={snapshotLoading}
              >
                {snapshotLoading ? 'Guardando...' : 'Actualizar hoy'}
              </button>
            </div>
            <div className="h-24 w-full relative">
              {snapshotPoints.length ? (
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
                  <path
                    d={buildSparklinePath(snapshotPoints, 300, 100)}
                    fill="none"
                    stroke="#0d6cf2"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <EmptyState
                  title="Sin snapshots aun"
                  description="Guarda el valor de hoy para ver la evolucion."
                />
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <button
            onClick={() => navigate('/add-transaction')}
            className="flex flex-col items-center justify-center gap-2.5 h-24 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">add</span>
            </div>
            <span className="text-xs font-bold">Anadir mov.</span>
          </button>
        </section>

        <section className="space-y-3 pb-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-bold">Movimientos recientes</h3>
          </div>
          {recentTransactions.length ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
              {recentTransactions.map(({ transaction, account, category }) => {
                const isIncome = transaction.kind === 'income';
                const icon = category?.icon || (isIncome ? 'work' : 'shopping_cart');
                const label = category?.name || (transaction.kind === 'transfer' ? 'Transferencia' : 'Sin categoria');
                const logoKey = category?.icon ? slugifyLogoKey(category.icon) : '';
                const logoUrl = logoKey ? logosByName.get(logoKey) : undefined;
                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/edit-transaction/${transaction.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                        {logoUrl ? (
                          <img src={logoUrl} alt={transaction.description ?? label} className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="material-symbols-outlined">{icon}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{transaction.description || label}</p>
                        <p className="text-xs text-slate-500">
                          {account?.name ?? 'Cuenta'} · {formatShortDate(transaction.occurred_at)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${isIncome ? 'text-green-600' : ''}`}>
                      {isIncome ? '+' : '-'} {formatCurrency(Number(transaction.amount), transaction.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Aun no hay movimientos" description="Crea tu primera transaccion para verla aqui." />
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
