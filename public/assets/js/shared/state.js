(function () {
  const defaultFilters = {
    applications: {
      status: 'All',
      barangay: 'All',
      search: '',
      from: '',
      to: '',
    },
    repayments: {
      search: '',
      barangay: 'All',
      status: 'All',
    },
    training: {
      search: '',
      month: '',
    },
    reports: {
      from: '',
      to: '',
      sectors: [],
      barangay: 'All',
      search: '',
    },
  };

  const state = {
    data: {},
    activeSection: 'dashboard',
    filters: JSON.parse(JSON.stringify(defaultFilters)),
    reports: {
      activeTab: 'repayments',
      tableSort: { key: 'name', dir: 'asc' },
      page: 1,
      pageSize: 8,
    },
    repayments: {
      activeDetailId: null,
    },
    dashboard: {
      activeQueueTab: 'pending',
    },
    applications: {
      activeId: null,
    },
    training: {
      activeSessionId: null,
    },
  };

  const resetFilters = (section) => {
    if (!state.filters[section]) return;
    state.filters[section] = JSON.parse(JSON.stringify(defaultFilters[section]));
  };

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const inDateRange = (dateValue, fromValue, toValue) => {
    const date = parseDate(dateValue);
    if (!date) return true;
    const from = parseDate(fromValue);
    const to = parseDate(toValue);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  };

  const textMatch = (value, query) => {
    if (!query) return true;
    if (!value) return false;
    return String(value).toLowerCase().includes(String(query).toLowerCase());
  };

  const setData = (data) => {
    state.data = data || {};
  };

  window.App = window.App || {};
  window.App.state = { state, resetFilters, inDateRange, textMatch, setData };
})();
