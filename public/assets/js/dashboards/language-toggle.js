(function () {
    'use strict';

    const storageKey = 'smartleap.portalLanguage';
    const defaultLanguage = 'en';
    const labels = {
        overview: { en: 'Overview', ceb: 'Pangkalahatan' },
        profile: { en: 'Profile', ceb: 'Profile' },
        changePassword: { en: 'Change Password', ceb: 'Palitan ang Password' },
        signOut: { en: 'Sign Out', ceb: 'Mag-sign out' },
        application: { en: 'Application', ceb: 'Aplikasyon' },
        training: { en: 'Training', ceb: 'Pagsasanay' },
        support: { en: 'Support', ceb: 'Suporta' },
        repayments: { en: 'Repayments', ceb: 'Mga Bayad' },
        activity: { en: 'Activity', ceb: 'Aktibidad' },
    };
    const phrases = [
        ['Current step', 'Kasalukuyang hakbang'],
        ['Loading your applicant portal...', 'Ikinakarga ang iyong applicant portal...'],
        ['Loading your beneficiary portal...', 'Ikinakarga ang iyong beneficiary portal...'],
        ['Edit Profile', 'I-edit ang Profile'],
        ['Application status', 'Status ng aplikasyon'],
        ['Last updated:', 'Huling update:'],
        ['Personal Information', 'Personal na Impormasyon'],
        ['This is the most important action right now.', 'Ito ang pinakamahalagang kailangang gawin ngayon.'],
        ['Loading current status', 'Ikinakarga ang kasalukuyang status'],
        ['Loading your next step', 'Ikinakarga ang susunod mong hakbang'],
        ['Please wait while the workspace checks your current workflow stage.', 'Mangyaring maghintay habang sinusuri ng workspace ang iyong kasalukuyang yugto ng workflow.'],
        ['Loading', 'Ikinakarga'],
        ['Current workflow status', 'Kasalukuyang status ng workflow'],
        ['What happens next', 'Ano ang susunod na mangyayari'],
        ['Process progress', 'Pag-usad ng proseso'],
        ['Progress overview', 'Pangkalahatang progreso'],
        ['Three milestones from profile completion to training progress.', 'Tatlong milestone mula sa pagkumpleto ng profile hanggang sa progreso sa pagsasanay.'],
        ['Applicant journey milestones', 'Mga milestone ng aplikante'],
        ['Application review', 'Pagsusuri ng aplikasyon'],
        ['Upload and verification progress.', 'Progreso ng pag-upload at beripikasyon.'],
        ['Training', 'Pagsasanay'],
        ['Sessions and attendance are grouped in Training.', 'Nasa Pagsasanay ang mga session at attendance.'],
        ['Certificate', 'Sertipiko'],
        ['Important updates', 'Mahahalagang update'],
        ['Current guidance', 'Kasalukuyang gabay'],
        ['Applicant guidance', 'Gabay para sa aplikante'],
        ['Live support', 'Live na suporta'],
        ['Support recipient', 'Tatanggap ng suporta'],
        ['Message', 'Mensahe'],
        ['Type your message', 'I-type ang iyong mensahe'],
        ['Guidance and contacts', 'Gabay at mga kontak'],
        ['Assigned project officer', 'Nakatalagang project officer'],
        ['Not assigned yet', 'Hindi pa naitatalaga'],
        ['Profile details', 'Mga detalye ng profile'],
        ['Personal details', 'Mga personal na detalye'],
        ['Contact details', 'Mga detalye ng kontak'],
        ['Contact number *', 'Numero ng kontak *'],
        ['Complete address *', 'Kompletong address *'],
        ['Birthdate *', 'Petsa ng kapanganakan *'],
        ['Age', 'Edad'],
        ['Select gender', 'Pumili ng kasarian'],
        ['Female', 'Babae'],
        ['Male', 'Lalaki'],
        ['Prefer not to say', 'Ayaw tukuyin'],
        ['Upload photo', 'Mag-upload ng litrato'],
        ['No photo', 'Walang litrato'],
        ['JPG or PNG, max 5MB.', 'JPG o PNG, hanggang 5MB.'],
        ['Highest educational attainment *', 'Pinakamataas na natapos sa pag-aaral *'],
        ['Select attainment', 'Pumili ng natapos sa pag-aaral'],
        ['SHS grad', 'Nagtapos ng SHS'],
        ['Sector *', 'Sektor *'],
        ['Select sector', 'Pumili ng sektor'],
        ['Livelihood / Business type *', 'Uri ng kabuhayan / negosyo *'],
        ['Go to Application', 'Pumunta sa Aplikasyon'],
        ['Application summary', 'Buod ng aplikasyon'],
        ['Review updates', 'Mga update sa pagsusuri'],
        ['View full history', 'Tingnan ang buong kasaysayan'],
        ['Repayment summary', 'Buod ng pagbabayad'],
        ['Current balance', 'Kasalukuyang balanse'],
        ['Repayment progress', 'Progreso ng pagbabayad'],
        ['Repayment snapshot', 'Snapshot ng pagbabayad'],
        ['Uploaded receipts', 'Mga na-upload na resibo'],
        ['Actions needing follow-up', 'Mga aksyong kailangang sundan'],
        ['Updates', 'Mga update'],
        ['Support', 'Suporta'],
        ['Open Support', 'Buksan ang Suporta'],
        ['Send feedback', 'Magpadala ng feedback'],
        ['Your message *', 'Iyong mensahe *'],
        ['Share your suggestion or concern', 'Ibahagi ang iyong mungkahi o alalahanin'],
        ['No feedback submitted yet.', 'Wala pang naisusumiteng feedback.'],
        ['Need help?', 'Kailangan ng tulong?'],
        ['Next repayment', 'Susunod na bayad'],
        ['Account standing', 'Katayuan ng account'],
        ['How to ask for help', 'Paano humingi ng tulong'],
        ['Before contacting support', 'Bago makipag-ugnayan sa suporta'],
        ['Office hours: Monday-Friday, 8 AM - 5 PM', 'Oras ng opisina: Lunes-Biyernes, 8 AM - 5 PM'],
        ['Activity summary', 'Buod ng aktibidad'],
        ['Uploaded actions', 'Mga na-upload na aksyon'],
        ['Activity timeline', 'Timeline ng aktibidad'],
        ['No activity yet.', 'Wala pang aktibidad.'],
        ['No receipts yet. Log the first OR to begin.', 'Wala pang resibo. Irehistro ang unang OR para makapagsimula.'],
        ['No notifications yet.', 'Wala pang notification.'],
        ['Not uploaded yet', 'Hindi pa naia-upload'],
        ['Missing', 'Kulang'],
        ['Submitted', 'Naisumite'],
        ['Reviewed', 'Nasuri'],
        ['Under review', 'Sinusuri'],
        ['Needs changes', 'Kailangang baguhin'],
        ['Submit receipt', 'Isumite ang resibo'],
        ['Add official receipt', 'Magdagdag ng opisyal na resibo'],
        ['Requirement uploads will appear once reviewed.', 'Lalabas ang mga upload ng requirement kapag nasuri na.'],
        ['The messages from your support team will appear here.', 'Lalabas dito ang mga mensahe mula sa support team mo.'],
        ['This field is required.', 'Kinakailangan ang field na ito.'],
        ['Save changes', 'I-save ang mga pagbabago'],
        ['Keep row', 'Panatilihin ang row'],
        ['Remove row', 'Alisin ang row'],
        ['Verified', 'Beripikado'],
        ['Pending review', 'Naghihintay ng pagsusuri'],
        ['Action needed', 'Kailangan ng aksyon'],
        ['Ready for approval', 'Handa para sa pag-apruba'],
        ['Pending verification', 'Naghihintay ng beripikasyon'],
        ['Completed', 'Natapos'],
        ['Complete', 'Kumpleto'],
        ['Needs updates', 'Kailangang i-update'],
        ['No application yet', 'Wala pang aplikasyon'],
        ['No review yet', 'Wala pang pagsusuri'],
        ['No message yet', 'Wala pang mensahe'],
        ['No status history yet.', 'Wala pang kasaysayan ng status.'],
        ['No applicant-visible remarks yet.', 'Wala pang remark na makikita ng aplikante.'],
        ['No requirement records yet.', 'Wala pang tala ng requirement.'],
        ['No required fill-up forms are available right now.', 'Wala pang available na kailangang fill-up form sa ngayon.'],
        ['No training assignment recorded yet.', 'Wala pang naitalang training assignment.'],
        ['No training schedule yet. Wait for notice updates from CSWDD.', 'Wala pang iskedyul ng pagsasanay. Hintayin ang mga update ng abiso mula sa CSWDD.'],
        ['No update yet.', 'Wala pang update.'],
        ['No reminder yet.', 'Wala pang paalala.'],
        ['No account alert yet.', 'Wala pang alerto sa account.'],
        ['No file uploaded yet', 'Wala pang na-upload na file'],
        ['Not yet assigned', 'Hindi pa naitatalaga'],
        ['Upload the required files', 'I-upload ang mga kinakailangang file'],
        ['Upload official receipt', 'I-upload ang opisyal na resibo'],
        ['Upload receipt', 'I-upload ang resibo'],
        ['Add receipt', 'Magdagdag ng resibo'],
        ['Upload the OR within 3 days from payment.', 'I-upload ang OR sa loob ng 3 araw mula sa pagbabayad.'],
        ['Official receipt', 'Opisyal na resibo'],
        ['Uploaded', 'Na-upload'],
        ['Uploaded:', 'Na-upload:'],
        ['Uploaded online', 'Na-upload online'],
        ['Uploaded action', 'Na-upload na aksyon'],
        ['Uploaded receipt', 'Na-upload na resibo'],
        ['Needs correction', 'Kailangang itama'],
        ['Current status', 'Kasalukuyang status'],
        ['Reviewed already', 'Nasuri na'],
        ['Waiting for required fill-up forms', 'Naghihintay sa mga kinakailangang fill-up form'],
        ['Applicant-visible review notes are summarized here.', 'Dito ibinubuod ang mga review note na makikita ng aplikante.'],
        ['Complete the missing personal details here, then continue to Application.', 'Kumpletuhin dito ang kulang na personal na detalye, pagkatapos ay magpatuloy sa Aplikasyon.'],
        ['Assigned PDO details will appear once scoped.', 'Lalabas ang mga detalye ng nakatalagang PDO kapag naitalaga na.'],
        ['Please complete all required profile fields and uploads before submitting.', 'Pakikumpleto ang lahat ng kailangang field at upload bago magsumite.'],
        ['Unable to save your profile.', 'Hindi ma-save ang iyong profile.'],
        ['Unable to save your profile right now.', 'Hindi ma-save ang iyong profile sa ngayon.'],
        ['Application submitted for verification.', 'Naisumite na ang aplikasyon para sa beripikasyon.'],
        ['Profile updated.', 'Na-update ang profile.'],
        ['Application draft saved.', 'Na-save ang draft ng aplikasyon.'],
        ['Unable to load your profile right now.', 'Hindi ma-load ang iyong profile sa ngayon.'],
        ['Unable to load the profile state.', 'Hindi ma-load ang status ng profile.'],
        ['Only JPG or PNG files can be uploaded.', 'JPG o PNG file lamang ang maaaring i-upload.'],
        ['Profile photo must be 5 MB or less.', 'Dapat 5 MB o mas mababa ang laki ng profile photo.'],
        ['Profile photo updated.', 'Na-update ang profile photo.'],
        ['Unable to save the profile photo.', 'Hindi ma-save ang profile photo.'],
        ['Saving...', 'Sine-save...'],
        ['Submitting...', 'Isinusumite...'],
        ['Save draft', 'I-save ang draft'],
        ['Submit for verification', 'Isumite para sa beripikasyon'],
        ['Upload file', 'I-upload ang file'],
        ['Choose another file', 'Pumili ng ibang file'],
        ['Replace file', 'Palitan ang file'],
        ['No file selected.', 'Walang napiling file.'],
        ['Waiting for replacement', 'Naghihintay ng ipapalit'],
        ['Upload this requirement in the Application page.', 'I-upload ang requirement na ito sa pahina ng Aplikasyon.'],
        ['This upload has been reviewed and approved. It can no longer be replaced.', 'Nasuri at naaprubahan na ang upload na ito. Hindi na ito maaaring palitan.'],
        ['This upload needs a new file before you submit again.', 'Kailangan ng bagong file ang upload na ito bago ka muling magsumite.'],
        ['Make sure your profile stays updated.', 'Tiyaking laging updated ang iyong profile.'],
        ['Only items that need attention or explain the next movement in your application.', 'Tanging mga item na nangangailangan ng atensyon o nagpapaliwanag ng susunod na galaw sa iyong aplikasyon.'],
        ['Important updates will appear here while your application moves through review.', 'Lalabas dito ang mahahalagang update habang sinusuri ang iyong aplikasyon.'],
        ['Your applicant profile is complete and ready for the current workflow steps.', 'Kumpleto na ang iyong applicant profile at handa na ito para sa kasalukuyang mga hakbang ng workflow.'],
        ['Keep your applicant profile complete.', 'Panatilihing kumpleto ang iyong applicant profile.'],
        ['Requirement review will appear here once CSWDD checks your uploads.', 'Lalabas dito ang pagsusuri ng requirement kapag nasuri na ng CSWDD ang iyong mga upload.'],
        ['Available after your training and application requirements are complete.', 'Magiging available ito kapag kumpleto na ang iyong training at mga requirement sa aplikasyon.'],
        ['Complete your applicant profile', 'Kumpletuhin ang iyong applicant profile'],
        ['The next required action will appear here.', 'Lalabas dito ang susunod na kinakailangang aksyon.'],
        ['One or more requirements need attention.', 'Isa o higit pang requirement ang nangangailangan ng atensyon.'],
        ['All current requirements are verified.', 'Lahat ng kasalukuyang requirement ay beripikado na.'],
        ['Requirement review is still in progress.', 'Patuloy pa rin ang pagsusuri ng requirement.'],
        ['Upload requirements', 'I-upload ang mga requirement'],
        ['Upload the files required for your application here. PDF, PNG, or JPG only. Up to 5 MB per file.', 'I-upload dito ang mga file na kailangan para sa iyong aplikasyon. PDF, PNG, o JPG lamang. Hanggang 5 MB bawat file.'],
        ['Form requirements uploaded by PDO/Admin', 'Mga form requirement na in-upload ng PDO/Admin'],
        ['These five form copies are uploaded by your assigned PDO or Admin in the application checker. Applicants cannot upload or replace them here.', 'Ang limang kopyang form na ito ay ini-upload ng nakatalagang PDO o Admin sa application checker. Hindi maaaring mag-upload o magpalit ng mga ito ang aplikante rito.'],
        ['Document checklist', 'Checklist ng dokumento'],
        ['See what is uploaded, what is being checked, and what still needs action.', 'Tingnan kung ano ang na-upload, ano ang sinusuri, at ano pa ang nangangailangan ng aksyon.'],
        ['Check the latest review result first, then open the full history when needed.', 'Tingnan muna ang pinakabagong resulta ng pagsusuri, pagkatapos buksan ang buong kasaysayan kung kailangan.'],
        ['No requirement review activity yet.', 'Wala pang aktibidad sa pagsusuri ng requirement.'],
        ['Reviewer notes visible to the applicant are summarized here.', 'Dito ibinubuod ang mga reviewer note na makikita ng aplikante.'],
        ['Latest reviewer message', 'Pinakabagong mensahe ng reviewer'],
        ['Reviewer notes visible to the applicant appear here first.', 'Dito unang lalabas ang mga reviewer note na makikita ng aplikante.'],
        ['Messages for you', 'Mga mensahe para sa iyo'],
        ['Upcoming or current session', 'Susunod o kasalukuyang session'],
        ['The next live training schedule appears here first.', 'Dito unang lalabas ang susunod na live na iskedyul ng pagsasanay.'],
        ['Next session', 'Susunod na session'],
        ['No upcoming session scheduled', 'Walang naka-iskedyul na susunod na session'],
        ['Attendance summary', 'Buod ng attendance'],
        ['A quick read on your assigned sessions and attendance record.', 'Mabilis na buod ng mga itinalagang session at tala ng attendance mo.'],
        ['Missed', 'Hindi nadaluhan'],
        ['Notified', 'Naabisuhan'],
        ['Schedule list', 'Listahan ng iskedyul'],
        ['Dates, venues, and preparation notes for each assigned session.', 'Mga petsa, venue, at preparation note para sa bawat itinalagang session.'],
        ['Attendance is easier to read on mobile and shows the latest status first.', 'Mas madaling basahin sa mobile ang attendance at inuuna nitong ipakita ang pinakabagong status.'],
        ['Attendance updates will appear once sessions are assigned.', 'Lalabas ang mga update sa attendance kapag may naitalagang session na.'],
        ['Session', 'Session'],
        ['Date & Time', 'Petsa at Oras'],
        ['Status', 'Status'],
        ['Remarks', 'Mga Tala'],
        ['Notice', 'Abiso'],
        ['Support Center', 'Sentro ng Suporta'],
        ['Submit a concern, track replies, and get help from Social Worker support.', 'Magsumite ng concern, subaybayan ang mga reply, at humingi ng tulong sa Social Worker support.'],
        ['New concern', 'Bagong concern'],
        ['Submit New Concern', 'Magsumite ng Bagong Concern'],
        ['Tell us what you need help with. Your concern will be routed to Social Worker support.', 'Sabihin sa amin kung anong tulong ang kailangan mo. Ipapadala ang concern mo sa Social Worker support.'],
        ['Concern category *', 'Kategorya ng concern *'],
        ['Choose category', 'Pumili ng kategorya'],
        ['Subject *', 'Paksa *'],
        ['Briefly describe your concern', 'Maikling ilarawan ang iyong concern'],
        ['Explain your concern clearly. Include the month, OR number, document name, or screenshot details if applicable.', 'Ipaliwanag nang malinaw ang iyong concern. Isama ang buwan, OR number, pangalan ng dokumento, o detalye ng screenshot kung naaangkop.'],
        ['Related record', 'Kaugnay na record'],
        ['No related record selected', 'Walang napiling kaugnay na record'],
        ['Attachment', 'Kalakip'],
        ['Screenshots, receipts, proof, or supporting documents. Max 5MB.', 'Mga screenshot, resibo, patunay, o sumusuportang dokumento. Hanggang 5MB.'],
        ['Submit concern', 'Isumite ang concern'],
        ['My Concerns', 'Aking mga Concern'],
        ['No concerns submitted yet. Use the form to submit a concern when you need help from Social Worker support.', 'Wala ka pang naisusumiteng concern. Gamitin ang form para magsumite kapag kailangan mo ng tulong mula sa Social Worker support.'],
        ['Document preview', 'Preview ng dokumento'],
        ['Close', 'Isara'],
        ['No remarks yet.', 'Wala pang tala.'],
        ['No remarks recorded for this status update.', 'Wala pang naitalang tala para sa update ng status na ito.'],
        ['No notice sent yet', 'Wala pang naipadalang abiso'],
        ['Last sent', 'Huling ipinadala'],
    ];
    const phraseByKey = new Map();
    const phraseLookup = new Map();
    phrases.forEach(([en, ceb]) => {
        const key = en.toLowerCase();
        phraseByKey.set(key, { en, ceb });
        phraseLookup.set(en.toLowerCase(), key);
        phraseLookup.set(ceb.toLowerCase(), key);
    });
    const skipSelector = [
        'script',
        'style',
        'input',
        'textarea',
        '[contenteditable="true"]',
        '#notificationList',
        '.notification-list',
        '.mobile-account-menu'
    ].join(',');
    let observer;
    let isApplying = false;

    function normalizeLanguage(language) {
        return language === 'ceb' ? 'ceb' : defaultLanguage;
    }

    function readLanguage() {
        try {
            return normalizeLanguage(window.localStorage.getItem(storageKey));
        } catch (error) {
            return defaultLanguage;
        }
    }

    function writeLanguage(language) {
        try {
            window.localStorage.setItem(storageKey, language);
        } catch (error) {
            // Ignore storage errors; the active page can still switch language.
        }
    }

    function translate(key, language = readLanguage()) {
        return labels[key]?.[normalizeLanguage(language)] || labels[key]?.[defaultLanguage] || '';
    }

    function translatePhrase(value, language = readLanguage()) {
        const text = String(value || '').trim();
        if (!text) {
            return '';
        }
        const key = phraseLookup.get(text.toLowerCase());
        if (key) {
            return phraseByKey.get(key)?.[normalizeLanguage(language)] || text;
        }
        return translatePattern(text, normalizeLanguage(language));
    }

    function translatePattern(text, language) {
        const replacements = language === 'ceb'
            ? [
                [/^(\d+) requirements$/i, '$1 requirement'],
                [/^(\d+) receipts?$/i, '$1 resibo'],
                [/^(\d+) months verified$/i, '$1 buwang beripikado'],
                [/^(\d+) awaiting review$/i, '$1 naghihintay ng pagsusuri'],
                [/^(\d+)% complete$/i, '$1% kumpleto'],
                [/^Completion (\d+)%$/i, 'Pagkumpleto $1%'],
                [/^Uploaded for verification\.$/i, 'Na-upload para sa beripikasyon.'],
                [/^Awaiting PDO\/Admin verification$/i, 'Naghihintay ng beripikasyon ng PDO/Admin'],
                [/^(\d+)\/(\d+) uploaded$/i, '$1/$2 na-upload'],
                [/^(\d+)\/(\d+) requirements$/i, '$1/$2 requirement'],
                [/^(\d+) verified$/i, '$1 beripikado'],
                [/^(\d+) remarks$/i, '$1 remark'],
                [/^Last sent (.+)$/i, 'Huling ipinadala $1'],
                [/^Notified (.+)$/i, 'Naabisuhan $1'],
            ]
            : [
                [/^(\d+) resibo$/i, '$1 receipts'],
                [/^(\d+) buwang beripikado$/i, '$1 months verified'],
                [/^(\d+) naghihintay ng pagsusuri$/i, '$1 awaiting review'],
                [/^(\d+)% kumpleto$/i, '$1% complete'],
                [/^Pagkumpleto (\d+)%$/i, 'Completion $1%'],
                [/^Na-upload para sa beripikasyon\.$/i, 'Uploaded for verification.'],
                [/^Naghihintay ng beripikasyon ng PDO\/Admin$/i, 'Awaiting PDO/Admin verification'],
                [/^(\d+)\/(\d+) na-upload$/i, '$1/$2 uploaded'],
                [/^(\d+)\/(\d+) requirement$/i, '$1/$2 requirements'],
                [/^(\d+) beripikado$/i, '$1 verified'],
                [/^(\d+) remark$/i, '$1 remarks'],
                [/^Huling ipinadala (.+)$/i, 'Last sent $1'],
                [/^Naabisuhan (.+)$/i, 'Notified $1'],
            ];
        for (const [pattern, replacement] of replacements) {
            if (pattern.test(text)) {
                return text.replace(pattern, replacement);
            }
        }
        return text;
    }

    function shouldSkipNode(node) {
        const parent = node.parentElement;
        return !parent || Boolean(parent.closest(skipSelector));
    }

    function replaceTextNode(node, language) {
        if (shouldSkipNode(node)) {
            return;
        }
        const original = node.nodeValue || '';
        const trimmed = original.trim();
        if (!trimmed) {
            return;
        }
        const translated = translatePhrase(trimmed, language);
        if (!translated || translated === trimmed) {
            return;
        }
        node.nodeValue = original.replace(trimmed, translated);
    }

    function applyPhraseLanguage(language) {
        const roots = document.querySelectorAll('.dash-content, .portal-loader');
        roots.forEach((root) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) {
                nodes.push(walker.currentNode);
            }
            nodes.forEach((node) => replaceTextNode(node, language));
            root.querySelectorAll('[placeholder], [aria-label], [title]').forEach((element) => {
                if (element.closest(skipSelector)) {
                    return;
                }
                ['placeholder', 'aria-label', 'title'].forEach((attribute) => {
                    const value = element.getAttribute(attribute);
                    const translated = translatePhrase(value, language);
                    if (translated && translated !== value) {
                        element.setAttribute(attribute, translated);
                    }
                });
            });
        });
    }

    function applyLanguage(language = readLanguage()) {
        const activeLanguage = normalizeLanguage(language);
        if (isApplying) {
            return;
        }
        isApplying = true;
        document.documentElement.dataset.portalLanguage = activeLanguage;
        window.SMARTLEAP_LANGUAGE_CURRENT = activeLanguage;

        document.querySelectorAll('[data-i18n-key]').forEach((element) => {
            const nextLabel = translate(element.dataset.i18nKey, activeLanguage);
            if (nextLabel) {
                element.textContent = nextLabel;
            }
        });

        document.querySelectorAll('[data-language-option]').forEach((button) => {
            const isActive = button.dataset.languageOption === activeLanguage;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        applyPhraseLanguage(activeLanguage);
        isApplying = false;

        window.dispatchEvent(new CustomEvent('smartleap:language-change', {
            detail: { language: activeLanguage },
        }));
    }

    function setLanguage(language) {
        const activeLanguage = normalizeLanguage(language);
        writeLanguage(activeLanguage);
        applyLanguage(activeLanguage);
    }

    function bindLanguageToggles() {
        document.querySelectorAll('[data-language-option]').forEach((button) => {
            button.addEventListener('click', () => setLanguage(button.dataset.languageOption));
        });
    }

    function observeLanguageMutations() {
        if (observer) {
            observer.disconnect();
        }
        const target = document.querySelector('.dash-content');
        if (!target) {
            return;
        }
        let timer = 0;
        observer = new MutationObserver(() => {
            if (isApplying) {
                return;
            }
            window.clearTimeout(timer);
            timer = window.setTimeout(() => applyLanguage(), 30);
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    window.SMARTLEAP_I18N = {
        applyLanguage,
        setLanguage,
        translate: (key) => translate(key, readLanguage()),
        translatePhrase: (value) => translatePhrase(value, readLanguage()),
    };

    document.addEventListener('DOMContentLoaded', () => {
        bindLanguageToggles();
        applyLanguage();
        observeLanguageMutations();
    });

    window.addEventListener('hashchange', () => {
        window.setTimeout(() => applyLanguage(), 0);
    });
    window.addEventListener('smartleap:language-refresh', () => applyLanguage());
}());
