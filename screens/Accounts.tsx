import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAccounts, createAccount, updateAccount, deleteAccount, countAccountTransactions } from '../data/accounts';
import { listAllTransactions, listTransactionsForAccount } from '../data/transactions';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import { calculateAccountBalances } from '../lib/calculations';
import { formatCurrency, formatShortDate } from '../lib/format';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

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

const Accounts: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'bank',
    currency: 'EUR',
    institution: '',
    opening_balance: '0',
  });

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, accounts, transactions] = await Promise.all([getProfile(), listAccounts(), listAllTransactions()]);
    return { profile, accounts, transactions };
  }, []);

  const balances = useMemo(() => {
    if (!data) return new Map<string, number>();
    return calculateAccountBalances(data.accounts, data.transactions);
  }, [data]);

  const totalBank = useMemo(() => {
    if (!data) return 0;
    return data.accounts.reduce((sum, account) => {
      if (account.type === 'bank' || account.type === 'savings' || account.type === 'cash') {
        return sum + (balances.get(account.id) ?? 0);
      }
      return sum;
    }, 0);
  }, [data, balances]);

  const selectedAccount = data?.accounts.find((account) => account.id === selectedAccountId) ?? null;
  const baseCurrency = data?.profile?.base_currency ?? 'EUR';

  useEffect(() => {
    setForm((prev) => ({ ...prev, currency: baseCurrency }));
  }, [baseCurrency]);

  const { data: accountTransactions, loading: txLoading, error: txError } = useQuery(async () => {
    if (!selectedAccountId) return [];
    return listTransactionsForAccount(selectedAccountId);
  }, [selectedAccountId]);

  const resetForm = () => {
    setForm({ name: '', type: 'bank', currency: baseCurrency, institution: '', opening_balance: '0' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (id: string) => {
    if (!data) return;
    const account = data.accounts.find((item) => item.id === id);
    if (!account) return;
    setEditingId(id);
    setShowForm(true);
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution ?? '',
      opening_balance: String(account.opening_balance ?? 0),
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('El nombre es obligatorio.', 'error');
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type as 'bank' | 'savings' | 'cash',
      currency: form.currency.trim() || baseCurrency,
      institution: form.institution.trim() || null,
      opening_balance: Number(form.opening_balance || 0),
    };
    try {
      if (editingId) {
        await updateAccount(editingId, payload);
        showToast('Cuenta actualizada.', 'success');
      } else {
        await createAccount(payload);
        showToast('Cuenta creada.', 'success');
      }
      resetForm();
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const count = await countAccountTransactions(id);
      if (count > 0) {
        showToast('Esta cuenta tiene movimientos. Eliminalos primero.', 'error');
        return;
      }
      await deleteAccount(id);
      showToast('Cuenta eliminada.', 'success');
      if (selectedAccountId === id) {
        setSelectedAccountId(null);
      }
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo borrar la cuenta.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando cuentas..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar las cuentas" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b dark:border-slate-800">
        <div className="w-10"></div>
        <h1 className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-slate-500">Mis Cuentas</h1>
        <button
          className="text-primary w-10 h-10 flex items-center justify-center"
          onClick={() => setShowForm((prev) => !prev)}
        >
          <span className="material-symbols-outlined">{showForm ? 'close' : 'add'}</span>
        </button>
      </header>
      <main className="flex-1 px-4 space-y-8 pt-4">
        <section className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm p-8 text-center border border-slate-100 dark:border-slate-700">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">Patrimonio Bancario</p>
          <h2 className="text-[32px] font-extrabold text-primary tracking-tight">{formatCurrency(totalBank, baseCurrency)}</h2>
        </section>

        {showForm && (
          <section className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm p-6 border border-slate-100 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
              {editingId && (
                <button className="text-xs text-slate-400 font-semibold" onClick={resetForm}>
                  Cancelar
                </button>
              )}
            </div>
            <div className="space-y-3">
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2 text-sm"
                placeholder="Nombre de cuenta"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  <option value="bank">Banco</option>
                  <option value="savings">Ahorro</option>
                  <option value="cash">Efectivo</option>
                </select>
                <input
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                  placeholder="Moneda"
                  value={form.currency}
                  onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                />
              </div>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2 text-sm"
                placeholder="Institucion (opcional)"
                value={form.institution}
                onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2 text-sm"
                placeholder="Saldo inicial"
                type="number"
                value={form.opening_balance}
                onChange={(event) => setForm((prev) => ({ ...prev, opening_balance: event.target.value }))}
              />
            </div>
            <button
              className="w-full h-11 rounded-xl bg-primary text-white font-bold text-sm"
              onClick={handleSave}
            >
              {editingId ? 'Guardar cambios' : 'Crear cuenta'}
            </button>
          </section>
        )}

        <div className="space-y-6">
          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.2em] px-1">Entidades conectadas</h4>
          {data?.accounts.length ? (
            <div className="space-y-3">
              {data.accounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between border border-transparent hover:border-primary/20 transition-all cursor-pointer"
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full border border-slate-100 dark:border-slate-700 flex items-center justify-center text-primary bg-primary/10 text-xs font-bold">
                      {(() => {
                        const logoKey = account.institution ? slugifyLogoKey(account.institution) : '';
                        const logoUrl = logoKey ? logosByName.get(logoKey) : undefined;
                        if (logoUrl) {
                          return (
                            <img
                              src={logoUrl}
                              alt={account.institution ?? account.name}
                              className="w-7 h-7 object-contain"
                            />
                          );
                        }
                        return account.name.slice(0, 2).toUpperCase();
                      })()}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{account.name}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {account.institution ?? 'Cuenta'} · {account.currency}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-sm">{formatCurrency(balances.get(account.id) ?? 0, account.currency)}</p>
                    <div className="flex justify-end gap-2 mt-1">
                      <button
                        className="text-[10px] text-slate-400 font-semibold"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEdit(account.id);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="text-[10px] text-rose-400 font-semibold"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(account.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Aun no tienes cuentas" description="Crea tu primera cuenta para empezar." />
          )}
        </div>

        {selectedAccount && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Movimientos de {selectedAccount.name}</h3>
              <button className="text-[10px] text-slate-400 font-semibold" onClick={() => setSelectedAccountId(null)}>
                Ocultar
              </button>
            </div>
            {txLoading ? (
              <LoadingState label="Cargando movimientos..." />
            ) : txError ? (
              <EmptyState title="No se pudieron cargar los movimientos" description={txError} />
            ) : accountTransactions?.length ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                {accountTransactions.map((transaction) => {
                  const isTransferIn = transaction.kind === 'transfer' && transaction.transfer_account_id === selectedAccount.id;
                  const sign = transaction.kind === 'income' || isTransferIn ? '+' : '-';
                  return (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      onClick={() => navigate(`/edit-transaction/${transaction.id}`)}
                    >
                      <div>
                        <p className="text-sm font-bold">{transaction.description || 'Movimiento'}</p>
                        <p className="text-xs text-slate-500">{formatShortDate(transaction.occurred_at)}</p>
                      </div>
                      <span className="text-sm font-bold">
                        {sign} {formatCurrency(Number(transaction.amount), transaction.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Sin movimientos" description="Esta cuenta aun no tiene transacciones." />
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default Accounts;
