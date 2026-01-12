import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Transaction } from '../types';

export const listRecentTransactions = async (limit = 10) => {
  await requireAuth();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data ?? []) as Transaction[];
};

export const listAllTransactions = async () => {
  await requireAuth();
  const { data, error } = await supabase.from('transactions').select('*').order('occurred_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Transaction[];
};

export const listTransactionsForAccount = async (accountId: string) => {
  await requireAuth();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId}`)
    .order('occurred_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Transaction[];
};

export const listTransactionsByMonth = async (month: string) => {
  await requireAuth();
  const start = `${month}-01`;
  const endDate = new Date(`${month}-01T00:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('occurred_at', start)
    .lt('occurred_at', end)
    .order('occurred_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Transaction[];
};

export const getTransaction = async (id: string) => {
  await requireAuth();
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
  if (error) {
    throw error;
  }
  return data as Transaction;
};

export const createTransaction = async (input: Omit<Transaction, 'id' | 'user_id' | 'created_at'>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('transactions')
    .insert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Transaction;
};

export const updateTransaction = async (
  id: string,
  input: Partial<Pick<Transaction, 'amount' | 'category_id'>>,
) => {
  await requireAuth();
  const { data, error } = await supabase.from('transactions').update(input).eq('id', id).select('*').single();
  if (error) {
    throw error;
  }
  return data as Transaction;
};
