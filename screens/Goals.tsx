import React, { useMemo, useState } from 'react';
import { listGoals, createGoal, updateGoal, deleteGoal } from '../data/goals';
import { getProfile } from '../data/profiles';
import { useQuery } from '../hooks/useQuery';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { formatCurrency, formatDate } from '../lib/format';
import { useToast } from '../components/ToastProvider';

const Goals: React.FC = () => {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    due_date: '',
  });

  const { data, loading, error, refetch } = useQuery(async () => {
    const [profile, goals] = await Promise.all([getProfile(), listGoals()]);
    return { profile, goals };
  }, []);

  const baseCurrency = data?.profile?.base_currency ?? 'EUR';
  const totalSaved = useMemo(() => {
    if (!data) return 0;
    return data.goals.reduce((sum, goal) => sum + Number(goal.current_amount), 0);
  }, [data]);

  const handleEdit = (goalId: string) => {
    const goal = data?.goals.find((item) => item.id === goalId);
    if (!goal) return;
    setEditingId(goalId);
    setShowForm(true);
    setForm({
      name: goal.name,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      due_date: goal.due_date ?? '',
    });
  };

  const resetForm = () => {
    setForm({ name: '', target_amount: '', current_amount: '', due_date: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('El nombre es obligatorio.', 'error');
      return;
    }
    const payload = {
      name: form.name.trim(),
      target_amount: Number(form.target_amount || 0),
      current_amount: Number(form.current_amount || 0),
      due_date: form.due_date || null,
    };
    try {
      if (editingId) {
        await updateGoal(editingId, payload);
        showToast('Objetivo actualizado.', 'success');
      } else {
        await createGoal(payload);
        showToast('Objetivo creado.', 'success');
      }
      resetForm();
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el objetivo.', 'error');
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      await deleteGoal(goalId);
      showToast('Objetivo eliminado.', 'success');
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    }
  };

  if (loading) {
    return <LoadingState label="Cargando objetivos..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar los objetivos" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24 overflow-y-auto no-scrollbar">
      <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background-light/90 dark:bg-background-dark/90">
        <h2 className="text-xl font-bold">Objetivos</h2>
        <button
          className="size-10 rounded-full bg-white dark:bg-slate-800 shadow-sm text-primary flex items-center justify-center border dark:border-slate-700"
          onClick={() => setShowForm((prev) => !prev)}
        >
          <span className="material-symbols-outlined">{showForm ? 'close' : 'add'}</span>
        </button>
      </header>
      <section className="px-4 py-6">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total ahorrado</p>
        <h1 className="text-4xl font-extrabold tracking-tight">{formatCurrency(totalSaved, baseCurrency)}</h1>
      </section>

      {showForm && (
        <section className="px-4 pb-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{editingId ? 'Editar objetivo' : 'Nuevo objetivo'}</h3>
              {editingId && (
                <button className="text-xs text-slate-400 font-semibold" onClick={resetForm}>
                  Cancelar
                </button>
              )}
            </div>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Nombre"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Objetivo"
                type="number"
                value={form.target_amount}
                onChange={(event) => setForm((prev) => ({ ...prev, target_amount: event.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Actual"
                type="number"
                value={form.current_amount}
                onChange={(event) => setForm((prev) => ({ ...prev, current_amount: event.target.value }))}
              />
            </div>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              type="date"
              value={form.due_date}
              onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
            />
            <button className="w-full h-10 rounded-xl bg-primary text-white text-sm font-bold" onClick={handleSave}>
              Guardar objetivo
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-5 px-4 pb-4">
        {data?.goals.length ? (
          data.goals.map((goal) => {
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0;
            return (
              <div key={goal.id} className="rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1 font-bold uppercase text-[9px] text-primary">
                      <span className="material-symbols-outlined text-sm">track_changes</span> Progreso
                    </div>
                    <h3 className="text-lg font-bold leading-tight">{goal.name}</h3>
                    {goal.due_date && (
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        Est. {formatDate(goal.due_date)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="text-[10px] text-slate-400 font-semibold" onClick={() => handleEdit(goal.id)}>
                      Editar
                    </button>
                    <button className="text-[10px] text-rose-400 font-semibold" onClick={() => handleDelete(goal.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xl font-extrabold">
                    {formatCurrency(goal.current_amount, baseCurrency)}{' '}
                    <span className="text-slate-400 text-sm font-medium">/ {formatCurrency(goal.target_amount, baseCurrency)}</span>
                  </span>
                  <span className="text-primary font-extrabold text-lg">{pct}%</span>
                </div>
                <div className="rounded-full bg-slate-100 dark:bg-slate-700 h-2.5 overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState title="Aun no tienes objetivos" description="Crea tu primer objetivo de ahorro." />
        )}
      </div>
    </div>
  );
};

export default Goals;
