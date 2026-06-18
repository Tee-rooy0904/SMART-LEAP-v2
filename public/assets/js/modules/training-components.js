(function () {
    const ATTENDANCE_STATES = {
        pending: { label: 'Pending', className: 'pending' },
        present: { label: 'Present', className: 'present' },
        absent: { label: 'Absent', className: 'absent' },
        excused: { label: 'Excused', className: 'excused' }
    };

    const TOGGLE_LABELS = {
        present: '<i class="fas fa-user-check" aria-hidden="true"></i><span>Present</span>',
        absent: '<i class="fas fa-user-times" aria-hidden="true"></i><span>Absent</span>',
        excused: '<i class="fas fa-user-clock" aria-hidden="true"></i><span>Excused</span>'
    };

    function buildScheduleGrid(sessions, options = {}) {
        const list = Array.isArray(sessions) ? sessions.slice() : [];
        if (!list.length) {
            return `<article class="training-schedule-empty">${escapeHtml(options.emptyCopy || 'No sessions scheduled yet.')}</article>`;
        }

        const sorted = list.sort((a, b) => {
            const aTime = normaliseDate(a.start)?.getTime?.() || 0;
            const bTime = normaliseDate(b.start)?.getTime?.() || 0;
            return aTime - bTime;
        });

        return sorted.map((session) => buildScheduleCard(session, options)).join('');
    }

    function buildScheduleCard(session, options = {}) {
        const details = normaliseSession(session);
        const windowCopy = formatWindow(session, options.formatWindow);
        const roleAttr = options.role === false ? '' : ' role="listitem"';
        const dataAttr = details.id ? ` data-session-id="${escapeAttr(details.id)}"` : '';
        const focusCopy = details.focus
            ? `<span>${escapeHtml(details.focus)}</span>`
            : '<span></span>';
        const actions = typeof options.renderActions === 'function'
            ? options.renderActions(session, details) || ''
            : '';

        return `
            <article class="training-schedule-card"${roleAttr}${dataAttr}>
                <span class="training-schedule-label">${escapeHtml(details.label)}</span>
                <h3>${escapeHtml(details.title)}</h3>
                <div class="training-schedule-meta">
                    <span>${escapeHtml(windowCopy.dateText)} &bull; ${escapeHtml(windowCopy.timeRange)}</span>
                    <span>${escapeHtml(details.venue)}</span>
                    <span>Facilitator: ${escapeHtml(details.facilitator)}</span>
                </div>
                <div class="training-schedule-status">
                    <span>${escapeHtml(details.statusLabel)}</span>
                    ${focusCopy}
                </div>
                ${actions ? `<div class="training-schedule-actions">${actions}</div>` : ''}
            </article>`;
    }

    function buildTitleDatalist(id, presets) {
        if (!Array.isArray(presets) || !presets.length) return '';
        const options = presets.map((item) => `<option value="${escapeHtml(String(item))}"></option>`).join('');
        return `<datalist id="${id}">${options}</datalist>`;
    }

    function buildAttendanceTable(sessions, attendanceMap, options = {}) {
        const list = Array.isArray(sessions) ? sessions.slice() : [];
        if (!list.length) {
            const colspan = options.colspan || 4;
            return `<tr class="empty"><td colspan="${colspan}">${escapeHtml(options.emptyCopy || 'No sessions recorded yet.')}</td></tr>`;
        }

        const map = attendanceMap || {};
        return list
            .map((session) => buildAttendanceRow(session, map[session.id], options))
            .join('');
    }

    function buildAttendanceRow(session, status, options = {}) {
        const details = normaliseSession(session);
        const windowCopy = formatWindow(session, options.formatWindow);
        const badge = buildAttendanceBadge(status);
        const mode = options.mode || 'readonly';

        if (mode === 'manage') {
            const toggles = buildAttendanceToggles(details, status, options);
            return `
                <tr${details.id ? ` data-session-id="${escapeAttr(details.id)}"` : ''}>
                    <td>
                        <div class="table-primary">${escapeHtml(details.title)}</div>
                        <div class="table-secondary">${escapeHtml(details.focus)}</div>
                    </td>
                    <td>
                        <div>${escapeHtml(windowCopy.dateText)}</div>
                        <small class="table-secondary">${escapeHtml(windowCopy.timeRange)}</small>
                    </td>
                    <td>${toggles}</td>
                    <td><span class="badge-status ${badge.className}">${badge.label}</span></td>
                </tr>`;
        }

        const note = typeof options.renderNote === 'function'
            ? options.renderNote(session, status, options)
            : '';

        return `
            <tr${details.id ? ` data-session-id="${escapeAttr(details.id)}"` : ''}>
                <td>
                    <div class="table-primary">${escapeHtml(details.title)}</div>
                    <div class="table-secondary">${escapeHtml(details.focus)}</div>
                </td>
                <td>
                    <div>${escapeHtml(windowCopy.dateText)}</div>
                    <small class="table-secondary">${escapeHtml(windowCopy.timeRange)}</small>
                </td>
                <td><span class="badge-status ${badge.className}">${badge.label}</span></td>
                <td>${note || ''}</td>
            </tr>`;
    }

    function buildAttendanceToggles(session, status, options = {}) {
        const current = String(status || 'pending').toLowerCase();
        const action = options.toggleAction || 'set-attendance';
        const sessionIdAttr = session.id ? ` data-session-id="${escapeAttr(session.id)}"` : '';

        return `
            <div class="attendance-buttons">
                ${['present', 'absent', 'excused'].map((value) => {
                    const isActive = current === value;
                    const activeClass = isActive ? ' is-active' : '';
                    return `<button type="button" class="attendance-button${activeClass}" data-action="${escapeAttr(action)}"${sessionIdAttr} data-value="${value}" aria-pressed="${isActive}">${TOGGLE_LABELS[value]}</button>`;
                }).join('')}
            </div>`;
    }

    function buildAttendanceBadge(status) {
        const key = String(status || 'pending').toLowerCase();
        return ATTENDANCE_STATES[key] || ATTENDANCE_STATES.pending;
    }

    function buildProgressSummary(progress = {}, options = {}) {
        const totalSessions = Number.isFinite(options.totalSessions)
            ? Number(options.totalSessions)
            : Number(progress.sessionCount || 0);
        const present = Number(progress.present || 0);
        const pending = Number(progress.pending || 0);
        const absent = Number(progress.absent || 0);
        const completion = clampPercent(progress.completion);

        return {
            sessionCountText: formatPlural(totalSessions, 'session'),
            fillPercent: completion,
            completedText: `${formatPlural(present, 'session')} completed`,
            pendingText: `${formatPlural(pending, 'upcoming session')}`,
            absencesText: `${formatPlural(absent, 'recorded absence')}`
        };
    }

    function applyProgressSummary(targets = {}, summary = {}) {
        if (targets.counter) {
            targets.counter.textContent = summary.sessionCountText || '0 sessions';
        }

        if (targets.fill) {
            const percent = Number.isFinite(summary.fillPercent) ? Math.max(0, Math.min(100, summary.fillPercent)) : 0;
            targets.fill.style.width = `${percent}%`;
            if (targets.track) {
                targets.track.setAttribute('aria-valuenow', String(Math.round(percent)));
            }
        }

        if (targets.completed) {
            targets.completed.textContent = summary.completedText || '0 sessions completed';
        }

        if (targets.pending) {
            targets.pending.textContent = summary.pendingText || '0 upcoming sessions';
        }

        if (targets.absences) {
            targets.absences.textContent = summary.absencesText || '0 recorded absences';
        }
    }

    function buildSessionForm(session = null, options = {}) {
        const values = normaliseSession(session || {});
        const idValue = escapeAttr(values.id || '');
        const buttonCopy = options.submitLabel || (values.id ? 'Update session' : 'Create session');
        const statusValue = escapeAttr(values.status || 'Scheduled');
        const dateValue = formatInputDate(values.startDate);
        const startValue = formatInputTime(values.startDate);
        const endValue = formatInputTime(values.endDate);
        const hiddenClass = options.visible === false ? ' is-hidden' : '';
        const presets = Array.isArray(options.modulePresets) ? options.modulePresets.filter(Boolean) : null;
        const datalistId = presets?.length ? escapeAttr(`${options.formId || 'training-session-form'}-titles`) : '';

        return `
            <form id="${escapeAttr(options.formId || 'training-session-form')}" class="training-session-form${hiddenClass}">
                <input type="hidden" id="training-session-id" value="${idValue}">
                <div class="training-form-grid">
                    <label class="form-field">
                        <span>Title *</span>
                        <input type="text" id="training-session-title" value="${escapeAttr(values.title)}"${datalistId ? ` list="${datalistId}"` : ''} required>
                        ${datalistId ? buildTitleDatalist(datalistId, presets) : ''}
                    </label>
                    <label class="form-field">
                        <span>Date *</span>
                        <input type="date" id="training-session-date" value="${escapeAttr(dateValue)}" required>
                    </label>
                    <label class="form-field">
                        <span>Start time *</span>
                        <input type="time" id="training-session-start" value="${escapeAttr(startValue)}" required>
                    </label>
                    <label class="form-field">
                        <span>End time *</span>
                        <input type="time" id="training-session-end" value="${escapeAttr(endValue)}" required>
                    </label>
                    <label class="form-field">
                        <span>Venue</span>
                        <input type="text" id="training-session-venue" value="${escapeAttr(values.venue)}" placeholder="Location">
                    </label>
                    <label class="form-field">
                        <span>Facilitator</span>
                        <input type="text" id="training-session-facilitator" value="${escapeAttr(values.facilitator)}" placeholder="Name or team">
                    </label>
                    <label class="form-field full">
                        <span>Focus / notes</span>
                        <input type="text" id="training-session-focus" value="${escapeAttr(values.focus)}" placeholder="Session focus">
                    </label>
                    <label class="form-field">
                        <span>Status</span>
                        <select id="training-session-status">
                            ${buildStatusOption('Scheduled', statusValue)}
                            ${buildStatusOption('Completed', statusValue)}
                            ${buildStatusOption('Cancelled', statusValue)}
                        </select>
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn-primary">${escapeHtml(buttonCopy)}</button>
                    <button type="button" class="btn-ghost btn-neutral" data-action="close-session-form">
                        <i class="fas fa-xmark" aria-hidden="true"></i><span>Close</span>
                    </button>
                </div>
            </form>`;
    }

    function buildStatusOption(value, current) {
        const selected = value === current ? ' selected' : '';
        return `<option value="${escapeAttr(value)}"${selected}>${escapeHtml(value)}</option>`;
    }

    function normaliseSession(session = {}) {
        const id = session.id || '';
        const label = session.label || session.title || 'Session';
        const title = session.title || session.label || 'Training Session';
        const focus = session.focus || '';
        const venue = session.venue || 'Venue to follow';
        const facilitator = session.facilitator || 'TBA';
        const status = (session.status || 'Scheduled').toLowerCase();
        const statusLabel = status === 'completed'
            ? 'Completed'
            : status === 'cancelled'
                ? 'Cancelled'
                : 'Scheduled';
        const startDate = normaliseDate(session.start);
        const endDate = normaliseDate(session.end);

        return {
            id,
            label,
            title,
            focus,
            venue,
            facilitator,
            status,
            statusLabel,
            startDate,
            endDate
        };
    }

    function formatWindow(session, customFormatter) {
        if (typeof customFormatter === 'function') {
            return customFormatter(session);
        }

        if (window.TrainingShared && typeof TrainingShared.formatSessionWindow === 'function') {
            return TrainingShared.formatSessionWindow(session);
        }

        const start = normaliseDate(session.start);
        const end = normaliseDate(session.end);

        if (!start) {
            return { dateText: '--', timeRange: '--' };
        }

        const dateText = start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        const startText = start.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
        const endText = end
            ? end.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
            : start.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

        return { dateText, timeRange: `${startText} - ${endText}` };
    }

    function formatPlural(value, unit) {
        const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        return `${count} ${unit}${count === 1 ? '' : 's'}`;
    }

    function clampPercent(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.min(100, Math.round(numeric)));
    }

    function normaliseDate(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return null;
        return date;
    }

    function formatInputDate(date) {
        if (!date) return '';
        const iso = date.toISOString();
        return iso.slice(0, 10);
    }

    function formatInputTime(date) {
        if (!date) return '';
        const iso = date.toISOString();
        return iso.slice(11, 16);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    window.TrainingComponents = {
        buildScheduleGrid,
        buildScheduleCard,
        buildAttendanceTable,
        buildAttendanceRow,
        buildAttendanceBadge,
        buildProgressSummary,
        applyProgressSummary,
        buildSessionForm,
        buildAttendanceToggles,
        ATTENDANCE_STATES
    };
})();
