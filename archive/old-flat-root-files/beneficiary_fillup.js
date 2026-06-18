const stepList = document.getElementById('stepList');
const forms = Array.from(document.querySelectorAll('.step-form'));
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const stepComment = document.getElementById('stepComment');
const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const submitStepBtn = document.getElementById('submitStepBtn');

let currentStep = 1;
let progressData = {};
let autosaveTimer = null;
let backendWarningShown = false;
let backendAvailable = true;
const LOCAL_PROGRESS_KEY = `smartleap_progress_${CURRENT_USER_ID}`;

const SECTOR_OPTIONS = [
    'PWD',
    'Senior Citizen',
    'Indigenous People',
    'Solo Parent',
    'None / No sector'
];
const SECTOR_NONE = 'None / No sector';
const MAX_SECTORS = 2;
const sectorState = {
    selected: [],
    showError: false
};
const sectorUI = {
    search: document.getElementById('sectorSearch'),
    suggestions: document.getElementById('sectorSuggestions'),
    chips: document.getElementById('sectorChips'),
    hidden: document.getElementById('sectorValue'),
    error: document.getElementById('sectorError')
};

const TABLE_CONFIG = {
    materialsTable: ['name', 'qty', 'unit', 'price', 'total'],
    laborTable: ['name', 'position', 'wage'],
    toolsTable: ['name', 'qty', 'price', 'life', 'depreciation'],
    expensesTable: ['type', 'frequency', 'amount'],
    salesTable: ['item', 'qty', 'price', 'gross'],
    utilTable: ['item', 'qty', 'schedule']
};

function init() {
    bindStepList();
    bindFooter();
    bindTableButtons();
    setupSectorField();
    loadProgress();
    setupAutosave();
}

function bindStepList() {
    stepList?.querySelectorAll('li').forEach((item) => {
        item.addEventListener('click', () => {
            const step = Number(item.dataset.step);
            if (step) switchStep(step);
        });
    });
}

function bindFooter() {
    backBtn?.addEventListener('click', () => {
        if (currentStep > 1) switchStep(currentStep - 1);
    });
    nextBtn?.addEventListener('click', () => {
        if (currentStep < 6) switchStep(currentStep + 1);
    });
    saveDraftBtn?.addEventListener('click', () => saveCurrentStep('In progress'));
    submitStepBtn?.addEventListener('click', () => submitCurrentStep());
}

function readLocalProgress() {
    try {
        const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
        if (!raw) return { steps: [] };
        const parsed = JSON.parse(raw);
        return parsed && Array.isArray(parsed.steps) ? parsed : { steps: [] };
    } catch (err) {
        return { steps: [] };
    }
}

function writeLocalProgress() {
    try {
        localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(progressData));
    } catch (err) {
        // Ignore storage quota/browser storage errors.
    }
}

function upsertStep(step, status, data, totals) {
    if (!progressData || !Array.isArray(progressData.steps)) {
        progressData = { steps: [] };
    }
    const idx = progressData.steps.findIndex((item) => Number(item.step) === Number(step));
    const next = {
        ...(idx >= 0 ? progressData.steps[idx] : {}),
        step,
        status,
        data,
        totals
    };
    if (idx >= 0) progressData.steps[idx] = next;
    else progressData.steps.push(next);
    writeLocalProgress();
}

async function requestJson(url, options) {
    if (!backendAvailable) {
        throw new Error('Backend unavailable');
    }
    const response = await fetch(url, options);
    const bodyText = await response.text();
    let payload = null;
    if (bodyText) {
        try {
            payload = JSON.parse(bodyText);
        } catch (err) {
            throw new Error(`Invalid JSON from ${url}`);
        }
    }
    if (!response.ok) {
        if (response.status === 503 || response.status === 404 || response.status === 500) {
            backendAvailable = false;
        }
        const message = payload?.error || `Request failed (${response.status})`;
        throw new Error(message);
    }
    return payload || {};
}

function handleBackendIssue(context, err) {
    backendAvailable = false;
    if (backendWarningShown) return;
    backendWarningShown = true;
    console.warn(`[${context}]`, err?.message || err);
}

