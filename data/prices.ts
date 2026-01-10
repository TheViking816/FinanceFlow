import { supabase } from '../lib/supabaseClient';
import { parseNumberEU } from '../lib/importers';
import type { Holding, SecurityPrice } from '../types';

const MARKET_ALIASES: Record<string, string> = {
  SEHK: 'HKG',
  HKEX: 'HKG',
  LSE: 'LON',
  LON: 'LON',
  BME: 'BME',
  EPA: 'EPA',
  AMS: 'AMS',
  NASDAQ: 'NASDAQ',
  NYSE: 'NYSE',
  NYSEARCA: 'NYSEARCA',
  HKG: 'HKG',
};

const normalizeMarket = (market: string | null | undefined) => {
  const raw = (market ?? '').trim().toUpperCase();
  return MARKET_ALIASES[raw] ?? raw;
};

const normalizeTicker = (ticker: string, market: string | null) => {
  const normalized = ticker.trim().toUpperCase();
  const marketCode = normalizeMarket(market);
  if (marketCode === 'HKG' && /^\d+$/.test(normalized)) {
    return normalized.padStart(4, '0');
  }
  return normalized;
};

const buildKey = (ticker: string, market: string | null) =>
  `${normalizeTicker(ticker, market)}__${normalizeMarket(market) || 'none'}`;
const SHEET_META_KEY = 'financeflow-sheet-prices-meta';
const DEFAULT_PRICES_SHEET_URL =
  (import.meta.env.VITE_PRICES_SHEET_URL || '').trim() ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?output=csv';

const resolveSheetUrls = (input: string) => {
  const urls = new Set<string>();
  const addUrl = (url: string | null) => {
    if (url) urls.add(url);
  };

  try {
    const direct = new URL(input);
    addUrl(direct.toString());
    if (direct.hostname.includes('docs.google.com') && direct.pathname.includes('/spreadsheets/d/e/')) {
      const match = direct.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
      const id = match?.[1];
      const gid = direct.searchParams.get('gid');
      if (id) {
        const params = new URLSearchParams();
        params.set('output', 'csv');
        if (gid) params.set('gid', gid);
        addUrl(`https://docs.google.com/spreadsheets/d/e/${id}/pub?${params.toString()}`);
      }
    }
    if (direct.hostname.includes('docs.google.com') && direct.pathname.includes('/spreadsheets/d/')) {
      const match = direct.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
      const id = match?.[1];
      const gid = direct.searchParams.get('gid') ?? '0';
      if (id) {
        addUrl(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
      }
    }
    if (direct.hostname.includes('googleusercontent.com') && direct.pathname.includes('e@')) {
      const match = direct.pathname.match(/e@([^/]+)/);
      const id = match?.[1];
      const gid = direct.searchParams.get('gid');
      if (id) {
        const params = new URLSearchParams();
        params.set('output', 'csv');
        if (gid) params.set('gid', gid);
        addUrl(`https://docs.google.com/spreadsheets/d/e/${id}/pub?${params.toString()}`);
      }
    }
  } catch {
    const match = input.match(/e@([^/\\s?]+)/);
    const id = match?.[1];
    if (id) {
      addUrl(`https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`);
    }
  }

  return Array.from(urls);
};

const fetchSheetText = async (input: string) => {
  const candidates = resolveSheetUrls(input);
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' });
      if (response.ok) {
        return response.text();
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('No se pudo cargar el CSV publicado.');
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

const normalizeSheetPrice = (price: number, currency: string | null, market: string | null) => {
  if (currency === 'GBP' && normalizeMarket(market) === 'LON' && price > 100) {
    return price / 100;
  }
  return price;
};

const buildSheetPrice = (row: Record<string, string>) => {
  const rawTicker = row.ticker?.trim();
  const price = parseNumberEU(row.price ?? '');
  if (!rawTicker || !price) return null;
  let ticker = rawTicker.toUpperCase();
  let market: string | null = null;
  if (rawTicker.includes(':')) {
    const [marketPart, tickerPart] = rawTicker.split(':');
    market = normalizeMarket(marketPart);
    ticker = normalizeTicker(tickerPart ?? rawTicker, market);
  } else {
    ticker = normalizeTicker(rawTicker, null);
  }
  const currency = row.currency?.trim().toUpperCase() || null;
  const normalizedPrice = normalizeSheetPrice(price, currency, market);
  const today = new Date().toISOString().slice(0, 10);
  const priceEntry: SecurityPrice = {
    id: `sheet-${ticker}-${market ?? 'none'}`,
    ticker,
    market,
    currency,
    price_date: today,
    close_price: normalizedPrice,
    created_at: today,
  };
  return priceEntry;
};

export type SheetHoldingEntry = {
  ticker: string;
  market: string | null;
  currency: string | null;
  price: number;
  quantity: number;
  name: string | null;
  priceDate: string;
};

const normalizeHeaderKey = (value: string) => value.replace(/\s+/g, '').toLowerCase();

const getRowValue = (row: Record<string, string>, keys: string[]) => {
  const normalizedRow: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    normalizedRow[normalizeHeaderKey(key)] = value;
  });
  for (const key of keys) {
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedRow[normalizedKey] !== undefined) {
      return normalizedRow[normalizedKey];
    }
  }
  return '';
};

