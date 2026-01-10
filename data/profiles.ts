import { supabase } from '../lib/supabaseClient';
import { requireAuth } from '../lib/auth';
import type { Profile } from '../types';

export const getProfile = async () => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data as Profile | null;
};

export const upsertProfile = async (input: Partial<Profile>) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, ...input })
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return data as Profile;
};
