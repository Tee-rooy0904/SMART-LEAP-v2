function updateFilterChips(scope, onChange) {
    const container = document.querySelector(`[data-filter-scope="${scope}"]`);
    const state = filterState[scope];
    if (!container || !state) return;
    const chipHost = container.querySelector('[data-filter-chips]');
    if (!chipHost) return;
    const chips = Array.from(state.sectors).map((key) => {
        const label = SECTOR_FILTERS.find((item) => item.key === key)?.label || key;
        return `<button type="button" class="filter-chip" data-filter="${key}">${label}<span aria-hidden="true">×</span></button>`;
    });
    chipHost.innerHTML = chips.join('') || '<span class="filter-chip filter-chip--empty">No filters</span>';
    chipHost.querySelectorAll('.filter-chip[data-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            state.sectors.delete(chip.dataset.filter);
            updateFilterChips(scope, onChange);
            container.querySelectorAll('.filter-pill').forEach((pill) => {
                pill.classList.toggle('is-active', state.sectors.has(pill.dataset.filter));
            });
            onChange?.();
        });
    });
}
