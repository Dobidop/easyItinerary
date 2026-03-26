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

        // Resource picker for activities (initialized after DOM ready via initPicker)
    }

    let activityPicker = null;

    function initPicker() {
        activityPicker = ResourcePicker.init(
            document.getElementById('activityResourcePicker'),
            document.getElementById('activityLinkedResource'),
            {
                getTrip: () => currentTrip,
                onSelect: (_id, res) => {
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
                    const catMap = { restaurant: 'food', hotel: 'lodging', sightseeing: 'sightseeing', transport: 'transport', activity: 'activity', shopping: 'shopping' };
                    if (catMap[res.category]) {
                        document.getElementById('activityCategory').value = catMap[res.category];
                    }
                },
            }
        );
    }

    function populateActivityResources() {
        if (!activityPicker) initPicker();
        activityPicker.renderList();
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
            activityPicker.setValue(act.linkedResourceId || act.linkedResourceIdx || '');
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
            activityPicker.clear();
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
            linkedResourceId: document.getElementById('activityLinkedResource').value || null,
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

    function buildTimelineBar(activities, dep, ret) {
        const timed = activities.filter(a => a.startTime);
        // Include endpoints in timing
        const endpointTimes = [];
        if (dep && dep.time) endpointTimes.push(dep.time);
        if (ret && ret.time) endpointTimes.push(ret.time);
        if (timed.length === 0 && endpointTimes.length === 0) return '';

        // Find day range from earliest start to latest end
        const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let earliest = 24 * 60, latest = 0;
        timed.forEach(a => {
            const s = toMin(a.startTime);
            const e = a.endTime ? toMin(a.endTime) : s + 30;
            if (s < earliest) earliest = s;
            if (e > latest) latest = e;
        });
        endpointTimes.forEach(t => {
            const m = toMin(t);
            if (m < earliest) earliest = m;
            if (m > latest) latest = m;
        });

        // Snap to hour boundaries with padding
        earliest = Math.floor(earliest / 60) * 60;
        latest = Math.ceil(latest / 60) * 60;
        if (latest <= earliest) latest = earliest + 60;
        const span = latest - earliest;

        // Hour labels
        const hours = [];
        for (let m = earliest; m <= latest; m += 60) {
            const pct = ((m - earliest) / span) * 100;
            const h = Math.floor(m / 60);
            hours.push(`<span class="tbar-hour" style="left:${pct}%">${h}:00</span>`);
        }

        // Activity blocks
        const blocks = timed.map(a => {
            const s = toMin(a.startTime);
            const e = a.endTime ? toMin(a.endTime) : s + 30;
            const left = ((s - earliest) / span) * 100;
            const width = Math.max(((e - s) / span) * 100, 1.5);
            const cat = a.category || 'other';
            return `<div class="tbar-block ${cat}" style="left:${left}%;width:${width}%" title="${escapeHtml(a.title)}  ${a.startTime}${a.endTime ? '–' + a.endTime : ''}"></div>`;
        }).join('');

        // Endpoint markers on timeline
        let endpointMarkers = '';
        if (dep && dep.time) {
            const pct = ((toMin(dep.time) - earliest) / span) * 100;
            endpointMarkers += `<div class="tbar-endpoint departure" style="left:${pct}%" title="Depart ${dep.time}"></div>`;
        }
        if (ret && ret.time) {
            const pct = ((toMin(ret.time) - earliest) / span) * 100;
            endpointMarkers += `<div class="tbar-endpoint return" style="left:${pct}%" title="Return ${ret.time}"></div>`;
        }

        return `
            <div class="timeline-bar">
                <div class="tbar-track">
                    ${hours.join('')}
                    ${blocks}
                    ${endpointMarkers}
                </div>
            </div>
        `;
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
                    <p>No days planned yet. Set your trip dates in Overview to auto-generate days.</p>
                    <button class="btn btn-small" onclick="Itinerary.addDay()"><i class="fa-solid fa-plus"></i> Add Day</button>
                </div>
            `;
            updateDayFilter();
            return;
        }

        let activityCounter = 1;
        container.innerHTML = currentTrip.days.map((day, dayIdx) => {
            const actCount = day.activities.length;

            // Find lodging reservations that span this day
            const lodgings = getLodgingForDay(day.date);
            const dep = day.lodgingDeparture || null;
            const ret = day.lodgingReturn || null;

            const lodgingHtml = lodgings.map(res => {
                const resIdx = currentTrip.reservations.indexOf(res);
                const nights = (res.checkIn && res.checkOut) ? Math.ceil((new Date(res.checkOut) - new Date(res.checkIn)) / (1000*60*60*24)) : 0;
                const isCheckIn = res.checkIn === day.date;
                const isCheckOut = res.checkOut === day.date;
                let label = '';
                if (isCheckIn && res.checkInTime) label = `Check-in ${res.checkInTime}`;
                else if (isCheckIn) label = 'Check-in';
                else if (isCheckOut && res.checkOutTime) label = `Check-out ${res.checkOutTime}`;
                else if (isCheckOut) label = 'Check-out';
                const lodgingCity = getLodgingCity(res);
                const isDep = dep && dep.reservationIdx === resIdx;
                const isRet = ret && ret.reservationIdx === resIdx;
                return `
                    <div class="lodging-banner"${res.linkedResourceId ? ` data-marker-key="res-${res.linkedResourceId}"` : ''}>
                        <i class="fa-solid fa-bed"></i>
                        <div class="lodging-banner-info">
                            <span class="lodging-banner-title">${escapeHtml(res.title)}${lodgingCity ? `<span class="location-label"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(lodgingCity)}</span>` : ''}</span>
                            ${label ? `<span class="lodging-banner-label">${label}</span>` : ''}
                            ${res.provider ? `<span class="lodging-banner-provider">${escapeHtml(res.provider)}</span>` : ''}
                        </div>
                        ${nights > 0 ? `<span class="lodging-banner-nights">${nights}n</span>` : ''}
                        <div class="lodging-day-actions">
                            <button class="lodging-toggle ${isDep ? 'active' : ''}" title="Depart from here" onclick="event.stopPropagation(); Itinerary.setLodgingEndpoint(${dayIdx}, ${resIdx}, 'departure')"><i class="fa-solid fa-right-from-bracket"></i></button>
                            ${isDep ? `<input type="time" class="lodging-time-input" value="${dep.time || ''}" title="Departure time" onchange="Itinerary.setLodgingTime(${dayIdx}, 'departure', this.value)" onclick="event.stopPropagation()" />` : ''}
                            <button class="lodging-toggle ${isRet ? 'active' : ''}" title="Return here" onclick="event.stopPropagation(); Itinerary.setLodgingEndpoint(${dayIdx}, ${resIdx}, 'return')"><i class="fa-solid fa-right-to-bracket"></i></button>
                            ${isRet ? `<input type="time" class="lodging-time-input" value="${ret.time || ''}" title="Return time" onchange="Itinerary.setLodgingTime(${dayIdx}, 'return', this.value)" onclick="event.stopPropagation()" />` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            const activitiesHtml = day.activities.map((act, actIdx) => {
                const num = activityCounter++;
                const timeStr = act.startTime ? `${act.startTime}${act.endTime ? ' - ' + act.endTime : ''}` : '';
                const city = getCity(act);
                return `
                    <div class="activity-card" draggable="true" data-day="${dayIdx}" data-act="${actIdx}" data-marker-key="act-${dayIdx}-${actIdx}">
                        ${act.startTime ? `<span class="activity-time-label">${act.startTime}</span>` : ''}
                        <div class="activity-marker ${act.category}"><i class="fa-solid ${getCategoryIcon(act.category)}"></i></div>
                        <div class="activity-top-row">
                            <span class="activity-title">${escapeHtml(act.title)}</span>
                            ${city ? `<span class="location-label"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(city)}</span>` : ''}
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
                            <button title="Show day on map" onclick="event.stopPropagation(); Itinerary.filterMapToDay(${dayIdx})"><i class="fa-solid fa-map"></i></button>
                            <button title="Delete day" onclick="event.stopPropagation(); Itinerary.removeDay(${dayIdx})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="day-body">
                        ${lodgingHtml}
                        ${buildTimelineBar(day.activities, dep, ret)}
                        <div class="activity-timeline" data-day="${dayIdx}">
                            ${buildEndpointHtml(dep, 'departure')}
                            ${activitiesHtml}
                            ${buildEndpointHtml(ret, 'return')}
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

        // Lodging banner + endpoint hover/click to highlight/focus marker
        document.querySelectorAll('.lodging-banner[data-marker-key], .lodging-endpoint[data-marker-key]').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('mouseenter', () => {
                MapModule.highlightMarker(el.dataset.markerKey);
            });
            el.addEventListener('mouseleave', () => {
                MapModule.clearHighlight();
            });
            el.addEventListener('click', (e) => {
                if (e.target.closest('.lodging-day-actions')) return;
                MapModule.focusMarker(el.dataset.markerKey);
            });
        });
    }

    function toggleDay(dayIdx) {
        const card = document.querySelector(`.day-card[data-day="${dayIdx}"]`);
        if (card) card.classList.toggle('collapsed');
    }

    function showOnMap(lat, lng) {
        MapModule.panTo(lat, lng, 16);
    }

    function filterMapToDay(dayIdx) {
        const select = document.getElementById('mapDayFilter');
        // Toggle: if already filtering this day, go back to all
        select.value = select.value === String(dayIdx) ? 'all' : String(dayIdx);
        select.dispatchEvent(new Event('change'));
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
            // Hover-to-highlight marker on map
            card.addEventListener('mouseenter', () => {
                const key = card.dataset.markerKey;
                if (key) MapModule.highlightMarker(key);
            });
            card.addEventListener('mouseleave', () => {
                MapModule.clearHighlight();
            });
            // Click to zoom into marker (ignore clicks on action buttons)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.activity-actions')) return;
                const key = card.dataset.markerKey;
                if (key) MapModule.focusMarker(key);
            });

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

    function buildEndpointHtml(endpoint, type) {
        if (!endpoint) return '';
        const title = endpoint.title || 'Hotel';
        const icon = type === 'departure' ? 'fa-right-from-bracket' : 'fa-right-to-bracket';
        const label = type === 'departure' ? 'Depart' : 'Return';
        const markerKey = endpoint.resourceId ? `res-${endpoint.resourceId}` : '';
        return `
            <div class="lodging-endpoint ${type}"${markerKey ? ` data-marker-key="${markerKey}"` : ''}>
                <div class="endpoint-marker lodging"><i class="fa-solid ${icon}"></i></div>
                <div class="endpoint-info">
                    <span class="endpoint-label">${label}</span>
                    <span class="endpoint-title">${escapeHtml(title)}</span>
                    ${endpoint.time ? `<span class="endpoint-time">${endpoint.time}</span>` : ''}
                </div>
            </div>
        `;
    }

    function setLodgingEndpoint(dayIdx, reservationIdx, type) {
        const day = currentTrip.days[dayIdx];
        const key = type === 'departure' ? 'lodgingDeparture' : 'lodgingReturn';
        if (day[key] && day[key].reservationIdx === reservationIdx) {
            // Toggle off
            delete day[key];
        } else {
            const reservation = currentTrip.reservations[reservationIdx];
            const endpoint = { reservationIdx, time: '' };
            if (reservation) {
                endpoint.title = reservation.title;
                let resource = null;
                // Try linked resource first
                if (reservation.linkedResourceId) {
                    resource = (currentTrip.resources || []).find(r => r.id === reservation.linkedResourceId);
                }
                // Fallback: find resource by matching title
                if (!resource || !resource.lat) {
                    resource = (currentTrip.resources || []).find(r =>
                        r.lat && r.lng && r.title && reservation.title &&
                        (r.title.includes(reservation.title) || reservation.title.includes(r.title))
                    );
                }
                if (resource && resource.lat && resource.lng) {
                    endpoint.lat = resource.lat;
                    endpoint.lng = resource.lng;
                    endpoint.resourceId = resource.id;
                }
            }
            day[key] = endpoint;
        }
        Storage.saveTrip(currentTrip);
        render();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function setLodgingTime(dayIdx, type, time) {
        const day = currentTrip.days[dayIdx];
        const key = type === 'departure' ? 'lodgingDeparture' : 'lodgingReturn';
        if (day[key]) {
            day[key].time = time;
            Storage.saveTrip(currentTrip);
            render();
        }
    }

    function getLodgingCity(res) {
        if (res.linkedResourceId && currentTrip.resources) {
            const linked = currentTrip.resources.find(r => r.id === res.linkedResourceId);
            if (linked && linked.city) return linked.city;
        }
        return '';
    }

    function getCity(act) {
        // Try linked resource first
        if (act.linkedResourceId && currentTrip.resources) {
            const res = currentTrip.resources.find(r => r.id === act.linkedResourceId);
            if (res && res.city) return res.city;
        }
        // Fall back to extracting from address (last meaningful part)
        if (act.address) {
            const parts = act.address.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) return parts[parts.length - 2];
        }
        return '';
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
        filterMapToDay,
        setLodgingEndpoint,
        setLodgingTime,
    };
})();
