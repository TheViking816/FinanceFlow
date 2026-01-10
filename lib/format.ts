export const formatCurrency = (value: number, currency: string) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatNumber = (value: number) => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatDate = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatShortDate = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
  }).format(date);
};

export const formatMonthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00`);
  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    year: '2-digit',
  }).format(date);
};
