(function () {
    const code = String(window.SMARTLEAP_POST_APPROVAL_CODE || '').trim();
    const storagePrefix = 'smartleap.post-approval.mock.';
    const defaultBaseUrl = '../..';

    const titles = {
        availment_form: 'Availment Form',
        validation_form: 'Validation Form',
        mungkahing_proyekto: 'Mungkahing Proyekto',
        business_plan: 'Business Plan',
        buhat_sa_pagpanumpa: 'Buhat sa Pagpanumpa',
    };

    const summaries = {
        availment_form: 'Mock applicant workspace for testing the SMART LEAP Availment Form.',
        validation_form: 'Mock applicant workspace for testing the SMART LEAP Validation Form.',
        mungkahing_proyekto: 'Mock applicant workspace for testing the Mungkahing Proyekto form.',
        business_plan: 'Mock applicant workspace for testing the Business Plan form.',
        buhat_sa_pagpanumpa: 'Mock applicant workspace for testing the Buhat sa Pagpanumpa form.',
    };

    const defaultPayloads = {
        availment_form: {
            clientIdentifyingData: {
                name: 'Test Applicant',
                age: '31',
                address: 'Bonbon, Butuan City',
                spouseName: 'Sample Spouse',
                city: 'Butuan City',
            },
            familyEnterprise: {
                projectType: 'Family Enterprise',
                members: [{ name: '', age: '', activities: '' }],
            },
            incomeEligibility: {
                rows: [{ memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }],
            },
            physicalRequirements: {},
            psychoSocialRequirements: {},
            applicantSignature: {
                participantName: 'Test Applicant',
                dateSigned: '',
                signatureUpload: null,
            },
        },
        validation_form: {
            applicantInfo: {
                applicantName: 'Test Applicant',
                address: 'Bonbon, Butuan City',
                projectType: 'Food Cart',
            },
            checklist: {},
            eligibilityAssessment: {},
            assessment: {},
            participantSignature: {
                participantName: 'Test Applicant',
                dateSigned: '',
                signatureUpload: null,
            },
            validatorIdentity: {
                validatorName: '',
                validatorTitle: '',
                dateSigned: '',
                signatureUpload: null,
            },
        },
        mungkahing_proyekto: {
            projectInfo: {
                projectTitle: 'Sample Livelihood Project',
                proponentName: 'Test Applicant',
                address: 'Bonbon, Butuan City',
            },
            rationale: {
                projectBackground: '',
                targetClients: '',
            },
            modalityApplication: {
                rows: [{ source: '', amount: '', remarks: '' }],
            },
            businessOperation: {
                materials: { rows: [{ material: '', quantity: '', quality: '', unitPrice: '', cyclesPerProduction: '', totalCost: '' }], totalCost: '' },
                labor: { rows: [{ position: '', rate: '', productionCycleCount: '', totalDailyWage: '', totalProductionCycleWage: '' }], totalDailyWage: '', totalProductionCycleWage: '' },
                toolsEquipment: { rows: [{ item: '', quantity: '', capacity: '', quantityOrPrice: '', usefulLifeDays: '', productionCycle: '', depreciation: '' }], totalCost: '' },
                operatingExpenses: { rows: [{ expense: '', projectedCost: '' }], grandTotal: '' },
                salesProjection: { rows: [{ product: '', volume: '', capacity: '', sellingPrice: '', grossSales: '' }], grossSales: '' },
                incomeComputation: {},
            },
            spendingPlan: {
                rows: [{ expense: '', amount: '', usageSchedule: '' }],
            },
            applicantSignature: {
                participantName: 'Test Applicant',
                dateSigned: '',
                signatureUpload: null,
            },
        },
        business_plan: {
            overview: {
                businessName: 'Sample Livelihood Project',
                applicantName: 'Test Applicant',
                businessAddress: 'Bonbon, Butuan City',
            },
            productsServices: {
                rows: [{ name: '', description: '', price: '', targetMarket: '' }],
            },
            marketingPlan: {},
            productionPlan: {},
            implementationSchedule: {
                rows: [{ activity: '', targetDate: '', responsiblePerson: '' }],
            },
            financialPlan: {},
            applicantSignature: {
                participantName: 'Test Applicant',
                dateSigned: '',
                signatureUpload: null,
            },
        },
        buhat_sa_pagpanumpa: {
            beneficiaryInfo: {
                beneficiaryName: 'Test Applicant',
                address: 'Bonbon, Butuan City',
            },
            programDetails: {
                projectType: 'Food Cart',
                releaseAmount: '',
            },
            coMakerInfo: {
                name: 'Sample Co-maker',
                relationship: 'Sibling',
            },
            applicantSignature: {
                participantName: 'Test Applicant',
                dateSigned: '',
                signatureUpload: null,
            },
            coMakerSignature: {
                coMakerName: 'Sample Co-maker',
                dateSigned: '',
                signatureUpload: null,
            },
        },
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function storageKey(taskCode) {
        return `${storagePrefix}${taskCode}`;
    }

    function completionForTask(task) {
        if (String(task.status || '') === 'Submitted') {
            return 100;
        }
        return 0;
    }

    function defaultTask(taskCode) {
        return {
            code: taskCode,
            title: titles[taskCode] || 'Application Form',
            summary: summaries[taskCode] || 'Mock SMART LEAP form workspace.',
            helpText: 'This is a standalone browser test page. Save, submit, and upload actions stay in local browser storage only.',
            status: 'Draft',
            completion: 0,
            interactive: true,
            payload: clone(defaultPayloads[taskCode] || {}),
            reviewerRemarks: '',
            staffSections: [],
            reviewedAt: null,
        };
    }

    function getTask(taskCode) {
        const raw = window.localStorage.getItem(storageKey(taskCode));
        if (!raw) {
            const task = defaultTask(taskCode);
            window.localStorage.setItem(storageKey(taskCode), JSON.stringify(task));
            return task;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            const task = defaultTask(taskCode);
            window.localStorage.setItem(storageKey(taskCode), JSON.stringify(task));
            return task;
        }
    }

    function saveTask(task) {
        task.completion = completionForTask(task);
        window.localStorage.setItem(storageKey(task.code), JSON.stringify(task));
        return task;
    }

    function setNestedValue(target, path, value) {
        const segments = String(path || '').split('.').filter(Boolean);
        if (!segments.length) return;
        let cursor = target;
        segments.forEach((segment, index) => {
            if (index === segments.length - 1) {
                cursor[segment] = value;
                return;
            }
            if (!cursor[segment] || typeof cursor[segment] !== 'object') {
                cursor[segment] = {};
            }
            cursor = cursor[segment];
        });
    }

    function mockUpload(file) {
        return {
            original_name: file?.name || 'mock-upload.png',
            mime_type: file?.type || 'image/png',
            file_size: Number(file?.size || 0),
            file_path: 'assets/img/SMARTLEAP.png',
            uploaded_at: new Date().toISOString(),
        };
    }

    function jsonResponse(payload) {
        return Promise.resolve(new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        }));
    }

    function parseJsonBody(init) {
        try {
            return JSON.parse(String(init?.body || '{}'));
        } catch (error) {
            return {};
        }
    }

    function interceptRequest(input, init) {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);

        if (url.pathname.includes('/api/post-approval/task')) {
            const taskCode = url.searchParams.get('code') || code;
            return jsonResponse({ ok: true, task: getTask(taskCode) });
        }

        if (url.pathname.includes('/api/post-approval/save')) {
            const body = parseJsonBody(init);
            const task = getTask(body.code || code);
            task.payload = body.form || task.payload;
            task.status = 'Draft';
            return jsonResponse({ ok: true, task: saveTask(task), message: 'Mock form saved.' });
        }

        if (url.pathname.includes('/api/post-approval/submit')) {
            const body = parseJsonBody(init);
            const task = getTask(body.code || code);
            task.payload = body.form || task.payload;
            task.status = 'Submitted';
            task.reviewedAt = null;
            return jsonResponse({ ok: true, task: saveTask(task), message: 'Mock form submitted.' });
        }

        if (url.pathname.includes('/api/post-approval/upload')) {
            const formData = init?.body;
            const taskCode = typeof formData?.get === 'function' ? String(formData.get('code') || code) : code;
            const fieldKey = typeof formData?.get === 'function' ? String(formData.get('fieldKey') || '') : '';
            const file = typeof formData?.get === 'function' ? formData.get('file') : null;
            const task = getTask(taskCode);
            const upload = mockUpload(file);
            if (fieldKey) {
                setNestedValue(task.payload, fieldKey, upload);
                saveTask(task);
            }
            return jsonResponse({ ok: true, upload, message: 'Mock upload saved.' });
        }

        if (url.pathname.includes('/logout')) {
            return jsonResponse({ ok: true, redirect: 'index.html' });
        }

        return null;
    }

    function bindResetButton() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-reset-mock-form]');
            if (!button) return;
            window.localStorage.removeItem(storageKey(code));
            window.location.reload();
        });
    }

    window.SMARTLEAP_BASE_URL = window.SMARTLEAP_BASE_URL || defaultBaseUrl;
    window.SMARTLEAP_AUTH_USER = window.SMARTLEAP_AUTH_USER || {
        id: 0,
        full_name: 'Test Applicant',
        email: 'test.applicant@smartleap.local',
        role: 'Applicant',
    };

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init = {}) {
        const intercepted = interceptRequest(input, init);
        if (intercepted) {
            return intercepted;
        }
        return nativeFetch(input, init);
    };

    bindResetButton();
})();
