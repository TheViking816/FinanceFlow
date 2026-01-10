export type Profile = {
  user_id: string;
  display_name: string | null;
  base_currency: string;
  created_at: string;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: 'bank' | 'savings' | 'cash';
  currency: string;
  institution: string | null;
  opening_balance: number;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  kind: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  category_id: string | null;
  description: string | null;
  occurred_at: string;
  transfer_account_id: string | null;
  created_at: string;
};

export type Broker = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type Holding = {
  id: string;
  user_id: string;
  broker_id: string | null;
  ticker: string;
  name: string | null;
  market: string | null;
  currency: string;
  quantity: number;
  avg_price: number;
  fees_total: number;
  created_at: string;
};

export type SecurityPrice = {
  id: string;
  ticker: string;
  market: string | null;
  currency: string | null;
  price_date: string;
  close_price: number;
  created_at: string;
};

export type PortfolioSnapshot = {
  id: string;
  user_id: string;
  snap_date: string;
  total_value_base: number;
  breakdown_json: Record<string, number>;
  created_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  due_date: string | null;
  created_at: string;
};
