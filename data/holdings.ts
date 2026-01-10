import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Holding } from '../types';

export const listHoldings = async () => {
  await requireAuth();
  const { data, error } = await supabase.from('holdings').select('*').order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Holding[];
};

export const getHolding = async (id: string) => {
  await requireAuth();
  const { data, error } = await supabase.from('holdings').select('*').eq('id', id).single();
  if (error) {
    throw error;
  }
  return data as Holding;
};

export const createHolding = async (input: Omit<Holding, 'id' | 'user_id' | 'created_at'>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('holdings')
    .insert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Holding;
};

export const updateHolding = async (id: string, input: Partial<Holding>) => {
  await requireAuth();
  const { data, error } = await supabase.from('holdings').update(input).eq('id', id).select('*').single();
  if (error) {
    throw error;
  }
  return data as Holding;
};

export const deleteHolding = async (id: string) => {
  await requireAuth();
  const { error } = await supabase.from('holdings').delete().eq('id', id);
  if (error) {
    throw error;
  }
};

export const deleteAllHoldings = async () => {
  await requireAuth();
  const { error } = await supabase.from('holdings').delete().not('id', 'is', null);
  if (error) {
    throw error;
  }
};
