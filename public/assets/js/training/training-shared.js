/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for t ra in in g s ha re d.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
(function (global) {
  const TRAINING_BATCH_GROUP_COUNT = 3;
  const TRAINING_BATCH_GROUP_SIZE = 100;
  const TRAINING_YEARLY_BATCH_CAPACITY = TRAINING_BATCH_GROUP_COUNT * TRAINING_BATCH_GROUP_SIZE;

  const TrainingUI = {
    baseUrl: String(global.SMARTLEAP_BASE_URL || '').replace(/\/+$/, ''),
    TRAINING_BATCH_GROUP_COUNT,
    TRAINING_BATCH_GROUP_SIZE,
    TRAINING_YEARLY_BATCH_CAPACITY,

    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },

    routeUrl(path) {
      return `${TrainingUI.baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
    },

    pageQuery() {
      return new URLSearchParams(global.location.search || '');
    },

    queryValue(key, fallback = '') {
      const value = TrainingUI.pageQuery().get(key);
      return value === null || value === '' ? fallback : value;
    },

    async parseJson(response) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return {
          ok: false,
          message: response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.',
        };
      }
      return response.json();
    },

    async apiGet(path, params = {}) {
      const query = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value === '' || value === null || typeof value === 'undefined') return;
        query.append(key, String(value));
      });
      const url = query.toString() ? `${TrainingUI.routeUrl(path)}?${query}` : TrainingUI.routeUrl(path);
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        return await TrainingUI.parseJson(response);
      } catch (error) {
        return { ok: false, message: 'Unable to reach the server right now.' };
      }
    },

    async apiPost(path, payload = {}) {
      const body = new URLSearchParams();
      Object.entries(payload || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => body.append(`${key}[]`, item));
          return;
        }
        body.append(key, value ?? '');
      });
      try {
        const response = await fetch(TrainingUI.routeUrl(path), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          credentials: 'same-origin',
          body: body.toString(),
        });
        return await TrainingUI.parseJson(response);
      } catch (error) {
        return { ok: false, message: 'Unable to reach the server right now.' };
      }
    },

    async apiFormPost(path, formData) {
      try {
        const response = await fetch(TrainingUI.routeUrl(path), {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          body: formData,
        });
        return await TrainingUI.parseJson(response);
      } catch (error) {
        return { ok: false, message: 'Unable to reach the server right now.' };
      }
    },

    firstError(errors) {
      if (!errors || typeof errors !== 'object') return '';
      const values = Object.values(errors);
      return values.length ? String(values[0] || '') : '';
    },
    debounce(callback, delay) {
      let timer = null;
      return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => callback.apply(this, args), delay);
      };
    },
    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatDate(value) {
      if (!value) return '--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    },
    formatDateTime(value) {
      if (!value) return '--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
    },
    statusChip(label, variant) {
      return `<span class="status-chip ${variant ? `status-chip--${variant}` : ''}">${TrainingUI.escapeHtml(label)}</span>`;
    },
    renderBanner(target, message, variant) {
      if (!target) return;
      target.className = `validation-banner validation-banner--${variant || 'warning'}${message ? ' is-visible' : ''}`;
      target.textContent = message || '';
    },
    pdoGroupMeta(participants, groupSize = TRAINING_BATCH_GROUP_SIZE, preferredAssignments = {}) {
      const buckets = new Map();
      [...participants].forEach((participant) => {
        const applicantName = String(participant.name || participant.applicant_full_name || participant.fullName || '');
        const pdoName = String(participant.assignedPdoName || participant.assigned_pdo_name || '').trim();
        const pdoUserId = Number(participant.assignedPdoUserId || participant.assigned_pdo_user_id || 0);
        const key = pdoUserId > 0 ? `pdo:${pdoUserId}` : `name:${pdoName.toLowerCase()}`;
        if (!buckets.has(key)) {
          buckets.set(key, {
            pdoUserId,
            pdoName,
            items: [],
          });
        }
        buckets.get(key).items.push({ ...participant, applicantName });
      });

      const sortedBuckets = [...buckets.values()]
        .map((bucket) => ({
          ...bucket,
          items: bucket.items.sort((left, right) => String(left.applicantName || '').localeCompare(String(right.applicantName || ''))),
        }))
        .sort((left, right) => {
          const sizeCompare = right.items.length - left.items.length;
          if (sizeCompare !== 0) return sizeCompare;
          return String(left.pdoName || '').localeCompare(String(right.pdoName || ''));
        });

      const groups = Array.from({ length: TRAINING_BATCH_GROUP_COUNT }, (_, index) => ({
        groupNumber: index + 1,
        pdoNames: [],
        items: [],
      }));

      const explicitBuckets = [];
      const automaticBuckets = [];
      for (const bucket of sortedBuckets) {
        const explicitGroup = Number(preferredAssignments[String(bucket.pdoUserId || '')] || 0);
        if (explicitGroup >= 1 && explicitGroup <= TRAINING_BATCH_GROUP_COUNT) {
          explicitBuckets.push({ ...bucket, explicitGroup });
        } else {
          automaticBuckets.push(bucket);
        }
      }

      const placeBucket = (bucket, forcedGroup = 0) => {
        if (bucket.items.length > groupSize) {
          groups.assignmentError = `${bucket.pdoName || 'Assigned PDO'} exceeds the training group limit of ${groupSize} participants.`;
          return false;
        }
        const candidates = forcedGroup
          ? groups.filter((group) => group.groupNumber === forcedGroup && group.items.length + bucket.items.length <= groupSize)
          : [...groups]
            .filter((group) => group.items.length + bucket.items.length <= groupSize)
            .sort((left, right) => {
              const sizeCompare = left.items.length - right.items.length;
              if (sizeCompare !== 0) return sizeCompare;
              return left.groupNumber - right.groupNumber;
            });
        const targetGroup = candidates[0];
        if (!targetGroup) {
          groups.assignmentError = forcedGroup
            ? `${bucket.pdoName || 'Assigned PDO'} cannot fit in Group ${forcedGroup} without exceeding ${groupSize} participants.`
            : `Assigned participants cannot fit within the current 3-group limit of ${groupSize} participants per group.`;
          return false;
        }
        targetGroup.pdoNames.push(bucket.pdoName || 'Unassigned PDO');
        targetGroup.items.push(...bucket.items);
        return true;
      };

      for (const bucket of explicitBuckets) {
        if (!placeBucket(bucket, bucket.explicitGroup)) return groups;
      }
      for (const bucket of automaticBuckets) {
        if (!placeBucket(bucket, 0)) return groups;
      }

      return groups.map((group) => ({
        ...group,
        pdoLabel: group.pdoNames.length ? group.pdoNames.join(', ') : 'No PDO assigned',
        items: group.items.map((participant, index) => ({
          ...participant,
          pdoSequence: index + 1,
        })),
      }));
    },
    deriveAssignment(participants, groupSize = TRAINING_BATCH_GROUP_SIZE, preferredAssignments = {}) {
      const grouped = TrainingUI.pdoGroupMeta(participants, groupSize, preferredAssignments);
      if (grouped.assignmentError) return [...participants];
      return grouped.flatMap((group) => group.items.map((participant, index) => ({
          ...participant,
          group_number: group.groupNumber,
          batchGroupNumber: group.groupNumber,
          pdo_group_name: group.pdoLabel,
          pdo_sequence: index + 1,
        })));
    },
    groupCounts(participants) {
      return participants.reduce((counts, participant) => {
        const key = Number(participant.group_number || 0);
        if (key >= 1 && key <= 3) counts[key] += 1;
        return counts;
      }, { 1: 0, 2: 0, 3: 0 });
    },
    openModal(modal) {
      if (!modal) return;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    },
    closeModal(modal) {
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    },
    bindModalClose(modal) {
      if (!modal) return;
      modal.addEventListener('click', (event) => {
        if (event.target.hasAttribute('data-close-modal')) {
          TrainingUI.closeModal(modal);
        }
      });
    },
    mountPage(config) {
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof config.init === 'function') {
          config.init(TrainingUI);
        }
      });
    },
  };
  global.TrainingUI = TrainingUI;
})(window);
