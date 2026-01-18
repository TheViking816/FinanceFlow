
export interface Holding {
  id: string;
  sourceId?: string;
  ticker: string; 
  rawTicker: string; 
  name: string;
  shares: number;
  costPerShare: number;
  currency: string;
  price: number;
  valueInEUR: number;
  gainLoss: number;
  yieldPct: number;
  annualIncomeEUR: number;
  per: string | number;
  yoc: number;
  weight: number;
  dailyChange: number;
  low52w: number;
  high52w: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalAnnualIncome: number;
  monthlyIncome: number;
  dividendYield: number;
  yoc: number;
  holdingsCount: number;
  dailyChange: number;
}

export interface HoldingUser {
  id: string;
  user_id: string;
  ticker: string;
  quantity: number;
  avg_price: number;
  currency: string;
  created_at: string;
}

export interface HoldingPending {
  id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  currency: string | null;
  price: number | null;
  yield_pct: number | null;
  low52w: number | null;
  high52w: number | null;
  daily_change: number | null;
  created_at: string;
}

export interface MarketData {
  [ticker: string]: {
    ticker: string;
    name: string;
    currency: string;
    price: number;
    fx: number;
    shares: number;
    costLocal: number;
    income: number;
    per: string | number;
    yieldPct: number;
    dailyChange?: number;
    low52w?: number;
    high52w?: number;
  };
}
