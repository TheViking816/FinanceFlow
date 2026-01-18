
export interface Holding {
  id: string;
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
