(function () {
  // Shared repayment math used by both Admin and PDO review workspaces.
  const MONTHLY_EXPECTED = 625;
  const TOTAL_MONTHS = 24;
  const TOTAL_EXPECTED = MONTHLY_EXPECTED * TOTAL_MONTHS;

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function asDate(value) {
    const parsed = new Date(value || '');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatCurrency(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDate(value) {
    const parsed = asDate(value);
    if (!parsed) return '--';
    return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(value) {
    const parsed = asDate(value);
    if (!parsed) return '--';
    return parsed.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function normalizeMonth(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : '';
  }

  function parseMonth(value) {
    const month = normalizeMonth(value);
    if (!month) return null;
    const parsed = new Date(`${month}-01T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatMonth(value) {
    const parsed = parseMonth(value);
    if (!parsed) return '--';
    return parsed.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  }

  function shiftMonthValue(value, offset) {
    const parsed = parseMonth(value);
    if (!parsed) return '';
    parsed.setMonth(parsed.getMonth() + Number(offset || 0));
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }

  function deriveFirstDueMonth(approvalDate) {
    const approvalMonth = normalizeMonth(approvalDate);
    return approvalMonth ? shiftMonthValue(approvalMonth, 1) : '';
  }

  function monthDiffInclusive(startMonth, endMonth) {
    const start = parseMonth(startMonth);
    const end = parseMonth(endMonth);
    if (!start || !end || end < start) return 0;
    return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
  }

  function normalizeFilterValue(value) {
    return text(value).toLowerCase();
  }

  function resolveAge(value, birthdate) {
    const numericAge = Number.parseInt(value, 10);
    if (Number.isFinite(numericAge) && numericAge > 0) {
      return numericAge;
    }
    const parsedBirthdate = asDate(birthdate);
    if (!parsedBirthdate) return null;
    const today = new Date();
    let age = today.getFullYear() - parsedBirthdate.getFullYear();
    const monthDelta = today.getMonth() - parsedBirthdate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < parsedBirthdate.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function resolveAgeGroup(rawAgeGroup, age, birthdate) {
    const provided = text(rawAgeGroup);
    if (provided && provided !== '--' && provided.toLowerCase() !== 'not set') {
      return provided;
    }
    const resolvedAge = resolveAge(age, birthdate);
    if (resolvedAge == null) return '--';
    if (resolvedAge < 18) return 'Below 18';
    if (resolvedAge <= 24) return '18-24';
    if (resolvedAge <= 34) return '25-34';
    if (resolvedAge <= 44) return '35-44';
    if (resolvedAge <= 54) return '45-54';
    return '55+';
  }

  function normalizeServiceType(value) {
    const normalized = normalizeFilterValue(value);
    if (!normalized) return '--';
    if (normalized.includes('buy') || normalized.includes('sell')) return 'Buy and Sell';
    if (normalized.includes('food') || normalized.includes('beverage') || normalized.includes('balut') || normalized.includes('snack') || normalized.includes('eatery') || normalized.includes('carinderia')) return 'Food and Beverages';
    if (normalized.includes('livestock') || normalized.includes('animal') || normalized.includes('poultry') || normalized.includes('hog')) return 'Livestock';
    if (
      normalized.includes('paluwagan')
      || normalized.includes('microenterprise')
      || normalized.includes('micro enterprise')
      || normalized.includes('micro-enterprise')
      || normalized.includes('service')
      || normalized.includes('establishment')
      || normalized.includes('store')
      || normalized.includes('shop')
      || normalized.includes('home')
      || normalized.includes('production')
      || normalized.includes('homemade')
      || normalized.includes('processing')
    ) return 'Establishment';
    return text(value) || '--';
  }

  function normalizeStage(value) {
    const normalized = normalizeFilterValue(value).replace(/[^a-z]/g, '');
    if (!normalized) return 'uploaded';
    if (['pending', 'submitted', 'underreview', 'reviewing'].includes(normalized)) return 'under_review';
    if (['needscorrection', 'correctionrequired'].includes(normalized)) return 'needs_correction';
    if (['rejected', 'flagged', 'invalid'].includes(normalized)) return 'rejected';
    if (['verified', 'verifiedupload', 'approved'].includes(normalized)) return 'verified';
    return 'uploaded';
  }

  function stageLabel(stage) {
    return ({
      uploaded: 'Uploaded',
      under_review: 'Under Review',
      needs_correction: 'Needs Correction',
      rejected: 'Rejected',
      verified: 'Verified',
    })[stage] || 'Uploaded';
  }

  function normalizeHardCopyOfficeStatus(value) {
    const normalized = normalizeFilterValue(value).replace(/[^a-z]/g, '');
    if (!normalized) return 'not_submitted';
    if (['submittedtooffice', 'submitted'].includes(normalized)) return 'submitted_to_office';
    if (['confirmedbyoffice', 'confirmed', 'yes'].includes(normalized)) return 'confirmed_by_office';
    return 'not_submitted';
  }

  function hardCopyOfficeStatusLabel(status) {
    return ({
      not_submitted: 'Not Submitted',
      submitted_to_office: 'Submitted to Office',
      confirmed_by_office: 'Confirmed by Office',
    })[normalizeHardCopyOfficeStatus(status)] || 'Not Submitted';
  }

  function submissionStatusLabel(record) {
    if (!record) return 'No Upload Yet';
    if (record.stage === 'verified') {
      return normalizeHardCopyOfficeStatus(record.hardCopyOfficeStatus) === 'confirmed_by_office'
        ? 'Fully Verified'
        : 'Partially Verified';
    }
    return stageLabel(record.stage);
  }

  function stageTone(stage) {
    return ({
      uploaded: 'uploaded',
      under_review: 'under-review',
      needs_correction: 'needs-correction',
      rejected: 'rejected',
      verified: 'verified',
    })[stage] || 'uploaded';
  }

  function accountStandingLabel(key) {
    return ({
      no_upload_yet: 'No Upload Yet',
      partial_paid: 'Partial Paid',
      fully_paid: 'Fully Paid',
    })[key] || 'No Upload Yet';
  }

  function accountStandingTone(key) {
    return ({
      no_upload_yet: 'muted',
      partial_paid: 'warning',
      fully_paid: 'success',
    })[key] || 'muted';
  }

  function isDeceasedStatus(value) {
    return normalizeFilterValue(value).replace(/[^a-z]/g, '') === 'deceased';
  }

  function activeCoMaker(meta) {
    const registration = meta?.coMakerRegistration;
    if (!registration || typeof registration !== 'object') return null;
    const status = normalizeFilterValue(registration.registrationStatus || '');
    if (!['active', 'approved'].includes(status)) return null;
    const name = text(registration.name);
    return name ? registration : null;
  }

  function resolveResponsiblePayer(meta, fallbackName) {
    const originalName = text(meta?.name || fallbackName || 'Unnamed beneficiary');
    const coMaker = isDeceasedStatus(meta?.programStatus || meta?.beneficiaryStatus || meta?.status)
      ? activeCoMaker(meta)
      : null;
    if (!coMaker) {
      return {
        name: originalName,
        originalName,
        isCoMakerTakeover: false,
        relationship: '',
        email: '',
        contactNumber: '',
      };
    }
    return {
      name: text(coMaker.name) || originalName,
      originalName,
      isCoMakerTakeover: true,
      relationship: text(coMaker.relationshipToPrimaryBeneficiary),
      email: text(coMaker.email),
      contactNumber: text(coMaker.contactNumber),
    };
  }

  function chipMarkup(label, tone) {
    return `<span class="repayment-state-chip repayment-state-chip--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function normalizeGenderLabel(value) {
    const key = String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if (['male', 'lalaki', 'lalake'].includes(key)) return 'Male';
    if (['female', 'babaye', 'babae'].includes(key)) return 'Female';
    if (['non binary', 'nonbinary'].includes(key)) return 'Non-binary';
    if (['prefer not to say', 'dili gustong mosulti'].includes(key)) return 'Prefer not to say';
    return text(value || '--');
  }

  function recordStageCounts(records) {
    return records.reduce((counts, record) => {
      counts[record.stage] = (counts[record.stage] || 0) + 1;
      return counts;
    }, {});
  }

  function normalizePayment(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: Number(row.id || 0),
      beneficiaryId: Number(row.beneficiaryId || 0),
      beneficiaryStatus: text(row.beneficiaryStatus),
      beneficiaryApprovalDate: text(row.beneficiaryApprovalDate),
      beneficiaryApprovedAt: text(row.beneficiaryApprovedAt),
      beneficiaryName: text(row.beneficiaryName),
      beneficiaryBusiness: text(row.beneficiaryBusiness),
      beneficiaryBarangay: text(row.beneficiaryBarangay),
      beneficiaryEmail: text(row.beneficiaryEmail),
      beneficiaryGender: text(row.beneficiaryGender || row.gender),
      beneficiaryAge: Number.isFinite(Number(row.beneficiaryAge ?? row.age)) ? Number(row.beneficiaryAge ?? row.age) : null,
      beneficiaryBirthdate: text(row.beneficiaryBirthdate || row.birthdate),
      beneficiaryAgeGroup: text(row.beneficiaryAgeGroup || row.ageGroup),
      beneficiaryServiceType: text(row.beneficiaryServiceType || row.serviceType || row.businessType),
      assignedPdo: text(row.assignedPdo || row.assignedPdoName || row.beneficiaryAssignedPdo),
      stage: normalizeStage(row.stage),
      month: normalizeMonth(row.month || row.coverageFrom || row.coverageMonth),
      coverageFrom: normalizeMonth(row.coverageFrom || row.month),
      coverageTo: normalizeMonth(row.coverageTo || row.month),
      submittedAt: text(row.submittedAt),
      paymentDate: text(row.paymentDate),
      amount: Number(row.amount || row.allocatedAmount || 0),
      allocatedAmount: Number(row.allocatedAmount || row.amount || 0),
      orNumber: text(row.orNumber),
      proof: text(row.proof),
      proofName: text(row.proofName),
      proofType: text(row.proofType),
      hardCopyOfficeStatus: normalizeHardCopyOfficeStatus(row.hardCopyOfficeStatus),
      notes: text(row.notes || row.adminRemarks),
      reviewedBy: text(row.reviewedBy || row.verifiedBy),
      reviewedAt: text(row.reviewedAt || row.verifiedAt),
    };
  }

  function findMetaRecord(metaRecords, payment) {
    if (!payment) return null;
    const byId = metaRecords.find((record) => Number(record.id || 0) > 0 && Number(record.id || 0) === payment.beneficiaryId);
    if (byId) return byId;
    const email = normalizeFilterValue(payment.beneficiaryEmail);
    if (email) {
      const byEmail = metaRecords.find((record) => normalizeFilterValue(record.email) === email);
      if (byEmail) return byEmail;
    }
    const name = normalizeFilterValue(payment.beneficiaryName);
    return name ? metaRecords.find((record) => normalizeFilterValue(record.name) === name) || null : null;
  }

  function rosterMetaLookup(metaRecords) {
    const map = new Map();
    metaRecords.forEach((record) => {
      const id = Number(record.id || 0);
      if (id > 0) map.set(`id:${id}`, record);
      const email = normalizeFilterValue(record.email);
      if (email) map.set(`email:${email}`, record);
      const name = normalizeFilterValue(record.name);
      if (name) map.set(`name:${name}`, record);
    });
    return map;
  }

  function lookupRecordMeta(map, seed) {
    if (!seed) return null;
    const id = Number(seed.beneficiaryId || seed.id || 0);
    if (id > 0 && map.has(`id:${id}`)) return map.get(`id:${id}`);
    const email = normalizeFilterValue(seed.beneficiaryEmail || seed.email);
    if (email && map.has(`email:${email}`)) return map.get(`email:${email}`);
    const name = normalizeFilterValue(seed.beneficiaryName || seed.name);
    if (name && map.has(`name:${name}`)) return map.get(`name:${name}`);
    return null;
  }

  function deriveStanding(records, meta) {
    const verifiedRecords = records.filter((record) => record.stage === 'verified');
    const verifiedMonths = unique(verifiedRecords.map((record) => record.month).filter(Boolean));
    const verifiedAmount = meta && meta.repayment && Number.isFinite(Number(meta.repayment.paidAmount))
      ? Number(meta.repayment.paidAmount)
      : verifiedRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const verifiedInstallments = meta && meta.repayment && Number.isFinite(Number(meta.repayment.verifiedInstallments))
      ? Math.max(Number(meta.repayment.verifiedInstallments), 0)
      : verifiedMonths.length;
    const currentMonth = normalizeMonth(new Date().toISOString());
    const firstDueMonth = deriveFirstDueMonth(meta?.approvalDate || '');
    const lastPlanMonth = firstDueMonth ? shiftMonthValue(firstDueMonth, TOTAL_MONTHS - 1) : '';
    const effectiveEndMonth = firstDueMonth && lastPlanMonth
      ? (currentMonth && currentMonth < lastPlanMonth ? currentMonth : lastPlanMonth)
      : '';
    const monthsPassed = firstDueMonth && effectiveEndMonth ? monthDiffInclusive(firstDueMonth, effectiveEndMonth) : 0;
    const monthsPaid = verifiedMonths.filter((month) => {
      const normalized = normalizeMonth(month);
      if (!normalized) return false;
      if (firstDueMonth && normalized < firstDueMonth) return false;
      if (lastPlanMonth && normalized > lastPlanMonth) return false;
      if (currentMonth && normalized > currentMonth) return false;
      return true;
    }).length;
    const repaymentRate = monthsPassed > 0 ? Math.round((monthsPaid / monthsPassed) * 10000) / 100 : 0;

    let key = meta && meta.repayment && text(meta.repayment.key)
      ? normalizeFilterValue(meta.repayment.key)
      : 'no_upload_yet';
    if (!['no_upload_yet', 'partial_paid', 'fully_paid'].includes(key)) {
      key = 'no_upload_yet';
    }
    if (key === 'no_upload_yet') {
      if (verifiedAmount >= TOTAL_EXPECTED || verifiedInstallments >= TOTAL_MONTHS) key = 'fully_paid';
      else if (verifiedAmount > 0 || verifiedInstallments > 0) key = 'partial_paid';
    }

    return {
      key,
      label: accountStandingLabel(key),
      verifiedAmount,
      verifiedMonths,
      verifiedInstallments,
      monthsPassed,
      monthsPaid,
      repaymentRate,
      outstandingBalance: Math.max(TOTAL_EXPECTED - verifiedAmount, 0),
      progressLabel: `${monthsPaid} / ${monthsPassed} months`,
      monthsPaidFraction: `${monthsPaid}/${monthsPassed}`,
    };
  }

  function deriveRosterState(records, standing) {
    const counts = recordStageCounts(records);
    if (!records.length) return 'no_upload_yet';
    if ((counts.uploaded || 0) + (counts.under_review || 0) > 0) return 'under_review';
    if ((counts.needs_correction || 0) > 0) return 'needs_correction';
    if ((counts.rejected || 0) > 0 && standing.key === 'no_upload_yet') return 'rejected';
    return standing.key;
  }

  function rosterStateLabel(state) {
    if (state === 'under_review') return 'Uploaded';
    if (['uploaded', 'needs_correction', 'rejected', 'verified'].includes(state)) return stageLabel(state);
    return accountStandingLabel(state);
  }

  function rosterStateTone(state) {
    if (['uploaded', 'under_review', 'needs_correction', 'rejected', 'verified'].includes(state)) {
      return stageTone(state === 'under_review' ? 'uploaded' : state);
    }
    return accountStandingTone(state);
  }

  function deriveSubmissionType(record) {
    const from = record ? formatMonth(record.coverageFrom || record.month) : '--';
    const to = record ? formatMonth(record.coverageTo || record.month) : '--';
    if (!record || (!record.coverageFrom && !record.month)) return '--';
    if ((record.coverageFrom || record.month) === (record.coverageTo || record.month)) return 'Single month';
    return `${from} to ${to}`;
  }

  function deriveCoverageLabel(record) {
    if (!record) return '--';
    const from = formatMonth(record.coverageFrom || record.month);
    const to = formatMonth(record.coverageTo || record.month);
    return from === to ? from : `${from} to ${to}`;
  }

  function buildBeneficiaryRoster(payments, metaRecords, config) {
    const metaMap = rosterMetaLookup(metaRecords);
    const grouped = new Map();

    metaRecords.forEach((record) => {
      const key = Number(record.id || 0) > 0
        ? `id:${Number(record.id)}`
        : normalizeFilterValue(record.email)
          ? `email:${normalizeFilterValue(record.email)}`
          : `name:${normalizeFilterValue(record.name || '')}`;
      if (!key.endsWith(':')) {
        grouped.set(key, {
          key,
          beneficiaryId: Number(record.id || 0),
          meta: record,
          records: [],
        });
      }
    });

    payments.forEach((payment) => {
      const meta = lookupRecordMeta(metaMap, payment);
      const key = payment.beneficiaryId > 0
        ? `id:${payment.beneficiaryId}`
        : normalizeFilterValue(payment.beneficiaryEmail)
          ? `email:${normalizeFilterValue(payment.beneficiaryEmail)}`
          : `name:${normalizeFilterValue(payment.beneficiaryName)}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          beneficiaryId: payment.beneficiaryId,
          meta,
          records: [],
        });
      }
      const entry = grouped.get(key);
      if (!entry.meta && meta) entry.meta = meta;
      entry.records.push(payment);
    });

    return Array.from(grouped.values()).map((entry) => {
      const meta = entry.meta || {};
      const records = entry.records.slice().sort((left, right) => {
        const rightTime = asDate(right.submittedAt || right.paymentDate)?.getTime() || 0;
        const leftTime = asDate(left.submittedAt || left.paymentDate)?.getTime() || 0;
        return rightTime - leftTime;
      });
      const standing = deriveStanding(records, meta);
      const rosterState = deriveRosterState(records, standing);
      const rosterLabel = rosterStateLabel(rosterState);
      const pendingCount = records.filter((record) => ['uploaded', 'under_review'].includes(record.stage)).length;
      const latestRecord = records[0] || null;
      const payer = resolveResponsiblePayer(meta, latestRecord?.beneficiaryName);

      return {
        key: entry.key,
        beneficiaryId: entry.beneficiaryId || Number(meta.id || 0) || 0,
        name: payer.name,
        originalBeneficiaryName: payer.originalName,
        responsiblePayerName: payer.name,
        isCoMakerTakeover: payer.isCoMakerTakeover,
        responsiblePayerRelationship: payer.relationship,
        responsiblePayerEmail: payer.email,
        responsiblePayerContactNumber: payer.contactNumber,
        email: text(meta.email || latestRecord?.beneficiaryEmail),
        businessName: text(meta.businessName || latestRecord?.beneficiaryBusiness || 'No business name'),
        barangay: text(meta.barangay || latestRecord?.beneficiaryBarangay || 'Unassigned'),
        gender: normalizeGenderLabel(meta.gender || latestRecord?.beneficiaryGender || '--'),
        ageGroup: resolveAgeGroup(meta.ageGroup, meta.age ?? latestRecord?.beneficiaryAge, meta.birthdate || latestRecord?.beneficiaryBirthdate),
        serviceType: normalizeServiceType(meta.serviceType || meta.businessType || latestRecord?.beneficiaryServiceType),
        assignedPdo: text(meta.assignedPdo || latestRecord?.assignedPdo || config.actorName || '--'),
        repayment: standing,
        rosterState,
        rosterLabel,
        pendingCount,
        latestSubmittedAt: latestRecord?.submittedAt || latestRecord?.paymentDate || '',
        lastActivity: text(meta.lastActivity || latestRecord?.submittedAt || latestRecord?.paymentDate),
        records,
      };
    }).sort((left, right) => {
      const rightTime = asDate(right.latestSubmittedAt || right.lastActivity)?.getTime() || 0;
      const leftTime = asDate(left.latestSubmittedAt || left.lastActivity)?.getTime() || 0;
      return rightTime - leftTime || left.name.localeCompare(right.name);
    });
  }

  function withinRange(value, from, to) {
    const current = asDate(value);
    if (!from && !to) return true;
    if (!current) return false;
    const fromDate = asDate(from);
    const toDate = asDate(to);
    if (fromDate && current < fromDate) return false;
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
      if (current > toDate) return false;
    }
    return true;
  }

  function renderProofPreview(node, record) {
    if (!node) return;
    const source = text(record?.proof);
    if (!source) {
      node.innerHTML = '<div class="admin-repayment-proof-empty">No proof preview available.</div>';
      node.dataset.proof = '';
      return;
    }
    node.dataset.proof = source;
    if (source.startsWith('data:image') || /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(source)) {
      node.innerHTML = `<img src="${escapeHtml(source)}" alt="${escapeHtml(record?.proofName || 'Repayment proof')}">`;
      return;
    }
    if (source.startsWith('data:application/pdf') || /\.pdf(\?.*)?$/i.test(source)) {
      node.innerHTML = `<iframe src="${escapeHtml(source)}" title="${escapeHtml(record?.proofName || 'Repayment proof')}"></iframe>`;
      return;
    }
    if (source.startsWith('data:video') || /\.(mp4|webm|ogg)(\?.*)?$/i.test(source)) {
      node.innerHTML = `<video controls src="${escapeHtml(source)}"></video>`;
      return;
    }
    node.innerHTML = '<div class="admin-repayment-proof-empty">Preview unavailable. Use the file actions below.</div>';
  }

  function openFile(source, download) {
    if (!source) return;
    if (download) {
      const link = document.createElement('a');
      link.href = source;
      link.download = '';
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    const win = window.open(source, '_blank', 'noopener');
    if (win) win.focus();
  }

  function requestFullscreen(previewNode) {
    if (!previewNode) return;
    const target = previewNode.querySelector('img, iframe, video') || previewNode;
    if (typeof target.requestFullscreen === 'function') {
      target.requestFullscreen().catch(() => {
        const source = text(previewNode.dataset.proof);
        openFile(source, false);
      });
      return;
    }
    const source = text(previewNode.dataset.proof);
    openFile(source, false);
  }

  // Build one reusable repayment workspace instance for a staff page by wiring IDs to shared roster and modal logic.
  function createWorkspace(config) {
    const ids = config.ids || {};
    const initialPayments = Array.isArray(config.initialPayments)
      ? config.initialPayments.map(normalizePayment).filter(Boolean)
      : [];
    // Local workspace state for the current staff page's roster, filters, and modal selection.
    const state = {
      payments: initialPayments,
      roster: [],
      filteredRoster: [],
      selectedBeneficiaryKey: '',
      activeRecordId: 0,
      filters: {
        search: '',
        barangay: '',
        pdo: '',
        repaymentState: '',
        fromDate: '',
        toDate: '',
      },
      modalOpen: false,
      remarksSnapshot: '',
    };

    function byId(id) {
      return id ? document.getElementById(id) : null;
    }

    function setText(id, value) {
      const node = byId(id);
      if (node) node.textContent = value;
    }

    function setHtml(id, value) {
      const node = byId(id);
      if (node) node.innerHTML = value;
    }

    function notify(message, tone = 'info') {
      if (typeof config.notify === 'function') {
        config.notify(message, tone);
      }
    }

    // Pull the live beneficiary source records from whichever staff dashboard is hosting the workspace.
    function beneficiaryRecords() {
      if (typeof config.beneficiaryRecordsProvider !== 'function') return [];
      const records = config.beneficiaryRecordsProvider();
      return Array.isArray(records) ? records : [];
    }

    function selectedBeneficiary() {
      return state.roster.find((entry) => entry.key === state.selectedBeneficiaryKey) || null;
    }

    // Prefer the active upload under review, falling back to the first actionable repayment record.
    function activeRecord(beneficiary) {
      if (!beneficiary) return null;
      if (state.activeRecordId > 0) {
        const current = beneficiary.records.find((record) => record.id === state.activeRecordId);
        if (current) return current;
      }
      return beneficiary.records.find((record) => ['uploaded', 'under_review', 'needs_correction'].includes(record.stage))
        || beneficiary.records[0]
        || null;
    }

    function selectedHardCopyOfficeStatus() {
      return normalizeHardCopyOfficeStatus(byId(ids.hardCopyInput)?.value);
    }

    function canVerifyFully(record) {
      return Boolean(record) && selectedHardCopyOfficeStatus() === 'confirmed_by_office';
    }

    function remarksDirty() {
      const field = byId(ids.remarks);
      if (!field) return false;
      return text(field.value) !== state.remarksSnapshot;
    }

    function toggleModal(open) {
      ensureModalRootDetached();
      const modal = byId(ids.modalRoot);
      if (!modal) return;
      state.modalOpen = open;
      modal.classList.toggle('is-open', open);
      modal.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.classList.toggle(config.bodyModalClass || 'repayment-modal-open', open);
    }

    function ensureModalRootDetached() {
      const modal = byId(ids.modalRoot);
      if (!modal || modal.parentElement === document.body) return;
      document.body.appendChild(modal);
    }

    function closeModal(force = false) {
      if (!force && remarksDirty() && !window.confirm('Discard unsaved remarks for this repayment review?')) {
        return false;
      }
      state.selectedBeneficiaryKey = state.selectedBeneficiaryKey || '';
      toggleModal(false);
      return true;
    }

    function renderSummary() {
      const approvedCount = state.roster.length;
      const pendingCount = state.roster.filter((entry) => entry.pendingCount > 0).length;
      const partialCount = state.roster.filter((entry) => entry.repayment.key === 'partial_paid').length;
      const fullCount = state.roster.filter((entry) => entry.repayment.key === 'fully_paid').length;
      setText(ids.approvedCount, String(approvedCount));
      setText(ids.pendingCount, String(pendingCount));
      setText(ids.partialCount, String(partialCount));
      setText(ids.fullCount, String(fullCount));
    }

    function syncFilterControls() {
      const values = [
        [ids.search, state.filters.search],
        [ids.barangayFilter, state.filters.barangay],
        [ids.pdoFilter, state.filters.pdo],
        [ids.stateFilter, state.filters.repaymentState],
        [ids.fromDateFilter, state.filters.fromDate],
        [ids.toDateFilter, state.filters.toDate],
      ];
      values.forEach(([id, value]) => {
        const node = byId(id);
        if (node && node.value !== value) {
          node.value = value;
        }
      });
    }

    function populateSelectOptions() {
      const barangaySelect = byId(ids.barangayFilter);
      const pdoSelect = byId(ids.pdoFilter);

      if (barangaySelect) {
        const values = unique(state.roster.map((entry) => entry.barangay).filter(Boolean)).sort((left, right) => left.localeCompare(right));
        barangaySelect.innerHTML = `<option value="">${escapeHtml(config.barangayAllLabel || 'All barangays')}</option>${values.map((value) => `<option value="${escapeHtml(normalizeFilterValue(value))}">${escapeHtml(value)}</option>`).join('')}`;
      }

      if (pdoSelect) {
        const values = unique(state.roster.map((entry) => entry.assignedPdo).filter(Boolean)).sort((left, right) => left.localeCompare(right));
        pdoSelect.innerHTML = `<option value="">${escapeHtml(config.pdoAllLabel || 'All PDOs')}</option>${values.map((value) => `<option value="${escapeHtml(normalizeFilterValue(value))}">${escapeHtml(value)}</option>`).join('')}`;
      }

      syncFilterControls();
    }

    function filterRoster() {
      const search = normalizeFilterValue(state.filters.search);
      state.filteredRoster = state.roster.filter((entry) => {
        if (state.filters.barangay && normalizeFilterValue(entry.barangay) !== state.filters.barangay) return false;
        if (state.filters.pdo && normalizeFilterValue(entry.assignedPdo) !== state.filters.pdo) return false;
        if (state.filters.repaymentState && entry.rosterState !== state.filters.repaymentState) return false;
        if ((state.filters.fromDate || state.filters.toDate) && !withinRange(entry.latestSubmittedAt || entry.lastActivity, state.filters.fromDate, state.filters.toDate)) return false;
        if (!search) return true;
        const haystack = [
          entry.name,
          entry.businessName,
          entry.barangay,
          entry.assignedPdo,
          entry.originalBeneficiaryName,
          entry.responsiblePayerRelationship,
          entry.records.map((record) => record.orNumber).join(' '),
        ].join(' ');
        return normalizeFilterValue(haystack).includes(search);
      });
    }

    // Paint the filtered beneficiary roster and attach the Open Repayments button state for the active row.
    function renderRosterTable() {
      const body = byId(ids.rosterBody);
      const countNode = byId(ids.rosterCount);
      if (countNode) {
        countNode.textContent = `${state.filteredRoster.length} ${state.filteredRoster.length === 1 ? 'beneficiary' : 'beneficiaries'}`;
      }
      if (!body) return;

      if (!state.filteredRoster.length) {
        body.innerHTML = `<tr><td colspan="${Number(config.emptyColspan || 12)}">${escapeHtml(config.emptyRosterMessage || 'No scoped beneficiaries matched the current filters.')}</td></tr>`;
        return;
      }

      body.innerHTML = state.filteredRoster.map((entry) => {
        const isActive = entry.key === state.selectedBeneficiaryKey && state.modalOpen;
        const repaymentRate = `${Number(entry.repayment.repaymentRate || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
        return `
          <tr class="${isActive ? 'is-active' : ''}">
            <td>
              <div class="admin-repayment-person">
                <strong>${escapeHtml(entry.responsiblePayerName || entry.name)}</strong>
                <span>${entry.isCoMakerTakeover ? `Current payer for ${escapeHtml(entry.originalBeneficiaryName || 'deceased beneficiary')}` : escapeHtml(entry.businessName || 'No business name')}</span>
                ${entry.isCoMakerTakeover && entry.responsiblePayerRelationship ? `<span>${escapeHtml(entry.responsiblePayerRelationship)}</span>` : ''}
              </div>
            </td>
            <td>${escapeHtml(entry.gender || '--')}</td>
            <td>${escapeHtml(entry.ageGroup || '--')}</td>
            <td>${escapeHtml(entry.serviceType || '--')}</td>
            <td>${escapeHtml(entry.barangay || '--')}</td>
            <td>${escapeHtml(entry.assignedPdo || '--')}</td>
            <td>${chipMarkup(entry.rosterLabel || entry.repayment.label, rosterStateTone(entry.rosterState || entry.repayment.key))}</td>
            <td>${escapeHtml(formatCurrency(entry.repayment.verifiedAmount))}</td>
            <td>${escapeHtml(String(entry.repayment.monthsPassed || 0))}</td>
            <td>${escapeHtml(String(entry.repayment.monthsPaid || 0))}</td>
            <td>${escapeHtml(`${repaymentRate} (${entry.repayment.monthsPaidFraction || '0/0'})`)}</td>
            <td class="actions">
              <button type="button" class="app-btn-outline" data-repayment-open="${escapeHtml(entry.key)}">Open Repayments</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Show every recorded month for the selected beneficiary and highlight whichever upload is under active review.
    function renderHistory(beneficiary, currentRecord) {
      const body = byId(ids.historyBody);
      if (!body) return;
      if (!beneficiary || !beneficiary.records.length) {
        body.innerHTML = '<tr><td colspan="10">No repayment history recorded yet.</td></tr>';
        return;
      }

      body.innerHTML = beneficiary.records.map((record) => {
        const isActive = currentRecord && currentRecord.id === record.id;
        const proofAction = record.proof
          ? `<button type="button" class="app-btn-outline app-btn-outline--quiet" data-repayment-proof="${record.id}">Open</button>`
          : '--';
        const verificationResult = record.stage === 'verified'
          ? submissionStatusLabel(record)
          : record.stage === 'needs_correction'
            ? 'Needs Correction'
            : record.stage === 'rejected'
              ? 'Rejected'
              : 'Pending';
        return `
          <tr class="${isActive ? 'is-active' : ''}" data-repayment-record="${record.id}">
            <td>${escapeHtml(formatMonth(record.month))}</td>
            <td>${escapeHtml(formatCurrency(MONTHLY_EXPECTED))}</td>
            <td>${escapeHtml(formatCurrency(record.amount))}</td>
            <td>${escapeHtml(record.orNumber || '--')}</td>
            <td>${proofAction}</td>
            <td>${chipMarkup(submissionStatusLabel(record), stageTone(record.stage))}</td>
            <td>${escapeHtml(verificationResult)}</td>
            <td>${escapeHtml(record.reviewedBy || '--')}</td>
            <td>${escapeHtml(record.notes || '--')}</td>
            <td>${escapeHtml(formatDateTime(record.reviewedAt || record.submittedAt || record.paymentDate))}</td>
          </tr>
        `;
      }).join('');
    }

    // Enable or lock review buttons depending on verification progress and hard-copy office confirmation.
    function renderDecisionState(beneficiary, record) {
      const remarksField = byId(ids.remarks);
      const hardCopyInput = byId(ids.hardCopyInput);
      const verifyPartialButton = byId(ids.verifyPartial);
      const verifyFullButton = byId(ids.verifyFull);
      const correctionButton = byId(ids.needsCorrection);
      const rejectButton = byId(ids.reject);
      const noteNode = byId(ids.decisionNote);
      const actionContainer =
        verifyPartialButton?.parentElement
        || verifyFullButton?.parentElement
        || correctionButton?.parentElement
        || rejectButton?.parentElement
        || null;
      const isVerified = Boolean(record && record.stage === 'verified');
      const isFullyLocked = isVerified && normalizeHardCopyOfficeStatus(record?.hardCopyOfficeStatus) === 'confirmed_by_office';
      const isPartiallyVerified = isVerified && !isFullyLocked;
      const hasRecord = Boolean(record);
      const hardCopyStatus = hasRecord ? selectedHardCopyOfficeStatus() : 'not_submitted';

      if (verifyPartialButton) {
        verifyPartialButton.textContent = 'Verify Partial';
        verifyPartialButton.classList.remove('is-locked-state');
        verifyPartialButton.hidden = false;
      }
      if (verifyFullButton) {
        verifyFullButton.textContent = 'Verify Fully';
        verifyFullButton.hidden = false;
      }
      if (correctionButton) correctionButton.hidden = false;
      if (rejectButton) rejectButton.hidden = false;

      if (remarksField) {
        const value = record ? text(record.notes) : '';
        remarksField.value = value;
        remarksField.readOnly = !hasRecord || isVerified;
        remarksField.disabled = !hasRecord || isVerified;
        state.remarksSnapshot = value;
      }

      if (hardCopyInput) {
        hardCopyInput.disabled = !hasRecord || isFullyLocked;
      }

      const disableAll = !hasRecord || isFullyLocked;
      const disableVerifyFull = !hasRecord || !canVerifyFully(record) || isFullyLocked;

      if (verifyPartialButton) verifyPartialButton.disabled = disableAll || isPartiallyVerified;
      if (verifyFullButton) verifyFullButton.disabled = disableVerifyFull;
      if (correctionButton) correctionButton.disabled = disableAll;
      if (rejectButton) rejectButton.disabled = disableAll;

      if (actionContainer) {
        actionContainer.hidden = !hasRecord;
      }

      if (isPartiallyVerified) {
        if (verifyPartialButton) {
          verifyPartialButton.textContent = 'Partially Verified';
          verifyPartialButton.disabled = true;
          verifyPartialButton.classList.add('is-locked-state');
        }
      }

      if (isFullyLocked) {
        if (verifyPartialButton) {
          verifyPartialButton.textContent = 'Fully Verified';
          verifyPartialButton.disabled = true;
          verifyPartialButton.classList.add('is-locked-state');
        }
      }

      if (!noteNode) return;
      if (!hasRecord) {
        noteNode.textContent = 'No uploaded repayment submission is available for review yet.';
        return;
      }
      if (isFullyLocked) {
        noteNode.textContent = 'This submission is already fully verified and locked.';
        return;
      }
      if (isPartiallyVerified) {
        if (hardCopyStatus === 'confirmed_by_office') {
          noteNode.textContent = 'Office receipt confirmed. You can now use Verify Fully.';
          return;
        }
        if (hardCopyStatus === 'submitted_to_office') {
          noteNode.textContent = 'Already partially verified. Confirm the office receipt to unlock Verify Fully.';
          return;
        }
        noteNode.textContent = 'Already partially verified. Update the office receipt status when the physical OR is received.';
        return;
      }
      if (hardCopyStatus === 'confirmed_by_office') {
        noteNode.textContent = 'Office receipt confirmed. Verify Fully is available.';
        return;
      }
      if (hardCopyStatus === 'submitted_to_office') {
        noteNode.textContent = 'Office receipt submitted but not yet confirmed. Use Verify Partial for now.';
        return;
      }
      noteNode.textContent = 'No office receipt yet. Use Verify Partial while this remains upload-only.';
    }

    // Sync every repayment modal panel from the selected beneficiary and the currently focused upload record.
    function renderModal() {
      const beneficiary = selectedBeneficiary();
      const record = activeRecord(beneficiary);

      if (!beneficiary) {
        toggleModal(false);
        return;
      }

      const subtitleParts = [
        beneficiary.businessName || '',
        beneficiary.barangay || '--',
        beneficiary.assignedPdo || '--',
      ].filter((value, index) => index === 0 ? Boolean(text(value)) : true);
      if (beneficiary.isCoMakerTakeover) {
        subtitleParts.unshift(`Original beneficiary: ${beneficiary.originalBeneficiaryName || '--'}`);
      }
      setText(ids.modalTitle, beneficiary.responsiblePayerName || beneficiary.name || 'Beneficiary repayment review');
      setText(ids.modalSubtitle, subtitleParts.join(' | '));
      setText(ids.modalStatus, record ? submissionStatusLabel(record) : beneficiary.repayment.label);
      setText(ids.beneficiaryName, beneficiary.isCoMakerTakeover ? `${beneficiary.responsiblePayerName || beneficiary.name} (co-maker)` : (beneficiary.name || '--'));
      setText(ids.business, beneficiary.businessName || '--');
      setText(ids.barangay, beneficiary.barangay || '--');
      setText(ids.assignedPdo, beneficiary.assignedPdo || '--');
      setText(ids.submittedAt, formatDateTime(record?.submittedAt || beneficiary.latestSubmittedAt));

      setText(ids.summaryOutstanding, formatCurrency(beneficiary.repayment.outstandingBalance));
      setText(ids.summaryVerified, formatCurrency(beneficiary.repayment.verifiedAmount));
      setText(ids.summaryProgress, beneficiary.repayment.progressLabel);
      setText(ids.summaryStanding, beneficiary.repayment.label);

      setText(ids.proofName, record?.proofName || 'No proof uploaded');
      setText(ids.proofType, record?.proofType || '--');
      setText(ids.proofDate, formatDateTime(record?.submittedAt || record?.paymentDate));
      renderProofPreview(byId(ids.proofPreview), record);

      setText(ids.orNumber, record?.orNumber || '--');
      setText(ids.paymentDate, formatDate(record?.paymentDate));
      setText(ids.submittedBy, beneficiary.responsiblePayerName || beneficiary.name || '--');
      setText(ids.submissionType, deriveSubmissionType(record));
      setText(ids.coverage, deriveCoverageLabel(record));
      setText(ids.amount, formatCurrency(record?.amount || 0));
      setText(ids.uploadStatus, record ? submissionStatusLabel(record) : 'No Upload Yet');
      if (byId(ids.hardCopyInput)) {
        byId(ids.hardCopyInput).value = normalizeHardCopyOfficeStatus(record?.hardCopyOfficeStatus);
      }
      setText(ids.hardCopyStatus, hardCopyOfficeStatusLabel(byId(ids.hardCopyInput)?.value || record?.hardCopyOfficeStatus));

      const warningNode = byId(ids.duplicateWarning);
      if (warningNode) {
        warningNode.classList.toggle('is-hidden', !(record && record.orNumber));
        warningNode.innerHTML = record && record.orNumber
          ? `<strong>Current OR reference</strong><span>${escapeHtml(record.orNumber)}</span>`
          : '';
      }

      renderHistory(beneficiary, record);
      renderDecisionState(beneficiary, record);
      toggleModal(true);
    }

    function selectBeneficiary(key) {
      const match = state.roster.find((entry) => entry.key === key);
      if (!match) return;
      state.selectedBeneficiaryKey = key;
      state.activeRecordId = activeRecord(match)?.id || 0;
      renderRosterTable();
      renderModal();
    }

    function selectRecord(recordId) {
      state.activeRecordId = Number(recordId || 0);
      renderModal();
    }

    async function fetchJson(path, options = {}) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        ...options,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Unable to load repayment records.');
      }
      return result;
    }

    async function applyDecision(decisionKey) {
      const beneficiary = selectedBeneficiary();
      const record = activeRecord(beneficiary);
      if (!record) {
        notify('No repayment submission is available for review.', 'warning');
        return;
      }

      const remarks = text(byId(ids.remarks)?.value);
      const hardCopyOfficeStatus = selectedHardCopyOfficeStatus();
      if (['needs_correction', 'rejected'].includes(decisionKey) && !remarks) {
        notify('Remarks are required for correction and rejection decisions.', 'warning');
        return;
      }
      if (decisionKey === 'verified_full' && hardCopyOfficeStatus !== 'confirmed_by_office') {
        notify('Verify Fully requires the hard copy receipt to be confirmed by office first.', 'warning');
        return;
      }
      if (decisionKey === 'verified_partial' && hardCopyOfficeStatus === 'confirmed_by_office') {
        notify('Use Verify Fully when the hard copy receipt is already confirmed by office.', 'warning');
        return;
      }

      const status = decisionKey === 'verified_partial' || decisionKey === 'verified_full'
        ? 'verified'
        : decisionKey;

      try {
        await fetchJson(`${window.SMARTLEAP_BASE_URL || ''}/api/repayments/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          body: JSON.stringify({
            repaymentId: record.id,
            status,
            remarks,
            hardCopyOfficeStatus,
          }),
        });
        await refresh();
        notify(
          decisionKey === 'verified_full'
            ? 'Repayment submission fully verified for the current account standing.'
            : decisionKey === 'verified_partial'
              ? 'Repayment submission partially verified.'
              : decisionKey === 'needs_correction'
                ? 'Repayment submission marked for correction.'
                : 'Repayment submission rejected.',
          'success'
        );
      } catch (error) {
        notify(error.message || 'Unable to save the repayment review.', 'warning');
      }
    }

    function resetFilters() {
      state.filters = {
        search: '',
        barangay: '',
        pdo: '',
        repaymentState: '',
        fromDate: '',
        toDate: '',
      };
      syncFilterControls();
      filterRoster();
      renderRosterTable();
    }

    // Recompute the roster after any search, barangay, PDO, repayment-state, or date-range change.
    function applyFilters() {
      state.filters.search = text(byId(ids.search)?.value);
      state.filters.barangay = normalizeFilterValue(byId(ids.barangayFilter)?.value);
      state.filters.pdo = normalizeFilterValue(byId(ids.pdoFilter)?.value);
      state.filters.repaymentState = normalizeFilterValue(byId(ids.stateFilter)?.value);
      state.filters.fromDate = text(byId(ids.fromDateFilter)?.value);
      state.filters.toDate = text(byId(ids.toDateFilter)?.value);
      filterRoster();
      renderRosterTable();
    }

    async function refresh() {
      try {
        const result = await fetchJson(`${window.SMARTLEAP_BASE_URL || ''}/api/repayments`);
        state.payments = Array.isArray(result.data?.payments)
          ? result.data.payments.map(normalizePayment).filter(Boolean)
          : [];
        if (typeof config.onPaymentsUpdated === 'function') {
          config.onPaymentsUpdated(state.payments.slice());
        }
        const metaRecords = beneficiaryRecords();
        state.roster = buildBeneficiaryRoster(state.payments, metaRecords, config);
        renderSummary();
        populateSelectOptions();
        filterRoster();
        renderRosterTable();

        if (state.modalOpen) {
          const current = selectedBeneficiary();
          if (current) {
            if (state.activeRecordId > 0 && !current.records.some((record) => record.id === state.activeRecordId)) {
              state.activeRecordId = activeRecord(current)?.id || 0;
            }
            renderModal();
          } else {
            closeModal(true);
          }
        }
      } catch (error) {
        state.payments = [];
        if (typeof config.onPaymentsUpdated === 'function') {
          config.onPaymentsUpdated([]);
        }
        state.roster = buildBeneficiaryRoster([], beneficiaryRecords(), config);
        renderSummary();
        populateSelectOptions();
        filterRoster();
        renderRosterTable();
        notify(error.message || 'Unable to load repayment records.', 'warning');
      }
    }

    function syncBeneficiaries() {
      state.roster = buildBeneficiaryRoster(state.payments, beneficiaryRecords(), config);
      renderSummary();
      populateSelectOptions();
      filterRoster();
      renderRosterTable();
    }

    function bind() {
      ensureModalRootDetached();
      const rosterBody = byId(ids.rosterBody);
      const modalRoot = byId(ids.modalRoot);

      rosterBody?.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-repayment-open]');
        if (!trigger) return;
        selectBeneficiary(trigger.getAttribute('data-repayment-open') || '');
      });

      byId(ids.resetFilters)?.addEventListener('click', resetFilters);

      [ids.search, ids.barangayFilter, ids.pdoFilter, ids.stateFilter, ids.fromDateFilter, ids.toDateFilter]
        .filter(Boolean)
        .forEach((id) => {
          byId(id)?.addEventListener('change', applyFilters);
        });
      byId(ids.search)?.addEventListener('input', applyFilters);

      modalRoot?.addEventListener('click', (event) => {
        if (event.target.closest('[data-repayment-modal-close]')) {
          closeModal();
          return;
        }

        if (event.target.id === ids.modalClose || event.target.id === ids.close) {
          closeModal();
          return;
        }

        const recordRow = event.target.closest('[data-repayment-record]');
        if (recordRow) {
          selectRecord(recordRow.getAttribute('data-repayment-record'));
          return;
        }

        const proofButton = event.target.closest('[data-repayment-proof]');
        if (proofButton) {
          const beneficiary = selectedBeneficiary();
          const record = beneficiary?.records.find((entry) => entry.id === Number(proofButton.getAttribute('data-repayment-proof')));
          if (record?.proof) openFile(record.proof, false);
        }
      });

      byId(ids.openProof)?.addEventListener('click', () => openFile(text(byId(ids.proofPreview)?.dataset.proof), false));
      byId(ids.downloadProof)?.addEventListener('click', () => openFile(text(byId(ids.proofPreview)?.dataset.proof), true));
      byId(ids.fullscreenProof)?.addEventListener('click', () => requestFullscreen(byId(ids.proofPreview)));
      byId(ids.hardCopyInput)?.addEventListener('change', () => {
        const beneficiary = selectedBeneficiary();
        const record = activeRecord(beneficiary);
        setText(ids.hardCopyStatus, hardCopyOfficeStatusLabel(selectedHardCopyOfficeStatus()));
        renderDecisionState(beneficiary, record);
      });
      byId(ids.verifyPartial)?.addEventListener('click', () => applyDecision('verified_partial'));
      byId(ids.verifyFull)?.addEventListener('click', () => applyDecision('verified_full'));
      byId(ids.needsCorrection)?.addEventListener('click', () => applyDecision('needs_correction'));
      byId(ids.reject)?.addEventListener('click', () => applyDecision('rejected'));
      byId(ids.close)?.addEventListener('click', () => closeModal());

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.modalOpen) {
          closeModal();
        }
      });
    }

    state.roster = buildBeneficiaryRoster(state.payments, beneficiaryRecords(), config);
    renderSummary();
    populateSelectOptions();
    filterRoster();
    renderRosterTable();

    bind();
    refresh();

    return {
      refresh,
      syncBeneficiaries,
      openBeneficiary: selectBeneficiary,
      close: () => closeModal(true),
    };
  }

  window.SMARTLEAP_REPAYMENT_REVIEW = { createWorkspace };
})();
