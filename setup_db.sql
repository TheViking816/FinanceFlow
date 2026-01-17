-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- Brokers Table
create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (user_id, name)
);

-- RLS for Brokers
alter table brokers enable row level security;

-- Drop existing policies to prevent conflicts (fix for ERROR 42710)
drop policy if exists "Brokers are user owned" on brokers;

create policy "Brokers are user owned" on brokers 
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Holdings Table
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

-- RLS for Holdings
alter table holdings enable row level security;

-- Drop existing policies to prevent conflicts
drop policy if exists "Holdings are user owned" on holdings;

create policy "Holdings are user owned" on holdings 
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
