import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listCategories, updateCategory } from '../data/categories';
import { getTransaction, updateTransaction } from '../data/transactions';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

const EditTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { id } = useParams();
  const [form, setForm] = useState({
    amount: '',
    category_id: '',
    description: '',
    occurred_at: '',
    category_icon: '',
  });

  const { data, loading, error, refetch } = useQuery(async () => {
    if (!id) {
      throw new Error('Movimiento no encontrado.');
    }
    const [transaction, categories] = await Promise.all([getTransaction(id), listCategories()]);
    return { transaction, categories };
  }, [id]);

  useEffect(() => {
    if (!data?.transaction) return;
    const currentCategory = data.categories.find(c => c.id === data.transaction.category_id);
    setForm({
      amount: String(data.transaction.amount ?? ''),
      category_id: data.transaction.category_id ?? '',
      description: data.transaction.description ?? '',
      occurred_at: data.transaction.occurred_at ? data.transaction.occurred_at.slice(0, 10) : '',
      category_icon: currentCategory?.icon ?? '',
    });
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.transaction) return [];
    return data.categories.filter((category) => category.kind === data.transaction.kind);
  }, [data]);

  const handleSave = async () => {
    if (!data?.transaction || !id) return;
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('El importe debe ser mayor que cero.', 'error');
      return;
    }
    if (data.transaction.kind !== 'transfer' && !form.category_id) {
      showToast('Selecciona una categoria.', 'error');
      return;
    }
    try {
      // 1. Update Transaction
      await updateTransaction(id, {
        amount: Number(form.amount),
        category_id: data.transaction.kind === 'transfer' ? null : form.category_id || null,
        description: form.description || null,
        occurred_at: form.occurred_at,
      });

      // 2. Update Category Icon if it changed (and not a transfer)
      const currentCategory = data.categories.find(c => c.id === form.category_id);
      if (currentCategory && form.category_icon !== (currentCategory.icon ?? '')) {
        await updateCategory(currentCategory.id, {
          icon: form.category_icon.trim() || null
        });
      }

      showToast('Movimiento actualizado.', 'success');
      navigate(-1);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar el movimiento.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando movimiento..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar el movimiento" description={error} />
      </div>
    );
  }

  if (!data?.transaction) {
    return (
      <div className="p-6">
        <EmptyState title="Movimiento no encontrado" description="No existe este movimiento." />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-light dark:bg-background-dark">
      <header className="p-4 flex items-center justify-between border-b dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold flex-1 text-center">Editar movimiento</h2>
        <div className="w-10" />
      </header>
      <main className="p-4 space-y-6 flex-1 overflow-y-auto no-scrollbar">
        <div className="py-4 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Importe</p>
          <div className="flex items-baseline justify-center">
            <span className="text-2xl font-bold text-slate-400 mr-2">{data.transaction.currency}</span>
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
          {data.transaction.kind !== 'transfer' ? (
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</label>
                <select
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                  value={form.category_id}
                  onChange={(event) => {
                    const newCatId = event.target.value;
                    const cat = data.categories.find(c => c.id === newCatId);
                    setForm((prev) => ({ ...prev, category_id: newCatId, category_icon: cat?.icon ?? '' }));
                  }}
                >
                  <option value="">Selecciona una categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Icono material / Imagen (png)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                  placeholder="Ej: shopping_cart o logo.png"
                  value={form.category_icon}
                  onChange={(event) => setForm((prev) => ({ ...prev, category_icon: event.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">Las transferencias no tienen categoria.</div>
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
          Guardar cambios
        </button>
      </footer>
    </div>
  );
};

export default EditTransaction;
