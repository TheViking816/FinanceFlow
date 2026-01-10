import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Broker } from '../types';

export const listBrokers = async () => {
  await requireAuth();
  const { data, error } = await supabase.from('brokers').select('*').order('name');
  if (error) {
    throw error;
  }
  return (data ?? []) as Broker[];
};

export const createBroker = async (name: string) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('brokers')
    .insert({ user_id: user.id, name })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Broker;
};