function bindTableButtons() {
    document.querySelectorAll('[data-action="add-row"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tableId = btn.dataset.table;
            addRow(tableId);
        });
    });
}

function switchStep(step) {
    currentStep = step;
    forms.forEach((form) => {
        form.hidden = Number(form.dataset.step) !== step;
    });
    updateProgressUI();
    loadFormData(step);
}

function updateProgressUI() {
    progressText.textContent = `Step ${currentStep} of 6`;
    progressFill.style.width = `${(currentStep / 6) * 100}%`;
    if (progressData.steps) {
        stepList.querySelectorAll('li').forEach((li) => {
            const step = Number(li.dataset.step);
            const data = progressData.steps.find((s) => s.step === step);
            const status = data?.status || 'Not started';
            li.querySelector('.step-status').textContent = status;
        });
    }
}

function collectFormData(step) {
    const form = forms.find((f) => Number(f.dataset.step) === step);
    if (!form) return {};

    const data = {};
    const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
    inputs.forEach((input) => {
        if (input.type === 'checkbox') {
            if (!data[input.name]) data[input.name] = [];
            if (input.checked) data[input.name].push(input.value);
            return;
        }
        data[input.name] = input.value;
    });

    if (step === 1 && sectorUI.search) {
        data.sector = [...sectorState.selected];
    }

    if (step >= 2) {
        const tableId = step === 2 ? 'materialsTable'
            : step === 3 ? 'laborTable'
                : step === 4 ? 'toolsTable'
                    : step === 5 ? 'expensesTable'
                        : step === 6 ? 'salesTable' : null;
        if (tableId) {
            data.rows = collectTableRows(tableId);
        }
        if (step === 6) {
            data.utilRows = collectTableRows('utilTable');
        }
    }

    return data;
}

function collectTableRows(tableId) {
    const keys = TABLE_CONFIG[tableId];
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody || !keys) return [];
    const rows = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
        const row = {};
        keys.forEach((key) => {
            const input = tr.querySelector(`[data-key="${key}"]`);
            row[key] = input ? input.value : '';
        });
        rows.push(row);
    });
    return rows;
}

function loadFormData(step) {
    const data = progressData.steps?.find((s) => s.step === step)?.data;
    const form = forms.find((f) => Number(f.dataset.step) === step);
    if (!form) return;
    form.reset();
    stepComment.textContent = '';
    stepComment.classList.remove('is-visible');
    resetSectorField();

    const comment = progressData.steps?.find((s) => s.step === step)?.admin_comment;
    if (comment) {
        stepComment.textContent = `PDO note: ${comment}`;
        stepComment.classList.add('is-visible');
    }

    if (!data) {
        seedTables(step);
        computeTotals();
        return;
    }

    Object.entries(data).forEach(([key, value]) => {
        const input = form.querySelector(`[name="${key}"]`);
        if (!input) return;
        if (input.type === 'checkbox' && Array.isArray(value)) {
            value.forEach((val) => {
                const box = form.querySelector(`input[name="${key}"][value="${val}"]`);
                if (box) box.checked = true;
            });
            return;
        }
        input.value = value;
    });

    if (step === 1 && data?.sector) {
        setSelectedSectors(data.sector);
    }

    if (data.rows && step >= 2) {
        const tableId = step === 2 ? 'materialsTable'
            : step === 3 ? 'laborTable'
                : step === 4 ? 'toolsTable'
                    : step === 5 ? 'expensesTable'
                        : step === 6 ? 'salesTable' : null;
        if (tableId) {
            hydrateTable(tableId, data.rows);
        }
    }
    if (data.utilRows && step === 6) {
        hydrateTable('utilTable', data.utilRows);
    }

    computeTotals();
}

function seedTables(step) {
    if (step === 2) addRow('materialsTable');
    if (step === 3) addRow('laborTable');
    if (step === 4) addRow('toolsTable');
    if (step === 5) addRow('expensesTable');
    if (step === 6) {
        addRow('salesTable');
        addRow('utilTable');
    }
}

