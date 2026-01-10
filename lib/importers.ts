export type ImportProvider = 'IBKR' | 'DEGIRO';

export type NormalizedRow = {
  broker: ImportProvider;
  symbol: string;
  isin: string;
  name: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  avgPrice?: number;
  value: number;
  valueLocal?: number;
  valueBase?: number;
  reportDate: string;
  warnings: string[];
};

export type ImportPreview = {
  provider: ImportProvider;
  rows: NormalizedRow[];
  ignored: { reason: string; row: Record<string, string> }[];
  warnings: string[];
  reportDate: string;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase();

const parseCsvLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
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

const detectDelimiter = (line: string) => {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  return semicolon > comma ? ';' : ',';
};

const parseCsv = (text: string) => {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);
  if (!rows.length) {
    return { headers: [] as string[], records: [] as Record<string, string>[] };
  }
  const delimiter = detectDelimiter(rows[0]);
  const headers = parseCsvLine(rows[0], delimiter).map((header) => header.trim());
  const records = rows.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? '';
    });
    return record;
  });
  return { headers, records };
};

export const detectProvider = (headers: string[]) => {
  const normalized = headers.map(normalizeHeader);
  const hasIbkr = normalized.includes('clientaccountid')
    && normalized.includes('markprice')
    && normalized.includes('positionvalue');
  const hasDegiro = normalized.includes('producto')
    && normalized.includes('symbol/isin')
    && normalized.includes('valor en eur');
  if (hasIbkr) return 'IBKR';
  if (hasDegiro) return 'DEGIRO';
  return null;
};

export const detectProviderFromText = (text: string) => {
  const { headers } = parseCsv(text);
  return detectProvider(headers);
};

export const parseNumberEU = (value: string) => {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.includes(',')) {
    return Number.parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return Number.parseFloat(cleaned);
};

const normalizeIbkrMarket = (value: string) => {
  const raw = value.trim().toUpperCase();
  const map: Record<string, string> = {
    BM: 'BME',
    AEB: 'AMS',
    SBF: 'EPA',
    LSE: 'LON',
    NYSE: 'NYSE',
    NASDAQ: 'NASDAQ',
    NYSEARCA: 'NYSEARCA',
    ARCA: 'NYSEARCA',
    SEHK: 'HKG',
  };
  return map[raw] ?? raw;
};

export const parseDateYYYYMMDD = (value: string) => {
  if (!value || value.length !== 8) return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return `${year}-${month}-${day}`;
};

const extractCurrency = (value: string) => {
  const match = value.match(/[A-Z]{3}/);
  return match ? match[0] : '';
};

const extractNumber = (value: string) => {
  const cleaned = value.replace(/[A-Z]{3}/g, '').trim();
  return parseNumberEU(cleaned);
};

export const parseIbkrPositionsCsv = (text: string, includeCash: boolean): ImportPreview => {
  const { headers, records } = parseCsv(text);
  const reportDateFallback = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  const ignored: { reason: string; row: Record<string, string> }[] = [];
  const rows: NormalizedRow[] = [];

  records.forEach((record) => {
    const assetClass = record.AssetClass ?? record['AssetClass'] ?? '';
    const symbol = (record.Symbol ?? '').trim();
    const isin = (record.ISIN ?? '').trim();
    const description = (record.Description ?? '').trim();
    const isCash = assetClass.toLowerCase().includes('cash') || description.toLowerCase().includes('cash') || (!symbol && !isin);
    if (isCash && !includeCash) {
      ignored.push({ reason: 'Fila de cash ignorada', row: record });
      return;
    }

    const reportDateRaw = record.ReportDate ?? '';
    const reportDate = parseDateYYYYMMDD(reportDateRaw) ?? reportDateFallback;
    const qty = Number.parseFloat(record.Quantity ?? '0');
    const price = Number.parseFloat(record.MarkPrice ?? '0');
    const value = Number.parseFloat(record.PositionValue ?? '0');
    const avgPrice = Number.parseFloat(record.CostBasisPrice ?? '0');
    const currency = (record.CurrencyPrimary ?? '').trim();
    const market = normalizeIbkrMarket(record.ListingExchange ?? '');
    const rowWarnings: string[] = [];

    if (!symbol && !isin) rowWarnings.push('Sin identificador');
    if (!price) rowWarnings.push('Precio faltante');
    if (!qty) rowWarnings.push('Cantidad cero');

    const resolvedSymbol = symbol || isin || description;
    rows.push({
      broker: 'IBKR',
      symbol: resolvedSymbol,
      isin,
      name: description,
      market,
      currency,
      qty,
      price,
      avgPrice: avgPrice || undefined,
      value,
      valueLocal: value,
      reportDate,
      warnings: rowWarnings,
    });
  });

  if (!rows.length) {
    warnings.push('No se encontraron posiciones para importar.');
  }

  return { provider: 'IBKR', rows, ignored, warnings, reportDate: rows[0]?.reportDate ?? reportDateFallback };
};

export const buildIsinMapFromIbkr = (text: string) => {
  const parsed = parseIbkrPositionsCsv(text, true);
  const map = new Map<string, { symbol: string; market: string; currency: string }>();
  parsed.rows.forEach((row) => {
    if (!row.isin) return;
    map.set(row.isin.toUpperCase(), {
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
    });
  });
  return map;
};

export const parseDegiroPortfolioCsv = (text: string, reportDate: string, includeCash: boolean): ImportPreview => {
  const { records } = parseCsv(text);
  const warnings: string[] = [];
  const ignored: { reason: string; row: Record<string, string> }[] = [];
  const rows: NormalizedRow[] = [];

  records.forEach((record) => {
    const name = (record.Producto ?? '').trim();
    const isin = (record['Symbol/ISIN'] ?? '').trim();
    const isCash = name.toUpperCase().startsWith('CASH') || !isin;
    if (isCash && !includeCash) {
      ignored.push({ reason: 'Fila de cash ignorada', row: record });
      return;
    }

    const qty = parseNumberEU(record.Cantidad ?? '0');
    const price = parseNumberEU(record['Precio de'] ?? '0');
    const valueRaw = record['Valor local'] ?? '';
    const currency = extractCurrency(valueRaw) || 'EUR';
    const valueLocal = valueRaw ? extractNumber(valueRaw) : 0;
    const valueEur = parseNumberEU(record['Valor en EUR'] ?? '0');
    const rowWarnings: string[] = [];

    if (!isin) rowWarnings.push('Sin ISIN');
    if (!price) rowWarnings.push('Precio faltante');
    if (!qty) rowWarnings.push('Cantidad cero');
    if (!valueEur) rowWarnings.push('Valor en EUR faltante');

    rows.push({
      broker: 'DEGIRO',
      symbol: isin || name,
      isin,
      name,
      market: '',
      currency,
      qty,
      price,
      avgPrice: price || undefined,
      value: valueLocal,
      valueLocal,
      valueBase: valueEur || undefined,
      reportDate,
      warnings: rowWarnings,
    });
  });

  if (!rows.length) {
    warnings.push('No se encontraron posiciones para importar.');
  }

  return { provider: 'DEGIRO', rows, ignored, warnings, reportDate };
};
