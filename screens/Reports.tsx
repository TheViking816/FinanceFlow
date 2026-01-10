import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCategories } from '../data/categories';
import { listSnapshots } from '../data/snapshots';
import { listTransactionsByMonth } from '../data/transactions';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { formatCurrency, formatMonthLabel } from '../lib/format';

const colorStyles = [
  { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600', bar: 'bg-blue-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600', bar: 'bg-emerald-500' },
  { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600', bar: 'bg-amber-500' },
  { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-600', bar: 'bg-rose-500' },
  { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-600', bar: 'bg-indigo-500' },
  { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-600', bar: 'bg-cyan-500' },
];

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data, loading, error } = useQuery(async () => {
    const [profile, categories, transactions, snapshots] = await Promise.all([
      getProfile(),
      listCategories(),
      listTransactionsByMonth(month),
      listSnapshots(),
    ]);
    return { profile, categories, transactions, snapshots };
  }, [month]);

  const baseCurrency = data?.profile?.base_currency ?? 'EUR';

  const { incomeTotal, expenseTotal, expensesByCategory } = useMemo(() => {
    if (!data) return { incomeTotal: 0, expenseTotal: 0, expensesByCategory: [] as Array<{ name: string; total: number }> };
    let income = 0;
    let expense = 0;
    const categoryMap = new Map(data.categories.map((cat) => [cat.id, cat.name]));
    const totals = new Map<string, number>();

    data.transactions.forEach((transaction) => {
      if (transaction.kind === 'income') {
        income += Number(transaction.amount);
      }
      if (transaction.kind === 'expense') {
        expense += Number(transaction.amount);
        const name = transaction.category_id ? categoryMap.get(transaction.category_id) ?? 'Sin categoria' : 'Sin categoria';
        totals.set(name, (totals.get(name) ?? 0) + Number(transaction.amount));
      }
    });

    const expensesList = Array.from(totals.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return { incomeTotal: income, expenseTotal: expense, expensesByCategory: expensesList };
  }, [data]);

  const balance = incomeTotal - expenseTotal;

  const snapshotPoints = useMemo(() => {
    if (!data?.snapshots.length) return [];
    return data.snapshots.slice(-6);
  }, [data]);

  if (loading) {
    return <LoadingState label="Cargando reportes..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar los reportes" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 min-h-screen text-slate-900 dark:text-white overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-30 flex items-center justify-between p-4 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md">
        <button onClick={() => navigate(-1)} className="size-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold flex-1 text-center">Reportes</h2>
        <input
          type="month"
          className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-primary text-[10px] font-extrabold uppercase tracking-widest"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </header>
      <main className="p-4 space-y-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Balance total</p>
          <h3 className="text-4xl font-extrabold tracking-tight">{formatCurrency(balance, baseCurrency)}</h3>
          <div className="flex items-center gap-2 mt-2 text-slate-500 font-bold text-sm">
            <span className="material-symbols-outlined text-[16px]">trending_up</span>
            {formatCurrency(incomeTotal, baseCurrency)} ingresos · {formatCurrency(expenseTotal, baseCurrency)} gastos
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span>Ingresos</span>
              <span>Gastos</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: incomeTotal ? '100%' : '10%' }}></div>
              </div>
              <div className="h-3 rounded-full bg-rose-100 dark:bg-rose-900/30 overflow-hidden">
                <div className="h-full bg-rose-500" style={{ width: expenseTotal ? '100%' : '10%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-lg font-bold">Desglose de gastos</h3>
            <span className="text-xs font-bold text-slate-400">{formatMonthLabel(month)}</span>
          </div>
          {expensesByCategory.length ? (
            expensesByCategory.map((item, index) => {
              const style = colorStyles[index % colorStyles.length];
              const pct = expenseTotal > 0 ? Math.round((item.total / expenseTotal) * 100) : 0;
              return (
                <div
                  key={item.name}
                  className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className={`size-12 rounded-2xl ${style.bg} flex items-center justify-center ${style.text}`}>
                      <span className="material-symbols-outlined">payments</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${style.bar}`} style={{ width: `${pct}%` }}></div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">{pct}%</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-sm">{formatCurrency(item.total, baseCurrency)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState title="Sin gastos en este mes" description="Registra gastos para ver el desglose." />
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-bold">Evolucion patrimonio</h3>
          {snapshotPoints.length ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
              <div className="flex items-end justify-between h-36">
                {snapshotPoints.map((snap, index) => {
                  const max = Math.max(...snapshotPoints.map((point) => point.total_value_base));
                  const height = max ? (snap.total_value_base / max) * 100 : 10;
                  return (
                    <div key={snap.id} className="flex flex-col items-center gap-2">
                      <div className="w-3 bg-primary rounded-t-sm" style={{ height: `${Math.max(10, height)}%` }}></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {index + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="Sin snapshots" description="Actualiza el valor desde el dashboard." />
          )}
        </div>
      </main>
    </div>
  );
};

export default Reports;
