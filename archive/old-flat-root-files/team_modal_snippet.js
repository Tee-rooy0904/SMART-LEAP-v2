function closeAllKebabMenus() {
    document.querySelectorAll('.dropdown-panel.is-open').forEach((panel) => panel.classList.remove('is-open'));
}

function openStaffModal({ mode, staffId } = {}) {
    const modal = document.getElementById("team-modal");
    if (!modal) return;
    modal.dataset.mode = mode || "add";
    modal.dataset.staffId = staffId ? String(staffId) : "";

    const title = document.getElementById("team-modal-title");
    const saveBtn = document.getElementById("team-user-save");

    if (modal.dataset.mode === "edit") {
        title.textContent = "Edit Staff";
        saveBtn.textContent = "Update";
        const staffMember = staff.find((item) => item.id === Number(staffId));
        if (staffMember) loadStaffIntoForm(staffMember);
    } else {
        title.textContent = "Add Staff";
        saveBtn.textContent = "Save";
        clearStaffForm();
    }

    modal.classList.add("is-open");
    modal.removeAttribute("aria-hidden");
}

function closeStaffModal() {
    const modal = document.getElementById("team-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
}

function clearStaffForm() {
    document.getElementById("team-user-id").value = "";
    document.getElementById("team-user-name").value = "";
    document.getElementById("team-user-role").value = "PDO";
    document.getElementById("team-user-email").value = "";
    document.getElementById("team-user-phone").value = "";
    document.getElementById("team-user-status").checked = true;
    document.getElementById("team-user-assignments").hidden = true;
}

function loadStaffIntoForm(user) {
    document.getElementById("team-user-id").value = user.id || "";
    document.getElementById("team-user-name").value = user.name || "";
    document.getElementById("team-user-role").value = user.role || "PDO";
    document.getElementById("team-user-email").value = user.email || "";
    document.getElementById("team-user-phone").value = user.phone || "";
    document.getElementById("team-user-status").checked = user.status === "active";

    const assignmentsBox = document.getElementById("team-user-assignments");
    const countEl = document.getElementById("team-user-assignments-count");
    if (user.role === "PDO") {
        const count = Object.values(assignments).filter((id) => id === user.id).length;
        assignmentsBox.hidden = false;
        countEl.textContent = `${count} assigned`;
    } else {
        assignmentsBox.hidden = true;
    }

    const isCurrentAdmin = user.email === CURRENT_ADMIN_EMAIL;
    document.getElementById("team-user-role").disabled = isCurrentAdmin;
    document.getElementById("team-user-status").disabled = isCurrentAdmin;
}

function handleStaffFormSubmit() {
    const modal = document.getElementById("team-modal");
    if (!modal) return;
    const mode = modal.dataset.mode || "add";
    const staffId = modal.dataset.staffId ? Number(modal.dataset.staffId) : null;

    if (mode === "edit") {
        updateStaff(staffId);
    } else {
        createStaff();
    }
}

function createStaff() {
    const name = document.getElementById("team-user-name").value.trim();
    const role = document.getElementById("team-user-role").value;
    const email = document.getElementById("team-user-email").value.trim();
    const phone = document.getElementById("team-user-phone").value.trim();
    const status = document.getElementById("team-user-status").checked ? "active" : "disabled";

    if (!name || !email || !role) {
        showToast("Please complete required fields.", "warning");
        return;
    }

    if (role === "Admin" && status !== "active") {
        alert("At least one active admin is required.");
        return;
    }

    const nextId = Math.max(0, ...staff.map((item) => item.id)) + 1;
    staff.push({ id: nextId, name, role, email, phone, status, hasHistory: false });
    closeStaffModal();
    renderUsersTab();
}

function updateStaff(staffId) {
    const user = staff.find((item) => item.id === staffId);
    if (!user) return;

    const name = document.getElementById("team-user-name").value.trim();
    const role = document.getElementById("team-user-role").value;
    const email = document.getElementById("team-user-email").value.trim();
    const phone = document.getElementById("team-user-phone").value.trim();
    const status = document.getElementById("team-user-status").checked ? "active" : "disabled";

    if (!name || !email || !role) {
        showToast("Please complete required fields.", "warning");
        return;
    }

    const currentAdmin = getCurrentAdmin();
    if (currentAdmin && currentAdmin.id === user.id && status !== "active") {
        alert("You cannot disable your own account.");
        return;
    }

    if (role === "Admin" && status !== "active") {
        const activeAdmins = staff.filter((u) => u.role === "Admin" && u.status === "active" && u.id !== user.id).length;
        if (activeAdmins < 1) {
            alert("At least one active admin is required.");
            return;
        }
    }

    Object.assign(user, { name, role, email, phone, status });
    closeStaffModal();
    renderUsersTab();
}
