/* ===== Resources Module ===== */
const Resources = (() => {
    let currentTrip = null;
    let editingIdx = null;
    let activeFilter = 'all';

    const categoryIcons = {
        restaurant: 'fa-utensils',
        hotel: 'fa-bed',
        transport: 'fa-plane',
        activity: 'fa-camera',
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

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                render();
            });
        });
    }

    function openModal(idx) {
        editingIdx = idx;
        const modal = document.getElementById('resourceModal');

        if (idx !== null && idx !== undefined) {
            const res = currentTrip.resources[idx];
            document.getElementById('resourceTitle').value = res.title || '';
            document.getElementById('resourceUrl').value = res.url || '';
            document.getElementById('resourceCategory').value = res.category || 'general';
            document.getElementById('resourceNotes').value = res.notes || '';
            document.getElementById('resourceLat').value = res.lat || '';
            document.getElementById('resourceLng').value = res.lng || '';
        } else {
            document.getElementById('resourceTitle').value = '';
            document.getElementById('resourceUrl').value = '';
            document.getElementById('resourceCategory').value = 'general';
            document.getElementById('resourceNotes').value = '';
            document.getElementById('resourceLat').value = '';
            document.getElementById('resourceLng').value = '';
        }
        modal.classList.add('open');
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

    function extractGoogleMapsCoords(url) {
        // Match patterns like @48.8566,2.3522 or place/48.8566,2.3522
        const patterns = [
            /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
            /place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
            /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
            /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
        }
        return null;
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
                    <p>${activeFilter === 'all' ? 'No links saved yet. Click "Add Link" to save restaurants, hotels, and more.' : 'No links in this category.'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = resources.map((res) => {
            const realIdx = currentTrip.resources.indexOf(res);
            const iconClass = categoryIcons[res.category] || 'fa-link';
            const urlDisplay = res.url ? new URL(res.url).hostname : '';
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
