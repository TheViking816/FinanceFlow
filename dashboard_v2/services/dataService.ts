
import { MarketData, Holding, PortfolioSummary } from '../types';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?gid=1414892855&single=true&output=csv';

function parseSpanishNum(val: string | number | null): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;

  let clean = val.toString().replace(/"/g, '').trim();
  if (clean === '' || clean === '#N/A' || clean === '#DIV/0!') return 0;

  clean = clean.replace('%', '').replace('€', '').replace('$', '');

  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function cleanTicker(ticker: string): string {
  if (!ticker) return '';
  return ticker.includes(':') ? ticker.split(':')[1] : ticker;
}

export async function fetchAllData(): Promise<{ marketData: MarketData, holdings: Holding[], summary: PortfolioSummary }> {
  const response = await fetch(`${SHEET_CSV_URL}&t=${Date.now()}`);
  const csvText = await response.text();
  const lines = csvText.split('\n');

  const parseLine = (text: string) => {
    const result: string[] = [];
    let curValue = '';
    let withinQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') withinQuotes = !withinQuotes;
      else if (char === ',' && !withinQuotes) {
        result.push(curValue.trim());
        curValue = '';
      } else {
        curValue += char;
      }
    }
    result.push(curValue.trim());
    return result;
  };

  const idx = {
    ticker: 0,
    nombre: 1,
    currency: 2,
    price: 3,
    changePct: 5,
    fx: 6,
    low52w: 7,
    high52w: 8,
    yield: 9,
    shares: 14,
    buyInLocal: 15,
    annualIncome: 16,
    per: 18
  };

  const marketData: MarketData = {};
  const holdings: Holding[] = [];
  const summaryYoc = (() => {
    const rowIndex = 102; // R103 in the sheet (1-based row number).
    const colIndex = 17; // Column R (0-based index).
    if (lines.length <= rowIndex) return 0;
    const cols = parseLine(lines[rowIndex] || '');
    return parseSpanishNum(cols[colIndex] || 0);
  })();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(',,,,')) continue;

    const cols = parseLine(line);
    const ticker = cols[idx.ticker];
    if (!ticker) continue;

    const price = parseSpanishNum(cols[idx.price]);
    const shares = parseSpanishNum(cols[idx.shares]);
    const fx = parseSpanishNum(cols[idx.fx]) || 1;
    const annualIncome = parseSpanishNum(cols[idx.annualIncome]);
    const dailyChange = parseSpanishNum(cols[idx.changePct]);
    const costBasisLocal = parseSpanishNum(cols[idx.buyInLocal]);
    const low52w = parseSpanishNum(cols[idx.low52w]);
    const high52w = parseSpanishNum(cols[idx.high52w]);
    const perVal = cols[idx.per];

    marketData[ticker] = {
      ticker,
      name: cols[idx.nombre] || ticker,
      currency: cols[idx.currency] || 'EUR',
      price: price,
      fx: fx,
      shares: shares,
      costLocal: costBasisLocal,
      income: annualIncome,
      per: (perVal === '#N/A' || !perVal) ? 'N/A' : perVal.replace(',', '.'),
      yieldPct: parseSpanishNum(cols[idx.yield]),
      dailyChange: dailyChange,
      low52w,
      high52w
    };

    if (shares > 0) {
      const valueInEUR = shares * price * fx;
      const costBasisEUR = shares * costBasisLocal * fx;

      holdings.push({
        id: `h-${i}`,
        ticker: cleanTicker(ticker),
        rawTicker: ticker,
        name: cols[idx.nombre] || ticker,
        shares: shares,
        price: price,
        costPerShare: costBasisLocal,
        currency: cols[idx.currency] || 'EUR',
        valueInEUR,
        gainLoss: costBasisEUR > 0 ? ((valueInEUR - costBasisEUR) / costBasisEUR) * 100 : 0,
        yieldPct: parseSpanishNum(cols[idx.yield]),
        annualIncomeEUR: annualIncome,
        per: (perVal === '#N/A' || !perVal) ? 'N/A' : perVal.replace(',', '.'),
        yoc: costBasisEUR > 0 ? (annualIncome / costBasisEUR) * 100 : 0,
        weight: 0,
        dailyChange: dailyChange,
        low52w,
        high52w
      });
    }
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.valueInEUR, 0);
  const totalAnnualIncome = holdings.reduce((sum, h) => sum + h.annualIncomeEUR, 0);

  holdings.forEach(h => {
    h.weight = totalValue > 0 ? (h.valueInEUR / totalValue) * 100 : 0;
  });

  return {
    marketData,
    holdings,
    summary: {
      totalValue,
      totalAnnualIncome,
      monthlyIncome: totalAnnualIncome / 12,
      dividendYield: totalValue > 0 ? (totalAnnualIncome / totalValue) * 100 : 0,
      yoc: summaryYoc,
      holdingsCount: holdings.length,
      dailyChange: holdings.reduce((sum, h) => sum + (h.weight * h.dailyChange), 0) / 100
    }
  };
}