function hydrateTable(tableId, rows) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(() => addRow(tableId));
    const trList = tbody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const tr = trList[index];
        if (!tr) return;
        Object.entries(row).forEach(([key, value]) => {
            const input = tr.querySelector(`[data-key="${key}"]`);
            if (input) input.value = value;
        });
    });
}

function addRow(tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    const keys = TABLE_CONFIG[tableId];
    if (!tbody || !keys) return;
    const tr = document.createElement('tr');
    tr.innerHTML = keys.map((key) => {
        const readOnly = ['total', 'depreciation', 'gross'].includes(key) ? 'readonly' : '';
        return `<td><input type="text" data-key="${key}" ${readOnly}></td>`;
    }).join('') + '<td><button type="button" class="btn-link remove-row">Remove</button></td>';
    tr.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', computeTotals);
    });
    tr.querySelector('.remove-row')?.addEventListener('click', () => {
        tr.remove();
        computeTotals();
    });
    tbody.appendChild(tr);
}

function computeTotals() {
    const materialTotal = computeMaterialTotals();
    const laborTotal = computeLaborTotals();
    const toolsTotal = computeToolTotals();
    const expensesTotal = computeExpensesTotals();
    const salesTotals = computeSalesTotals();

    document.getElementById('materialsTotal').textContent = materialTotal.toFixed(2);
    document.getElementById('laborTotal').textContent = laborTotal.toFixed(2);
    document.getElementById('toolsTotal').textContent = toolsTotal.toFixed(2);
    document.getElementById('expensesTotal').textContent = expensesTotal.toFixed(2);
    document.getElementById('grossSales').textContent = salesTotals.grossSales.toFixed(2);
    document.getElementById('grossProfit').textContent = salesTotals.grossProfit.toFixed(2);
    document.getElementById('netProfit').textContent = salesTotals.netProfit.toFixed(2);
}

function computeMaterialTotals() {
    const rows = document.querySelectorAll('#materialsTable tbody tr');
    let total = 0;
    rows.forEach((row) => {
        const qty = Number(row.querySelector('[data-key="qty"]')?.value || 0);
        const price = Number(row.querySelector('[data-key="price"]')?.value || 0);
        const sum = qty * price;
        const totalField = row.querySelector('[data-key="total"]');
        if (totalField) totalField.value = sum.toFixed(2);
        total += sum;
    });
    return total;
}

function computeLaborTotals() {
    const rows = document.querySelectorAll('#laborTable tbody tr');
    let total = 0;
    rows.forEach((row) => {
        total += Number(row.querySelector('[data-key="wage"]')?.value || 0);
    });
    return total;
}

function computeToolTotals() {
    const rows = document.querySelectorAll('#toolsTable tbody tr');
    let total = 0;
    rows.forEach((row) => {
        const qty = Number(row.querySelector('[data-key="qty"]')?.value || 0);
        const price = Number(row.querySelector('[data-key="price"]')?.value || 0);
        const lifeText = row.querySelector('[data-key="life"]')?.value || '';
        const life = parseLifeToMonths(lifeText);
        const depreciation = life > 0 ? (qty * price) / life : 0;
        const field = row.querySelector('[data-key="depreciation"]');
        if (field) field.value = depreciation.toFixed(2);
        total += depreciation;
    });
    return total;
}

function parseLifeToMonths(value) {
    const trimmed = String(value || '').toLowerCase();
    const number = parseFloat(trimmed);
    if (!number) return 0;
    if (trimmed.includes('year')) return number * 12;
    if (trimmed.includes('day')) return number / 30;
    return number;
}

function computeExpensesTotals() {
    const rows = document.querySelectorAll('#expensesTable tbody tr');
    let total = 0;
    rows.forEach((row) => {
        total += Number(row.querySelector('[data-key="amount"]')?.value || 0);
    });
    return total;
}

