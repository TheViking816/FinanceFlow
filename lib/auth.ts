import { supabase } from './supabaseClient';

export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return data.user;
};

export const requireAuth = async () => {
  const user = await getUser();
  if (!user) {
    throw new Error('No autenticado.');
  }
  return user;
};
