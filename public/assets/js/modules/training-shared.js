/**
 * Shared training data module for SMART LEAP dashboards.
 * Handles session scheduling, attendance, and roster statistics with a shared storage layer.
 */
(function () {
    const STORAGE_KEYS = {
        sessions: 'smartleap_training_sessions_v1',
        beneficiaries: 'smartleap_training_beneficiaries_v1',
        attendance: 'smartleap_training_attendance_v1'
    };

    const BROADCAST_CHANNEL = 'smartleap-training-events';

    const DEFAULT_SESSIONS = [
        {
            id: 'session-1',
            label: 'Session 1',
            title: 'Program Orientation',
            focus: 'SMART LEAP overview, expectations, and cohort agreements',
            venue: 'CSWDD Training Hall',
            facilitator: 'PDO Maria Santos',
            start: '2024-07-01T09:00:00+08:00',
            end: '2024-07-01T11:30:00+08:00',
            status: 'Completed'
        },
        {
            id: 'session-2',
            label: 'Session 2',
            title: 'Financial Literacy 101',
            focus: 'Budgeting habits, savings, and debt management',
            venue: 'CSWDD Training Hall',
            facilitator: 'CSWDD Finance Desk',
            start: '2024-07-08T09:00:00+08:00',
            end: '2024-07-08T12:00:00+08:00',
            status: 'Completed'
        },
        {
            id: 'session-3',
            label: 'Session 3',
            title: 'Business Planning Clinic',
            focus: 'Value proposition, costing, and cash-flow mapping',
            venue: 'Butuan Learning Center',
            facilitator: 'DTI Mentor Me Program',
            start: '2024-07-15T09:00:00+08:00',
            end: '2024-07-15T12:00:00+08:00',
            status: 'Completed'
        },
        {
            id: 'session-4',
            label: 'Session 4',
            title: 'Digital Marketing Essentials',
            focus: 'Social media strategy and customer engagement',
            venue: 'Butuan Learning Center',
            facilitator: 'Caraga ICT Council',
            start: '2024-07-22T09:00:00+08:00',
            end: '2024-07-22T12:00:00+08:00',
            status: 'Scheduled'
        },
        {
            id: 'session-5',
            label: 'Session 5',
            title: 'Pitch Day & Graduation',
            focus: 'Presentation of business plans and awarding',
            venue: 'City Hall Annex',
            facilitator: 'SMART LEAP Steering Team',
            start: '2024-07-29T09:00:00+08:00',
            end: '2024-07-29T12:00:00+08:00',
            status: 'Scheduled'
        }
    ];

    const DEFAULT_BENEFICIARIES = [
        { id: 101, name: 'Maria Lopez', barangay: 'Barangay Doongan', status: 'ApprovedForTraining', remarks: 'On-track with deliverables' },
        { id: 102, name: 'Juan Dela Cruz', barangay: 'Barangay Libertad', status: 'PendingRequirements', remarks: 'Coordinate make-up session for Session 2' },
        { id: 103, name: 'Rogelio Bautista', barangay: 'Barangay Ambago', status: 'ApprovedForTraining', remarks: 'Submitted medical excuse for Session 1' },
        { id: 104, name: 'Jasmin Reyes', barangay: 'Barangay Golden Ribbon', status: 'ApprovedForTraining', remarks: 'Candidate for best pitch' }
    ];

    const DEFAULT_ATTENDANCE = {
        '101': { 'session-1': 'present', 'session-2': 'present', 'session-3': 'present', 'session-4': 'pending', 'session-5': 'pending' },
        '102': { 'session-1': 'present', 'session-2': 'absent', 'session-3': 'present', 'session-4': 'pending', 'session-5': 'pending' },
        '103': { 'session-1': 'absent', 'session-2': 'present', 'session-3': 'present', 'session-4': 'pending', 'session-5': 'pending' },
        '104': { 'session-1': 'present', 'session-2': 'present', 'session-3': 'present', 'session-4': 'pending', 'session-5': 'pending' }
    };

    const VALID_ATTENDANCE = Object.freeze(['pending', 'present', 'absent', 'excused']);

    let sessions = [];
    let beneficiaries = [];
    let attendance = {};
    let listeners = [];
    let channel = null;
    let initialised = false;

    init();

    function init() {
        if (initialised) return;
        loadState();
        ensureBroadcastChannel();
        initialised = true;
        notify();
    }

    function ensureBroadcastChannel() {
        try {
            channel = new BroadcastChannel(BROADCAST_CHANNEL);
            channel.onmessage = (event) => {
                if (event?.data?.type === 'training-update') {
                    loadState();
                    notify();
                }
            };
        } catch (err) {
            console.warn('TrainingShared broadcast channel unavailable', err);
            channel = null;
        }
    }

    function loadState() {
        sessions = readFromStorage(STORAGE_KEYS.sessions, DEFAULT_SESSIONS);
        beneficiaries = readFromStorage(STORAGE_KEYS.beneficiaries, DEFAULT_BENEFICIARIES);
        attendance = readFromStorage(STORAGE_KEYS.attendance, DEFAULT_ATTENDANCE);
    }

    function readFromStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (err) {
            console.warn(`TrainingShared: unable to parse ${key}`, err);
        }
        return clone(fallback);
    }

    function persistState() {
        try { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions)); } catch (err) { console.warn('Unable to persist sessions', err); }
        try { localStorage.setItem(STORAGE_KEYS.beneficiaries, JSON.stringify(beneficiaries)); } catch (err) { console.warn('Unable to persist beneficiaries', err); }
        try { localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance)); } catch (err) { console.warn('Unable to persist attendance', err); }
        broadcastUpdate();
        notify();
    }

    function broadcastUpdate() {
        try {
            channel?.postMessage({ type: 'training-update', ts: Date.now() });
        } catch (err) {
            console.warn('TrainingShared broadcast failed', err);
        }
    }

    function notify() {
        const snapshot = getSnapshot();
        listeners.forEach((cb) => {
            try { cb(snapshot); } catch (err) { console.warn('TrainingShared listener error', err); }
        });
    }

    function getSnapshot() {
        return {
            sessions: clone(sessions),
            beneficiaries: clone(beneficiaries),
            attendance: clone(attendance)
        };
    }

    function clone(value) {
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (err) { /* fallback below */ }
        }
        return JSON.parse(JSON.stringify(value));
    }

    function findBeneficiary(id) {
        return beneficiaries.find((item) => item.id === id) || null;
    }

    function findSession(id) {
        return sessions.find((item) => item.id === id) || null;
    }

    function ensureAttendanceRecord(beneficiaryId) {
        if (!attendance[beneficiaryId]) {
            attendance[beneficiaryId] = {};
        }
        return attendance[beneficiaryId];
    }

    function computeBeneficiaryProgress(beneficiaryId) {
        const record = ensureAttendanceRecord(beneficiaryId);
        let present = 0;
        let absent = 0;
        let excused = 0;
        let pending = 0;
        sessions.forEach((session) => {
            const status = record[session.id] || 'pending';
            if (status === 'present') present += 1;
            else if (status === 'absent') absent += 1;
            else if (status === 'excused') excused += 1;
            else pending += 1;
        });
        const completion = sessions.length ? (present / sessions.length) * 100 : 0;
        return {
            present,
            absent,
            excused,
            pending,
            completion: Math.round(completion),
            sessionCount: sessions.length
        };
    }

    function getBeneficiaryProgress(beneficiaryId) {
        return computeBeneficiaryProgress(beneficiaryId);
    }

    function getUpcomingSession() {
        const upcoming = sessions
            .filter((session) => {
                const status = (session.status || '').toLowerCase();
                if (status === 'completed' || status === 'cancelled') return false;
                const start = new Date(session.start);
                return !Number.isNaN(start.getTime()) && start >= new Date();
            })
            .sort((a, b) => new Date(a.start) - new Date(b.start));
        return upcoming[0] || null;
    }

    function aggregateStats() {
        const roster = beneficiaries.map((beneficiary) => ({
            ...beneficiary,
            progress: computeBeneficiaryProgress(beneficiary.id)
        }));

        const total = roster.length;
        const verifiedDocs = roster.filter((beneficiary) => {
            const requirements = beneficiary.requirements || {};
            return Object.values(requirements).every((req) => (req?.status || '').toLowerCase() === 'verified');
        }).length;

        const totalAttendance = roster.reduce((sum, item) => sum + item.progress.present, 0);
        const totalSessions = sessions.length * Math.max(total, 1);
        const attendanceRate = totalSessions ? Math.round((totalAttendance / totalSessions) * 100) : 0;

        return { roster, total, verifiedDocs, attendanceRate };
    }

    function setAttendance(beneficiaryId, sessionId, status) {
        if (!VALID_ATTENDANCE.includes(status)) return;
        if (!findSession(sessionId)) return;
        const record = ensureAttendanceRecord(beneficiaryId);
        record[sessionId] = status;
        persistState();
    }

    function setAttendanceToggle(beneficiaryId, sessionId, value) {
        const record = ensureAttendanceRecord(beneficiaryId);
        const current = record[sessionId] || 'pending';
        const next = current === value ? 'pending' : value;
        if (!VALID_ATTENDANCE.includes(next)) return;
        record[sessionId] = next;
        persistState();
        return record[sessionId];
    }

    function createSession(payload) {
        const id = payload.id || `session-${Date.now()}`;
        sessions.push({
            id,
            label: payload.label || buildSessionLabel(sessions.length + 1),
            title: payload.title || 'Training Session',
            focus: payload.focus || '',
            venue: payload.venue || '',
            facilitator: payload.facilitator || '',
            start: payload.start,
            end: payload.end,
            status: payload.status || 'Scheduled'
        });
        persistState();
        return id;
    }

    function buildSessionLabel(index) {
        return `Session ${String(index).padStart(1, '0')}`;
    }

    function updateSession(sessionId, updates) {
        const session = findSession(sessionId);
        if (!session) return;
        Object.assign(session, updates);
        persistState();
    }

    function deleteSession(sessionId) {
        sessions = sessions.filter((session) => session.id !== sessionId);
        Object.keys(attendance).forEach((beneficiaryId) => {
            if (attendance[beneficiaryId]) {
                delete attendance[beneficiaryId][sessionId];
            }
        });
        persistState();
    }

    function upsertBeneficiary(beneficiary) {
        if (!beneficiary?.id) return;
        const index = beneficiaries.findIndex((item) => item.id === beneficiary.id);
        if (index >= 0) {
            beneficiaries[index] = { ...beneficiaries[index], ...beneficiary };
        } else {
            beneficiaries.push({ id: beneficiary.id, name: beneficiary.name || 'Beneficiary', barangay: beneficiary.barangay || '-', status: beneficiary.status || 'Submitted', remarks: beneficiary.remarks || '' });
        }
        persistState();
    }

    function removeBeneficiary(id) {
        if (id === undefined || id === null) return;
        const targetId = String(id);
        beneficiaries = beneficiaries.filter((beneficiary) => String(beneficiary.id) !== targetId);
        if (attendance[targetId]) {
            delete attendance[targetId];
        }
        persistState();
    }

    function getBeneficiaryAttendanceMap(beneficiaryId) {
        return clone(ensureAttendanceRecord(beneficiaryId));
    }

    function onChange(callback) {
        if (typeof callback !== 'function') return () => {};
        listeners.push(callback);
        callback(getSnapshot());
        return () => {
            listeners = listeners.filter((listener) => listener !== callback);
        };
    }

    function formatSessionWindow(session) {
        const start = new Date(session.start);
        const end = new Date(session.end);
        const dateText = Number.isNaN(start.getTime()) ? '--' : start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeRange = (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()))
            ? `${start.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
            : '--';
        return { dateText, timeRange };
    }

    function getBeneficiaryRoster() {
        return aggregateStats().roster;
    }

    window.TrainingShared = {
        onChange,
        getSnapshot,
        getSessions: () => clone(sessions),
        getBeneficiaries: () => clone(beneficiaries),
        getBeneficiary: (id) => clone(findBeneficiary(id)),
        getAttendanceMap: getBeneficiaryAttendanceMap,
        getBeneficiaryProgress,
        getUpcomingSession,
        aggregateStats,
        getBeneficiaryRoster,
        setAttendance,
        toggleAttendance: setAttendanceToggle,
        createSession,
        updateSession,
        deleteSession,
        upsertBeneficiary,
        removeBeneficiary,
        formatSessionWindow
    };
})();

