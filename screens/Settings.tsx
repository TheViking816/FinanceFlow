import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from '../hooks/useSession';
import { useDarkMode } from '../hooks/useDarkMode';
import { getProfile, upsertProfile } from '../data/profiles';
import { listAccounts } from '../data/accounts';
import { listAllTransactions } from '../data/transactions';
import { listHoldings } from '../data/holdings';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { downloadCsv } from '../lib/csv';
import { useToast } from '../components/ToastProvider';

const Settings: React.FC = () => {
  const { session } = useSession();
  const { isDark, preference, setPreference } = useDarkMode();
  const { showToast } = useToast();
  const [form, setForm] = useState({ display_name: '', base_currency: 'EUR' });

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, accounts, transactions, holdings] = await Promise.all([
      getProfile(),
      listAccounts(),
      listAllTransactions(),
      listHoldings(),
    ]);
    return { profile, accounts, transactions, holdings };
  }, []);

  useEffect(() => {
    if (data?.profile) {
      setForm({ display_name: '', base_currency: data.profile.base_currency });
    }
  }, [data?.profile]);

  const handleSaveProfile = async () => {
    try {
      await upsertProfile({
        display_name: form.display_name || data?.profile?.display_name || '',
        base_currency: form.base_currency || data?.profile?.base_currency || 'EUR',
      });
      showToast('Perfil actualizado.', 'success');
      setForm({ display_name: '', base_currency: data?.profile?.base_currency ?? 'EUR' });
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.', 'error');
    }
  };

  const handleExport = () => {
    if (!data) return;
    downloadCsv('accounts.csv', data.accounts);
    downloadCsv('transactions.csv', data.transactions);
    downloadCsv('holdings.csv', data.holdings);
    showToast('CSV descargados.', 'success');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <LoadingState label="Cargando ajustes..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar los ajustes" description={error} />
      </div>
    );
  }

  const displayName = data?.profile?.display_name ?? 'Tu perfil';
  const initials = displayName.trim()
    ? displayName
        .trim()
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'FF';
  const baseCurrency = data?.profile?.base_currency ?? 'EUR';

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b dark:border-slate-800">
        <h1 className="text-lg font-bold flex-1 text-center">Ajustes</h1>
      </header>

      <main className="p-4 space-y-8">
        <div className="flex items-center gap-4 py-2">
          <div className="w-20 h-20 rounded-full bg-primary/10 shadow-lg border-4 border-white dark:border-slate-800 overflow-hidden flex items-center justify-center text-primary text-xl font-bold">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{displayName}</h2>
            <p className="text-slate-500 text-sm font-medium">{session?.user.email}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Perfil</h3>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder={displayName}
              value={form.display_name}
              onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
            />
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder={baseCurrency}
              value={form.base_currency}
              onChange={(event) => setForm((prev) => ({ ...prev, base_currency: event.target.value.toUpperCase() }))}
            />
            <button className="w-full h-10 rounded-xl bg-primary text-white text-sm font-bold" onClick={handleSaveProfile}>
              Guardar perfil
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Preferencias</h3>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 divide-y dark:divide-slate-700 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">light_mode</span>
                </div>
                <span className="text-sm font-bold tracking-tight">Modo oscuro</span>
              </div>
              <button
                className={`w-12 h-6 rounded-full relative transition-colors ${isDark ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
                onClick={() => setPreference(isDark ? 'light' : 'dark')}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${isDark ? 'right-1' : 'left-1'}`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">contrast</span>
                </div>
                <span className="text-sm font-bold tracking-tight">Preferencia</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">
                  {preference === 'system' ? 'Sistema' : isDark ? 'Oscuro' : 'Claro'}
                </span>
                <button
                  className="text-[10px] text-primary font-bold"
                  onClick={() => setPreference('system')}
                >
                  Usar sistema
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Datos</h3>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 divide-y dark:divide-slate-700 overflow-hidden shadow-sm">
            <button className="flex items-center justify-between p-4 w-full" onClick={() => window.location.hash = '#/import-portfolio'}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">upload_file</span>
                </div>
                <span className="text-sm font-bold tracking-tight">Importar cartera</span>
              </div>
              <span className="material-symbols-outlined text-slate-300">chevron_right</span>
            </button>
            <button className="flex items-center justify-between p-4 w-full" onClick={handleExport}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">file_download</span>
                </div>
                <span className="text-sm font-bold tracking-tight">Exportar CSV</span>
              </div>
              <span className="material-symbols-outlined text-slate-300">chevron_right</span>
            </button>
          </div>
        </div>

        <button
          className="w-full py-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-red-500 font-bold text-sm tracking-tight active:scale-[0.98] transition-all shadow-sm"
          onClick={handleLogout}
        >
          Cerrar sesion
        </button>
        <p className="text-center text-[10px] font-bold text-slate-300">FinanceFlow</p>
      </main>
    </div>
  );
};

export default Settings;
