import { parseNumberEU } from './importers';

const STORAGE_KEY = 'financeflow-fx-rates';

const resolveSheetUrls = (input: string) => {
  const urls = new Set<string>();
  const addUrl = (url: string | null) => {
    if (url) urls.add(url);
  };

  try {
    const direct = new URL(input);
    if (!direct.hostname.includes('googleusercontent.com')) {
      addUrl(direct.toString());
    }
    if (direct.hostname.includes('docs.google.com') && direct.pathname.includes('/spreadsheets/d/e/')) {
      const match = direct.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
      const id = match?.[1];
      if (id) {
        const gid = direct.searchParams.get('gid');
        const params = new URLSearchParams();
        params.set('output', 'csv');
        if (gid) params.set('gid', gid);
        addUrl(`https://docs.google.com/spreadsheets/d/e/${id}/pub?${params.toString()}`);
      }
    }
    if (
      direct.hostname.includes('docs.google.com')
      && direct.pathname.includes('/spreadsheets/d/')
      && !direct.pathname.includes('/spreadsheets/d/e/')
    ) {
      const match = direct.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
      const id = match?.[1];
      const gid = direct.searchParams.get('gid') ?? '0';
      if (id && id !== 'e') {
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

const withCacheBuster = (raw: string) => {
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('_ts')) {
      url.searchParams.set('_ts', Date.now().toString());
    }
    return url.toString();
  } catch {
    return raw;
  }
};

const fetchSheetText = async (input: string) => {
  const candidates = resolveSheetUrls(input).map(withCacheBuster);
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        return response.text();
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('No se pudo cargar FX desde Google Sheets.');
};

const detectDelimiter = (line: string) => {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  return semicolon > comma ? ';' : ',';
};

const splitLine = (line: string, delimiter: string) => {
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

const normalizePartsToHeaders = (parts: string[], headers: string[], delimiter: string) => {
  if (parts.length <= headers.length) return parts;
  const numericHeaders = new Set([
    'price',
    'change',
    'change_percent',
    'fx_to_base',
    'fx',
    'fx_to_eur',
    'low52w',
    'high52w',
    'yield_pct',
    'payout_pct',
    'annual_dividend',
    'acciones',
    'quantity',
  ]);
  const looksLikeSplitDecimal = (left: string, right: string) =>
    /^-?\d+$/.test(left) && /^\d{1,4}$/.test(right);
  const normalized = [...parts];
  for (let i = 0; i < normalized.length - 1 && normalized.length > headers.length; i += 1) {
    const header = headers[i];
    if (!numericHeaders.has(header)) continue;
    const left = (normalized[i] ?? '').trim();
    const right = (normalized[i + 1] ?? '').trim();
    if (!left || !right) continue;
    if (!looksLikeSplitDecimal(left, right)) continue;
    normalized[i] = `${left}${delimiter}${right}`;
    normalized.splice(i + 1, 1);
    i = Math.max(-1, i - 1);
  }
  return normalized;
};

export const loadFxRatesFromSheet = async (sheetUrl: string, baseCurrency: string) => {
  const text = await fetchSheetText(sheetUrl);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return {};
  const headerLine = lines[0];
  const delimiter = detectDelimiter(headerLine);
  const headers = splitLine(headerLine, delimiter).map((header) => header.trim().toLowerCase());
  const currencyIndex = headers.findIndex((header) => header === 'currency' || header === 'moneda');
  const fxIndex = headers.findIndex(
    (header) => header === 'fx_to_base' || header === 'fx' || header === 'fx_to_eur'
  );
  const rates: Record<string, number> = {};

  if (currencyIndex >= 0 && fxIndex >= 0) {
    lines.slice(1).forEach((line) => {
      const rawParts = splitLine(line, delimiter);
      const parts = normalizePartsToHeaders(rawParts, headers, delimiter);
      const currency = (parts[currencyIndex] ?? '').trim().toUpperCase();
      const fxValue = (parts[fxIndex] ?? '').toString();
      if (!currency || !fxValue) return;
      const rate = parseNumberEU(fxValue);
      if (!rate || !Number.isFinite(rate)) return;
      if (currency === baseCurrency) {
        rates[currency] = 1;
        return;
      }
      rates[currency] = rate;
    });
  } else {
    lines.forEach((line, index) => {
      if (index === 0) return;
      const parts = splitLine(line, delimiter);
      if (parts.length < 2) return;
      const pairRaw = parts[parts.length - 1];
      const rateRaw = parts.slice(0, -1).join(delimiter);
      if (!rateRaw || !pairRaw) return;
      const pair = pairRaw.trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (pair.length < 6) return;
      const from = pair.slice(0, 3);
      const to = pair.slice(3, 6);
      const aliasMap: Record<string, string> = {
        HDK: 'HKD',
        HKD: 'HKD',
      };
      const normalizedFrom = aliasMap[from] ?? from;
      const normalizedTo = aliasMap[to] ?? to;
      const rateValue = rateRaw.replace(/"/g, '').trim().replace(/\u00A0/g, '');
      const rate = parseNumberEU(rateValue);
      if (!rate || !Number.isFinite(rate)) return;
      if (normalizedTo === baseCurrency) {
        rates[normalizedFrom] = rate;
        return;
      }
      if (normalizedFrom === baseCurrency) {
        rates[normalizedTo] = 1 / rate;
      }
    });
  }

  if (Object.keys(rates).length) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  }
  return rates;
};

export const loadCachedFxRates = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return null;
  }
};
