(function () {
  const peso = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  });

  const number = new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 0,
  });

  const formatCurrency = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '?0';
    return peso.format(value);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '0';
    return number.format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '0%';
    return `${Math.round(value)}%`;
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatMonth = (value) => {
    if (!value) return '--';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short' });
  };

  window.App = window.App || {};
  window.App.format = { formatCurrency, formatNumber, formatPercent, formatDate, formatMonth };
})();
