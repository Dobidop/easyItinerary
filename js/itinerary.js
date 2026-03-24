/* ===== Itinerary Module ===== */
const Itinerary = (() => {
    let currentTrip = null;
    let editingActivity = null; // { dayIdx, actIdx } or null
    let dragState = null;

    function init(trip) {
        currentTrip = trip;
        render();
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('btnAddDay').addEventListener('click', addDay);
        document.getElementById('btnSaveActivity').addEventListener('click', saveActivity);
        document.getElementById('btnPickLocation').addEventListener('click', () => {
            MapModule.enablePickMode((lat, lng) => {
                document.getElementById('activityLat').value = lat.toFixed(6);
                document.getElementById('activityLng').value = lng.toFixed(6);
            });
        });

        // Resource linker for activities
        document.getElementById('activityLinkedResource').addEventListener('change', () => {
            const idx = document.getElementById('activityLinkedResource').value;
            if (idx === '') return;
            const res = currentTrip.resources[parseInt(idx)];
            if (!res) return;

            if (!document.getElementById('activityTitle').value.trim()) {
                document.getElementById('activityTitle').value = res.title;
            }
            if (res.url && !document.getElementById('activityLink').value.trim()) {
                document.getElementById('activityLink').value = res.url;
            }
            if (res.notes && !document.getElementById('activityDescription').value.trim()) {
                document.getElementById('activityDescription').value = res.notes;
            }
            if (res.lat && !document.getElementById('activityLat').value) {
                document.getElementById('activityLat').value = res.lat;
            }
            if (res.lng && !document.getElementById('activityLng').value) {
                document.getElementById('activityLng').value = res.lng;
            }

            // Map resource category to activity category
            const catMap = { restaurant: 'food', hotel: 'lodging', sightseeing: 'sightseeing', transport: 'transport', activity: 'activity', shopping: 'shopping' };
            if (catMap[res.category]) {
                document.getElementById('activityCategory').value = catMap[res.category];
            }
        });
    }

    function populateActivityResources() {
        const select = document.getElementById('activityLinkedResource');
        select.innerHTML = '<option value="">— None —</option>';
        (currentTrip.resources || []).forEach((res, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${res.title}${res.category ? ' (' + res.category + ')' : ''}`;
            select.appendChild(opt);
        });
    }

    function generateDaysFromDates() {
        if (!currentTrip.startDate || !currentTrip.endDate) return;
        const start = new Date(currentTrip.startDate);
        const end = new Date(currentTrip.endDate);
        if (start > end) return;

        const existingDays = currentTrip.days.length;
        const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        // Only add missing days
        for (let i = existingDays; i < totalDays; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            currentTrip.days.push({
                date: date.toISOString().split('T')[0],
                label: '',
                activities: [],
            });
        }
        Storage.saveTrip(currentTrip);
        render();
    }

    function addDay() {
        const lastDay = currentTrip.days[currentTrip.days.length - 1];
        let nextDate = '';
        if (lastDay && lastDay.date) {
            const d = new Date(lastDay.date);
            d.setDate(d.getDate() + 1);
            nextDate = d.toISOString().split('T')[0];
        } else if (currentTrip.startDate) {
            nextDate = currentTrip.startDate;
        }

        currentTrip.days.push({
            date: nextDate,
            label: '',
            activities: [],
        });
        Storage.saveTrip(currentTrip);
        render();
    }

    function removeDay(dayIdx) {
        if (!confirm('Delete this day and all its activities?')) return;
        currentTrip.days.splice(dayIdx, 1);
        Storage.saveTrip(currentTrip);
        render();
        App.updateStats();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function openActivityModal(dayIdx, actIdx) {
        editingActivity = { dayIdx, actIdx };
        const modal = document.getElementById('activityModal');
        const title = document.getElementById('activityModalTitle');

        populateActivityResources();

        if (actIdx !== null && actIdx !== undefined) {
            title.textContent = 'Edit Activity';
            const act = currentTrip.days[dayIdx].activities[actIdx];
            document.getElementById('activityTitle').value = act.title || '';
            document.getElementById('activityCategory').value = act.category || 'sightseeing';
            document.getElementById('activityStartTime').value = act.startTime || '';
            document.getElementById('activityEndTime').value = act.endTime || '';
            document.getElementById('activityCost').value = act.cost || '';
            document.getElementById('activityDescription').value = act.description || '';
            document.getElementById('activityLink').value = act.link || '';
            document.getElementById('activityAddress').value = act.address || '';
            document.getElementById('activityLat').value = act.lat || '';
            document.getElementById('activityLng').value = act.lng || '';
            document.getElementById('activityLinkedResource').value = act.linkedResourceIdx !== undefined ? act.linkedResourceIdx : '';
        } else {
            title.textContent = 'Add Activity';
            document.getElementById('activityTitle').value = '';
            document.getElementById('activityCategory').value = 'sightseeing';
            document.getElementById('activityStartTime').value = '';
            document.getElementById('activityEndTime').value = '';
            document.getElementById('activityCost').value = '';
            document.getElementById('activityDescription').value = '';
            document.getElementById('activityLink').value = '';
            document.getElementById('activityAddress').value = '';
            document.getElementById('activityLat').value = '';
            document.getElementById('activityLng').value = '';
            document.getElementById('activityLinkedResource').value = '';
        }
        modal.classList.add('open');
    }

    function saveActivity() {
        if (!editingActivity) return;
        const { dayIdx, actIdx } = editingActivity;
        const title = document.getElementById('activityTitle').value.trim();
        if (!title) {
            document.getElementById('activityTitle').focus();
            return;
        }

        const activity = {
            id: (actIdx !== null && actIdx !== undefined) ? currentTrip.days[dayIdx].activities[actIdx].id : Storage.generateId(),
            title,
            category: document.getElementById('activityCategory').value,
            startTime: document.getElementById('activityStartTime').value,
            endTime: document.getElementById('activityEndTime').value,
            cost: parseFloat(document.getElementById('activityCost').value) || 0,
            description: document.getElementById('activityDescription').value,
            link: document.getElementById('activityLink').value,
            address: document.getElementById('activityAddress').value,
            lat: parseFloat(document.getElementById('activityLat').value) || null,
            lng: parseFloat(document.getElementById('activityLng').value) || null,
            linkedResourceIdx: document.getElementById('activityLinkedResource').value || null,
        };

        if (actIdx !== null && actIdx !== undefined) {
            currentTrip.days[dayIdx].activities[actIdx] = activity;
        } else {
            currentTrip.days[dayIdx].activities.push(activity);
        }

        // Sort activities by start time (activities without time go to end)
        sortActivitiesByTime(currentTrip.days[dayIdx].activities);

        Storage.saveTrip(currentTrip);
        document.getElementById('activityModal').classList.remove('open');
        editingActivity = null;
        render();
        App.updateStats();
        Budget.update(currentTrip);
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function sortActivitiesByTime(activities) {
        activities.sort((a, b) => {
            // Activities with start time come first, sorted by time
            // Activities without start time keep their relative order at the end
            if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
            if (a.startTime && !b.startTime) return -1;
            if (!a.startTime && b.startTime) return 1;
            return 0;
        });
    }

    function deleteActivity(dayIdx, actIdx) {
        if (!confirm('Delete this activity?')) return;
        currentTrip.days[dayIdx].activities.splice(actIdx, 1);
        Storage.saveTrip(currentTrip);
        render();
        App.updateStats();
        Budget.update(currentTrip);
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function getCategoryIcon(cat) {
        const icons = {
            sightseeing: 'fa-camera',
            food: 'fa-utensils',
            transport: 'fa-plane',
            lodging: 'fa-bed',
            activity: 'fa-person-hiking',
            shopping: 'fa-bag-shopping',
            other: 'fa-ellipsis',
        };
        return icons[cat] || 'fa-location-dot';
    }

    function getLodgingForDay(dayDate) {
        if (!dayDate || !currentTrip.reservations) return [];
        return currentTrip.reservations.filter(r => {
            if (r.type !== 'hotel') return false;
            if (r.checkIn && r.checkOut) {
                return dayDate >= r.checkIn && dayDate <= r.checkOut;
            }
            // Fall back to single date
            return r.date === dayDate;
        });
    }

    function render() {
        const container = document.getElementById('itineraryDays');
        if (!currentTrip || currentTrip.days.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-calendar-plus"></i>
                    <p>No days planned yet. Set your trip dates in Overview or click "Add Day" to start planning.</p>
                </div>
            `;
            updateDayFilter();
            return;
        }

        let activityCounter = 1;
        container.innerHTML = currentTrip.days.map((day, dayIdx) => {
            const actCount = day.activities.length;

            // Find lodging reservations that span this day
            const lodgingHtml = getLodgingForDay(day.date).map(res => {
                const nights = (res.checkIn && res.checkOut) ? Math.ceil((new Date(res.checkOut) - new Date(res.checkIn)) / (1000*60*60*24)) : 0;
                const isCheckIn = res.checkIn === day.date;
                const isCheckOut = res.checkOut === day.date;
                let label = '';
                if (isCheckIn) label = 'Check-in';
                else if (isCheckOut) label = 'Check-out';
                return `
                    <div class="lodging-banner">
                        <i class="fa-solid fa-bed"></i>
                        <div class="lodging-banner-info">
                            <span class="lodging-banner-title">${escapeHtml(res.title)}</span>
                            ${label ? `<span class="lodging-banner-label">${label}</span>` : ''}
                            ${res.provider ? `<span class="lodging-banner-provider">${escapeHtml(res.provider)}</span>` : ''}
                        </div>
                        ${nights > 0 ? `<span class="lodging-banner-nights">${nights}n</span>` : ''}
                    </div>
                `;
            }).join('');

            const activitiesHtml = day.activities.map((act, actIdx) => {
                const num = activityCounter++;
                const timeStr = act.startTime ? `${act.startTime}${act.endTime ? ' - ' + act.endTime : ''}` : '';
                return `
                    <div class="activity-card" draggable="true" data-day="${dayIdx}" data-act="${actIdx}">
                        <div class="activity-marker ${act.category}"><i class="fa-solid ${getCategoryIcon(act.category)}"></i></div>
                        <div class="activity-top-row">
                            <span class="activity-title">${escapeHtml(act.title)}</span>
                            <span class="activity-time">${timeStr}</span>
                        </div>
                        <div class="activity-details">
                            ${act.description ? `<div>${escapeHtml(act.description)}</div>` : ''}
                            ${act.address ? `<div class="activity-address"><i class="fa-solid fa-location-dot"></i>${escapeHtml(act.address)}</div>` : ''}
                        </div>
                        <div class="activity-bottom-row">
                            <div class="activity-tags">
                                <span class="activity-tag ${act.category}">${act.category}</span>
                                ${act.cost ? `<span class="activity-tag other">${getCurrencySymbol(currentTrip.budgetCurrency)}${act.cost}</span>` : ''}
                            </div>
                            <div class="activity-actions">
                                ${act.lat && act.lng ? `<button title="Show on map" onclick="Itinerary.showOnMap(${act.lat}, ${act.lng})"><i class="fa-solid fa-map-location-dot"></i></button>` : ''}
                                ${act.link ? `<button title="Open link" onclick="window.open('${escapeHtml(act.link)}', '_blank')"><i class="fa-solid fa-external-link"></i></button>` : ''}
                                <button title="Edit" onclick="Itinerary.openActivityModal(${dayIdx}, ${actIdx})"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn-delete" title="Delete" onclick="Itinerary.deleteActivity(${dayIdx}, ${actIdx})"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="day-card" data-day="${dayIdx}">
                    <div class="day-header" onclick="Itinerary.toggleDay(${dayIdx})">
                        <div class="day-header-left">
                            <i class="fa-solid fa-chevron-down"></i>
                            <div>
                                <div class="day-title">Day ${dayIdx + 1}${day.label ? ' — ' + escapeHtml(day.label) : ''}</div>
                                <div class="day-date">${formatDate(day.date)} <span class="day-summary">${actCount} ${actCount === 1 ? 'activity' : 'activities'}</span></div>
                            </div>
                        </div>
                        <div class="day-header-actions">
                            <button title="Delete day" onclick="event.stopPropagation(); Itinerary.removeDay(${dayIdx})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="day-body">
                        ${lodgingHtml}
                        <div class="activity-timeline" data-day="${dayIdx}">
                            ${activitiesHtml}
                        </div>
                        <button class="add-activity-btn" onclick="Itinerary.openActivityModal(${dayIdx}, null)">
                            <i class="fa-solid fa-plus"></i> Add activity
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        updateDayFilter();
        setupDragAndDrop();
    }

    function toggleDay(dayIdx) {
        const card = document.querySelector(`.day-card[data-day="${dayIdx}"]`);
        if (card) card.classList.toggle('collapsed');
    }

    function showOnMap(lat, lng) {
        MapModule.panTo(lat, lng, 16);
    }

    function updateDayFilter() {
        const select = document.getElementById('mapDayFilter');
        const currentValue = select.value;
        select.innerHTML = '<option value="all">All Days</option>';
        if (currentTrip) {
            currentTrip.days.forEach((day, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `Day ${idx + 1}${day.date ? ' — ' + day.date : ''}`;
                select.appendChild(opt);
            });
        }
        select.value = currentValue;
    }

    function setupDragAndDrop() {
        document.querySelectorAll('.activity-card[draggable]').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                dragState = {
                    dayIdx: parseInt(card.dataset.day),
                    actIdx: parseInt(card.dataset.act),
                };
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.activity-card.drag-over').forEach(el => el.classList.remove('drag-over'));
                dragState = null;
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (!dragState) return;

                const toDayIdx = parseInt(card.dataset.day);
                const toActIdx = parseInt(card.dataset.act);
                const { dayIdx: fromDayIdx, actIdx: fromActIdx } = dragState;

                if (fromDayIdx === toDayIdx && fromActIdx === toActIdx) return;

                // Remove from source
                const [activity] = currentTrip.days[fromDayIdx].activities.splice(fromActIdx, 1);
                // Insert at target
                currentTrip.days[toDayIdx].activities.splice(toActIdx, 0, activity);

                Storage.saveTrip(currentTrip);
                render();
                MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
            });
        });
    }

    function getCurrencySymbol(code) {
        const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'Fr', CAD: '$', AUD: '$', THB: '฿' };
        return symbols[code] || code + ' ';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function update(trip) {
        currentTrip = trip;
        render();
    }

    return {
        init,
        update,
        render,
        generateDaysFromDates,
        addDay,
        removeDay,
        openActivityModal,
        saveActivity,
        deleteActivity,
        toggleDay,
        showOnMap,
    };
})();
