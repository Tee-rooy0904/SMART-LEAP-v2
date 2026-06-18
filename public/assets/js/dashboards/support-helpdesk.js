(function () {
    const root = document.querySelector('[data-helpdesk-root]');
    if (!root) return;

    const baseUrl = String(window.SMARTLEAP_BASE_URL || '').replace(/\/$/, '');
    const state = {
        tickets: [],
        selectedId: null,
        detail: null,
    };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        root.querySelector('[data-helpdesk-form]')?.addEventListener('submit', handleCreateTicket);
        root.addEventListener('click', handleRootClick);
        loadTickets();
    }

    async function loadTickets() {
        try {
            const payload = await fetchJson('api/support/tickets');
            const data = payload.data || {};
            state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
            renderSummary(data.summary || {});
            renderTickets();
            if (state.selectedId) {
                await loadTicketDetail(state.selectedId, true);
            }
        } catch (error) {
            renderTickets(error.message || 'Unable to load support concerns.');
        }
    }

    async function loadTicketDetail(ticketId, silent) {
        try {
            const payload = await fetchJson(`api/support/ticket?id=${encodeURIComponent(ticketId)}`);
            state.selectedId = ticketId;
            state.detail = payload.data || null;
            renderConversation();
            renderTickets();
        } catch (error) {
            if (!silent) {
                renderConversation(error.message || 'Unable to load this concern.');
            }
        }
    }

    async function handleCreateTicket(event) {
        event.preventDefault();
        const form = event.currentTarget;
        clearFormErrors(form);
        const validation = validateConcernForm(form);
        if (Object.keys(validation).length > 0) {
            showFormErrors(form, validation);
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        const status = root.querySelector('[data-helpdesk-form-status]');
        setBusy(button, true, 'Submitting...');
        setStatus(status, '');

        try {
            const payload = await fetchForm('api/support/tickets', new FormData(form));
            setStatus(status, payload.message || 'Your concern has been submitted.', 'success');
            form.reset();
            const ticket = payload.ticket || payload.data?.ticket;
            state.selectedId = ticket?.id || null;
            await loadTickets();
            if (state.selectedId) {
                await loadTicketDetail(state.selectedId, true);
            }
            showToast(payload.message || 'Your concern has been submitted.', 'success');
        } catch (error) {
            if (error.errors) {
                showFormErrors(form, error.errors);
            }
            setStatus(status, error.message || 'Unable to submit your concern right now.', 'error');
        } finally {
            setBusy(button, false);
        }
    }

    async function handleReplySubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const message = String(new FormData(form).get('message') || '').trim();
        if (message.length < 2) {
            form.querySelector('[data-helpdesk-reply-error]').textContent = 'Enter a reply before sending.';
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        formData.set('ticket_id', String(state.selectedId || ''));
        setBusy(button, true, 'Sending...');
        try {
            const payload = await fetchForm('api/support/ticket/messages', formData);
            state.detail = payload.data || state.detail;
            form.reset();
            renderConversation();
            await loadTickets();
        } catch (error) {
            form.querySelector('[data-helpdesk-reply-error]').textContent = error.message || 'Unable to send reply.';
        } finally {
            setBusy(button, false);
        }
    }

    async function handleRootClick(event) {
        const viewButton = event.target.closest('[data-helpdesk-view]');
        if (viewButton) {
            await loadTicketDetail(Number(viewButton.dataset.helpdeskView || 0), false);
            return;
        }

        const reopenButton = event.target.closest('[data-helpdesk-reopen]');
        if (reopenButton && state.selectedId) {
            const formData = new FormData();
            formData.set('ticket_id', String(state.selectedId));
            try {
                const payload = await fetchForm('api/support/ticket/reopen', formData);
                state.detail = payload.data || state.detail;
                renderConversation();
                await loadTickets();
            } catch (error) {
                showToast(error.message || 'Unable to reopen concern.', 'warning');
            }
        }
    }

    function renderSummary(summary) {
        void summary;
    }

    function renderTickets(errorMessage) {
        const list = root.querySelector('[data-helpdesk-ticket-list]');
        if (!list) return;
        if (errorMessage) {
            list.innerHTML = `<p class="helpdesk-empty">${escapeHtml(errorMessage)}</p>`;
            return;
        }
        if (!state.tickets.length) {
            list.innerHTML = '<p class="helpdesk-empty">No concerns submitted yet. Use the form to submit a concern when you need help from SMART LEAP staff.</p>';
            return;
        }

        list.innerHTML = state.tickets.map((ticket) => `
            <article class="helpdesk-ticket ${Number(ticket.id) === Number(state.selectedId) ? 'is-active' : ''}">
                <div class="helpdesk-ticket__main">
                    <div class="helpdesk-ticket__title">
                        <strong>${escapeHtml(ticket.ticketNo || ticket.ticket_no || '')}</strong>
                        ${ticket.unread ? '<span class="helpdesk-unread">Unread</span>' : ''}
                    </div>
                    <h4>${escapeHtml(ticket.subject || '')}</h4>
                    <p>${escapeHtml(ticket.category || '')} Â· Assigned to: ${escapeHtml(ticket.assignedRole || '')}</p>
                </div>
                <div class="helpdesk-ticket__meta">
                    <span class="helpdesk-badge ${statusClass(ticket.status)}">${escapeHtml(ticket.status || 'New')}</span>
                    <small>${escapeHtml(formatDateTime(ticket.updatedAt || ticket.lastMessageAt || ticket.createdAt))}</small>
                    <button type="button" class="btn-outline small" data-helpdesk-view="${Number(ticket.id)}">View conversation</button>
                </div>
            </article>
        `).join('');
    }

    function renderConversation(errorMessage) {
        const panel = root.querySelector('[data-helpdesk-conversation]');
        if (!panel) return;
        if (errorMessage || !state.detail?.ticket) {
            panel.innerHTML = '';
            return;
        }

        const ticket = state.detail.ticket;
        const messages = Array.isArray(state.detail.messages) ? state.detail.messages : [];
        const isClosed = ticket.status === 'Closed';
        const isResolved = ticket.status === 'Resolved';
        panel.innerHTML = `
            <article class="helpdesk-conversation__ticket">
                <div>
                    <strong>${escapeHtml(ticket.ticketNo || '')}</strong>
                    <h4>${escapeHtml(ticket.subject || '')}</h4>
                    <p>${escapeHtml(ticket.category || '')} Â· Assigned to: ${escapeHtml(ticket.assignedRole || '')}</p>
                </div>
                <span class="helpdesk-badge ${statusClass(ticket.status)}">${escapeHtml(ticket.status || '')}</span>
                <dl>
                    <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(ticket.createdAt))}</dd></div>
                    <div><dt>Last updated</dt><dd>${escapeHtml(formatDateTime(ticket.updatedAt || ticket.lastMessageAt))}</dd></div>
                </dl>
            </article>
            <div class="helpdesk-thread">
                ${messages.length ? messages.map(renderMessage).join('') : '<p class="helpdesk-empty">No messages yet.</p>'}
            </div>
            ${isResolved ? '<p class="helpdesk-notice">This concern has been marked as resolved. You may reply if you still need help.</p>' : ''}
            ${isClosed ? '<p class="helpdesk-notice">This concern is closed. Create a new concern if you need further assistance.</p>' : renderReplyForm()}
            ${isResolved ? '<button type="button" class="btn-outline small" data-helpdesk-reopen>Reopen concern</button>' : ''}
        `;
        panel.querySelector('[data-helpdesk-reply-form]')?.addEventListener('submit', handleReplySubmit);
    }

    function renderMessage(message) {
        const attachments = Array.isArray(message.attachments) ? message.attachments : [];
        return `
            <article class="helpdesk-message ${message.senderType === 'Applicant' || message.senderType === 'Beneficiary' ? 'is-own' : ''}">
                <div class="helpdesk-message__meta">
                    <strong>${escapeHtml(message.senderName || message.senderType || 'SMART LEAP')}</strong>
                    <span>${escapeHtml(message.senderType || '')}</span>
                    <time>${escapeHtml(formatDateTime(message.createdAt))}</time>
                </div>
                <p>${escapeHtml(message.body || message.message || '')}</p>
                ${attachments.length ? `<div class="helpdesk-attachments">${attachments.map((attachment) => `<a href="${baseUrl}/${escapeHtml(attachment.downloadUrl || '')}" target="_blank" rel="noopener">${escapeHtml(attachment.name || attachment.originalName || 'Attachment')}</a>`).join('')}</div>` : ''}
            </article>
        `;
    }

    function renderReplyForm() {
        return `
            <form class="helpdesk-reply" data-helpdesk-reply-form>
                <label class="form-field full">
                    <span>Reply</span>
                    <textarea name="message" rows="3" placeholder="Type your reply to SMART LEAP staff"></textarea>
                    <small data-helpdesk-reply-error></small>
                </label>
                <label class="form-field full">
                    <span>Attachment</span>
                    <input type="file" name="attachment" accept=".jpg,.jpeg,.png,.webp,.pdf">
                </label>
                <button type="submit" class="btn-primary">Send reply</button>
            </form>
        `;
    }

    function validateConcernForm(form) {
        const data = new FormData(form);
        const errors = {};
        if (!String(data.get('category') || '').trim()) errors.category = 'Choose a concern category.';
        const subject = String(data.get('subject') || '').trim();
        if (subject.length < 5) errors.subject = 'Subject must be at least 5 characters.';
        const message = String(data.get('message') || '').trim();
        if (message.length < 10) errors.message = 'Message must be at least 10 characters.';
        return errors;
    }

    function clearFormErrors(form) {
        form.querySelectorAll('[data-helpdesk-error]').forEach((item) => { item.textContent = ''; });
    }

    function showFormErrors(form, errors) {
        Object.entries(errors || {}).forEach(([key, value]) => {
            const target = form.querySelector(`[data-helpdesk-error="${key}"]`);
            if (target) target.textContent = String(value || '');
        });
    }

    async function fetchJson(path) {
        const response = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, { headers: { Accept: 'application/json' } });
        return parseResponse(response);
    }

    async function fetchForm(path, formData) {
        const response = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: formData,
        });
        return parseResponse(response);
    }

    async function parseResponse(response) {
        const type = response.headers.get('content-type') || '';
        if (!type.includes('application/json')) {
            throw new Error(response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.');
        }
        const payload = await response.json();
        if (!response.ok || payload.ok === false || payload.success === false) {
            const error = new Error(payload.message || 'Request failed.');
            error.errors = payload.errors || null;
            throw error;
        }
        return payload;
    }

    function setBusy(button, busy, text) {
        if (!button) return;
        if (busy) {
            button.dataset.defaultText = button.textContent;
            button.textContent = text || 'Working...';
            button.disabled = true;
        } else {
            button.textContent = button.dataset.defaultText || button.textContent;
            button.disabled = false;
        }
    }

    function setStatus(target, message, type) {
        if (!target) return;
        target.textContent = message || '';
        target.dataset.state = type || '';
    }

    function statusClass(status) {
        return `is-${String(status || 'New').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    }

    function formatDateTime(value) {
        if (!value) return '--';
        const date = new Date(String(value).replace(' ', 'T'));
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${type || 'info'}`;
        toast.textContent = message;
        stack.appendChild(toast);
        window.setTimeout(() => toast.remove(), 4500);
    }
})();
