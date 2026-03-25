/* ===== Main App Module ===== */
const App = (() => {
    let currentTrip = null;

    async function init() {
        // Apply saved theme before anything renders
        initTheme();

        // Check for shared trip in URL
        const shareId = Storage.checkForSharedTrip();
        if (shareId) {
            try {
                currentTrip = await Storage.loadSharedTrip(shareId);
                showToast(`Joined shared trip: ${currentTrip.name}`);
                // Keep ?trip= in URL so refresh reconnects
            } catch {
                showToast('Shared trip not found');
                currentTrip = Storage.getActiveTrip();
            }
        } else {
            currentTrip = Storage.getActiveTrip();
        }

        // Start sync polling if this trip is shared
        if (currentTrip.shareId) {
            Storage.startSyncPolling(currentTrip, (updatedTrip) => {
                currentTrip = updatedTrip;
                reloadAll();
                showToast('Trip updated by collaborator');
            });
        }

        // Init all modules
        MapModule.init();
        Itinerary.init(currentTrip);
        Budget.init(currentTrip);
        Resources.init(currentTrip);

        // Populate UI
        populateTripSelector();
        loadTripData();
        setupNavigation();
        setupOverview();
        setupTopBar();
        setupModals();
        setupThemePicker();
        anchorDateInputsToTrip();
        updateStats();
        MapModule.updateMarkers(currentTrip, 'all');

        // Auto-save on input changes in overview
        setupAutoSave();
    }

    // ===== Theme =====
    function initTheme() {
        const saved = localStorage.getItem('easyitinerary-theme') || 'warm';
        applyTheme(saved);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('easyitinerary-theme', theme);

        // Update map tiles if map is initialized
        if (typeof MapModule !== 'undefined' && MapModule.setTileLayer) {
            try { MapModule.setTileLayer(theme); } catch(e) { /* map not ready yet */ }
        }

        // Update active state in dropdown
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    function setupThemePicker() {
        const btn = document.getElementById('btnTheme');
        const dropdown = document.getElementById('themeDropdown');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                applyTheme(option.dataset.theme);
                dropdown.classList.remove('open');
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-picker')) {
                dropdown.classList.remove('open');
            }
        });

        // Mark current theme as active
        const current = localStorage.getItem('easyitinerary-theme') || 'dark';
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === current);
        });
    }

    // ===== Navigation =====
    function setupNavigation() {
        document.querySelectorAll('.section-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const section = tab.dataset.section;
                switchSection(section);
            });
        });

        // Summary card shortcuts
        document.querySelectorAll('.summary-card[data-goto]').forEach(card => {
            card.addEventListener('click', () => {
                switchSection(card.dataset.goto);
            });
        });

        // Map day filter
        document.getElementById('mapDayFilter').addEventListener('change', (e) => {
            MapModule.updateMarkers(currentTrip, e.target.value, false);
        });

        // Route toggle
        document.getElementById('btnToggleRoute').addEventListener('click', () => {
            MapModule.toggleRoute();
        });

        // Fit map button
        document.getElementById('btnFitMap').addEventListener('click', () => {
            MapModule.fitBounds();
        });

        // Toggle panel
        document.getElementById('btnTogglePanel').addEventListener('click', () => {
            const panel = document.querySelector('.left-panel');
            panel.classList.toggle('collapsed');
            setTimeout(() => MapModule.invalidateSize(), 300);
        });
    }

    function switchSection(name) {
        document.querySelectorAll('.section-tab').forEach(t => t.classList.toggle('active', t.dataset.section === name));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const sectionMap = {
            overview: 'sectionOverview',
            itinerary: 'sectionItinerary',
            budget: 'sectionBudget',
            resources: 'sectionResources',
        };
        const el = document.getElementById(sectionMap[name]);
        if (el) el.classList.add('active');
    }

    // ===== Top Bar =====
    function setupTopBar() {
        document.getElementById('btnNewTrip').addEventListener('click', () => {
            const name = prompt('Trip name:', 'New Trip');
            if (!name) return;
            const trip = Storage.createTrip(name);
            Storage.saveTrip(trip);
            currentTrip = trip;
            reloadAll();
            showToast('New trip created');
        });

        document.getElementById('btnDeleteTrip').addEventListener('click', () => {
            if (!confirm(`Delete "${currentTrip.name}"? This cannot be undone.`)) return;
            Storage.deleteTrip(currentTrip.id);
            currentTrip = Storage.getActiveTrip();
            reloadAll();
            showToast('Trip deleted');
        });

        document.getElementById('tripSelector').addEventListener('change', (e) => {
            Storage.setActiveTrip(e.target.value);
            currentTrip = Storage.getActiveTrip();
            reloadAll();
        });

        document.getElementById('btnShare').addEventListener('click', async () => {
            try {
                const result = await Storage.shareTrip(currentTrip);
                const shareUrl = `${window.location.origin}${result.url}`;
                await navigator.clipboard.writeText(shareUrl);
                // Update URL to include share param
                window.history.replaceState({}, '', result.url);
                // Start sync polling if not already running
                Storage.startSyncPolling(currentTrip, (updatedTrip) => {
                    currentTrip = updatedTrip;
                    reloadAll();
                    showToast('Trip updated by collaborator');
                });
                showToast('Share link copied! Trip is now synced.');
            } catch (err) {
                showToast('Failed to share trip');
            }
        });

        document.getElementById('btnExport').addEventListener('click', () => {
            Storage.exportTrip(currentTrip);
            showToast('Trip exported');
        });

        document.getElementById('btnImport').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const trip = await Storage.importTrip(file);
                currentTrip = trip;
                reloadAll();
                showToast('Trip imported successfully');
            } catch {
                showToast('Failed to import trip');
            }
            e.target.value = '';
        });
    }

    function populateTripSelector() {
        const select = document.getElementById('tripSelector');
        const data = Storage.getAll();
        select.innerHTML = data.trips.map(t =>
            `<option value="${t.id}" ${t.id === currentTrip.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
        ).join('');
    }

    // ===== Overview =====
    function setupOverview() {
        // Collapsible sections
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });

        // Reservations
        document.getElementById('btnAddReservation').addEventListener('click', () => openReservationModal(null));
        document.getElementById('btnSaveReservation').addEventListener('click', saveReservation);
        document.getElementById('reservationType').addEventListener('change', () => {
            toggleReservationDates();
            populateReservationResources();
        });
        document.getElementById('reservationLinkedResource').addEventListener('change', onReservationResourceSelected);

        // Checklist
        document.getElementById('btnAddChecklist').addEventListener('click', addChecklistItem);
        document.getElementById('checklistInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addChecklistItem();
        });
    }

    function loadTripData() {
        document.getElementById('tripName').value = currentTrip.name || '';
        document.getElementById('tripStartDate').value = currentTrip.startDate || '';
        document.getElementById('tripEndDate').value = currentTrip.endDate || '';
        document.getElementById('tripNotes').value = currentTrip.notes || '';
        updateTripDuration();
        renderReservations();
        renderChecklist();
    }

    function setupAutoSave() {
        // Trip name
        document.getElementById('tripName').addEventListener('input', (e) => {
            currentTrip.name = e.target.value;
            Storage.saveTrip(currentTrip);
            populateTripSelector();
        });

        // Dates
        document.getElementById('tripStartDate').addEventListener('change', (e) => {
            currentTrip.startDate = e.target.value;
            Storage.saveTrip(currentTrip);
            updateTripDuration();
            Itinerary.generateDaysFromDates();
        });
        document.getElementById('tripEndDate').addEventListener('change', (e) => {
            currentTrip.endDate = e.target.value;
            Storage.saveTrip(currentTrip);
            updateTripDuration();
            Itinerary.generateDaysFromDates();
        });

        // Notes
        document.getElementById('tripNotes').addEventListener('input', (e) => {
            currentTrip.notes = e.target.value;
            Storage.saveTrip(currentTrip);
        });
    }

    function updateTripDuration() {
        const el = document.getElementById('tripDuration');
        if (currentTrip.startDate && currentTrip.endDate) {
            const start = new Date(currentTrip.startDate);
            const end = new Date(currentTrip.endDate);
            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            if (days > 0) {
                el.textContent = `(${days} day${days !== 1 ? 's' : ''})`;
            } else {
                el.textContent = '';
            }
        } else {
            el.textContent = '';
        }
    }

    // ===== Reservations =====
    let editingReservationIdx = null;

    function populateReservationResources() {
        const select = document.getElementById('reservationLinkedResource');
        const type = document.getElementById('reservationType').value;
        select.innerHTML = '<option value="">— None —</option>';

        // Map reservation types to resource categories
        const categoryMap = {
            hotel: ['hotel'],
            flight: ['transport'],
            train: ['transport'],
            bus: ['transport'],
            rental: ['transport'],
            other: [],
        };
        const matchCategories = categoryMap[type] || [];

        (currentTrip.resources || []).forEach((res, idx) => {
            // Show matching resources first, but include all
            const match = matchCategories.length === 0 || matchCategories.includes(res.category);
            const prefix = match ? '' : '';
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${res.title}${res.category ? ' (' + res.category + ')' : ''}`;
            if (match) opt.style.fontWeight = '600';
            select.appendChild(opt);
        });
    }

    function onReservationResourceSelected() {
        const idx = document.getElementById('reservationLinkedResource').value;
        if (idx === '') return;
        const res = currentTrip.resources[parseInt(idx)];
        if (!res) return;

        // Auto-set reservation type based on resource category
        const catToType = { hotel: 'hotel', transport: 'flight', restaurant: 'other', activity: 'other', general: 'other' };
        if (catToType[res.category]) {
            document.getElementById('reservationType').value = catToType[res.category];
            toggleReservationDates();
        }

        if (!document.getElementById('reservationTitle').value.trim()) {
            document.getElementById('reservationTitle').value = res.title;
        }
        if (res.url && !document.getElementById('reservationLink').value.trim()) {
            document.getElementById('reservationLink').value = res.url;
        }
        if (res.notes && !document.getElementById('reservationNotes').value.trim()) {
            document.getElementById('reservationNotes').value = res.notes;
        }
    }

    function toggleReservationDates() {
        const type = document.getElementById('reservationType').value;
        const row = document.getElementById('reservationDatesRow');
        row.style.display = type === 'hotel' ? 'flex' : 'none';
    }

    function openReservationModal(idx) {
        editingReservationIdx = idx;
        const modal = document.getElementById('reservationModal');
        const title = document.getElementById('reservationModalTitle');

        if (idx !== null && idx !== undefined) {
            title.textContent = 'Edit Reservation';
            const res = currentTrip.reservations[idx];
            document.getElementById('reservationType').value = res.type || 'other';
            document.getElementById('reservationTitle').value = res.title || '';
            document.getElementById('reservationProvider').value = res.provider || '';
            document.getElementById('reservationConfirmation').value = res.confirmation || '';
            document.getElementById('reservationDate').value = res.date || '';
            document.getElementById('reservationTime').value = res.time || '';
            document.getElementById('reservationCost').value = res.cost || '';
            document.getElementById('reservationNotes').value = res.notes || '';
            document.getElementById('reservationLink').value = res.link || '';
            document.getElementById('reservationCheckIn').value = res.checkIn || '';
            document.getElementById('reservationCheckOut').value = res.checkOut || '';
            document.getElementById('reservationLinkedResource').value = res.linkedResourceIdx !== undefined ? res.linkedResourceIdx : '';
        } else {
            title.textContent = 'Add Reservation';
            document.getElementById('reservationType').value = 'flight';
            document.getElementById('reservationTitle').value = '';
            document.getElementById('reservationProvider').value = '';
            document.getElementById('reservationConfirmation').value = '';
            document.getElementById('reservationDate').value = currentTrip.startDate || '';
            document.getElementById('reservationTime').value = '';
            document.getElementById('reservationCost').value = '';
            document.getElementById('reservationNotes').value = '';
            document.getElementById('reservationLink').value = '';
            document.getElementById('reservationCheckIn').value = currentTrip.startDate || '';
            document.getElementById('reservationCheckOut').value = currentTrip.endDate || '';
            document.getElementById('reservationLinkedResource').value = '';
        }
        populateReservationResources();
        toggleReservationDates();
        modal.classList.add('open');
    }

    function saveReservation() {
        const title = document.getElementById('reservationTitle').value.trim();
        if (!title) {
            document.getElementById('reservationTitle').focus();
            return;
        }

        const type = document.getElementById('reservationType').value;
        const reservation = {
            id: editingReservationIdx !== null ? currentTrip.reservations[editingReservationIdx].id : Storage.generateId(),
            type,
            title,
            provider: document.getElementById('reservationProvider').value,
            confirmation: document.getElementById('reservationConfirmation').value,
            date: document.getElementById('reservationDate').value,
            time: document.getElementById('reservationTime').value,
            cost: parseFloat(document.getElementById('reservationCost').value) || 0,
            notes: document.getElementById('reservationNotes').value,
            link: document.getElementById('reservationLink').value,
            checkIn: type === 'hotel' ? document.getElementById('reservationCheckIn').value : '',
            checkOut: type === 'hotel' ? document.getElementById('reservationCheckOut').value : '',
            linkedResourceIdx: document.getElementById('reservationLinkedResource').value || null,
        };

        if (editingReservationIdx !== null) {
            currentTrip.reservations[editingReservationIdx] = reservation;
        } else {
            currentTrip.reservations.push(reservation);
        }

        Storage.saveTrip(currentTrip);
        document.getElementById('reservationModal').classList.remove('open');
        editingReservationIdx = null;
        renderReservations();
        Budget.update(currentTrip);
        updateStats();
    }

    function deleteReservation(idx) {
        if (!confirm('Delete this reservation?')) return;
        currentTrip.reservations.splice(idx, 1);
        Storage.saveTrip(currentTrip);
        renderReservations();
        Budget.update(currentTrip);
        updateStats();
    }

    function renderReservations() {
        const container = document.getElementById('reservationsList');
        if (!currentTrip.reservations || currentTrip.reservations.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No reservations added yet.</p></div>';
            return;
        }

        const typeIcons = {
            flight: { icon: 'fa-plane', class: 'flight' },
            hotel: { icon: 'fa-bed', class: 'hotel' },
            rental: { icon: 'fa-car', class: 'rental' },
            train: { icon: 'fa-train', class: 'train' },
            bus: { icon: 'fa-bus', class: 'bus' },
            other: { icon: 'fa-ellipsis', class: 'other' },
        };

        // Sort by date (check-in for hotels, date for others), then by time
        const sorted = currentTrip.reservations
            .map((res, idx) => ({ ...res, _idx: idx }))
            .sort((a, b) => {
                const dateA = (a.type === 'hotel' && a.checkIn) ? a.checkIn : (a.date || '');
                const dateB = (b.type === 'hotel' && b.checkIn) ? b.checkIn : (b.date || '');
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return (a.time || '').localeCompare(b.time || '');
            });

        container.innerHTML = sorted.map((res) => {
            const idx = res._idx;
            const t = typeIcons[res.type] || typeIcons.other;
            const sym = Budget.getCurrencySymbol(currentTrip.budgetCurrency);

            // Build date display
            let dateDisplay = '';
            if (res.type === 'hotel' && res.checkIn && res.checkOut) {
                const nights = Math.ceil((new Date(res.checkOut) - new Date(res.checkIn)) / (1000*60*60*24));
                dateDisplay = `<span><i class="fa-regular fa-calendar"></i> ${res.checkIn} → ${res.checkOut}${nights > 0 ? ` (${nights} night${nights !== 1 ? 's' : ''})` : ''}</span>`;
            } else if (res.date) {
                dateDisplay = `<span><i class="fa-regular fa-calendar"></i> ${res.date}</span>`;
            }

            return `
                <div class="reservation-card">
                    <div class="reservation-icon ${t.class}"><i class="fa-solid ${t.icon}"></i></div>
                    <div class="reservation-info">
                        <h4>${escapeHtml(res.title)}</h4>
                        <div class="reservation-meta">
                            ${res.provider ? `<span>${escapeHtml(res.provider)}</span>` : ''}
                            ${dateDisplay}
                            ${res.time ? `<span><i class="fa-regular fa-clock"></i> ${res.time}</span>` : ''}
                            ${res.cost ? `<span>${sym}${res.cost}</span>` : ''}
                        </div>
                        ${res.confirmation ? `<span class="reservation-confirmation" onclick="navigator.clipboard.writeText('${escapeHtml(res.confirmation)}'); showToast('Copied')" title="Click to copy">${escapeHtml(res.confirmation)}</span>` : ''}
                    </div>
                    <div class="reservation-actions">
                        ${res.link ? `<button onclick="window.open('${escapeHtml(res.link)}', '_blank')" title="Open link"><i class="fa-solid fa-external-link"></i></button>` : ''}
                        <button onclick="App.openReservationModal(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="App.deleteReservation(${idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== Checklist =====
    function addChecklistItem() {
        const input = document.getElementById('checklistInput');
        const text = input.value.trim();
        if (!text) return;

        currentTrip.checklist.push({ text, checked: false });
        Storage.saveTrip(currentTrip);
        input.value = '';
        renderChecklist();
    }

    function toggleChecklistItem(idx) {
        currentTrip.checklist[idx].checked = !currentTrip.checklist[idx].checked;
        Storage.saveTrip(currentTrip);
        renderChecklist();
    }

    function deleteChecklistItem(idx) {
        currentTrip.checklist.splice(idx, 1);
        Storage.saveTrip(currentTrip);
        renderChecklist();
    }

    function renderChecklist() {
        const container = document.getElementById('checklistItems');
        if (!currentTrip.checklist || currentTrip.checklist.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = currentTrip.checklist.map((item, idx) => `
            <div class="checklist-item ${item.checked ? 'checked' : ''}">
                <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="App.toggleChecklistItem(${idx})" />
                <span>${escapeHtml(item.text)}</span>
                <button onclick="App.deleteChecklistItem(${idx})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join('');
    }

    // ===== Stats =====
    function updateStats() {
        const totalDays = currentTrip.days.length;
        const totalActivities = currentTrip.days.reduce((sum, d) => sum + d.activities.length, 0);
        const sym = Budget.getCurrencySymbol(currentTrip.budgetCurrency);
        const spent = Budget.getTotalSpent();
        const totalLinks = (currentTrip.resources || []).length;

        document.getElementById('statDays').textContent = totalDays;
        document.getElementById('statActivities').textContent = totalActivities;
        document.getElementById('statBudget').textContent = `${sym}${spent.toFixed(spent % 1 === 0 ? 0 : 2)}`;
        document.getElementById('statLinks').textContent = totalLinks;
    }

    // ===== Modals =====
    function setupModals() {
        // Close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = document.getElementById(btn.dataset.close);
                if (modal) modal.classList.remove('open');
            });
        });

        // Click outside to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('open');
            });
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
            }
        });
    }

    // ===== Reload =====
    function reloadAll() {
        populateTripSelector();
        loadTripData();
        Itinerary.update(currentTrip);
        Budget.update(currentTrip);
        Resources.update(currentTrip);
        updateStats();
        MapModule.updateMarkers(currentTrip, 'all');
    }

    // ===== Helpers =====
    function anchorDateInputsToTrip() {
        // For any date input inside a modal that is empty, temporarily set value
        // to trip start date on focus so the picker opens to the right month,
        // then clear it on blur if unchanged.
        document.querySelectorAll('.modal input[type="date"]').forEach(input => {
            if (input._dateAnchored) return;
            input._dateAnchored = true;

            input.addEventListener('focus', () => {
                if (!input.value) {
                    // For check-out, use check-in date as anchor if available
                    let anchor = currentTrip.startDate || '';
                    if (input.id === 'reservationCheckOut') {
                        const checkIn = document.getElementById('reservationCheckIn').value;
                        if (checkIn) anchor = checkIn;
                    }
                    if (anchor) {
                        input._wasEmpty = true;
                        input._anchorValue = anchor;
                        input.value = anchor;
                    }
                } else {
                    input._wasEmpty = false;
                }
            });

            input.addEventListener('blur', () => {
                if (input._wasEmpty && input.value === input._anchorValue) {
                    input.value = '';
                }
                input._wasEmpty = false;
            });
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        init,
        updateStats,
        switchSection,
        openReservationModal,
        deleteReservation,
        toggleChecklistItem,
        deleteChecklistItem,
    };
})();

// ===== Toast =====
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Init on DOM ready =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
