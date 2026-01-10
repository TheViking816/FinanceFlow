import { supabase } from '../lib/supabaseClient';
import { parseNumberEU } from '../lib/importers';
import type { Holding, SecurityPrice } from '../types';

const normalizeMarket = (market: string | null | undefined) => (market ?? '').trim();
const buildKey = (ticker: string, market: string | null) => `${ticker}__${normalizeMarket(market) || 'none'}`;
const SHEET_META_KEY = 'financeflow-sheet-prices-meta';
const DEFAULT_PRICES_SHEET_URL =
  (import.meta.env.VITE_PRICES_SHEET_URL || '').trim() ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?output=csv';

const normalizeSheetUrl = (input: string) => {
  try {
    const url = new URL(input);
    if (url.hostname.includes('docs.google.com') && url.pathname.includes('/spreadsheets/d/e/')) {
      const match = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
      const id = match?.[1];
      if (id) {
        return `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`;
      }
    }
    if (url.hostname.includes('docs.google.com') && url.pathname.includes('/spreadsheets/d/')) {
      const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
      const id = match?.[1];
      const gid = url.searchParams.get('gid') ?? '0';
      if (id) {
        return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
      }
    }
  } catch {
    return input;
  }
  return input;
};

const detectDelimiter = (line: string) => {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  return semicolon > comma ? ';' : ',';
};

const splitCsvLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
};

const parseSheetPrices = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? '';
    });
    return record;
  });
};

const buildSheetPrice = (row: Record<string, string>) => {
  const rawTicker = row.ticker?.trim();
  const price = parseNumberEU(row.price ?? '');
  if (!rawTicker || !price) return null;
  let ticker = rawTicker;
  let market: string | null = null;
  if (rawTicker.includes(':')) {
    const [marketPart, tickerPart] = rawTicker.split(':');
    market = marketPart?.trim() || null;
    ticker = tickerPart?.trim() || rawTicker;
  }
  const currency = row.currency?.trim().toUpperCase() || null;
  const today = new Date().toISOString().slice(0, 10);
  const priceEntry: SecurityPrice = {
    id: `sheet-${ticker}-${market ?? 'none'}`,
    ticker,
    market,
    currency,
    price_date: today,
    close_price: price,
    created_at: today,
  };
  return priceEntry;
};

const loadPricesFromSheet = async () => {
  try {
    const response = await fetch(normalizeSheetUrl(DEFAULT_PRICES_SHEET_URL));
    if (!response.ok) {
      return new Map<string, SecurityPrice>();
    }
    const text = await response.text();
    const rows = parseSheetPrices(text);
    const map = new Map<string, SecurityPrice>();
    rows.forEach((row) => {
      const price = buildSheetPrice(row);
      if (!price) return;
      const key = buildKey(price.ticker, price.market);
      map.set(key, price);
      if (price.market) {
        const fallbackKey = buildKey(price.ticker, null);
        if (!map.has(fallbackKey)) {
          map.set(fallbackKey, { ...price, market: null });
        }
      }
    });
    window.localStorage.setItem(
      SHEET_META_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        rows: rows.length,
        source: 'sheet',
      })
    );
    return map;
  } catch {
    return new Map<string, SecurityPrice>();
  }
};

export const getSheetPrices = async () => loadPricesFromSheet();

export const getSheetPricesMeta = () => {
  try {
    const raw = window.localStorage.getItem(SHEET_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { updatedAt: string; rows: number; source: string };
  } catch {
    return null;
  }
};

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
  const sheetPrices = await loadPricesFromSheet();
  sheetPrices.forEach((price, key) => {
    latestMap.set(key, price);
  });
  return latestMap;
};

export const getPriceKey = (ticker: string, market: string | null) => buildKey(ticker, market ?? '');
