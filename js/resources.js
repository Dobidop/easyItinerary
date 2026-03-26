/* ===== Resources Module ===== */
const Resources = (() => {
    let currentTrip = null;
    let editingIdx = null;
    let activeFilter = 'all';
    let activeStatus = 'selected';

    const categoryIcons = {
        restaurant: 'fa-utensils',
        hotel: 'fa-bed',
        sightseeing: 'fa-camera',
        transport: 'fa-plane',
        activity: 'fa-person-hiking',
        shopping: 'fa-bag-shopping',
        general: 'fa-link',
    };

    function init(trip) {
        currentTrip = trip;
        bindEvents();
        render();
    }

    function bindEvents() {
        document.getElementById('btnAddResource').addEventListener('click', () => openModal(null));
        document.getElementById('btnSaveResource').addEventListener('click', saveResource);
        document.getElementById('btnFetchFromUrl').addEventListener('click', fetchFromUrl);
        document.getElementById('btnPickResourceLocation').addEventListener('click', () => {
            // Close modal temporarily so user can interact with map
            document.getElementById('resourceModal').classList.remove('open');
            MapModule.enablePickMode((lat, lng) => {
                document.getElementById('resourceLat').value = lat.toFixed(6);
                document.getElementById('resourceLng').value = lng.toFixed(6);
                // Re-open modal
                document.getElementById('resourceModal').classList.add('open');
                showToast('Location picked!');
                // Fetch place details in background
                fetchPlaceDetails(lat, lng).then(details => {
                    if (details) applyPlaceDetails(details);
                });
            });
        });

        // Auto-detect Google Maps URL on paste
        document.getElementById('resourceUrl').addEventListener('paste', (e) => {
            setTimeout(() => {
                const url = document.getElementById('resourceUrl').value.trim();
                if (isGoogleMapsUrl(url)) {
                    document.getElementById('resourceUrlHint').innerHTML = '<i class="fa-solid fa-lightbulb"></i> Google Maps link detected — click <strong>Fetch</strong> to extract location data';
                    document.getElementById('resourceUrlHint').classList.add('visible');
                } else {
                    document.getElementById('resourceUrlHint').classList.remove('visible');
                }
            }, 50);
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                render();
            });
        });

        document.querySelectorAll('.status-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.status-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeStatus = btn.dataset.status;
                render();
            });
        });
    }

    function openModal(idx, skipClear) {
        editingIdx = idx;
        pendingDetails = null;
        const modal = document.getElementById('resourceModal');
        document.getElementById('resourceUrlHint').classList.remove('visible');
        document.getElementById('resourceUrlHint').innerHTML = '';

        if (idx !== null && idx !== undefined) {
            const res = currentTrip.resources[idx];
            document.getElementById('resourceTitle').value = res.title || '';
            document.getElementById('resourceUrl').value = res.url || '';
            document.getElementById('resourceCategory').value = res.category || 'general';
            document.getElementById('resourceNotes').value = res.notes || '';
            document.getElementById('resourceLat').value = res.lat || '';
            document.getElementById('resourceLng').value = res.lng || '';
            document.getElementById('resourceCity').value = res.city || '';
        } else if (!skipClear) {
            document.getElementById('resourceTitle').value = '';
            document.getElementById('resourceUrl').value = '';
            document.getElementById('resourceCategory').value = 'general';
            document.getElementById('resourceNotes').value = '';
            document.getElementById('resourceLat').value = '';
            document.getElementById('resourceLng').value = '';
            document.getElementById('resourceCity').value = '';
        }
        modal.classList.add('open');
    }

    function isGoogleMapsUrl(url) {
        return /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(url);
    }

    /* ===== Fetch location data from URL ===== */
    function fetchFromUrl() {
        const url = document.getElementById('resourceUrl').value.trim();
        if (!url) {
            showToast('Paste a URL first');
            return;
        }

        const hint = document.getElementById('resourceUrlHint');
        hint.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting location data...';
        hint.classList.add('visible');

        // Extract from Google Maps URL
        if (isGoogleMapsUrl(url)) {
            const data = extractGoogleMapsData(url);
            if (data.lat && data.lng) {
                document.getElementById('resourceLat').value = data.lat;
                document.getElementById('resourceLng').value = data.lng;

                if (data.name && !document.getElementById('resourceTitle').value.trim()) {
                    document.getElementById('resourceTitle').value = data.name;
                }

                // Show success immediately — user can save right away
                const displayName = data.name || 'Location';
                hint.innerHTML = `<i class="fa-solid fa-check"></i> Found: <strong>${escapeHtml(displayName)}</strong>`;

                // Reverse geocode for title if we don't have a name
                if (!data.name) {
                    reverseGeocode(data.lat, data.lng).then(info => {
                        if (info && !document.getElementById('resourceTitle').value.trim()) {
                            document.getElementById('resourceTitle').value = info.name || info.display_name.split(',')[0];
                        }
                    });
                }

                // Fetch OSM details in background — non-blocking, just enriches if found
                fetchPlaceDetails(data.lat, data.lng).then(details => {
                    if (details) {
                        applyPlaceDetails(details);
                    }
                });
                return;
            }
        }

        // For non-Google URLs, try to resolve via Nominatim if it looks like an address
        // Otherwise just show a message
        hint.innerHTML = '<i class="fa-solid fa-circle-info"></i> No location data found in this URL. You can manually enter coordinates or use "Pick on Map".';
        setTimeout(() => hint.classList.remove('visible'), 5000);
    }

    /* ===== Enhanced Google Maps extraction ===== */
    function extractGoogleMapsData(url) {
        const result = { lat: null, lng: null, name: null };

        // Extract place name from URL path: /place/Place+Name/@lat,lng
        const placeNameMatch = url.match(/\/place\/([^/@]+)/);
        if (placeNameMatch) {
            result.name = decodeURIComponent(placeNameMatch[1].replace(/\+/g, ' '));
        }

        // Extract coordinates from various patterns
        const coordPatterns = [
            /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,           // @lat,lng
            /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,       // !3dlat!4dlng (data params)
            /place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,      // place/lat,lng
            /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,           // q=lat,lng
            /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,          // ll=lat,lng
            /center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,      // center=lat,lng
        ];

        for (const pattern of coordPatterns) {
            const match = url.match(pattern);
            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);
                // Sanity check coordinates
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    result.lat = lat.toFixed(6);
                    result.lng = lng.toFixed(6);
                    break;
                }
            }
        }

        // Try extracting search query as name fallback
        if (!result.name) {
            const searchMatch = url.match(/[?&]q=([^&@]+)/);
            if (searchMatch) {
                const decoded = decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
                // Only use if it's not just coordinates
                if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(decoded)) {
                    result.name = decoded;
                }
            }
        }

        return result;
    }

    function extractGoogleMapsCoords(url) {
        const data = extractGoogleMapsData(url);
        if (data.lat && data.lng) {
            return { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
        }
        return null;
    }

    /* ===== Reverse geocode via Nominatim ===== */
    function reverseGeocode(lat, lng) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' },
            signal: controller.signal,
        })
        .then(res => res.json())
        .catch(() => null);
    }

    /* ===== Resolve city from coordinates (fallback) ===== */
    function resolveCityFromCoords(lat, lng) {
        return reverseGeocode(lat, lng).then(data => {
            if (!data || !data.address) return '';
            const a = data.address;
            return a.city || a.town || a.village || a.municipality || a.county || '';
        });
    }

    function resolveMissingCities() {
        if (!currentTrip || !currentTrip.resources) return;
        const pending = currentTrip.resources.filter(r => r.lat && r.lng && !r.city);
        if (pending.length === 0) return;
        // Resolve sequentially with small delay to respect Nominatim rate limits
        let i = 0;
        function next() {
            if (i >= pending.length) return;
            const res = pending[i++];
            resolveCityFromCoords(res.lat, res.lng).then(city => {
                if (city) {
                    res.city = city;
                    Storage.saveTrip(currentTrip);
                    render();
                    Itinerary.render();
                }
                setTimeout(next, 1100); // Nominatim: max 1 req/s
            });
        }
        next();
    }

    /* ===== Fetch place details from Overpass (OSM tags) ===== */
    function fetchPlaceDetails(lat, lng) {
        // Query nearby POIs within ~30m radius for tags like opening_hours, phone, cuisine, etc.
        const radius = 30;
        const query = `
            [out:json][timeout:10];
            (
                nwr(around:${radius},${lat},${lng})["name"];
            );
            out tags center 1;
        `;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 8000); // 8s timeout
        return fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            signal: controller.signal,
        })
        .then(res => res.json())
        .then(data => {
            if (!data.elements || data.elements.length === 0) return null;
            // Pick the most relevant element (prefer the one with the most tags)
            const best = data.elements.reduce((a, b) =>
                Object.keys(b.tags || {}).length > Object.keys(a.tags || {}).length ? b : a
            );
            const t = best.tags || {};
            return {
                phone: t.phone || t['contact:phone'] || '',
                website: t.website || t['contact:website'] || '',
                openingHours: t.opening_hours || '',
                cuisine: t.cuisine ? t.cuisine.replace(/;/g, ', ') : '',
                address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
                    + (t['addr:city'] ? ', ' + t['addr:city'] : ''),
                stars: t.stars || '',
                internetAccess: t.internet_access || '',
                wheelchair: t.wheelchair || '',
                osmType: t.tourism || t.amenity || t.shop || '',
                city: t['addr:city'] || '',
            };
        })
        .catch(() => null);
    }

    function applyPlaceDetails(details) {
        if (!details) return;
        const hint = document.getElementById('resourceUrlHint');
        const parts = [];
        if (details.cuisine) parts.push(`<i class="fa-solid fa-utensils"></i> ${escapeHtml(details.cuisine)}`);
        if (details.openingHours) parts.push(`<i class="fa-regular fa-clock"></i> ${escapeHtml(details.openingHours)}`);
        if (details.phone) parts.push(`<i class="fa-solid fa-phone"></i> ${escapeHtml(details.phone)}`);
        if (details.stars) parts.push(`<i class="fa-solid fa-star"></i> ${escapeHtml(details.stars)} stars`);
        if (details.website && !document.getElementById('resourceUrl').value.trim()) {
            document.getElementById('resourceUrl').value = details.website;
        }
        if (details.address && !document.getElementById('resourceNotes').value.trim()) {
            document.getElementById('resourceNotes').value = details.address;
        }
        if (details.city && !document.getElementById('resourceCity').value.trim()) {
            document.getElementById('resourceCity').value = details.city;
        } else if (!details.city && !document.getElementById('resourceCity').value.trim()) {
            // Fallback: reverse geocode to get city from coordinates
            const lat = parseFloat(document.getElementById('resourceLat').value);
            const lng = parseFloat(document.getElementById('resourceLng').value);
            if (lat && lng) {
                resolveCityFromCoords(lat, lng).then(city => {
                    if (city && !document.getElementById('resourceCity').value.trim()) {
                        document.getElementById('resourceCity').value = city;
                        if (pendingDetails) pendingDetails.city = city;
                    }
                });
            }
        }
        // Auto-detect category from OSM type
        if (document.getElementById('resourceCategory').value === 'general' && details.osmType) {
            const cat = guessCategoryFromOsm(details.osmType);
            if (cat) document.getElementById('resourceCategory').value = cat;
        }
        if (parts.length > 0) {
            hint.innerHTML = `<div class="place-details-preview">${parts.join('<span class="detail-sep">·</span>')}</div>`;
            hint.classList.add('visible');
        }
        // Store on a temp property so saveResource can grab it
        pendingDetails = details;
    }

    let pendingDetails = null;

    function guessCategoryFromOsm(osmType) {
        const map = {
            restaurant: 'restaurant', cafe: 'restaurant', bar: 'restaurant', pub: 'restaurant', fast_food: 'restaurant',
            hotel: 'hotel', hostel: 'hotel', guest_house: 'hotel', motel: 'hotel',
            museum: 'sightseeing', attraction: 'sightseeing', viewpoint: 'sightseeing', artwork: 'sightseeing',
            supermarket: 'shopping', clothes: 'shopping', mall: 'shopping',
        };
        return map[osmType] || null;
    }

    function saveResource() {
        const title = document.getElementById('resourceTitle').value.trim();
        if (!title) {
            document.getElementById('resourceTitle').focus();
            return;
        }

        const url = document.getElementById('resourceUrl').value.trim();
        let lat = parseFloat(document.getElementById('resourceLat').value) || null;
        let lng = parseFloat(document.getElementById('resourceLng').value) || null;

        // Try to extract coords from Google Maps URL
        if (url && !lat && !lng) {
            const coords = extractGoogleMapsCoords(url);
            if (coords) {
                lat = coords.lat;
                lng = coords.lng;
            }
        }

        const resource = {
            id: editingIdx !== null ? currentTrip.resources[editingIdx].id : Storage.generateId(),
            title,
            url,
            category: document.getElementById('resourceCategory').value,
            notes: document.getElementById('resourceNotes').value,
            lat,
            lng,
            status: editingIdx !== null ? (currentTrip.resources[editingIdx].status || 'selected') : activeStatus,
            city: document.getElementById('resourceCity').value || (editingIdx !== null ? currentTrip.resources[editingIdx].city || '' : ''),
        };

        // Merge in place details if we fetched them
        if (pendingDetails) {
            if (pendingDetails.phone) resource.phone = pendingDetails.phone;
            if (pendingDetails.openingHours) resource.openingHours = pendingDetails.openingHours;
            if (pendingDetails.cuisine) resource.cuisine = pendingDetails.cuisine;
            if (pendingDetails.stars) resource.stars = pendingDetails.stars;
            pendingDetails = null;
        } else if (editingIdx !== null) {
            // Preserve existing details on edit
            const existing = currentTrip.resources[editingIdx];
            if (existing.phone) resource.phone = existing.phone;
            if (existing.openingHours) resource.openingHours = existing.openingHours;
            if (existing.cuisine) resource.cuisine = existing.cuisine;
            if (existing.stars) resource.stars = existing.stars;
        }

        if (editingIdx !== null) {
            currentTrip.resources[editingIdx] = resource;
        } else {
            currentTrip.resources.push(resource);
        }

        Storage.saveTrip(currentTrip);
        document.getElementById('resourceModal').classList.remove('open');
        editingIdx = null;

        // Propagate changes to linked activities, reservations, endpoints
        syncFromResources();

        render();
        App.updateStats();
        Itinerary.render();
        App.renderReservations();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);

        // Resolve city in background if missing
        if (resource.lat && resource.lng && !resource.city) {
            resolveCityFromCoords(resource.lat, resource.lng).then(city => {
                if (city) {
                    resource.city = city;
                    Storage.saveTrip(currentTrip);
                    render();
                    Itinerary.render();
                }
            });
        }
    }

    function syncFromResources() {
        if (!currentTrip) return;
        const resources = currentTrip.resources || [];
        let changed = false;

        // Sync activities linked to resources
        (currentTrip.days || []).forEach(day => {
            (day.activities || []).forEach(act => {
                if (!act.linkedResourceId) return;
                const res = resources.find(r => r.id === act.linkedResourceId);
                if (!res) return;
                if (res.title && act.title !== res.title) { act.title = res.title; changed = true; }
                if (res.lat && act.lat !== res.lat) { act.lat = res.lat; changed = true; }
                if (res.lng && act.lng !== res.lng) { act.lng = res.lng; changed = true; }
                if (res.notes && act.address !== res.notes) { act.address = res.notes; changed = true; }
                if (res.url && act.link !== res.url) { act.link = res.url; changed = true; }
            });

            // Sync lodging endpoints
            ['lodgingDeparture', 'lodgingReturn'].forEach(key => {
                const ep = day[key];
                if (!ep || !ep.resourceId) return;
                const res = resources.find(r => r.id === ep.resourceId);
                if (!res) return;
                if (res.lat && ep.lat !== res.lat) { ep.lat = res.lat; changed = true; }
                if (res.lng && ep.lng !== res.lng) { ep.lng = res.lng; changed = true; }
            });
        });

        // Sync reservations linked to resources
        (currentTrip.reservations || []).forEach(rev => {
            if (!rev.linkedResourceId) return;
            const res = resources.find(r => r.id === rev.linkedResourceId);
            if (!res) return;
            if (res.title && rev.title !== res.title) { rev.title = res.title; changed = true; }
        });

        // Also sync lodging endpoint titles from their reservations
        (currentTrip.days || []).forEach(day => {
            ['lodgingDeparture', 'lodgingReturn'].forEach(key => {
                const ep = day[key];
                if (!ep || ep.reservationIdx === undefined) return;
                const rev = currentTrip.reservations[ep.reservationIdx];
                if (rev && ep.title !== rev.title) { ep.title = rev.title; changed = true; }
            });
        });

        if (changed) {
            Storage.saveTrip(currentTrip);
        }
        return changed;
    }

    function deleteResource(idx) {
        if (!confirm('Delete this link?')) return;
        currentTrip.resources.splice(idx, 1);
        Storage.saveTrip(currentTrip);
        render();
        App.updateStats();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function toggleStatus(idx) {
        const res = currentTrip.resources[idx];
        if (!res) return;
        res.status = (res.status || 'selected') === 'selected' ? 'potential' : 'selected';
        Storage.saveTrip(currentTrip);
        render();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function render() {
        const container = document.getElementById('resourcesList');
        let resources = currentTrip.resources || [];

        // Filter by status
        resources = resources.filter(r => (r.status || 'selected') === activeStatus);

        if (activeFilter !== 'all') {
            resources = resources.filter(r => r.category === activeFilter);
        }

        // Update tab counts
        const allResources = currentTrip.resources || [];
        const selectedCount = allResources.filter(r => (r.status || 'selected') === 'selected').length;
        const potentialCount = allResources.filter(r => r.status === 'potential').length;
        document.querySelectorAll('.status-tab').forEach(tab => {
            const count = tab.dataset.status === 'selected' ? selectedCount : potentialCount;
            const label = tab.dataset.status === 'selected' ? 'Selected' : 'Potentials';
            const icon = tab.dataset.status === 'selected' ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-regular fa-lightbulb"></i>';
            tab.innerHTML = `${icon} ${label} <span class="status-count">${count}</span>`;
        });

        if (resources.length === 0) {
            const emptyMsg = activeStatus === 'potential'
                ? 'No potential resources yet. Add places you\'re considering.'
                : (activeFilter === 'all' ? 'No selected resources yet.' : 'No selected resources in this category.');
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bookmark"></i>
                    <p>${emptyMsg}</p>
                    <button class="btn btn-small" onclick="Resources.openModal(null)"><i class="fa-solid fa-plus"></i> Add Link</button>
                </div>
            `;
            return;
        }

        const isPotential = activeStatus === 'potential';
        container.innerHTML = resources.map((res) => {
            const realIdx = currentTrip.resources.indexOf(res);
            const iconClass = categoryIcons[res.category] || 'fa-link';
            let urlDisplay = '';
            try { urlDisplay = res.url ? new URL(res.url).hostname : ''; } catch(e) { urlDisplay = res.url || ''; }
            const detailTags = [];
            if (res.cuisine) detailTags.push(`<span class="resource-detail"><i class="fa-solid fa-utensils"></i> ${escapeHtml(res.cuisine)}</span>`);
            if (res.openingHours) detailTags.push(`<span class="resource-detail"><i class="fa-regular fa-clock"></i> ${escapeHtml(res.openingHours)}</span>`);
            if (res.phone) detailTags.push(`<span class="resource-detail"><i class="fa-solid fa-phone"></i> ${escapeHtml(res.phone)}</span>`);
            if (res.stars) detailTags.push(`<span class="resource-detail"><i class="fa-solid fa-star"></i> ${escapeHtml(res.stars)} stars</span>`);

            const statusBtn = isPotential
                ? `<button title="Promote to selected" onclick="Resources.toggleStatus(${realIdx})"><i class="fa-solid fa-check-circle"></i></button>`
                : `<button title="Move to potentials" onclick="Resources.toggleStatus(${realIdx})"><i class="fa-regular fa-lightbulb"></i></button>`;

            return `
                <div class="resource-card ${isPotential ? 'potential' : ''}" data-marker-key="${res.id ? 'res-' + res.id : ''}">
                    <div class="resource-icon ${res.category}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div class="resource-info">
                        <h4>${res.url ? `<a href="${escapeHtml(res.url)}" target="_blank">${escapeHtml(res.title)}</a>` : escapeHtml(res.title)}${res.city ? `<span class="location-label"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(res.city)}</span>` : ''}</h4>
                        ${res.url ? `<span class="resource-url">${escapeHtml(urlDisplay)}</span>` : ''}
                        ${detailTags.length ? `<div class="resource-details">${detailTags.join('')}</div>` : ''}
                        ${res.notes ? `<div class="resource-notes">${escapeHtml(res.notes)}</div>` : ''}
                    </div>
                    <div class="resource-actions">
                        ${statusBtn}
                        ${res.lat && res.lng ? `<button title="Show on map" onclick="MapModule.panTo(${res.lat}, ${res.lng}, 16)"><i class="fa-solid fa-map-location-dot"></i></button>` : ''}
                        ${res.url ? `<button title="Copy URL" onclick="Resources.copyUrl('${escapeHtml(res.url)}')"><i class="fa-solid fa-copy"></i></button>` : ''}
                        <button title="Edit" onclick="Resources.openModal(${realIdx})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-delete" title="Delete" onclick="Resources.deleteResource(${realIdx})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        // Wire hover-to-highlight and click-to-focus for resource cards
        container.querySelectorAll('.resource-card[data-marker-key]').forEach(card => {
            card.addEventListener('mouseenter', () => {
                const key = card.dataset.markerKey;
                if (key) MapModule.highlightMarker(key);
            });
            card.addEventListener('mouseleave', () => {
                MapModule.clearHighlight();
            });
            card.addEventListener('click', (e) => {
                if (e.target.closest('.resource-actions') || e.target.closest('a')) return;
                const key = card.dataset.markerKey;
                if (key) MapModule.focusMarker(key);
            });
        });
    }

    function copyUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('URL copied to clipboard');
        });
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

    function fetchAndApplyDetails(lat, lng) {
        // Background fetch — no spinner, just enriches if found
        fetchPlaceDetails(lat, lng).then(details => {
            if (details) applyPlaceDetails(details);
        });
    }

    return {
        init,
        update,
        render,
        openModal,
        saveResource,
        deleteResource,
        copyUrl,
        fetchAndApplyDetails,
        toggleStatus,
        resolveMissingCities,
        syncFromResources,
    };
})();
