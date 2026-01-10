import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Goal } from '../types';

export const listGoals = async () => {
  await requireAuth();
  const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Goal[];
};

export const createGoal = async (input: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Goal;
};

export const updateGoal = async (id: string, input: Partial<Goal>) => {
  await requireAuth();
  const { data, error } = await supabase.from('goals').update(input).eq('id', id).select('*').single();
  if (error) {
    throw error;
  }
  return data as Goal;
};

export const deleteGoal = async (id: string) => {
  await requireAuth();
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) {
    throw error;
  }
};
