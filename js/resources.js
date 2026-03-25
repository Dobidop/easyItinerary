/* ===== Resources Module ===== */
const Resources = (() => {
    let currentTrip = null;
    let editingIdx = null;
    let activeFilter = 'all';

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
    }

    function openModal(idx, skipClear) {
        editingIdx = idx;
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
        } else if (!skipClear) {
            document.getElementById('resourceTitle').value = '';
            document.getElementById('resourceUrl').value = '';
            document.getElementById('resourceCategory').value = 'general';
            document.getElementById('resourceNotes').value = '';
            document.getElementById('resourceLat').value = '';
            document.getElementById('resourceLng').value = '';
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

                // Reverse geocode to get address details
                reverseGeocode(data.lat, data.lng).then(info => {
                    if (info && !document.getElementById('resourceTitle').value.trim()) {
                        document.getElementById('resourceTitle').value = info.name || info.display_name.split(',')[0];
                    }
                    hint.innerHTML = '<i class="fa-solid fa-check"></i> Location data extracted!';
                    setTimeout(() => hint.classList.remove('visible'), 3000);
                });

                // If we already have a name, just show success
                if (data.name) {
                    hint.innerHTML = `<i class="fa-solid fa-check"></i> Found: <strong>${escapeHtml(data.name)}</strong>`;
                    setTimeout(() => hint.classList.remove('visible'), 4000);
                }
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
        return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        })
        .then(res => res.json())
        .catch(() => null);
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
        };

        if (editingIdx !== null) {
            currentTrip.resources[editingIdx] = resource;
        } else {
            currentTrip.resources.push(resource);
        }

        Storage.saveTrip(currentTrip);
        document.getElementById('resourceModal').classList.remove('open');
        editingIdx = null;
        render();
        App.updateStats();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function deleteResource(idx) {
        if (!confirm('Delete this link?')) return;
        currentTrip.resources.splice(idx, 1);
        Storage.saveTrip(currentTrip);
        render();
        App.updateStats();
        MapModule.updateMarkers(currentTrip, document.getElementById('mapDayFilter').value);
    }

    function render() {
        const container = document.getElementById('resourcesList');
        let resources = currentTrip.resources || [];

        if (activeFilter !== 'all') {
            resources = resources.filter(r => r.category === activeFilter);
        }

        if (resources.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bookmark"></i>
                    <p>${activeFilter === 'all' ? 'No links saved yet. Save restaurants, hotels, and more.' : 'No links in this category.'}</p>
                    ${activeFilter === 'all' ? '<button class="btn btn-small" onclick="Resources.openModal(null)"><i class="fa-solid fa-plus"></i> Add Link</button>' : ''}
                </div>
            `;
            return;
        }

        container.innerHTML = resources.map((res) => {
            const realIdx = currentTrip.resources.indexOf(res);
            const iconClass = categoryIcons[res.category] || 'fa-link';
            let urlDisplay = '';
            try { urlDisplay = res.url ? new URL(res.url).hostname : ''; } catch(e) { urlDisplay = res.url || ''; }
            return `
                <div class="resource-card">
                    <div class="resource-icon ${res.category}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div class="resource-info">
                        <h4>${res.url ? `<a href="${escapeHtml(res.url)}" target="_blank">${escapeHtml(res.title)}</a>` : escapeHtml(res.title)}</h4>
                        ${res.url ? `<span class="resource-url">${escapeHtml(urlDisplay)}</span>` : ''}
                        ${res.notes ? `<div class="resource-notes">${escapeHtml(res.notes)}</div>` : ''}
                    </div>
                    <div class="resource-actions">
                        ${res.lat && res.lng ? `<button title="Show on map" onclick="MapModule.panTo(${res.lat}, ${res.lng}, 16)"><i class="fa-solid fa-map-location-dot"></i></button>` : ''}
                        ${res.url ? `<button title="Copy URL" onclick="Resources.copyUrl('${escapeHtml(res.url)}')"><i class="fa-solid fa-copy"></i></button>` : ''}
                        <button title="Edit" onclick="Resources.openModal(${realIdx})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-delete" title="Delete" onclick="Resources.deleteResource(${realIdx})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
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

    return {
        init,
        update,
        render,
        openModal,
        saveResource,
        deleteResource,
        copyUrl,
    };
})();
