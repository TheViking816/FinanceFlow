import { supabase } from '../lib/supabaseClient';
import type { Holding, SecurityPrice } from '../types';

const normalizeMarket = (market: string | null | undefined) => (market ?? '').trim();
const buildKey = (ticker: string, market: string | null) => `${ticker}__${normalizeMarket(market) || 'none'}`;

export const listPricesForHolding = async (ticker: string, market: string | null) => {
  const normalized = normalizeMarket(market);
  let query = supabase.from('security_prices').select('*').eq('ticker', ticker);
  if (normalized) {
    query = query.eq('market', normalized);
  } else {
    query = query.or('market.is.null,market.eq.');
  }
  const { data, error } = await query.order('price_date', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as SecurityPrice[];
};

export const insertPrice = async (input: Omit<SecurityPrice, 'id' | 'created_at'>) => {
  const { data, error } = await supabase.from('security_prices').insert(input).select('*').single();
  if (error) {
    throw error;
  }
  return data as SecurityPrice;
};

export const getLatestPrices = async (holdings: Holding[]) => {
  if (!holdings.length) {
    return new Map<string, SecurityPrice>();
  }
  const tickers = Array.from(new Set(holdings.map((holding) => holding.ticker)));
  const { data, error } = await supabase
    .from('security_prices')
    .select('*')
    .in('ticker', tickers)
    .order('price_date', { ascending: false });
  if (error) {
    throw error;
  }
  const latestMap = new Map<string, SecurityPrice>();
  (data ?? []).forEach((price) => {
    const key = buildKey(price.ticker, price.market ?? '');
    if (!latestMap.has(key)) {
      latestMap.set(key, price as SecurityPrice);
    }
  });
  return latestMap;
};

export const getPriceKey = (ticker: string, market: string | null) => buildKey(ticker, market ?? '');
