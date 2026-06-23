(function () {
    // Shared Stage 2 applicant runtime state, including support polling and next-step routing.
    const state = {
        baseUrl: window.SMARTLEAP_BASE_URL || '',
        authUser: window.SMARTLEAP_AUTH_USER || null,
        dashboard: null,
        nextStepPath: null,
        loaderStartedAt: Date.now(),
        supportRecipient: 'social_worker',
        supportChatTimer: null,
        formCountdownTimer: null,
        accountSheetOpen: false,
    };
    // Post-approval form cards shown inside the applicant application workspace.
    const APPLICANT_FORM_REQUIREMENTS = [
        { code: 'availment_form', title: 'Availment Form' },
        { code: 'validation_form', title: 'Validation Form' },
        { code: 'mungkahing_proyekto', title: 'Mungkahing Proyekto' },
        { code: 'business_plan', title: 'Business Plan' },
        { code: 'buhat_sa_pagpanumpa', title: 'Buhat sa Pagpanumpa' },
    ];
    const PORTAL_LOADER_MIN_MS = 3000;

    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('smartleap:language-change', () => {
        if (!state.dashboard) {
            return;
        }
        renderDashboard();
        applyRouteVisibility();
    });

    // Bind static controls first, then hydrate the full applicant dashboard state from the server.
    async function init() {
        bindStaticEvents();
        await loadDashboardState();
    }

    // Register sidebar, mobile account, support, certificate, and route-driven interactions.
    function bindStaticEvents() {
        document.getElementById('applicantLogoutButton')?.addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebarMenu);
        document.getElementById('sidebarClose')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebarMenuOnMobile);
        bindApplicantAccountSheet();
        document.addEventListener('click', handleWorkspaceShortcuts);
        document.addEventListener('change', handleApplicantTrainingProofUpload);
        document.addEventListener('click', handleApplicantAccountOutsideClick);
        document.addEventListener('smartleap:profile-state', handleProfileStateSync);
        document.addEventListener('smartleap:notifications-toggle', (event) => {
            if (event.detail?.open) {
                closeApplicantAccountSheet();
            }
        });
        document.getElementById('downloadSertipikoButton')?.addEventListener('click', () => {
            const path = state.dashboard?.certificate?.downloadPath;
            if (path) {
                window.location.href = routeUrl(path);
            }
        });
        document.getElementById('nextStepAction')?.addEventListener('click', () => {
            if (state.nextStepPath) {
                navigateToPath(state.nextStepPath);
            }
        });
        document.querySelectorAll('[data-support-recipient]').forEach((button) => {
            button.addEventListener('click', () => {
                state.supportRecipient = button.dataset.supportRecipient || 'social_worker';
                document.querySelectorAll('[data-support-recipient]').forEach((item) => {
                    item.classList.toggle('is-active', item === button);
                });
                loadSupportChat();
            });
        });
        document.getElementById('supportChatForm')?.addEventListener('submit', handleSupportChatSubmit);

        document.querySelectorAll('.sidebar-link, .applicant-tabbar__link').forEach((link) => {
            link.addEventListener('click', (event) => {
                const hash = link.getAttribute('href') || '#dashboard-home';
                if (!hash.startsWith('#')) {
                    closeSidebarMenuOnMobile();
                    return;
                }

                event.preventDefault();
                openSection(hash.slice(1));
                closeSidebarMenuOnMobile();
            });
        });

        window.addEventListener('hashchange', applyRouteVisibility);
        window.addEventListener('resize', syncSidebarMenuState);
        window.setInterval(() => {
            if (state.dashboard) {
                renderFormRequirementCountdowns();
            }
        }, 60000);
        document.addEventListener('keydown', handleGlobalKeydown);
        syncSidebarMenuState();
    }

    // Pull the entire Stage 2 applicant workspace state before any section is rendered.
    async function loadDashboardState() {
        try {
            const payload = await fetchJson('applicant-dashboard/state');
            if (!payload.ok) {
                throw new Error(payload.message || 'Unable to load the applicant dashboard.');
            }

            state.dashboard = payload.state || null;
            renderDashboard();
            applyRouteVisibility();
            markPortalReady();
        } catch (error) {
            renderFatalState(error.message || 'Unable to load the applicant dashboard.');
            markPortalReady();
        }
    }

    // Fan out rendering so every applicant sub-workspace stays in sync with the same payload.
    function renderDashboard() {
        if (!state.dashboard) {
            renderFatalState('Applicant dashboard data is unavailable.');
            return;
        }

        renderIdentity();
        renderOverview();
        renderProfile();
        renderRequirements();
        renderFormRequirements();
        renderAplikasyon();
        renderTraining();
        renderSertipiko();
        renderSupport();
        loadSupportChat();
        startSupportChatPolling();
        renderJourney();
        renderAlerts();
    }

    function handleProfileStateSync(event) {
        if (!state.dashboard) {
            return;
        }

        const detail = event.detail || {};
        if (detail.user) {
            state.dashboard.authUser = {
                ...(state.dashboard.authUser || {}),
                ...detail.user,
            };
        }
        if (detail.profile) {
            state.dashboard.profile = {
                ...(state.dashboard.profile || {}),
                ...detail.profile,
            };
            setText('sidebarUserBusiness', detail.profile.businessName || detail.profile.livelihood || 'Applicant profile');
        }

        if (detail.application) {
            state.dashboard.application = {
                ...(state.dashboard.application || {}),
                ...detail.application,
            };
        }

        renderIdentity();
        renderProfile();
        renderAplikasyon();
        renderOverview();
        renderSupport();
    }

    function renderIdentity() {
        const authUser = state.dashboard.authUser || state.authUser || {};
        const profile = state.dashboard.profile || {};
        const displayName = authUser.name || 'Applicant';
        const businessName = profile.businessName || profile.livelihood || 'Applicant profile';
        const initial = (displayName.trim().charAt(0) || 'A').toUpperCase();
        const photo = getStoredProfilePhoto(authUser);

        setText('sidebarUserName', displayName);
        setText('sidebarUserBusiness', businessName);
        setText('profilePageName', displayName);
        setAvatarNode(document.getElementById('sidebarAvatar'), initial, photo);
        setMobileAvatar(initial, photo);
    }

    function getStoredProfilePhoto(identity) {
        return identity?.photo || state.dashboard?.authUser?.photo || state.authUser?.photo || null;
    }

    function setAvatarNode(node, fallbackInitial, photo) {
        if (!node) return;
        if (photo) {
            node.textContent = '';
            node.style.backgroundImage = `url("${photo}")`;
            node.classList.add('has-photo');
            return;
        }

        node.style.backgroundImage = '';
        node.classList.remove('has-photo');
        node.textContent = fallbackInitial;
    }

    function setMobileAvatar(fallbackInitial, photo) {
        const button = document.getElementById('applicantAccountToggle');
        const badge = document.getElementById('mobileAccountAvatar');
        if (photo) {
            if (button) {
                button.classList.add('has-photo');
                button.style.backgroundImage = `url("${photo}")`;
            }
            if (badge) {
                badge.style.backgroundImage = '';
                badge.classList.remove('has-photo');
                badge.textContent = '';
                badge.setAttribute('aria-hidden', 'true');
            }
            return;
        }

        if (button) {
            button.classList.remove('has-photo');
            button.style.backgroundImage = '';
        }
        if (badge) {
            badge.style.backgroundImage = '';
            badge.classList.remove('has-photo');
            badge.textContent = fallbackInitial;
            badge.setAttribute('aria-hidden', 'true');
        }
    }

    function renderOverview() {
        const profile = state.dashboard.profile;
        const application = state.dashboard.application;
        const training = state.dashboard.training || {};
        const certificate = state.dashboard.certificate || {};
        const nextStep = state.dashboard.nextStep || {};
        const requirements = state.dashboard.requirements || [];
        const uploadedCount = requirements.filter((item) => item.file && item.file.path).length;
        const verifiedCount = requirements.filter((item) => String(item.status || '').toLowerCase() === 'verified').length;

        const status = application?.status || 'No application yet';
        const profilePagkompleto = profile?.completionPercent ?? 0;
        const trainingSummary = training.summary || {};
        setText('nextStepStatus', status);

        setText('dashboardProfileCompletion', `${profilePagkompleto}%`);
        setText(
            'dashboardProfileCompletionNote',
            profilePagkompleto >= 100
                ? 'Your applicant profile is complete and ready for the current workflow steps.'
                : 'Keep your applicant profile complete.'
        );
        setText('dashboardRequirementsSummary', `${uploadedCount}/${requirements.length || 4} uploaded`);
        setText(
            'dashboardRequirementsSummaryNote',
            verifiedCount > 0
                ? `${verifiedCount} requirement${verifiedCount === 1 ? '' : 's'} verified so far.`
                : 'Requirement review will appear here once CSWDD checks your uploads.'
        );
        setText('dashboardTrainingCompletion', `${Math.round((((trainingSummary.attended || 0) + (trainingSummary.completed || 0)) / Math.max(1, training.invitees?.length || 0)) * 100)}% complete`);
        setText('dashboardTrainingCompletionNote', buildTrainingOverviewNote(trainingSummary, training));
        setText('dashboardSertipikoStatus', certificate.statusLabel || 'Locked');
        setText('dashboardSertipikoStatusNote', sanitizeSertipikoNote(certificate.note || 'Available after your training and application requirements are complete.'));
        setText('nextStepTitle', sanitizeApplicantWording(nextStep.title || 'Complete your applicant profile'));
        setText('nextStepDescription', workflowActionDescription(nextStep.actionPath, nextStep.description || 'The next required action will appear here.'));
    }

    function renderProfile() {
        const profile = state.dashboard.profile || {};
        const application = state.dashboard.application || null;
        const completionPercent = profile.completionPercent ?? 0;

        setText('profilePageEmail', state.dashboard.authUser?.email || state.authUser?.email || '--');
        setText('profileWorkspaceCompletion', `${completionPercent}% complete`);
        setText(
            'profileWorkspaceCompletionNote',
            completionPercent >= 100
                ? 'Your personal details look complete. Use Application for uploads and submission.'
                : 'Complete the missing personal details here, then continue to Application.'
        );
        setText('profileWorkspaceAplikasyonStatus', application?.status || 'No application yet');
        setText('profileWorkspaceAplikasyonNote', buildProfileAplikasyonNote(application));
    }

    // Render uploaded requirement cards, review states, and any correction or resubmission guidance.
    function renderRequirements() {
        const requirements = state.dashboard.requirements || [];
        const list = document.getElementById('requirementsList');
        const uploadedCount = requirements.filter((item) => item.file && item.file.path).length;
        const total = requirements.length || 4;
        const percent = total > 0 ? Math.round((uploadedCount / total) * 100) : 0;
        const issues = requirements.filter((item) => isRequirementIssue(item.status)).length;
        const verified = requirements.filter((item) => String(item.status || '').toLowerCase() === 'verified').length;

        setText('requirementsProgressCount', `${uploadedCount}/${total} requirements`);
        setText(
            'requirementsProgressStatus',
            issues > 0
                ? 'One or more requirements need attention.'
                : verified === total && total > 0
                    ? 'All current requirements are verified.'
                    : 'Requirement review is still in progress.'
        );

        const fill = document.getElementById('requirementsProgressFill');
        fill && (fill.style.width = `${percent}%`);
        fill?.parentElement?.setAttribute('aria-valuenow', String(percent));

        if (!list) {
            return;
        }

        if (requirements.length === 0) {
            list.innerHTML = '<li class="empty">No requirement records yet.</li>';
            return;
        }

        list.innerHTML = requirements.map((item) => {
            const statusClass = requirementStatusClass(item.status);
            const statusText = normalizeRequirementStatusSimple(item);
            const fileName = item.file?.name ? escapeHtml(item.file.name) : 'No file uploaded yet';
            const fileMeta = item.updatedAt ? `Last update: ${formatDate(item.updatedAt)}` : 'You can upload this in the Application page.';
            const reviewerNote = item.reviewerRemarks || item.remarks || item.note || '';
            const actionHref = item.file?.url ? escapeAttribute(item.file.url) : '#application-page';
            const actionLabel = item.file?.url ? 'View file' : 'Go to uploads';
            const actionAttrs = item.file?.url ? 'target="_blank" rel="noopener"' : 'data-open-application-workspace';

            return `
                <li class="requirement-card">
                    <div class="requirement-card__main">
                        <div class="requirement-card__header">
                            <strong>${escapeHtml(item.label || item.key || 'Requirement')}</strong>
                            <span class="requirement-status ${statusClass}">${escapeHtml(statusText)}</span>
                        </div>
                        <p class="requirement-card__copy">${escapeHtml(buildRequirementHelpText(item))}</p>
                        <div class="requirement-file-meta">${fileName}</div>
                        <div class="requirement-file-meta">${escapeHtml(fileMeta)}</div>
                        ${reviewerNote ? `<p class="requirement-card__note"><strong>Reviewer note:</strong> ${escapeHtml(truncateText(reviewerNote, 120))}</p>` : ''}
                    </div>
                    <div class="requirement-actions">
                        <a class="btn-outline small requirement-action-link" href="${actionHref}" ${actionAttrs}>${actionLabel}</a>
                    </div>
                </li>
            `;
        }).join('');
    }

    function renderFormRequirements() {
        const root = document.getElementById('applicationFormCards');
        if (!root) {
            return;
        }

        const taskMap = new Map(
            (state.dashboard?.postApproval?.tasks || []).map((task) => [String(task.code || '').toLowerCase(), task])
        );

        root.innerHTML = APPLICANT_FORM_REQUIREMENTS.map((definition) => {
            const task = taskMap.get(definition.code) || null;
            const file = task?.file || null;
            const statusText = normalizeFormCardStatus(task);
            const statusClass = formCardStatusClass(statusText);
            const accomplishment = buildFormAccomplishmentState(task, statusText);
            const sessionInfo = definition.finalRequirement
                ? {
                    label: 'Final proof',
                    title: '',
                    meta: task?.interactive
                        ? 'Available after your earlier form requirements are verified.'
                        : 'Locked until your earlier form requirements are verified.',
                    opened: Boolean(task?.interactive),
                }
                : findFormSessionInfo(definition.code);
            const directFormFiles = {
                availment_form: 'availment_form.php',
                mungkahing_proyekto: 'mungkahing_proyekto.php',
            };
            const onlineUrl = directFormFiles[definition.code]
                ? routeUrl(directFormFiles[definition.code])
                : routeUrl(`application-form-file?code=${encodeURIComponent(definition.code)}`);
            const canOpenOnline = Boolean(task?.interactive)
                && String(task?.status || '').toLowerCase() !== 'locked';
            const fileMeta = file
                ? `Hardcopy upload: ${file.name || 'Uploaded form'}${file.size ? ` | ${formatFileSize(file.size)}` : ''}${file.type ? ` | ${file.type}` : ''}`
                : (definition.finalRequirement
                    ? (canOpenOnline ? 'Upload the proof that assistance was received.' : 'This final proof opens after earlier requirements are verified.')
                    : (canOpenOnline ? 'Online form opened for your training session.' : 'Waiting for Admin to open this form in a training session.'));
            const helperText = buildFormRequirementHelper(task, definition);
            const reviewerNote = task?.reviewerRemarks || '';
            const onlineLabel = onlineFormActionLabel(task);
            const sessionMeta = sessionInfo.meta
                ? `${sessionInfo.title ? `${sessionInfo.title} | ` : ''}${sessionInfo.meta}`
                : (definition.finalRequirement ? 'Final requirement before beneficiary approval.' : (sessionInfo.title || 'No training schedule linked yet.'));
            return `
                <article class="doc-tile application-form-card ${statusClass}">
                    <div class="doc-header">
                        <strong>${escapeHtml(task?.title || definition.title)}</strong>
                        <span class="doc-status ${statusClass === 'is-approved' ? 'is-approved' : (statusClass === 'is-uploaded' ? 'is-uploaded' : (statusClass === 'is-rejected' ? 'is-rejected' : ''))}">${escapeHtml(statusText)}</span>
                    </div>
                    <div class="application-form-card__accomplishment ${accomplishment.className}">
                        <span>${escapeHtml(definition.finalRequirement ? 'Final requirement' : 'Training form status')}</span>
                        <strong>${escapeHtml(accomplishment.label)}</strong>
                    </div>
                    <div class="application-form-card__session ${sessionInfo.opened ? 'is-opened' : 'is-locked'}">
                        <span>${escapeHtml(sessionInfo.label)}</span>
                        <strong>${escapeHtml(sessionInfo.opened ? 'Opened by Admin' : 'Not opened yet')}</strong>
                    </div>
                    <div class="application-form-card__schedule">${escapeHtml(sessionMeta)}</div>
                    <div class="doc-meta">${escapeHtml(fileMeta)}</div>
                    <div class="doc-note">${escapeHtml(helperText)}</div>
                    ${reviewerNote ? `<div class="doc-note application-form-card__review-note"><strong>Reviewer note:</strong> ${escapeHtml(truncateText(reviewerNote, 120))}</div>` : ''}
                    <div class="doc-actions">
                        ${canOpenOnline
                            ? `<a class="btn-primary application-form-card__link" href="${escapeAttribute(onlineUrl)}" data-online-form-link="${escapeAttribute(onlineUrl)}">${escapeHtml(onlineLabel)}</a>`
                            : '<span class="btn-outline application-form-card__disabled" aria-disabled="true">Online form locked</span>'}
                        ${file?.url
                            ? `<a class="btn-outline" href="${escapeAttribute(file.url)}" target="_blank" rel="noopener">View PDO/Admin upload</a>`
                            : '<span class="btn-outline application-form-card__disabled" aria-disabled="true">No hardcopy upload</span>'}
                    </div>
                </article>
            `;
        }).join('');

        // Ensure online form links always navigate even if delegated handler misses the target.
        Array.from(root.querySelectorAll('[data-online-form-link]')).forEach((anchor) => {
            anchor.addEventListener('click', (ev) => {
                ev.preventDefault();
                const href = String(anchor.dataset.onlineFormLink || anchor.getAttribute('href') || '').trim();
                if (href) {
                    window.location.href = href;
                }
            });
        });

        // Capture-phase handler to open online form links even when an overlay accidentally sits above the cards.
        if (!window.__smartleapAppFormCaptureAdded) {
            window.__smartleapAppFormCaptureAdded = true;
            document.addEventListener('pointerdown', (ev) => {
                try {
                    const x = ev.clientX, y = ev.clientY;
                    const stacked = document.elementsFromPoint(x, y);
                    for (const el of stacked) {
                        const anchor = el.closest ? el.closest('[data-online-form-link]') : null;
                        if (anchor) {
                            const href = String(anchor.dataset?.onlineFormLink || anchor.getAttribute('href') || '').trim();
                            if (href) {
                                // Prevent default navigation from the overlay and navigate immediately.
                                ev.preventDefault();
                                window.location.href = href;
                            }
                            break;
                        }
                    }
                } catch (e) {
                    // silent
                }
            }, true);
        }
    }

    function renderAplikasyon() {
        const application = state.dashboard.application;
        const remarks = application?.remarks || [];
        const latestRemark = remarks[0] || null;
        const currentStatus = application?.status || 'Draft';
        const nextStepSummary = buildAplikasyonNextStepSummary(application, latestRemark);

        setText('applicationStatusValue', application?.status || 'No application yet');
        setText('applicationStatusPill', currentStatus);
        setText('applicationStatusValue', currentStatus);
        setText('applicationReviewStatusValue', currentStatus);
        setText('applicationStatusNextStep', nextStepSummary);
        setText('applicationReviewStatusNote', nextStepSummary);
        setText('applicationStatusDates', buildAplikasyonDateMeta(application));
        setText('applicationStatusReviewedDate', application?.reviewedAt ? formatDate(application.reviewedAt) : 'No review yet');
        const assignedPdo = application?.assignedPdo || state.dashboard?.profile?.assignedPdo || null;
        setText('assignedPdoName', assignedPdo?.name || 'Not assigned');
        setText('assignedPdoEmail', assignedPdo?.email || 'Assigned PDO details will appear here once scoped.');

        const reviewSummary = application?.reviewSummary || { verified: 0, total: 0, pending: 0, issues: 0 };
        setText('requirementReviewValue', `${reviewSummary.verified || 0} verified`);
        setText(
            'requirementReviewNote',
            reviewSummary.issues > 0
                ? `${reviewSummary.issues} requirement${reviewSummary.issues === 1 ? '' : 's'} need attention.`
                : `${reviewSummary.pending || 0} requirement${reviewSummary.pending === 1 ? '' : 's'} still pending review.`
        );
        setText(
            'applicationRemarkCount',
            `${remarks.length} remark${remarks.length === 1 ? '' : 's'}`
        );
        setText(
            'applicationRemarkNote',
            latestRemark
                ? `${latestRemark.actorName || 'CSWDD'}: ${truncateText(latestRemark.comment || 'Applicant-visible note available.', 92)}`
                : 'Applicant-visible review notes are summarized here.'
        );
        const latestRemarkPanel = document.getElementById('applicationLatestRemarkPanel');
        if (latestRemarkPanel) {
            latestRemarkPanel.hidden = !latestRemark;
        }
        setText('applicationLatestRemarkTitle', latestRemark?.actorName || 'No message yet');
        setText(
            'applicationLatestRemarkCopy',
            latestRemark
                ? truncateText(latestRemark.comment || 'Applicant-visible note available.', 150)
                : 'Applicant-visible review notes will appear here first.'
        );
        setText('dashboardSnapshotStatus', application?.status || 'Draft');
        setText('dashboardSnapshotDate', buildAplikasyonDateMeta(application));
        setText('dashboardSnapshotPdo', assignedPdo?.name || 'Not yet assigned');
        setText(
            'dashboardSnapshotRemark',
            latestRemark
                ? `${latestRemark.actorName || 'CSWDD'} | ${truncateText(latestRemark.comment || '', 110)}`
                : 'Reviewer remarks will appear here once visible to you.'
        );

        renderTimelineList('historyList', application?.history || [], renderHistoryItem, 'No status history yet.');
        renderTimelineList('remarksList', application?.remarks || [], renderRemarkItem, 'No applicant-visible remarks yet.');
    }

    // Render the applicant's seminar schedule, attendance progress, and training-related notices.
    function renderTraining() {
        const training = state.dashboard.training || {};
        const summary = training.summary || {};
        const invitees = training.invitees || [];
        const nextSession = training.nextSession || null;

        const progressPercent = invitees.length > 0
            ? Math.round((((summary.attended || 0) + (summary.completed || 0)) / invitees.length) * 100)
            : 0;

        setText('trainingPercent', `${progressPercent}%`);
        setText(
            'trainingSummaryNote',
            invitees.length === 0
                ? 'No training assignment recorded yet.'
                : `${invitees.length} training assignment${invitees.length === 1 ? '' : 's'} recorded for your applicant profile.`
        );
        setText('trainingNapahibaloanCount', String(summary.notified || 0));
        setText('trainingNahumanCount', String(summary.completed || 0));
        setText('trainingMissedCount', String(summary.missed || 0));
        setText('trainingProgressMeta', `${progressPercent}% completion`);

        const ring = document.getElementById('trainingRing');
        if (ring) {
            ring.style.setProperty('--progress', `${Math.max(0, Math.min(100, progressPercent)) * 3.6}deg`);
        }
        const fill = document.getElementById('trainingProgressFill');
        fill && (fill.style.width = `${progressPercent}%`);

        const nextCard = document.getElementById('trainingNextCard');
        if (nextSession) {
            nextCard?.classList.remove('is-empty');
            setText('trainingNextTitle', nextSession.program?.programName || 'Training session');
            setText('trainingNextMeta', buildTrainingMeta(nextSession));
        } else {
            nextCard?.classList.add('is-empty');
            setText('trainingNextTitle', 'No upcoming session scheduled');
            setText('trainingNextMeta', '');
        }

        renderTrainingChecklist(invitees);
        renderTrainingSchedule(invitees);
        renderAttendanceTable(invitees);
    }

    function renderSertipiko() {
        const certificate = state.dashboard?.certificate || {};
        const statusButton = document.getElementById('downloadSertipikoButton');

        setText('certificateStatus', certificate.statusLabel || 'Locked');
        const trainingNahuman = certificate.trainingNahuman || 0;
        const trainingTotal = certificate.trainingTotal || 0;
        const postApprovalVerified = certificate.postApprovalVerified || 0;
        const postApprovalTotal = certificate.postApprovalTotal || 0;
        setText('certificateMeta', `${trainingNahuman}/${trainingTotal} trainings completed - ${postApprovalVerified}/${postApprovalTotal} verified application requirements`);
        setText('certificateNote', sanitizeSertipikoNote(certificate.note || 'Certificate availability will be shown here once your training and application requirements are complete.'));

        if (statusButton) {
            statusButton.disabled = !certificate.eligible;
            statusButton.textContent = certificate.eligible
                ? 'Download certificate (PDF)'
                : 'Certificate locked';
        }
    }

    // Render support contacts, conversation context, and the active support channel target.
    function renderSupport() {
        const nextStep = state.dashboard.nextStep || {};
        const application = state.dashboard.application || {};
        state.nextStepPath = nextStep.actionPath || null;

        setText('nextStepTitle', sanitizeApplicantWording(nextStep.title || 'Complete your applicant profile'));
        setText('nextStepDescription', workflowActionDescription(nextStep.actionPath, nextStep.description || 'The next required action will appear here.'));
        setText('supportGuidanceTitle', 'Guidance for your current step');
        setText(
            'supportGuidanceText',
            application?.status
                ? `${workflowActionDescription(nextStep.actionPath, nextStep.description || 'The next required action will appear here.')} Current application status: ${application.status}.`
                : 'Your next required action will appear here once your applicant record updates.'
        );

        const nextStepAction = document.getElementById('nextStepAction');
        if (nextStepAction) {
            nextStepAction.textContent = workflowActionLabel(nextStep.actionPath, nextStep.actionLabel || 'Refresh dashboard');
            nextStepAction.disabled = !nextStep.actionPath;
        }
    }

    async function loadSupportChat(silent = false) {
        const stream = document.getElementById('supportChatMessages');
        if (!stream) {
            return;
        }

        try {
            const payload = await fetchJson(`api/support-chat/messages?recipient=${encodeURIComponent(state.supportRecipient)}`);
            renderSupportChat(payload.messages || []);
            setSupportChatStatus('');
        } catch (error) {
            if (!silent) {
                setSupportChatStatus(error.message || 'Unable to load chat messages.');
            }
        }
    }

    async function handleSupportChatSubmit(event) {
        event.preventDefault();
        const input = document.getElementById('supportChatInput');
        const message = String(input?.value || '').trim();
        if (!message) {
            return;
        }

        setSupportChatStatus('Sending...');
        try {
            const payload = await fetchJson('api/support-chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: state.supportRecipient,
                    message,
                }),
            });
            if (input) {
                input.value = '';
            }
            renderSupportChat(payload.messages || []);
            setSupportChatStatus('Message sent.');
        } catch (error) {
            setSupportChatStatus(error.message || 'Unable to send your message.');
        }
    }

    function renderSupportChat(messages) {
        const stream = document.getElementById('supportChatMessages');
        if (!stream) {
            return;
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            stream.innerHTML = '<p class="support-chat__empty">Messages from your support team will appear here.</p>';
            return;
        }

        stream.innerHTML = messages.map((message) => `
            <article class="support-chat__message ${message.isOwn ? 'is-own' : ''}">
                <strong>${escapeHtml(message.senderName || 'SMART LEAP support')}</strong>
                <p>${escapeHtml(message.body || '')}</p>
                <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
            </article>
        `).join('');
        stream.scrollTop = stream.scrollHeight;
    }

    function setSupportChatStatus(message) {
        const status = document.getElementById('supportChatStatus');
        if (status) {
            status.textContent = message || '';
        }
    }

    function startSupportChatPolling() {
        if (state.supportChatTimer || !document.getElementById('supportChatMessages')) {
            return;
        }

        state.supportChatTimer = window.setInterval(() => {
            if ((window.location.hash || '#dashboard-home').replace('#', '') === 'support-page') {
                loadSupportChat(true);
            }
        }, 10000);
    }

    function renderJourney() {
        const profile = state.dashboard.profile || {};
        const application = state.dashboard.application || {};
        const training = state.dashboard.training || {};
        const certificate = state.dashboard.certificate || {};

        setJourneyState('journeyStepProfile', (profile.completionPercent || 0) >= 100 ? 'complete' : 'current');

        const applicationStatus = String(application.status || '').toLowerCase();
        const applicationReady = ['approved', 'for training', 'training', 'completed'].includes(applicationStatus);
        setJourneyState('journeyStepAplikasyon', applicationReady ? 'complete' : ((profile.completionPercent || 0) >= 100 ? 'current' : 'upcoming'));

        const trainingSummary = training.summary || {};
        const trainingStarted = (training.invitees || []).length > 0;
        const trainingComplete = (trainingSummary.totalPrograms || 0) > 0 && (trainingSummary.completed || 0) >= (trainingSummary.totalPrograms || 0);
        setJourneyState('journeyStepTraining', trainingComplete ? 'complete' : (trainingStarted ? 'current' : 'upcoming'));
        setJourneyState('journeyStepSertipiko', certificate.eligible ? 'complete' : (trainingComplete ? 'current' : 'upcoming'));
    }

    function renderAlerts() {
        const list = document.getElementById('applicantAlertList');
        if (!list) {
            return;
        }

        const requirements = state.dashboard.requirements || [];
        const application = state.dashboard.application || {};
        const training = state.dashboard.training || {};
        const alerts = [];

        const requirementIssue = requirements.find((item) => isRequirementIssue(item.status) || String(item.status || '').toLowerCase() === 'missing');
        if (requirementIssue) {
            alerts.push({
                label: 'Requirement',
                title: requirementIssue.label || requirementIssue.key || 'Requirement needs attention',
                copy: String(requirementIssue.status || '').toLowerCase() === 'missing'
                    ? 'A required file is still missing from your application.'
                    : `Current requirement status: ${normalizeRequirementStatus(requirementIssue.status)}.`,
            });
        }

        const latestRemark = (application.remarks || [])[0];
        if (latestRemark) {
            alerts.push({
                label: 'Reviewer remark',
                title: latestRemark.actorName || 'CSWDD',
                copy: truncateText(latestRemark.comment || 'Applicant-visible reviewer note available.', 120),
            });
        }

        if (training.nextSession) {
            alerts.push({
                label: 'Training schedule',
                title: training.nextSession.program?.programName || 'Upcoming session',
                copy: buildTrainingMeta(training.nextSession),
            });
        }

        const certificate = state.dashboard.certificate || {};
        if (certificate.eligible) {
            alerts.push({
                label: 'Certificate',
                title: 'Certificate ready',
                copy: 'Your certificate is ready to download from the Training page.',
            });
        }

        if (alerts.length === 0) {
            list.innerHTML = '<li class="attention-list__empty">Important updates will appear here while your application moves forward.</li>';
            return;
        }

        list.innerHTML = alerts.slice(0, 4).map((item) => `
            <li class="attention-item">
                <span class="attention-item__label">${escapeHtml(item.label)}</span>
                <strong class="attention-item__title">${escapeHtml(item.title)}</strong>
                <p class="attention-item__copy">${escapeHtml(item.copy)}</p>
            </li>
        `).join('');
    }

    function renderTrainingChecklist(invitees) {
        const list = document.getElementById('trainingChecklist');
        if (!list) {
            return;
        }

        if (invitees.length === 0) {
            list.innerHTML = '<li class="empty">No training sessions have been assigned yet.</li>';
            return;
        }

        list.innerHTML = invitees.map((invitee) => `
            <li>
                <span>${escapeHtml(invitee.program?.programName || 'Training session')}</span>
                <span>${escapeHtml(invitee.status || 'Not Scheduled')}</span>
            </li>
        `).join('');
    }

    function renderTrainingSchedule(invitees) {
        const grid = document.getElementById('trainingScheduleGrid');
        if (!grid) {
            return;
        }

        if (invitees.length === 0) {
            grid.innerHTML = '<article class="training-schedule-empty">No training schedule yet. Wait for notice updates from CSWDD.</article>';
            return;
        }

        grid.innerHTML = invitees.map((invitee) => {
            const program = invitee.program || {};
            return `
                <article class="training-schedule-card">
                    <span class="training-schedule-label">${escapeHtml(invitee.status || 'Not Scheduled')}</span>
                    <h3>${escapeHtml(program.programName || 'Training session')}</h3>
                    <div class="training-schedule-meta">
                        <span>${escapeHtml(formatDate(program.startsAt))}</span>
                        <span>${escapeHtml(formatTimeRange(program.startsAt, program.endsAt))}</span>
                        <span>${escapeHtml(program.venue || 'Venue to be announced')}</span>
                    </div>
                    <div class="training-schedule-status">
                        <span>${escapeHtml(program.whatToBring || 'No what-to-bring note yet.')}</span>
                    </div>
                    <div class="muted">${escapeHtml(program.instructions || 'No additional instructions yet.')}</div>
                </article>
            `;
        }).join('');
    }

    function trainingProofMarkup(invitee) {
        const proof = invitee?.proofAttachment || null;
        if (proof?.filePath) {
            return `<a class="action-link" href="${escapeHtml(routeUrl(proof.filePath))}" target="_blank" rel="noopener">${escapeHtml(proof.originalName || 'View proof')}</a>`;
        }

        const needsProof = ['Absent', 'Excused', 'Missed'].includes(String(invitee?.status || ''));
        if (!needsProof) {
            return 'No proof required';
        }

        return `
            <label class="attendance-proof-upload">
                <span>Upload proof required</span>
                <input type="file" data-training-proof-upload="${escapeHtml(String(invitee?.id || ''))}" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf">
            </label>
        `;
    }

    async function handleApplicantTrainingProofUpload(event) {
        const input = event.target?.closest?.('[data-training-proof-upload]');
        if (!input || !(input instanceof HTMLInputElement)) {
            return;
        }

        const trainingInviteeId = Number.parseInt(input.getAttribute('data-training-proof-upload') || '0', 10);
        const file = input.files?.[0] || null;
        if (!trainingInviteeId || !file) {
            return;
        }

        const formData = new FormData();
        formData.append('trainingInviteeId', String(trainingInviteeId));
        formData.append('proofAttachment', file);

        input.disabled = true;
        try {
            await fetchJson('api/training/attendance-proof', {
                method: 'POST',
                body: formData,
            });
            showToast('Attendance proof uploaded.', 'success');
            await loadDashboardState();
        } catch (error) {
            showToast(error.message || 'Unable to upload attendance proof.', 'warning');
            input.value = '';
            input.disabled = false;
        }
    }

    function renderAttendanceTable(invitees) {
        const body = document.getElementById('attendanceTableBody');
        const cardList = document.getElementById('attendanceCardList');
        if (!body) {
            return;
        }

        if (invitees.length === 0) {
            body.innerHTML = '<tr class="empty"><td colspan="5">Attendance updates will appear once sessions are assigned.</td></tr>';
            if (cardList) {
                cardList.innerHTML = '<article class="attendance-card attendance-card--empty">Attendance updates will appear once sessions are assigned.</article>';
            }
            return;
        }

        const rows = invitees.map((invitee) => {
            const program = invitee.program || {};
            const proofMarkup = trainingProofMarkup(invitee);
            return `
                <tr>
                    <td>
                        <div class="table-primary">${escapeHtml(program.programName || 'Training session')}</div>
                        <div class="table-secondary">${escapeHtml(program.venue || 'Venue TBA')}</div>
                    </td>
                    <td>
                        <div>${escapeHtml(formatDate(program.startsAt))}</div>
                        <small class="table-secondary">${escapeHtml(formatTimeRange(program.startsAt, program.endsAt))}</small>
                    </td>
                    <td><span class="badge-status ${attendanceBadgeClass(invitee.status)}">${escapeHtml(invitee.status || 'Not Scheduled')}</span></td>
                    <td>${escapeHtml(invitee.remarks || 'No remarks yet.')}</td>
                    <td>${escapeHtml(buildNoticeMeta(invitee))}<br><small class="table-secondary">Proof: ${proofMarkup}</small></td>
                </tr>
            `;
        }).join('');

        body.innerHTML = rows;

        if (cardList) {
            cardList.innerHTML = invitees.map((invitee) => {
                const program = invitee.program || {};
                const proofMarkup = trainingProofMarkup(invitee);
                return `
                    <article class="attendance-card">
                        <div class="attendance-card__top">
                            <strong>${escapeHtml(program.programName || 'Training session')}</strong>
                            <span class="badge-status ${attendanceBadgeClass(invitee.status)}">${escapeHtml(invitee.status || 'Not Scheduled')}</span>
                        </div>
                        <p class="attendance-card__meta">${escapeHtml(formatDate(program.startsAt))} | ${escapeHtml(formatTimeRange(program.startsAt, program.endsAt))}</p>
                        <p class="attendance-card__meta">${escapeHtml(program.venue || 'Venue TBA')}</p>
                        <p class="attendance-card__copy">${escapeHtml(invitee.remarks || 'No remarks yet.')}</p>
                        <p class="attendance-card__hint">Proof: ${proofMarkup}</p>
                        <p class="attendance-card__hint">${escapeHtml(buildNoticeMeta(invitee))}</p>
                    </article>
                `;
            }).join('');
        }
    }

    function renderTimelineList(id, items, renderer, emptyCopy) {
        const list = document.getElementById(id);
        if (!list) {
            return;
        }

        if (!items || items.length === 0) {
            list.innerHTML = `<li class="empty">${escapeHtml(emptyCopy)}</li>`;
            return;
        }

        list.innerHTML = items.map(renderer).join('');
    }

    function renderHistoryItem(item) {
        const transition = item.fromStatus
            ? `${item.fromStatus} -> ${item.toStatus}`
            : item.toStatus;

        return `
            <li>
                <div class="timeline-main">
                    <div class="timeline-title">${escapeHtml(transition)}</div>
                    <div class="timeline-copy">${escapeHtml(item.remarks || 'No remarks recorded for this status update.')}</div>
                </div>
                <div class="timeline-meta">${escapeHtml(item.actorName || 'System')} | ${escapeHtml(formatDateTime(item.createdAt))}</div>
            </li>
        `;
    }

    function renderRemarkItem(item) {
        return `
            <li>
                <div class="timeline-main">
                    <div class="timeline-title">${escapeHtml(item.actorName || 'CSWDD')}</div>
                    <div class="timeline-copy">${escapeHtml(item.comment || 'No remark text.')}</div>
                </div>
                <div class="timeline-meta">${escapeHtml(formatDateTime(item.createdAt))}</div>
            </li>
        `;
    }

    function renderFatalState(message) {
        showToast(message, 'warning');
        document.querySelectorAll('.dash-page').forEach((page) => {
            page.classList.add('is-route-hidden');
        });
        const dashboardHome = document.getElementById('dashboard-home');
        dashboardHome?.classList.remove('is-route-hidden');
        if (dashboardHome) {
            dashboardHome.innerHTML = `
                <div class="panel-header">
                    <h2>Applicant dashboard unavailable</h2>
                    <p class="panel-subtitle">${escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    function showPortalLoader(copy) {
        const loader = document.getElementById('portalLoader');
        const copyNode = document.getElementById('portalLoaderCopy');
        if (!loader) {
            return;
        }

        if (copyNode && copy) {
            copyNode.textContent = copy;
        }

        state.loaderStartedAt = Date.now();
        loader.hidden = false;
        document.body.classList.remove('portal-ready');
    }

    function hidePortalLoader() {
        const loader = document.getElementById('portalLoader');
        if (!loader) {
            document.body.classList.add('portal-ready');
            return;
        }

        loader.setAttribute('hidden', 'hidden');
        document.body.classList.add('portal-ready');
    }

    function markPortalReady() {
        document.body.classList.add('portal-ready');
        const remaining = Math.max(0, PORTAL_LOADER_MIN_MS - (Date.now() - state.loaderStartedAt));
        window.setTimeout(hidePortalLoader, remaining);
    }

    async function handleLogout() {
        showPortalLoader('Signing you out of SMART LEAP...');
        try {
            const payload = await fetchJson('auth/logout', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({ entryPoint: 'portal' }).toString(),
            });
            const remaining = Math.max(0, PORTAL_LOADER_MIN_MS - (Date.now() - state.loaderStartedAt));
            window.setTimeout(() => {
                window.location.href = routeUrl(payload.redirect || 'portal');
            }, remaining);
        } catch (error) {
            hidePortalLoader();
            showToast(error.message || 'Dili makagawas karon.', 'warning');
        }
    }

    async function fetchJson(path, options = {}) {
        const response = await fetch(routeUrl(path), {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            if (response.redirected) {
                window.location.href = response.url;
                throw new Error('Nag-redirect...');
            }

            throw new Error(`Unexpected response from ${path}.`);
        }

        const payload = await response.json();
        if (!response.ok) {
            if (payload.redirect) {
                window.location.href = routeUrl(payload.redirect);
                throw new Error('Nag-redirect...');
            }

            throw new Error(payload.message || 'Napakyas ang request.');
        }

        if (payload.redirect) {
            window.location.href = routeUrl(payload.redirect);
            throw new Error('Nag-redirect...');
        }

        return payload;
    }

    function applyRouteVisibility() {
        const pages = Array.from(document.querySelectorAll('.dash-page'));
        const routeMap = {
            overview: 'dashboard-home',
            'dashboard-home': 'dashboard-home',
            'profile-page': 'profile-page',
            'requirements-progress': 'application-page',
            'application-status': 'application-page',
            'application-page': 'application-page',
            'training-progress': 'training-page',
            'training-page': 'training-page',
            'support-panel': 'support-page',
            'support-chat': 'support-page',
            'support-page': 'support-page',
        };
        const rawHash = (window.location.hash || '#dashboard-home').replace('#', '');
        const targetId = routeMap[rawHash] || 'dashboard-home';
        const target = document.getElementById(targetId) || document.getElementById('dashboard-home');

        pages.forEach((page) => {
            page.classList.toggle('is-route-hidden', page !== target);
        });

        document.querySelectorAll('.sidebar-link').forEach((link) => {
            const href = (link.getAttribute('href') || '').replace('#', '');
            link.classList.toggle('is-active', href === target?.id);
        });
        document.querySelectorAll('.applicant-tabbar__link').forEach((link) => {
            const href = (link.getAttribute('href') || '').replace('#', '');
            link.classList.toggle('is-active', href === target?.id);
        });

        const activeLink = Array.from(document.querySelectorAll('.sidebar-link')).find((link) => link.classList.contains('is-active')) || null;
        updateMobileTopbarTitle(activeLink, target?.id || 'dashboard-home');
        syncSidebarMenuState();
    }

    function openSection(id) {
        const targetId = id || 'dashboard-home';
        const nextHash = `#${targetId}`;
        if (window.location.hash === nextHash) {
            applyRouteVisibility();
            return;
        }
        window.location.hash = nextHash;
    }

    function navigateToPath(path) {
        if (!path) {
            return;
        }

        if (isProfileEditorPath(path)) {
            openSection('profile-page');
            return;
        }

        window.location.href = routeUrl(path);
    }

    function toggleSidebarMenu() {
        const sidebar = document.querySelector('.dash-sidebar');
        if (!sidebar) {
            return;
        }

        closeApplicantAccountSheet();
        sidebar.classList.toggle('is-open');
        syncSidebarMenuState();
    }

    function closeSidebarMenuOnMobile() {
        if (window.innerWidth > 960) {
            return;
        }

        const sidebar = document.querySelector('.dash-sidebar');
        sidebar?.classList.remove('is-open');
        syncSidebarMenuState();
    }

    function handleGlobalKeydown(event) {
        if (event.key === 'Escape') {
            closeApplicantAccountSheet();
            closeSidebarMenuOnMobile();
        }
    }

    function handleWorkspaceShortcuts(event) {
        const origin = event.target instanceof Element
            ? event.target
            : (event.target && event.target.parentElement ? event.target.parentElement : null);
        const onlineFormTrigger = origin ? origin.closest('[data-online-form-link]') : null;
        if (onlineFormTrigger) {
            event.preventDefault();
            const targetUrl = String(onlineFormTrigger.dataset.onlineFormLink || '').trim();
            if (targetUrl) {
                window.location.href = targetUrl;
            }
            return;
        }

        const profileTrigger = origin ? origin.closest('[data-open-profile-editor]') : null;
        if (profileTrigger) {
            event.preventDefault();
            openSection('profile-page');
            return;
        }

        const backHomeTrigger = origin ? origin.closest('[data-open-dashboard-home]') : null;
        if (backHomeTrigger) {
            event.preventDefault();
            openSection('dashboard-home');
            return;
        }

        const applicationTrigger = origin ? origin.closest('[data-open-application-workspace]') : null;
        if (applicationTrigger) {
            event.preventDefault();
            openSection('application-page');
        }
    }

    function syncSidebarMenuState() {
        const sidebar = document.querySelector('.dash-sidebar');
        const toggle = document.getElementById('sidebarToggle');
        const overlay = document.getElementById('sidebarOverlay');
        const closeButton = document.getElementById('sidebarClose');
        if (!sidebar || !toggle) {
            return;
        }

        if (window.innerWidth > 960) {
            sidebar.classList.remove('is-open');
            document.body.classList.remove('drawer-open');
            toggle.setAttribute('aria-expanded', 'false');
            overlay?.classList.remove('is-visible');
            overlay?.setAttribute('aria-hidden', 'true');
            sidebar.removeAttribute('aria-modal');
            sidebar.removeAttribute('aria-hidden');
            closeButton?.setAttribute('tabindex', '-1');
            return;
        }

        const isOpen = sidebar.classList.contains('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        overlay?.classList.toggle('is-visible', isOpen);
        overlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (isOpen) {
            sidebar.setAttribute('aria-modal', 'true');
        } else {
            sidebar.removeAttribute('aria-modal');
        }
        document.body.classList.toggle('drawer-open', isOpen);
        closeButton?.setAttribute('tabindex', isOpen ? '0' : '-1');
    }

    function bindApplicantAccountSheet() {
        document.getElementById('applicantAccountToggle')?.addEventListener('click', toggleApplicantAccountSheet);
        document.getElementById('applicantAccountClose')?.addEventListener('click', () => closeApplicantAccountSheet());
        document.getElementById('applicantAccountProfile')?.addEventListener('click', (event) => {
            runApplicantAccountSheetAction(event, () => openSection('profile-page'));
        });
        document.getElementById('applicantAccountPassword')?.addEventListener('click', (event) => {
            runApplicantAccountSheetAction(event, openChangePasswordModal);
        });
        document.getElementById('applicantAccountLogout')?.addEventListener('click', (event) => {
            runApplicantAccountSheetAction(event, handleLogout);
        });
    }

    function toggleApplicantAccountSheet(event) {
        event?.preventDefault();
        event?.stopPropagation();
        const sheet = document.getElementById('applicantAccountSheet');
        if (!sheet) {
            return;
        }
        if (!state.accountSheetOpen) {
            document.dispatchEvent(new CustomEvent('smartleap:close-notifications'));
            openApplicantAccountSheet();
            return;
        }
        closeApplicantAccountSheet();
    }

    function openApplicantAccountSheet() {
        const sheet = document.getElementById('applicantAccountSheet');
        const toggle = document.getElementById('applicantAccountToggle');
        if (!sheet || !toggle) {
            return;
        }

        state.accountSheetOpen = true;
        sheet.hidden = false;
        sheet.style.display = 'grid';
        sheet.setAttribute('aria-hidden', 'false');
        toggle.setAttribute('aria-expanded', 'true');
    }

    function closeApplicantAccountSheet() {
        const sheet = document.getElementById('applicantAccountSheet');
        const toggle = document.getElementById('applicantAccountToggle');
        if (!state.accountSheetOpen && (!sheet || sheet.hidden)) {
            toggle?.setAttribute('aria-expanded', 'false');
            return;
        }
        state.accountSheetOpen = false;
        const activeElement = document.activeElement;
        if (sheet && activeElement instanceof HTMLElement && sheet.contains(activeElement)) {
            activeElement.blur();
            toggle?.focus({ preventScroll: true });
        }
        if (sheet) {
            sheet.hidden = true;
            sheet.style.display = 'none';
            sheet.setAttribute('aria-hidden', 'true');
        }
        toggle?.setAttribute('aria-expanded', 'false');
    }

    function runApplicantAccountSheetAction(event, callback) {
        event?.preventDefault();
        event?.stopPropagation();
        event?.currentTarget?.blur?.();
        closeApplicantAccountSheet();
        callback?.();
    }

    function handleApplicantAccountOutsideClick(event) {
        if (!state.accountSheetOpen) {
            return;
        }

        const target = event.target;
        const sheet = document.getElementById('applicantAccountSheet');
        const toggle = document.getElementById('applicantAccountToggle');
        if (!(target instanceof Node)) {
            return;
        }
        if (sheet?.contains(target) || toggle?.contains(target)) {
            return;
        }

        closeApplicantAccountSheet();
    }

    function updateMobileTopbarTitle(activeLink, routeId) {
        const title = document.getElementById('mobileTopbarTitle');
        if (!title) {
            return;
        }
        const keyMap = {
            'dashboard-home': 'overview',
            'profile-page': 'profile',
            'application-page': 'application',
            'training-page': 'training',
            'support-page': 'support',
        };
        const activeKey = keyMap[routeId] || 'overview';
        title.dataset.i18nKey = activeKey;
        const translatedLabel = window.SMARTLEAP_I18N?.translate?.(activeKey);
        const linkLabel = activeLink?.querySelector('span:last-child')?.textContent?.trim();
        const fallbackMap = {
            'dashboard-home': 'Overview',
            'profile-page': 'Profile',
            'application-page': 'Application',
            'training-page': 'Training',
            'support-page': 'Support',
        };
        title.textContent = translatedLabel || linkLabel || fallbackMap[routeId] || 'Overview';
    }

    function routeUrl(path) {
        const base = state.baseUrl || '';
        return `${base}/${String(path || '').replace(/^\/+/, '')}`;
    }

    function isProfileEditorPath(path) {
        const normalized = String(path || '').trim().toLowerCase().replace(/^\/+/, '');
        return normalized === 'applicant-dashboard#profile-page'
            || normalized === 'applicant-dashboard/?welcome=1#profile-page'
            || normalized === 'applicant-dashboard?welcome=1#profile-page'
            || normalized.endsWith('#profile-page');
    }

    // Reusable password-change modal opened from both desktop and mobile account actions.
    function openChangePasswordModal() {
        closeCenteredModal();
        const modal = document.createElement('div');
        modal.className = 'beneficiary-centered-modal';
        modal.dataset.centeredModal = 'true';
        modal.innerHTML = `
            <div class="beneficiary-centered-modal__backdrop" data-close-centered-modal></div>
            <div class="beneficiary-centered-modal__card applicant-password-modal" role="dialog" aria-modal="true" aria-labelledby="applicantPasswordTitle">
                <button type="button" class="beneficiary-centered-modal__close" data-close-centered-modal aria-label="Close">&times;</button>
                <div class="beneficiary-centered-modal__header applicant-password-modal__header">
                    <div class="applicant-password-modal__eyebrow">Account Security</div>
                    <h3 id="applicantPasswordTitle">Change Password</h3>
                    <p>Update your portal password securely. Enter your current password first, then choose a new one that is easy for you to remember and hard for others to guess.</p>
                    <div class="applicant-password-modal__tip" aria-hidden="true">
                        <span class="applicant-password-modal__tip-badge">8+ characters</span>
                        <span class="applicant-password-modal__tip-copy">Use a mix of uppercase, lowercase, and numbers.</span>
                    </div>
                </div>
                <form id="applicantChangePasswordForm" class="beneficiary-centered-modal__form applicant-password-modal__form">
                    <label class="form-field applicant-password-modal__field">
                        <span class="applicant-password-modal__label">Current password</span>
                        <input type="password" name="currentPassword" class="applicant-password-modal__input" autocomplete="current-password" required>
                    </label>
                    <label class="form-field applicant-password-modal__field">
                        <span class="applicant-password-modal__label">New password</span>
                        <input type="password" name="newPassword" class="applicant-password-modal__input" autocomplete="new-password" required minlength="8">
                        <small class="applicant-password-modal__hint">Choose at least 8 characters for better security.</small>
                    </label>
                    <label class="form-field applicant-password-modal__field">
                        <span class="applicant-password-modal__label">Confirm new password</span>
                        <input type="password" name="confirmPassword" class="applicant-password-modal__input" autocomplete="new-password" required minlength="8">
                    </label>
                    <div class="notice error" id="applicantPasswordError" hidden></div>
                    <div class="beneficiary-centered-modal__actions applicant-password-modal__actions">
                        <button type="button" class="btn-outline" data-close-centered-modal>Back</button>
                        <button type="submit" class="btn-primary">Save Password</button>
                    </div>
                </form>
            </div>
        `;
        modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-close-centered-modal]')) {
                closeCenteredModal();
            }
        });
        modal.querySelector('#applicantChangePasswordForm')?.addEventListener('submit', submitChangePassword);
        document.body.appendChild(modal);
    }

    function closeCenteredModal() {
        document.querySelector('[data-centered-modal="true"]')?.remove();
    }

    async function submitChangePassword(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const errorNode = document.getElementById('applicantPasswordError');
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        if (errorNode) {
            errorNode.hidden = true;
            errorNode.textContent = '';
        }

        const formData = new URLSearchParams();
        formData.set('currentPassword', String(form.currentPassword?.value || ''));
        formData.set('newPassword', String(form.newPassword?.value || ''));
        formData.set('confirmPassword', String(form.confirmPassword?.value || ''));

        try {
            const response = await fetch(routeUrl('account/change-password'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                },
                credentials: 'same-origin',
                body: formData.toString(),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || 'Unable to change password.');
            }
            showToast(payload.message || 'Password updated.', 'success');
            closeCenteredModal();
        } catch (error) {
            if (errorNode) {
                errorNode.hidden = false;
                errorNode.textContent = error.message || 'Unable to change password.';
            }
        } finally {
            submitButton.disabled = false;
        }
    }

    function workflowActionLabel(path, fallback) {
        if (isProfileEditorPath(path)) {
            return window.SMARTLEAP_I18N?.translatePhrase?.('Edit Profile') || 'Edit Profile';
        }

        return fallback;
    }

    function workflowActionDescription(path, fallback) {
        if (isProfileEditorPath(path)) {
            return 'Open your Profile page to update your personal details. Use Application for uploads, review, and submission.';
        }

        return sanitizeApplicantWording(fallback);
    }

    function buildTaskProgressText(task) {
        const normalized = String(task.status || '').toLowerCase();
        if (normalized === 'verified') return 'Done';
        if (normalized === 'submitted') return 'Sent and waiting for review';
        if (normalized === 'needs correction') return 'Needs correction before it can move forward';
        if (normalized === 'rejected') return 'Returned for changes';
        if (normalized === 'locked') return 'Waiting for the earlier requirement';
        return `${task.completion || 0}% complete`;
    }

    function buildTaskPrimaryState(task) {
        const normalized = String(task.status || '').toLowerCase();
        if (normalized === 'verified') return 'Done';
        if (task.interactive) return 'Available now';
        return 'Waiting for earlier step';
    }

    function setJourneyState(id, stateName) {
        const node = document.getElementById(id);
        if (!node) {
            return;
        }

        node.dataset.state = stateName || 'upcoming';
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) {
            node.textContent = value ?? '';
        }
    }

    function setTexts(ids, value) {
        ids.forEach((id) => setText(id, value));
    }

    function formatDate(value) {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatTimeRange(start, end) {
        if (!start && !end) {
            return '--';
        }

        const parts = [start, end].map((value) => {
            const date = value ? new Date(value) : null;
            if (!date || Number.isNaN(date.getTime())) {
                return '--';
            }
            return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
        });

        return `${parts[0]} - ${parts[1]}`;
    }

    function buildFormRequirementSchedule(task, fallbackSchedule = null) {
        const schedule = task?.schedule || {};
        const openedAt = schedule.openedAt || fallbackSchedule?.openedAt || task?.startedAt || '';
        const closesAt = task?.dueDate || schedule.closesAt || fallbackSchedule?.closesAt || '';
        const programTitle = schedule.programTitle || '';

        return {
            openedAt,
            closesAt,
            openedText: openedAt ? `Opened: ${formatDateTime(openedAt)}` : 'Opened: Waiting for admin schedule',
            closesText: closesAt ? `Closes: ${formatDateTime(closesAt)}` : 'Closes: No close time set yet',
            remainingText: buildCountdownText(closesAt, programTitle),
        };
    }

    function buildCountdownText(closesAt, label = '') {
        if (!closesAt) {
            return 'No countdown available';
        }

        const deadline = new Date(closesAt).getTime();
        if (Number.isNaN(deadline)) {
            return `Closes on ${closesAt}`;
        }

        const diff = deadline - Date.now();
        if (diff <= 0) {
            return 'Closed';
        }

        const totalMinutes = Math.ceil(diff / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);

        return `Time left: ${parts.join(' ')}`;
    }

    function renderFormRequirementCountdowns() {
        document.querySelectorAll('[data-form-countdown]').forEach((node) => {
            const deadline = node.getAttribute('data-form-countdown') || '';
            const countdown = node.querySelector('strong');
            if (countdown) {
                countdown.textContent = buildCountdownText(deadline);
            }
        });
    }

    function normalizeRequirementStatus(status) {
        const value = String(status || 'missing').trim().toLowerCase();
        if (value === 'verified') return 'Verified';
        if (value === 'pending') return 'Pending';
        if (value === 'missing') return 'Missing';
        if (value === 'flagged') return 'Flagged';
        if (value === 'rejected') return 'Rejected';
        if (value === 'needs correction' || value === 'needs_correction') return 'Needs Correction';
        return status || 'Pending';
    }

    function requirementStatusClass(status) {
        const value = normalizeRequirementStatus(status).toLowerCase();
        if (value === 'verified') return 'requirement-status--complete';
        if (value === 'missing') return 'requirement-status--missing';
        if (value === 'flagged' || value === 'rejected' || value === 'needs correction') return 'requirement-status--issue';
        return 'requirement-status--pending';
    }

    function isRequirementIssue(status) {
        return ['flagged', 'rejected', 'needs correction', 'needs_correction'].includes(String(status || '').toLowerCase());
    }

    function buildOverviewStatusNote(application) {
        if (!application) {
            return 'Complete profile completion first so your application enters the review workflow.';
        }

        const dates = [];
        if (application.submittedAt) {
            dates.push(`Submitted ${formatDate(application.submittedAt)}`);
        }
        if (application.reviewedAt) {
            dates.push(`Last reviewed ${formatDate(application.reviewedAt)}`);
        }
        return dates.join(' | ') || 'Application is waiting for the next workflow update.';
    }

    function buildTrainingOverviewNote(summary, training) {
        if ((summary.totalPrograms || 0) === 0) {
            return 'No training schedule has been assigned yet.';
        }

        if ((summary.completed || 0) > 0) {
            return `${summary.completed} completed session${summary.completed === 1 ? '' : 's'} recorded.`;
        }

        if ((summary.notified || 0) > 0) {
            return `${summary.notified} session notice${summary.notified === 1 ? ' has' : 's have'} been sent.`;
        }

        if (training.nextSession) {
            return `Next session: ${formatDate(training.nextSession.program?.startsAt)}.`;
        }

        return 'Training activity is available in your applicant record.';
    }

    function buildAplikasyonDateMeta(application) {
        if (!application) {
            return 'Application has not been submitted yet.';
        }

        const parts = [];
        if (application.submittedAt) {
            parts.push(`Submitted ${formatDate(application.submittedAt)}`);
        }
        if (application.reviewedAt) {
            parts.push(`Reviewed ${formatDate(application.reviewedAt)}`);
        }
        if (application.updatedAt) {
            parts.push(`Updated ${formatDate(application.updatedAt)}`);
        }
        return parts.join(' | ') || 'Awaiting workflow timestamps.';
    }

    function buildProfileAplikasyonNote(application) {
        if (!application || !application.status || application.status === 'Draft') {
            return 'Keep these details updated before you upload or submit application requirements.';
        }

        return 'Your Application page uses the same profile details shown here.';
    }

    function sanitizeSertipikoNote(note) {
        return sanitizeApplicantWording(note)
            .replace(/verified application forms/gi, 'verified application requirements')
            .replace(/application forms/gi, 'application requirements');
    }

    function buildAplikasyonNextStepSummary(application, latestRemark) {
        if (latestRemark?.comment) {
            return truncateText(latestRemark.comment, 120);
        }

        const status = String(application?.status || '').toLowerCase();
        if (status === 'draft') {
            return 'Upload your required files, then submit them for PDO/Admin verification.';
        }
        if (status.includes('checked') || status.includes('review')) {
            return 'Wait for the latest review result and check if any requirement needs fixing.';
        }
        if (status.includes('approved')) {
            return 'Your application is approved. Open Training to check scheduled sessions and available fill-up forms.';
        }
        return 'Complete any missing upload requirement and submit it for review.';
    }

    function sanitizeApplicantWording(text) {
        return String(text || '')
            .replace(/post-approval compliance/gi, 'application requirements')
            .replace(/post-approval phase/gi, 'application requirements')
            .replace(/post-approval tasks/gi, 'application requirements')
            .replace(/post-approval forms/gi, 'application requirements')
            .replace(/application forms/gi, 'application requirements')
            .replace(/compliance/gi, 'requirements')
            .replace(/applicant workspace/gi, 'beneficiary portal')
            .replace(/applicant dashboard/gi, 'beneficiary portal')
            .replace(/applicant record/gi, 'beneficiary record')
            .replace(/applicant-visible/gi, 'beneficiary-visible')
            .replace(/applicant/gi, 'beneficiary');
    }

    function buildTrainingMeta(invitee) {
        const program = invitee.program || {};
        const parts = [
            formatDate(program.startsAt),
            formatTimeRange(program.startsAt, program.endsAt),
            program.venue || '',
        ].filter(Boolean);
        return parts.join(' | ');
    }

    function findFormSessionInfo(code) {
        const normalizedCode = String(code || '').toLowerCase();
        const invitees = state.dashboard?.training?.invitees || [];
        const index = invitees.findIndex((invitee) => {
            const codes = invitee.program?.seminarFormCodes || [];
            return codes.map((value) => String(value || '').toLowerCase()).includes(normalizedCode);
        });

        if (index < 0) {
            return {
                label: 'No session yet',
                title: '',
                meta: '',
                opened: false,
            };
        }

        const invitee = invitees[index];
        return {
            label: `Session ${index + 1}`,
            title: invitee.program?.programName || 'Training session',
            meta: buildTrainingMeta(invitee),
            opened: true,
        };
    }

    function buildNoticeMeta(invitee) {
        if (invitee.lastNoticeSentAt) {
            return `Last sent ${formatDateTime(invitee.lastNoticeSentAt)}`;
        }
        if (invitee.notifiedAt) {
            return `Notified ${formatDateTime(invitee.notifiedAt)}`;
        }
        return 'No notice sent yet';
    }

    function buildRequirementHelpText(item) {
        const label = String(item.label || item.key || 'requirement').toLowerCase();
        if (label.includes('id')) return 'Make sure the file is clear and the name matches your current details.';
        if (label.includes('barangay')) return 'This helps confirm your current address and local residency.';
        if (label.includes('certificate')) return 'Upload a readable copy so the reviewer can check it quickly.';
        return 'This file is needed before your application can move to the next step.';
    }

    function buildFormAccomplishmentState(task, statusText) {
        const normalizedStatus = String(task?.status || statusText || '').toLowerCase();
        const accomplished = ['verified', 'approved', 'completed'].includes(normalizedStatus)
            || String(statusText || '').toLowerCase() === 'approved';
        return {
            label: accomplished ? 'Accomplished' : 'Not accomplished',
            className: accomplished ? 'is-accomplished' : 'is-not-accomplished',
        };
    }

    function normalizeFormCardStatus(task) {
        if (!task) return 'Locked';
        const raw = String(task?.status || '').toLowerCase();
        if (['verified', 'approved', 'completed'].includes(raw)) return 'Approved';
        if (raw === 'locked') return 'Locked';
        if (raw === 'submitted') return 'Submitted';
        if (task?.file?.url) return 'Hardcopy uploaded';
        if (raw === 'in progress') return 'In progress';
        if (['needs correction', 'rejected'].includes(raw)) return 'Needs correction';
        return task?.interactive ? 'Ready online' : 'Locked';
    }

    function formCardStatusClass(status) {
        const value = String(status || '').toLowerCase();
        if (value === 'approved') return 'is-approved';
        if (value === 'submitted' || value === 'hardcopy uploaded' || value === 'in progress' || value === 'ready online') return 'is-uploaded';
        if (value === 'needs correction') return 'is-rejected';
        return '';
    }

    function buildFormRequirementHelper(task, definition = {}) {
        if (definition.finalRequirement) {
            if (!task) {
                return 'This proof opens only after the earlier training form requirements are verified.';
            }
            if (task?.reviewerRemarks) {
                return 'This proof needs correction based on the latest review remarks.';
            }
            if (String(task?.status || '').toLowerCase() === 'verified') {
                return 'PDO/Admin verified your proof of assistance received.';
            }
            if (String(task?.status || '').toLowerCase() === 'submitted') {
                return 'Your proof of assistance received is submitted and waiting for PDO/Admin review.';
            }
            if (task?.interactive) {
                return 'Upload the proof that you already received the SMART LEAP assistance.';
            }
            return 'This final proof is still locked until the earlier requirements are verified.';
        }
        if (!task) {
            return 'This form opens only when it is linked to one of your assigned training sessions by admin.';
        }
        if (task?.reviewerRemarks) {
            return 'This form needs correction based on the latest review remarks.';
        }
        if (task?.file?.url && String(task?.status || '').toLowerCase() === 'verified') {
            return 'The PDO/Admin hardcopy upload has been reviewed and approved. You can still view the online form record.';
        }
        if (String(task?.status || '').toLowerCase() === 'submitted') {
            return task?.file?.url
                ? 'A PDO/Admin hardcopy upload is submitted for review. You can also open the online form record.'
                : 'Your online form is submitted for review.';
        }
        if (task?.file?.url) {
            return 'A scanned hardcopy was uploaded by your assigned PDO or Admin. You may still open the online form record.';
        }
        if (task?.interactive) {
            return 'Fill this up online, or coordinate with your PDO/Admin if they will upload a scanned hardcopy instead.';
        }
        return 'This form is still locked until your training is scheduled/notified and admin opens it for you.';
    }

    function onlineFormActionLabel(task) {
        const status = String(task?.status || '').toLowerCase();
        if (status === 'verified') return 'View online form';
        if (status === 'submitted') return 'Review online form';
        if (status === 'in progress' || status === 'needs correction' || status === 'rejected') return 'Continue online form';
        return 'Fill up online';
    }

    function normalizeRequirementStatusSimple(item) {
        const raw = String(item.status || '').toLowerCase().replace(/[^a-z]/g, '');
        if (['verified', 'approved', 'complete', 'completed', 'approvedbypdo', 'pdoapproved', 'requirementsverified'].includes(raw)) return 'Approved';
        if (raw === 'pending') return item.file?.path ? 'Under review' : 'Not uploaded yet';
        if (raw === 'missing') return item.file?.path ? 'Uploaded' : 'Not uploaded yet';
        if (['flagged', 'needscorrection', 'rejected'].includes(raw)) return 'Needs changes';
        return item.file?.path ? 'Uploaded' : 'Not uploaded yet';
    }

    function notificationTone(item) {
        const source = `${item.title || ''} ${item.message || ''}`.toLowerCase();
        if (source.includes('correction') || source.includes('fix') || source.includes('remark')) return 'correction';
        if (source.includes('schedule') || source.includes('training') || source.includes('session')) return 'schedule';
        if (source.includes('approved') || source.includes('completed') || source.includes('verified')) return 'success';
        if (source.includes('review') || source.includes('status')) return 'review';
        return 'reminder';
    }

    function notificationToneLabel(tone) {
        if (tone === 'correction') return 'Correction needed';
        if (tone === 'schedule') return 'Schedule';
        if (tone === 'review') return 'Review update';
        if (tone === 'success') return 'Completed';
        return 'Reminder';
    }

    function notificationActionLabel(tone, requiresAction) {
        if (tone === 'schedule') return 'View schedule';
        if (tone === 'correction') return 'Review changes';
        if (tone === 'review') return 'View update';
        if (tone === 'success') return 'Review result';
        if (requiresAction) return 'Open details';
        return 'Open';
    }

    function prepareNotifications(notifications) {
        return notifications
            .map(buildNotificationModel)
            .sort((left, right) => {
                const dateDifference = notificationDateValue(right) - notificationDateValue(left);
                if (dateDifference !== 0) {
                    return dateDifference;
                }

                return notificationPriority(right) - notificationPriority(left);
            });
    }

    function dedupeNotifications(notifications) {
        const seen = new Set();
        return notifications.filter((item) => {
            const key = item.dedupeKey;
            if (!key || seen.has(key)) {
                return !key;
            }

            seen.add(key);
            return true;
        });
    }

    function buildNotificationModel(item) {
        const tone = notificationTone(item);
        const title = sanitizeNotificationTitle(item.title || 'Notification', tone);
        const summary = sanitizeNotificationMessage(item.message || '', title);
        const subject = notificationSubject(item, title, summary);
        const dateValue = item.sentAt || item.createdAt || item.updatedAt || '';
        const requiresAction = tone === 'correction' || hasActionPhrase(summary);

        return {
            id: Number(item.id || 0) || null,
            isRead: Boolean(item.isRead),
            tone,
            title,
            summary,
            meta: buildNotificationMeta(item, tone),
            dateValue,
            actionHref: item.actionPath || item.path || item.url || '',
            requiresAction,
            dedupeKey: `${tone}:${subject}`,
        };
    }

    function sanitizeNotificationTitle(title, tone) {
        const cleanTitle = sanitizeApplicantWording(title)
            .replace(/\bverified\b/gi, tone === 'correction' ? 'needs changes' : 'approved')
            .replace(/\bsubmitted\b/gi, 'received')
            .replace(/\bchecked by pdo\b/gi, 'reviewed by PDO')
            .trim();

        return cleanTitle || 'Application update';
    }

    function sanitizeNotificationMessage(message, title) {
        const cleanMessage = sanitizeApplicantWording(message)
            .replace(/your submitted form/gi, 'your submitted requirement')
            .replace(/is now awaiting revi\w*/gi, 'is now waiting for review')
            .replace(/was reviewed and verified by cswdd staff/gi, 'was reviewed by CSWDD staff')
            .replace(/remarks:\s*/gi, 'Note: ')
            .trim();

        if (!cleanMessage || cleanMessage === title) {
            return '';
        }

        return cleanMessage;
    }

    function notificationSubject(item, title, summary) {
        const source = `${item.title || ''} ${title} ${summary}`;
        const match = source.match(/(business plan|valid id|health certificate|cedula|training|session|certificate|barangay clearance|barangay certificate)/i);
        if (match) {
            return match[1].toLowerCase();
        }

        return String(title || 'notification').toLowerCase().replace(/\b(received|approved|needs changes|reviewed by pdo|application update)\b/g, '').trim();
    }

    function buildNotificationMeta(item, tone) {
        const actor = item.actorName || item.senderName || item.source || '';
        if (tone === 'schedule') {
            return 'Check the Training page for the full schedule and attendance details.';
        }
        if (tone === 'correction') {
            return actor ? `Latest review note from ${actor}.` : 'A reviewer left instructions for this requirement.';
        }
        if (tone === 'review') {
            return actor ? `Latest update from ${actor}.` : 'This requirement is moving through review.';
        }
        if (tone === 'success') {
            return 'This requirement has reached a completed review step.';
        }

        return '';
    }

    function notificationPriority(item) {
        const tone = item.tone || notificationTone(item);
        if (tone === 'correction') return 4;
        if (tone === 'schedule') return 3;
        if (tone === 'review') return 2;
        if (tone === 'success') return 1;
        return 0;
    }

    function notificationDateValue(item) {
        const value = new Date(item.dateValue || item.sentAt || item.createdAt || item.updatedAt || 0).getTime();
        return Number.isNaN(value) ? 0 : value;
    }

    function hasActionPhrase(text) {
        return /need|fix|correct|update|required|action/i.test(String(text || ''));
    }

    function routeMaybeAbsolute(path) {
        if (/^https?:\/\//i.test(String(path || ''))) {
            return path;
        }
        return routeUrl(path);
    }

    async function markNotificationsRead(ids) {
        const notificationIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
            .map((value) => Number(value || 0))
            .filter((value) => value > 0)));
        const unreadIds = notificationIds.filter((id) => {
            const entry = (state.dashboard?.notifications || []).find((item) => Number(item?.id || 0) === id);
            return entry && !entry.isRead;
        });

        if (!unreadIds.length) {
            return;
        }

        if (Array.isArray(state.dashboard?.notifications)) {
            state.dashboard.notifications = state.dashboard.notifications.map((entry) => unreadIds.includes(Number(entry.id || 0))
                ? { ...entry, isRead: true }
                : entry);
        }

        try {
            const payload = await fetchJson('api/notifications/read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ ids: unreadIds }),
            });
            if (Array.isArray(payload.notifications) && state.dashboard) {
                state.dashboard.notifications = payload.notifications;
            }
        } catch (error) {
            console.warn('Unable to mark notifications as read', error);
        }
    }

    function attendanceBadgeClass(status) {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'attended' || normalized === 'completed') return 'present';
        if (normalized === 'missed') return 'absent';
        if (normalized === 'notified') return 'late';
        return 'pending';
    }

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function showToast(message, tone) {
        const stack = document.getElementById('toastStack');
        if (!stack) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${tone || 'info'}`;
        toast.textContent = message;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
        }, 2600);
        setTimeout(() => {
            toast.remove();
        }, 3400);
    }

    function escapeHtml(value) {
        const node = document.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML;
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/"/g, '&quot;');
    }

    function truncateText(value, limit) {
        const text = String(value || '').trim();
        if (text.length <= limit) {
            return text;
        }
        return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
    }

    function formatFileSize(bytes) {
        const size = Number(bytes || 0);
        if (!Number.isFinite(size) || size <= 0) return '0 KB';
        if (size >= 1024 * 1024) {
            return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
        }
        return `${Math.max(1, Math.round(size / 1024))} KB`;
    }
})();
