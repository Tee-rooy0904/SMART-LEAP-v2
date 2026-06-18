function computeDashboardSnapshot() {
    const roster = getBeneficiaryRoster();
    const applicants = getApplicantPool();

    const total = roster.length;
    const active = roster.filter((b) => normalizeStatus(b.applicationStatus || b.status) === 'active').length;
    const pipelineStatusSet = new Set(['submitted', 'underreview', 'forvalidation', 'pendingrequirements', 'shortlisted', 'approvedfortraining'].map(normalizeStatus));
    const pendingStatusSet = new Set(['submitted', 'underreview', 'forvalidation', 'pendingrequirements'].map(normalizeStatus));

    const pipeline = applicants.filter((b) => pipelineStatusSet.has(normalizeStatus(b.applicationStatus || b.status))).length;
    const pendingApps = applicants.filter((b) => pendingStatusSet.has(normalizeStatus(b.applicationStatus || b.status))).length;

    let pendingReceipts = 0;
    let totalReq = 0;
    let verifiedReq = 0;

    roster.forEach((b) => {
        (b.repayments || []).forEach((payment) => {
            if ((payment.status || '').toLowerCase() !== 'verified') pendingReceipts += 1;
        });
    });

    const requirementSource = [...roster, ...applicants];
    const seenRequirementIds = new Set();
    requirementSource.forEach((b) => {
        if (b?.id != null) {
            const key = String(b.id);
            if (seenRequirementIds.has(key)) return;
            seenRequirementIds.add(key);
        }
        REQUIREMENTS.forEach((req) => {
            const entry = b.requirements?.[req.key];
            if (!entry) return;
            totalReq += 1;
            if (entry.status === 'verified') verifiedReq += 1;
        });
    });

    const trainingRoster = trainingAggregate?.roster || [];
    const trainingSessions = trainingSnapshot?.sessions?.length || 0;
    const trainingCompletionRate = trainingAggregate?.attendanceRate || 0;
    const trainingEligible = trainingRoster.filter(item => (item.progress?.present || 0) > 0 || (item.progress?.completion || 0) >= 50).length;

    return {
        totalBeneficiaries: total,
        activeBeneficiaries: active,
        pipelineBeneficiaries: pipeline,
        pendingApplications: pendingApps,
        pendingReceipts,
        totalRequirements: totalReq || 1,
        verifiedRequirements: verifiedReq,
        verificationRate: totalReq ? Math.round((verifiedReq / totalReq) * 100) : 0,
        trainingEligible,
        trainingCompletionRate,
        trainingSessions
    };
}
