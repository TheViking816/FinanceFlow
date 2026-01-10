create extension if not exists "pgcrypto";

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency text default 'EUR',
  created_at timestamptz default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text check (type in ('bank', 'savings', 'cash')),
  currency text default 'EUR',
  institution text,
  opening_balance numeric default 0,
  created_at timestamptz default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kind text check (kind in ('income', 'expense')),
  icon text,
  created_at timestamptz default now(),
  unique (user_id, kind, name)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  kind text check (kind in ('income', 'expense', 'transfer')),
  amount numeric not null check (amount >= 0),
  currency text default 'EUR',
  category_id uuid references categories(id),
  description text,
  occurred_at date not null,
  transfer_account_id uuid references accounts(id),
  created_at timestamptz default now()
);

create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (user_id, name)
);

create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  broker_id uuid references brokers(id) on delete set null,
  ticker text not null,
  name text,
  market text,
  currency text default 'USD',
  quantity numeric not null default 0,
  avg_price numeric not null default 0,
  fees_total numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, broker_id, ticker, market)
);

create table if not exists security_prices (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text,
  currency text,
  price_date date not null,
  close_price numeric not null,
  created_at timestamptz default now(),
  unique (ticker, market, price_date)
);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  snap_date date not null,
  total_value_base numeric not null,
  breakdown_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, snap_date)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  due_date date,
  created_at timestamptz default now()
);

create index if not exists accounts_user_id_idx on accounts(user_id);
create index if not exists categories_user_id_idx on categories(user_id);
create index if not exists transactions_user_id_idx on transactions(user_id);
create index if not exists transactions_account_id_idx on transactions(account_id);
create index if not exists transactions_transfer_account_id_idx on transactions(transfer_account_id);
create index if not exists brokers_user_id_idx on brokers(user_id);
create index if not exists holdings_user_id_idx on holdings(user_id);
create index if not exists portfolio_snapshots_user_id_idx on portfolio_snapshots(user_id);
create index if not exists goals_user_id_idx on goals(user_id);

alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table brokers enable row level security;
alter table holdings enable row level security;
alter table portfolio_snapshots enable row level security;
alter table goals enable row level security;
alter table security_prices enable row level security;

drop policy if exists "Profiles are user owned" on profiles;
create policy "Profiles are user owned" on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Accounts are user owned" on accounts;
create policy "Accounts are user owned" on accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Categories are user owned" on categories;
create policy "Categories are user owned" on categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Transactions are user owned" on transactions;
create policy "Transactions are user owned" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Brokers are user owned" on brokers;
create policy "Brokers are user owned" on brokers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Holdings are user owned" on holdings;
create policy "Holdings are user owned" on holdings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Snapshots are user owned" on portfolio_snapshots;
create policy "Snapshots are user owned" on portfolio_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Goals are user owned" on goals;
create policy "Goals are user owned" on goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Public read prices" on security_prices;
create policy "Public read prices" on security_prices
  for select using (true);

drop policy if exists "Authenticated insert prices" on security_prices;
create policy "Authenticated insert prices" on security_prices
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated update prices" on security_prices;
create policy "Authenticated update prices" on security_prices
  for update using (auth.role() = 'authenticated');

drop policy if exists "Authenticated delete prices" on security_prices;
create policy "Authenticated delete prices" on security_prices
  for delete using (auth.role() = 'authenticated');
