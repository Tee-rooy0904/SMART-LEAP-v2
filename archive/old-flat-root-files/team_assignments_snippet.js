function renderBarangayList() {
    const container = document.getElementById("barangay-list");
    if (!container) return;

    const search = (teamState.barangaySearch || "").toLowerCase();
    const filter = teamState.assignmentFilter || "all";
    const currentPdoId = teamState.selectedPdoId;

    const list = barangays.filter((b) => b.name.toLowerCase().includes(search));

    const filtered = list.filter((b) => {
        const assignedTo = teamState.assignmentsDraft?.[b.id];
        if (filter === "unassigned") return !assignedTo;
        if (filter === "assigned-self") return assignedTo === currentPdoId;
        if (filter === "assigned-other") return assignedTo && assignedTo !== currentPdoId;
        return true;
    });

    container.innerHTML = filtered.map((b) => {
        const assignedTo = teamState.assignmentsDraft?.[b.id];
        const checked = assignedTo === currentPdoId;
        const helper = assignedTo && assignedTo !== currentPdoId
            ? `Assigned to ${getStaffName(assignedTo)}`
            : assignedTo === currentPdoId
                ? "Assigned to this PDO"
                : "Unassigned";
        return `
            <div class="assignments-row">
                <label class="assignments-cell">
                    <input type="checkbox" data-barangay-id="${b.id}" ${checked ? "checked" : ""}>
                    <span>${b.name}</span>
                </label>
                <span class="assignments-helper">${helper}</span>
            </div>`;
    }).join("") || '<div class="muted">No barangays found.</div>';

    container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.addEventListener('change', () => {
            toggleBarangayAssignment(currentPdoId, input.dataset.barangayId, input.checked);
        });
    });

    updateAssignmentsHeader();
    updateAssignSaveState();
}
