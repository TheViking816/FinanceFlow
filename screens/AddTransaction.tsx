import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAccounts } from '../data/accounts';
import { listCategories, createCategory } from '../data/categories';
import { createTransaction } from '../data/transactions';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [form, setForm] = useState({
    amount: '',
    account_id: '',
    transfer_account_id: '',
    category_id: '',
    description: '',
    occurred_at: new Date().toISOString().slice(0, 10),
  });
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: '' });

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, accounts, categories] = await Promise.all([getProfile(), listAccounts(), listCategories()]);
    return { profile, accounts, categories };
  }, []);

  const categories = useMemo(() => {
    if (!data) return [];
    return data.categories.filter((category) => category.kind === kind);
  }, [data, kind]);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('El importe debe ser mayor que cero.', 'error');
      return;
    }
    if (!form.account_id) {
      showToast('Selecciona una cuenta.', 'error');
      return;
    }
    if (kind === 'transfer' && !form.transfer_account_id) {
      showToast('Selecciona la cuenta destino.', 'error');
      return;
    }
    if (kind === 'transfer' && form.transfer_account_id === form.account_id) {
      showToast('La cuenta destino debe ser distinta.', 'error');
      return;
    }
    if (kind !== 'transfer' && !form.category_id) {
      showToast('Selecciona una categoria.', 'error');
      return;
    }
    try {
      const accountCurrency = data?.accounts.find((account) => account.id === form.account_id)?.currency;
      await createTransaction({
        account_id: form.account_id,
        transfer_account_id: kind === 'transfer' ? form.transfer_account_id : null,
        kind,
        amount: Number(form.amount),
        currency: accountCurrency ?? data?.profile?.base_currency ?? 'EUR',
        category_id: kind === 'transfer' ? null : form.category_id,
        description: form.description || null,
        occurred_at: form.occurred_at,
      });
      showToast('Movimiento guardado.', 'success');
      navigate(-1);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.', 'error');
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      showToast('El nombre es obligatorio.', 'error');
      return;
    }
    try {
      const category = await createCategory({
        name: categoryForm.name.trim(),
        kind,
        icon: categoryForm.icon.trim() || null,
      });
      showToast('Categoria creada.', 'success');
      setShowCategoryForm(false);
      setCategoryForm({ name: '', icon: '' });
      setForm((prev) => ({ ...prev, category_id: category.id }));
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la categoria.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando formulario..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar la pantalla" description={error} />
      </div>
    );
  }

  if (!data?.accounts.length) {
    return (
      <div className="p-6">
        <EmptyState
          title="Necesitas una cuenta"
          description="Crea una cuenta antes de registrar movimientos."
          action={
            <button className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold" onClick={() => navigate('/accounts')}>
              Ir a cuentas
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-light dark:bg-background-dark">
      <header className="p-4 flex items-center justify-between border-b dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="w-12"></div>
        <h2 className="text-base font-bold flex-1 text-center">Anadir Movimiento</h2>
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800 transition-all">
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      <main className="p-4 space-y-8 flex-1 overflow-y-auto no-scrollbar">
        <div className="bg-slate-200 dark:bg-slate-800 p-1 rounded-xl flex h-10 shadow-inner">
          {(['expense', 'income', 'transfer'] as const).map((type) => (
            <button
              key={type}
              className={`flex-1 rounded-lg text-xs font-bold transition-all ${kind === type ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}
              onClick={() => {
                setKind(type);
                setForm((prev) => ({ ...prev, category_id: '', transfer_account_id: '' }));
              }}
            >
              {type === 'expense' ? 'Gasto' : type === 'income' ? 'Ingreso' : 'Transf.'}
            </button>
          ))}
        </div>

        <div className="py-4 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Importe</p>
          <div className="flex items-baseline justify-center">
            <span className="text-2xl font-bold text-slate-400 mr-2">{data?.profile?.base_currency ?? 'EUR'}</span>
            <input
              className="text-5xl font-extrabold bg-transparent border-none text-center focus:ring-0 p-0 w-64 tracking-tighter"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              type="number"
              placeholder="0"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm divide-y dark:divide-slate-700">
          <div className="p-5 space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta</label>
            <select
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              value={form.account_id}
              onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))}
            >
              <option value="">Selecciona una cuenta</option>
              {data?.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>

          {kind === 'transfer' ? (
            <div className="p-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta destino</label>
              <select
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                value={form.transfer_account_id}
                onChange={(event) => setForm((prev) => ({ ...prev, transfer_account_id: event.target.value }))}
              >
                <option value="">Selecciona una cuenta</option>
                {data?.accounts
                  .filter((account) => account.id !== form.account_id)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</label>
                <button className="text-[10px] text-primary font-bold" onClick={() => setShowCategoryForm((prev) => !prev)}>
                  {showCategoryForm ? 'Cancelar' : 'Nueva'}
                </button>
              </div>
              <select
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                value={form.category_id}
                onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}
              >
                <option value="">Selecciona una categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {showCategoryForm && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                    placeholder="Nombre"
                    value={categoryForm.name}
                    onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <input
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                    placeholder="Icono material"
                    value={categoryForm.icon}
                    onChange={(event) => setCategoryForm((prev) => ({ ...prev, icon: event.target.value }))}
                  />
                  <button className="col-span-2 h-9 rounded-xl bg-primary text-white text-xs font-bold" onClick={handleCreateCategory}>
                    Guardar categoria
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="p-5 space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</label>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              value={form.occurred_at}
              onChange={(event) => setForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
            />
          </div>
          <div className="p-5 space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descripcion</label>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Opcional"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
        </div>
      </main>
      <footer className="p-4 pb-12">
        <button
          onClick={handleSave}
          className="w-full h-14 bg-primary text-white font-extrabold rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all"
        >
          Guardar Movimiento
        </button>
      </footer>
    </div>
  );
};

export default AddTransaction;