function computeSalesTotals() {
    const rows = document.querySelectorAll('#salesTable tbody tr');
    let grossSales = 0;
    rows.forEach((row) => {
        const qty = Number(row.querySelector('[data-key="qty"]')?.value || 0);
        const price = Number(row.querySelector('[data-key="price"]')?.value || 0);
        const gross = qty * price;
        const field = row.querySelector('[data-key="gross"]');
        if (field) field.value = gross.toFixed(2);
        grossSales += gross;
    });
    const materials = computeMaterialTotals();
    const labor = computeLaborTotals();
    const tools = computeToolTotals();
    const expenses = computeExpensesTotals();
    const grossProfit = grossSales - materials;
    const netProfit = grossProfit - labor - tools - expenses;
    return { grossSales, grossProfit, netProfit };
}

function saveCurrentStep(status) {
    const stepData = collectFormData(currentStep);
    const totals = buildTotals();
    upsertStep(currentStep, status, stepData, totals);

    if (!backendAvailable) {
        return Promise.resolve({ ok: false, offline: true });
    }

    const payload = {
        user_id: CURRENT_USER_ID,
        step: currentStep,
        status,
        full_name: CURRENT_USER_NAME,
        email: CURRENT_USER_EMAIL,
        data: stepData,
        totals
    };
    return requestJson('save_step.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch((err) => {
        handleBackendIssue('save_step', err);
        return { ok: false, offline: true };
    });
}

function submitCurrentStep() {
    if (currentStep === 1 && !validateSector({ showError: true })) {
        return;
    }
    const stepData = collectFormData(currentStep);
    const totals = buildTotals();
    upsertStep(currentStep, 'Completed', stepData, totals);

    if (!backendAvailable) {
        if (currentStep < 6) switchStep(currentStep + 1);
        return;
    }

    const payload = {
        user_id: CURRENT_USER_ID,
        step: currentStep,
        full_name: CURRENT_USER_NAME,
        email: CURRENT_USER_EMAIL,
        data: stepData,
        totals
    };
    requestJson('submit_step.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(() => {
        loadProgress();
        if (currentStep < 6) switchStep(currentStep + 1);
    }).catch((err) => {
        handleBackendIssue('submit_step', err);
        if (currentStep < 6) switchStep(currentStep + 1);
    });
}

function buildTotals() {
    return {
        grandTotal: Number(document.getElementById('materialsTotal')?.textContent || 0),
        totalLabor: Number(document.getElementById('laborTotal')?.textContent || 0),
        totalDepreciation: Number(document.getElementById('toolsTotal')?.textContent || 0),
        totalExpense: Number(document.getElementById('expensesTotal')?.textContent || 0),
        grossSales: Number(document.getElementById('grossSales')?.textContent || 0),
        grossProfit: Number(document.getElementById('grossProfit')?.textContent || 0),
        netProfit: Number(document.getElementById('netProfit')?.textContent || 0)
    };
}

function setupAutosave() {
    autosaveTimer = setInterval(() => {
        saveCurrentStep('In progress');
    }, 20000);
    window.addEventListener('beforeunload', () => {
        saveCurrentStep('In progress');
    });
}

function loadProgress() {
    if (!backendAvailable) {
        progressData = readLocalProgress();
        updateProgressUI();
        loadFormData(currentStep);
        return;
    }

    requestJson(`get_progress.php?user_id=${CURRENT_USER_ID}`)
        .then((data) => {
            progressData = data;
            writeLocalProgress();
            updateProgressUI();
            loadFormData(currentStep);
        })
        .catch((err) => {
            handleBackendIssue('get_progress', err);
            progressData = readLocalProgress();
            updateProgressUI();
            loadFormData(currentStep);
        });
}

function setupSectorField() {
    if (!sectorUI.search || !sectorUI.suggestions || !sectorUI.chips || !sectorUI.hidden) return;

    sectorUI.search.addEventListener('input', () => {
        updateSectorSuggestions(true);
    });

    sectorUI.search.addEventListener('focus', () => {
        updateSectorSuggestions(true);
    });

    sectorUI.search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const first = sectorUI.suggestions.querySelector('.sector-option');
            if (first) addSector(first.dataset.value);
        }
    });

    sectorUI.search.addEventListener('blur', () => {
        setTimeout(() => {
            validateSector({ showError: true });
            closeSectorSuggestions();
        }, 120);
    });
}

