import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import { getSheetPriceEntries } from './prices';
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
  const { data, error } = await supabase.from('holdings').select('*').eq('id', id).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error('Activo no encontrado.');
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

export const syncHoldingsFromSheet = async () => {
  const user = await requireAuth();
  const entries = await getSheetPriceEntries();
  if (!entries.length) return 0;
  const payload = entries.map((entry) => ({
    user_id: user.id,
    broker_id: null,
    ticker: entry.ticker,
    name: null,
    market: entry.market ?? '',
    currency: entry.currency ?? 'EUR',
    quantity: 0,
    avg_price: entry.close_price,
    fees_total: 0,
  }));
  const { error } = await supabase
    .from('holdings')
    .upsert(payload, { onConflict: 'user_id,broker_id,ticker,market' });
  if (error) {
    throw error;
  }
  return payload.length;
};
