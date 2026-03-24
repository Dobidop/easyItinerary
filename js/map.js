/* ===== Map Module ===== */
const MapModule = (() => {
    let map = null;
    let markers = [];
    let pickMode = false;
    let pickCallback = null;

    const categoryIcons = {
        sightseeing: 'fa-camera',
        food: 'fa-utensils',
        transport: 'fa-plane',
        lodging: 'fa-bed',
        activity: 'fa-person-hiking',
        shopping: 'fa-bag-shopping',
        other: 'fa-location-dot',
        restaurant: 'fa-utensils',
        hotel: 'fa-bed',
        general: 'fa-link',
        resource: 'fa-bookmark',
    };

    function init() {
        map = L.map('map', {
            center: [48.8566, 2.3522],
            zoom: 3,
            zoomControl: true,
        });

        // Dark map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19,
        }).addTo(map);

        // Click handler for pick-on-map
        map.on('click', (e) => {
            if (pickMode && pickCallback) {
                pickCallback(e.latlng.lat, e.latlng.lng);
                pickMode = false;
                pickCallback = null;
                map.getContainer().style.cursor = '';
            }
        });

        // Ensure map renders correctly after layout
        setTimeout(() => map.invalidateSize(), 100);
    }

    function createMarkerIcon(category, number) {
        if (number !== undefined && number !== null) {
            return L.divIcon({
                className: '',
                html: `<div class="numbered-marker" style="background: var(--cat-${category}, var(--accent))">${number}</div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
                popupAnchor: [0, -16],
            });
        }
        const iconClass = categoryIcons[category] || 'fa-location-dot';
        return L.divIcon({
            className: '',
            html: `<div class="custom-marker ${category}"><i class="fa-solid ${iconClass}"></i></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -18],
        });
    }

    function clearMarkers() {
        markers.forEach(m => map.removeLayer(m));
        markers = [];
    }

    function addMarker(lat, lng, popupHtml, category, number) {
        const icon = createMarkerIcon(category || 'other', number);
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        if (popupHtml) {
            marker.bindPopup(popupHtml, { maxWidth: 250 });
        }
        markers.push(marker);
        return marker;
    }

    function updateMarkers(trip, dayFilter) {
        clearMarkers();
        if (!trip) return;

        // Add activity markers
        let activityNum = 1;
        trip.days.forEach((day, dayIdx) => {
            if (dayFilter !== 'all' && dayFilter !== String(dayIdx)) return;
            day.activities.forEach((act) => {
                if (act.lat && act.lng) {
                    const timeStr = act.startTime ? `<p><i class="fa-regular fa-clock"></i> ${act.startTime}${act.endTime ? ' - ' + act.endTime : ''}</p>` : '';
                    const linkStr = act.link ? `<p><a href="${escapeHtml(act.link)}" target="_blank">Open link</a></p>` : '';
                    const popup = `
                        <h4>${escapeHtml(act.title)}</h4>
                        ${timeStr}
                        <p>${escapeHtml(act.description || '')}</p>
                        ${act.address ? `<p><i class="fa-solid fa-location-dot"></i> ${escapeHtml(act.address)}</p>` : ''}
                        ${linkStr}
                    `;
                    addMarker(act.lat, act.lng, popup, act.category, activityNum);
                    activityNum++;
                }
            });
        });

        // Add resource markers
        trip.resources.forEach((res) => {
            if (res.lat && res.lng) {
                const popup = `
                    <h4>${escapeHtml(res.title)}</h4>
                    ${res.url ? `<p><a href="${escapeHtml(res.url)}" target="_blank">${escapeHtml(res.url)}</a></p>` : ''}
                    ${res.notes ? `<p>${escapeHtml(res.notes)}</p>` : ''}
                `;
                addMarker(res.lat, res.lng, popup, res.category);
            }
        });

        fitBounds();
    }

    function fitBounds() {
        if (markers.length === 0) return;
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }

    function enablePickMode(callback) {
        pickMode = true;
        pickCallback = callback;
        map.getContainer().style.cursor = 'crosshair';
        showToast('Click on the map to pick a location');
    }

    function panTo(lat, lng, zoom) {
        map.setView([lat, lng], zoom || 15);
    }

    function invalidateSize() {
        if (map) map.invalidateSize();
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        init,
        updateMarkers,
        fitBounds,
        clearMarkers,
        addMarker,
        enablePickMode,
        panTo,
        invalidateSize,
    };
})();
