import type { Account, Holding, Transaction, SecurityPrice } from '../types';
import { getPriceKey } from '../data/prices';

export const calculateAccountBalances = (accounts: Account[], transactions: Transaction[]) => {
  const balances = new Map<string, number>();
  accounts.forEach((account) => {
    balances.set(account.id, Number(account.opening_balance ?? 0));
  });

  transactions.forEach((transaction) => {
    if (transaction.kind === 'transfer') {
      if (transaction.account_id && balances.has(transaction.account_id)) {
        balances.set(
          transaction.account_id,
          (balances.get(transaction.account_id) ?? 0) - Number(transaction.amount),
        );
      }
      if (transaction.transfer_account_id && balances.has(transaction.transfer_account_id)) {
        balances.set(
          transaction.transfer_account_id,
          (balances.get(transaction.transfer_account_id) ?? 0) + Number(transaction.amount),
        );
      }
      return;
    }

    if (balances.has(transaction.account_id)) {
      const delta = transaction.kind === 'income' ? Number(transaction.amount) : -Number(transaction.amount);
      balances.set(transaction.account_id, (balances.get(transaction.account_id) ?? 0) + delta);
    }
  });

  return balances;
};

export const calculateHoldingsValue = (holdings: Holding[], latestPrices: Map<string, SecurityPrice>) => {
  return holdings.reduce((total, holding) => {
    const key = getPriceKey(holding.ticker, holding.market ?? null);
    const latest = latestPrices.get(key);
    const price = latest ? Number(latest.close_price) : 0;
    return total + Number(holding.quantity) * price;
  }, 0);
};

export const calculateHoldingsBreakdown = (holdings: Holding[], latestPrices: Map<string, SecurityPrice>) => {
  return holdings.reduce((acc, holding) => {
    const key = getPriceKey(holding.ticker, holding.market ?? null);
    const latest = latestPrices.get(key);
    const price = latest ? Number(latest.close_price) : 0;
    const value = Number(holding.quantity) * price;
    acc.total += value;
    return acc;
  }, { total: 0 });
};
