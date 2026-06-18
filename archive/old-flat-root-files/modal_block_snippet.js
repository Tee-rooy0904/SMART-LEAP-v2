function ensureCoreModals() {
    const modalIds = [
        'beneficiaryModal',
        'beneficiaryProfileModal',
        'applicationModal',
        'repaymentModal',
        'repaymentEditModal',
        'userModal',
        'releaseVerificationModal'
    ];
    modalIds.forEach((id) => {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
            btn.addEventListener('click', () => hideModal(modal));
        });
    });
}

function showModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('show');
    modalEl.style.display = 'flex';
    modalEl.removeAttribute('aria-hidden');
    modalEl.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
}

function hideModal(modalEl) {
    if (modalEl && modalEl.contains(document.activeElement)) { document.activeElement.blur(); }
    if (!modalEl) return;
    modalEl.classList.remove('show');
    modalEl.style.removeProperty('display');
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.removeAttribute('aria-modal');
    document.body.classList.remove('modal-open');
}
