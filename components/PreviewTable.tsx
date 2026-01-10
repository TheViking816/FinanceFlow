import React from 'react';
import type { NormalizedRow } from '../lib/importers';
import { formatCurrency, formatDate } from '../lib/format';

type PreviewTableProps = {
  rows: NormalizedRow[];
  baseCurrency: string;
};

const PreviewTable: React.FC<PreviewTableProps> = ({ rows, baseCurrency }) => {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 uppercase tracking-widest text-[10px]">
          <tr>
            <th className="px-3 py-2 text-left">Broker</th>
            <th className="px-3 py-2 text-left">Ticker/ISIN</th>
            <th className="px-3 py-2 text-left">Nombre</th>
            <th className="px-3 py-2 text-left">Mercado</th>
            <th className="px-3 py-2 text-left">Moneda</th>
            <th className="px-3 py-2 text-right">Cant.</th>
            <th className="px-3 py-2 text-right">Precio</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Warnings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.symbol}-${index}`} className="border-t border-slate-100 dark:border-slate-700">
              <td className="px-3 py-2 font-semibold">{row.broker}</td>
              <td className="px-3 py-2">{row.symbol}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.market || '-'}</td>
              <td className="px-3 py-2">{row.currency || baseCurrency}</td>
              <td className="px-3 py-2 text-right">{row.qty}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.price, row.currency || baseCurrency)}</td>
              <td className="px-3 py-2 text-right">
                <div>{formatCurrency(row.value, row.currency || baseCurrency)}</div>
                {row.valueBase !== undefined && (
                  <div className="text-[10px] text-slate-400">
                    {formatCurrency(row.valueBase, baseCurrency)}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">{formatDate(row.reportDate)}</td>
              <td className="px-3 py-2 text-amber-600">{row.warnings.length ? row.warnings.join(', ') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PreviewTable;