function updateSectorSuggestions(forceOpen = false) {
    if (!sectorUI.search || !sectorUI.suggestions) return;
    const query = sectorUI.search.value.trim().toLowerCase();
    const options = SECTOR_OPTIONS.filter((option) => {
        if (sectorState.selected.includes(option)) return false;
        if (!query) return forceOpen;
        return option.toLowerCase().includes(query);
    });

    sectorUI.suggestions.innerHTML = '';
    if (!options.length) {
        closeSectorSuggestions();
        return;
    }

    options.forEach((option) => {
        const div = document.createElement('div');
        div.className = 'sector-option';
        div.textContent = option;
        div.dataset.value = option;
        div.addEventListener('click', () => addSector(option));
        sectorUI.suggestions.appendChild(div);
    });
    sectorUI.suggestions.classList.add('is-open');
}

function closeSectorSuggestions() {
    sectorUI.suggestions?.classList.remove('is-open');
}

function addSector(value) {
    if (!value || sectorState.selected.includes(value)) return;

    if (value === SECTOR_NONE) {
        sectorState.selected = [SECTOR_NONE];
    } else {
        sectorState.selected = sectorState.selected.filter((item) => item !== SECTOR_NONE);
        if (MAX_SECTORS && sectorState.selected.length >= MAX_SECTORS) {
            sectorState.showError = true;
            setSectorError(`You can select up to ${MAX_SECTORS} sectors.`);
            return;
        }
        sectorState.selected = [...sectorState.selected, value];
    }

    sectorState.showError = false;
    setSectorError('');
    sectorUI.search.value = '';
    renderSectorChips();
    updateSectorValue();
    updateSectorSuggestions(false);
}

function removeSector(value) {
    sectorState.selected = sectorState.selected.filter((item) => item !== value);
    renderSectorChips();
    updateSectorValue();
    validateSector({ showError: sectorState.showError });
}

function renderSectorChips() {
    if (!sectorUI.chips) return;
    sectorUI.chips.innerHTML = '';
    sectorState.selected.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'sector-chip';
        chip.textContent = value;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', `Remove ${value}`);
        btn.innerHTML = '&times;';
        btn.addEventListener('click', () => removeSector(value));
        chip.appendChild(btn);
        sectorUI.chips.appendChild(chip);
    });
}

function updateSectorValue() {
    if (!sectorUI.hidden) return;
    sectorUI.hidden.value = sectorState.selected.join(', ');
}

function setSelectedSectors(values) {
    let list = Array.isArray(values) ? values : String(values || '').split(',');
    list = list.map((item) => item.trim()).filter(Boolean);
    const unique = [];
    list.forEach((item) => {
        if (!unique.includes(item)) unique.push(item);
    });
    if (unique.includes(SECTOR_NONE)) {
        sectorState.selected = [SECTOR_NONE];
    } else if (MAX_SECTORS) {
        sectorState.selected = unique.slice(0, MAX_SECTORS);
    } else {
        sectorState.selected = unique;
    }
    sectorState.showError = false;
    sectorUI.search.value = '';
    renderSectorChips();
    updateSectorValue();
    setSectorError('');
}

function resetSectorField() {
    if (!sectorUI.search) return;
    sectorState.selected = [];
    sectorState.showError = false;
    sectorUI.search.value = '';
    renderSectorChips();
    updateSectorValue();
    setSectorError('');
    closeSectorSuggestions();
}

function validateSector({ showError }) {
    if (!sectorUI.search) return true;
    if (showError) sectorState.showError = true;
    if (!sectorState.showError) return sectorState.selected.length > 0;
    if (sectorState.selected.length === 0) {
        setSectorError('Please select at least one sector.');
        return false;
    }
    if (MAX_SECTORS && sectorState.selected.length > MAX_SECTORS) {
        setSectorError(`You can select up to ${MAX_SECTORS} sectors.`);
        return false;
    }
    setSectorError('');
    return true;
}

function setSectorError(message) {
    if (!sectorUI.error) return;
    sectorUI.error.textContent = sectorState.showError ? message : '';
}

init();