const buildSheetHolding = (row: Record<string, string>): SheetHoldingEntry | null => {
  const rawTicker = (row.ticker ?? getRowValue(row, ['ticker', 'symbol', 'isin'])).trim();
  const price = parseNumberEU(getRowValue(row, ['price', 'precio', 'precioactual']));
  if (!rawTicker || !price) return null;
  let ticker = rawTicker.toUpperCase();
  let market: string | null = null;
  if (rawTicker.includes(':')) {
    const [marketPart, tickerPart] = rawTicker.split(':');
    market = normalizeMarket(marketPart);
    ticker = normalizeTicker(tickerPart ?? rawTicker, market);
  } else {
    ticker = normalizeTicker(rawTicker, null);
  }
  const currency = (getRowValue(row, ['currency', 'moneda']) || '').trim().toUpperCase() || null;
  const normalizedPrice = normalizeSheetPrice(price, currency, market);
  const quantity = parseNumberEU(getRowValue(row, ['acciones', 'cantidad', 'shares']));
  const name = (getRowValue(row, ['name', 'nombre', 'descripcion']) || '').trim() || null;
  return {
    ticker,
    market,
    currency,
    price: normalizedPrice,
    quantity,
    name,
    priceDate: new Date().toISOString().slice(0, 10),
  };
};

export const getSheetPriceEntries = async () => {
  try {
    const text = await fetchSheetText(DEFAULT_PRICES_SHEET_URL);
    const rows = parseSheetPrices(text);
    const entries: SecurityPrice[] = [];
    rows.forEach((row) => {
      const price = buildSheetPrice(row);
      if (!price) return;
      entries.push(price);
    });
    window.localStorage.setItem(
      SHEET_META_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        rows: rows.length,
        source: 'sheet',
      })
    );
    return entries;
  } catch {
    return [];
  }
};

export const getSheetHoldings = async () => {
  try {
    const text = await fetchSheetText(DEFAULT_PRICES_SHEET_URL);
    const rows = parseSheetPrices(text);
    return rows.map(buildSheetHolding).filter(Boolean) as SheetHoldingEntry[];
  } catch {
    return [];
  }
};

const loadPricesFromSheet = async () => {
  const entries = await getSheetPriceEntries();
  const map = new Map<string, SecurityPrice>();
  entries.forEach((price) => {
    const key = buildKey(price.ticker, price.market);
    map.set(key, price);
    if (price.market) {
      const fallbackKey = buildKey(price.ticker, null);
      if (!map.has(fallbackKey)) {
        map.set(fallbackKey, { ...price, market: null });
      }
      const prefixedKey = buildKey(`${price.market}:${price.ticker}`, null);
      if (!map.has(prefixedKey)) {
        map.set(prefixedKey, { ...price, market: null });
      }
    }
  });
  return map;
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

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

export const syncSheetPricesToSupabase = async (holdings: Holding[]) => {
  if (!holdings.length) return 0;
  const sheetPrices = await loadPricesFromSheet();
  if (!sheetPrices.size) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const payload = holdings
    .map((holding) => {
      const key = buildKey(holding.ticker, holding.market ?? null);
      const price = sheetPrices.get(key);
      if (!price) return null;
      return {
        ticker: normalizeTicker(holding.ticker, holding.market ?? null),
        market: normalizeMarket(holding.market ?? ''),
        currency: price.currency ?? holding.currency,
        price_date: today,
        close_price: price.close_price,
      };
    })
    .filter(Boolean) as Array<{
    ticker: string;
    market: string;
    currency: string;
    price_date: string;
    close_price: number;
  }>;

  if (!payload.length) return 0;

  for (const batch of chunk(payload, 200)) {
    const { error } = await supabase
      .from('security_prices')
      .upsert(batch, { onConflict: 'ticker,market,price_date' });
    if (error) throw error;
  }
  return payload.length;
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
