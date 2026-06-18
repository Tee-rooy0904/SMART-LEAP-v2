function initFilterBar(scope, onChange) {
    const container = document.querySelector(`[data-filter-scope="${scope}"]`);
    const state = filterState[scope];
    if (!container || !state) return;

    const pills = Array.from(container.querySelectorAll('.filter-pill'));
    pills.forEach((pill) => {
        const key = pill.dataset.filter;
        pill.classList.toggle('is-active', state.sectors.has(key));
        pill.addEventListener('click', () => {
            if (state.sectors.has(key)) {
                state.sectors.delete(key);
            } else {
                state.sectors.add(key);
            }
            updateFilterChips(scope, onChange);
            pills.forEach((btn) => btn.classList.toggle('is-active', state.sectors.has(btn.dataset.filter)));
            onChange?.();
        });
    });

    const searchInput = container.querySelector('[data-filter-search]');
    if (searchInput) {
        searchInput.value = state.search || '';
        searchInput.addEventListener('input', () => {
            state.search = searchInput.value.trim();
            updateFilterChips(scope, onChange);
            onChange?.();
        });
    }

    container.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
        state.sectors.clear();
        state.search = '';
        pills.forEach((btn) => btn.classList.remove('is-active'));
        if (searchInput) searchInput.value = '';
        updateFilterChips(scope, onChange);
        onChange?.();
    });

    updateFilterChips(scope, onChange);
}
