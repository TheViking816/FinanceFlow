const escapeCsv = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const buildCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header] as string)).join(',')),
  ];
  return lines.join('\n');
};

export const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  const csv = buildCsv(rows);
  if (!csv) {
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
