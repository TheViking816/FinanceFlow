import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { PortfolioSnapshot } from '../types';

export const listSnapshots = async () => {
  await requireAuth();
  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .order('snap_date', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as PortfolioSnapshot[];
};

export const getLatestSnapshot = async () => {
  await requireAuth();
  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .order('snap_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data as PortfolioSnapshot | null;
};

export const upsertSnapshot = async (snap_date: string, total_value_base: number, breakdown_json: Record<string, number>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .upsert({ user_id: user.id, snap_date, total_value_base, breakdown_json })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as PortfolioSnapshot;
};

export const deleteAllSnapshots = async () => {
  await requireAuth();
  const { error } = await supabase.from('portfolio_snapshots').delete().not('id', 'is', null);
  if (error) {
    throw error;
  }
};
