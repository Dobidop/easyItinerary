/* ===== Storage Module ===== */
const Storage = (() => {
    const STORAGE_KEY = 'easyItinerary';

    function getAll() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : { trips: [], activeTripId: null };
        } catch {
            return { trips: [], activeTripId: null };
        }
    }

    function saveAll(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        showSaveStatus();
    }

    function showSaveStatus() {
        const el = document.getElementById('saveStatus');
        if (el) {
            el.textContent = 'Saved';
            el.style.color = 'var(--success)';
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function createTrip(name = 'New Trip') {
        return {
            id: generateId(),
            name,
            startDate: '',
            endDate: '',
            notes: '',
            reservations: [],
            checklist: [],
            days: [],
            expenses: [],
            resources: [],
            budgetTotal: 0,
            budgetCurrency: 'USD',
        };
    }

    function getActiveTrip() {
        const data = getAll();
        if (!data.activeTripId || data.trips.length === 0) {
            // Create default trip
            const trip = createTrip('My Trip');
            data.trips.push(trip);
            data.activeTripId = trip.id;
            saveAll(data);
            return trip;
        }
        return data.trips.find(t => t.id === data.activeTripId) || data.trips[0];
    }

    function saveTrip(trip) {
        const data = getAll();
        const idx = data.trips.findIndex(t => t.id === trip.id);
        if (idx >= 0) {
            data.trips[idx] = trip;
        } else {
            data.trips.push(trip);
        }
        data.activeTripId = trip.id;
        saveAll(data);

        // Auto-sync to server if this trip has been shared
        if (trip.shareId) {
            syncSharedTrip(trip);
        }
    }

    // Debounced sync to avoid flooding the server on rapid edits
    let syncTimer = null;
    function syncSharedTrip(trip) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trip),
            }).catch(() => { /* silent fail for background sync */ });
        }, 2000);
    }

    function deleteTrip(tripId) {
        const data = getAll();
        data.trips = data.trips.filter(t => t.id !== tripId);
        if (data.activeTripId === tripId) {
            data.activeTripId = data.trips.length > 0 ? data.trips[0].id : null;
        }
        saveAll(data);
        return data;
    }

    function setActiveTrip(tripId) {
        const data = getAll();
        data.activeTripId = tripId;
        saveAll(data);
    }

    function exportTrip(trip) {
        const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${trip.name.replace(/[^a-z0-9]/gi, '_')}_itinerary.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importTrip(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const trip = JSON.parse(e.target.result);
                    // Assign new ID to avoid conflicts
                    trip.id = generateId();
                    const data = getAll();
                    data.trips.push(trip);
                    data.activeTripId = trip.id;
                    saveAll(data);
                    resolve(trip);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async function shareTrip(trip) {
        const res = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trip),
        });
        if (!res.ok) throw new Error('Share failed');
        const result = await res.json();
        // Persist the shareId on the trip so future shares reuse the same link
        if (!trip.shareId) {
            trip.shareId = result.shareId;
            saveTrip(trip);
        }
        return result;
    }

    async function loadSharedTrip(shareId) {
        const res = await fetch(`/api/share/${encodeURIComponent(shareId)}`);
        if (!res.ok) throw new Error('Shared trip not found');
        const data = await res.json();
        const trip = data.trip;
        // Assign new ID and clear shareId to avoid conflicts
        trip.id = generateId();
        delete trip.shareId;
        const store = getAll();
        store.trips.push(trip);
        store.activeTripId = trip.id;
        saveAll(store);
        return trip;
    }

    function checkForSharedTrip() {
        const params = new URLSearchParams(window.location.search);
        return params.get('trip');
    }

    return {
        getAll,
        getActiveTrip,
        saveTrip,
        deleteTrip,
        setActiveTrip,
        createTrip,
        exportTrip,
        importTrip,
        shareTrip,
        loadSharedTrip,
        checkForSharedTrip,
        generateId,
    };
})();
