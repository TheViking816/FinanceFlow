import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Account } from '../types';

export const listAccounts = async () => {
  await requireAuth();
  const { data, error } = await supabase.from('accounts').select('*').order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Account[];
};

export const createAccount = async (input: Omit<Account, 'id' | 'user_id' | 'created_at'>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('accounts')
    .insert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Account;
};

export const updateAccount = async (id: string, input: Partial<Account>) => {
  await requireAuth();
  const { data, error } = await supabase.from('accounts').update(input).eq('id', id).select('*').single();
  if (error) {
    throw error;
  }
  return data as Account;
};

export const deleteAccount = async (id: string) => {
  await requireAuth();
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) {
    throw error;
  }
};

export const countAccountTransactions = async (accountId: string) => {
  await requireAuth();
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId}`);
  if (error) {
    throw error;
  }
  return count ?? 0;
};
