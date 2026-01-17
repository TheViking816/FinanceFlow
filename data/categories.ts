import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Category } from '../types';

export const listCategories = async (kind?: Category['kind']) => {
  await requireAuth();
  let query = supabase.from('categories').select('*').order('name');
  if (kind) {
    query = query.eq('kind', kind);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as Category[];
};

export const createCategory = async (input: Omit<Category, 'id' | 'user_id' | 'created_at'>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Category;
};
export const updateCategory = async (id: string, input: Partial<Omit<Category, 'id' | 'user_id' | 'created_at'>>) => {
  await requireAuth();
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Category;
};
