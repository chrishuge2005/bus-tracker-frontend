// ================== Variables ==================
let map;
let markers = {};
let userMarker = null;
let selectedBusId = null;
let gpsWatchId = null;
let currentPopupBusId = null;

// Replace with your backend URL
const API_BASE_URL = "https://bus-tracker-backend-96uu.onrender.com";

// ================== DOM Elements ==================
const busModal = document.getElementById('bus-modal');
const actionModal = document.getElementById('action-modal');
const driverLoginModal = document.getElementById('driver-login-modal');
const userLoginModal = document.getElementById('user-login-modal');
const busSelectBtn = document.getElementById('bus-select-btn');
const stopTrackingBtn = document.getElementById('stop-tracking');
const closeModals = document.querySelectorAll('.close-modal');
const cancelSelect = document.getElementById('cancel-select');
const connectAction = document.getElementById('connect-action');
const viewAction = document.getElementById('view-action');
const cancelAction = document.getElementById('cancel-action');
const cancelDriverLogin = document.getElementById('cancel-driver-login');
const confirmDriverLogin = document.getElementById('confirm-driver-login');
const cancelUserLogin = document.getElementById('cancel-user-login');
const confirmUserLogin = document.getElementById('confirm-user-login');
const debugToggle = document.getElementById('debug-toggle');
const debugPanel = document.getElementById('debug-panel');
const debugContent = document.getElementById('debug-content');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const locateMeBtn = document.getElementById('locate-me');
const busList = document.getElementById('bus-list');

// ================== Authentication ==================
const driverCredentials = { "driver123": "pass123" };
const studentCredentials = { "student1": "pass1", "student2": "pass2" };

// ================== Initialize Map ==================
function initMap() {
    map = L.map("map").setView([12.9716, 77.5946], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
    }).addTo(map);

    zoomInBtn.addEventListener('click', () => map.zoomIn());
    zoomOutBtn.addEventListener('click', () => map.zoomOut());

    locateMeBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                map.setView([position.coords.latitude, position.coords.longitude], 15);
            });
        }
    });

    debugToggle.addEventListener('click', () => {
        debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
    });

    fetchBuses();
    setInterval(fetchBuses, 5000);
}

// ================== Fetch Buses ==================
async function fetchBuses() {
    try {
        const response = await fetch(`${API_BASE_URL}/buses`);
        let busData = await response.json();

        // Handle array or object response
        if (Array.isArray(busData)) {
            const objData = {};
            busData.forEach(bus => objData[bus.id] = bus);
            busData = objData;
        }

        console.log('Fetched buses:', busData);

        debugContent.innerHTML = JSON.stringify(busData, null, 2);
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
        document.getElementById('active-buses').textContent = Object.keys(busData).length;
        document.getElementById('total-buses').textContent = Object.keys(busData).length;

        busList.innerHTML = ''; // clear bus list

        if (!busData || Object.keys(busData).length === 0) {
            busList.innerHTML = '<p>No buses available</p>';
            return;
        }

        for (const busId in busData) {
            const bus = busData[busId];
            const position = [bus.lat, bus.lon];

            // Add or update marker
            if (markers[busId]) {
                markers[busId].setLatLng(position);
                markers[busId].setPopupContent(`<b>${bus.name}</b><br>Status: ${bus.status}`);
            } else {
                markers[busId] = L.marker(position).addTo(map)
                    .bindPopup(`<b>${bus.name}</b><br>Status: ${bus.status}`);
            }

            // Add to bus list
            const div = document.createElement('div');
            div.classList.add('bus-item');
            div.innerHTML = `
                <div class="bus-icon"><i class="fas fa-bus"></i></div>
                <div class="bus-info">
                    <h3>${bus.name}</h3>
                    <p>Status: ${bus.status}</p>
                </div>
            `;
            div.addEventListener('click', () => openActionModal(busId));
            busList.appendChild(div);
        }
    } catch (err) {
        console.error("Error fetching buses:", err);
        debugContent.innerHTML = "Error fetching bus data: " + err.message;
        busList.innerHTML = '<p>Error loading buses</p>';
    }
}

// ================== Open Action Modal ==================
function openActionModal(busId) {
    currentPopupBusId = busId;
    document.getElementById('action-modal-title').textContent = `Bus ${busId} Options`;
    actionModal.style.display = 'flex';
}

// ================== Driver Live Location ==================
function startLiveLocation(busId) {
    selectedBusId = busId;

    if (navigator.geolocation) {
        updateGpsStatus('searching');

        gpsWatchId = navigator.geolocation.watchPosition(
            pos => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;

                if (userMarker) {
                    userMarker.setLatLng([lat, lon]);
                } else {
                    userMarker = L.marker([lat, lon], { 
                        icon: L.icon({
                            iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
                            iconSize: [32, 32],
                        })
                    }).addTo(map).bindPopup("📍 Your Location (Bus Driver)");
                }

                map.setView([lat, lon], 15);
                sendLocationToServer(selectedBusId, lat, lon);
                updateGpsStatus('active');
            },
            err => {
                console.error("GPS error:", err);
                showToast('GPS Error: ' + err.message);
                updateGpsStatus('inactive');
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    } else {
        alert("Geolocation not supported!");
    }
}

function stopLiveLocation() {
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;

        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }

        busSelectBtn.style.display = 'block';
        stopTrackingBtn.style.display = 'none';
        updateGpsStatus('inactive');
        showToast('Stopped live tracking');
    }
}

// ================== Send Location to Backend ==================
async function sendLocationToServer(busId, lat, lon) {
    try {
        await fetch(`${API_BASE_URL}/update_location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bus_id: busId, lat, lon, driverConnected: true }),
        });
    } catch (err) {
        console.error("Error sending location:", err);
    }
}

// ================== Modal Functionality ==================
busSelectBtn.addEventListener('click', () => busModal.style.display = 'flex');

closeModals.forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
}));

cancelSelect.addEventListener('click', () => busModal.style.display = 'none');
cancelAction.addEventListener('click', () => actionModal.style.display = 'none');
cancelDriverLogin.addEventListener('click', () => driverLoginModal.style.display = 'none');
cancelUserLogin.addEventListener('click', () => userLoginModal.style.display = 'none');

connectAction.addEventListener('click', () => {
    actionModal.style.display = 'none';
    driverLoginModal.style.display = 'flex';
});

viewAction.addEventListener('click', () => {
    actionModal.style.display = 'none';
    userLoginModal.style.display = 'flex';
});

confirmDriverLogin.addEventListener('click', () => {
    const id = document.getElementById('driver-id').value;
    const password = document.getElementById('driver-password').value;

    if (driverCredentials[id] === password) {
        driverLoginModal.style.display = 'none';
        startLiveLocation(currentPopupBusId);
        showToast(`Driver connected to Bus ${currentPopupBusId}`);
        busSelectBtn.style.display = 'none';
        stopTrackingBtn.style.display = 'block';
    } else {
        showToast('Invalid driver credentials');
    }
});

confirmUserLogin.addEventListener('click', async () => {
    const id = document.getElementById('user-id').value;
    const password = document.getElementById('user-password').value;

    if (studentCredentials[id] === password) {
        // Check if driver is connected
        const response = await fetch(`${API_BASE_URL}/buses`);
        const busData = await response.json();
        if (!busData[currentPopupBusId]?.driverConnected) {
            showToast('Driver not connected. Cannot view live location.');
            return;
        }

        userLoginModal.style.display = 'none';
        showToast(`Viewing Bus ${currentPopupBusId} location`);

        if (markers[currentPopupBusId]) {
            map.setView(markers[currentPopupBusId].getLatLng(), 15);
        }
    } else {
        showToast('Invalid student credentials');
    }
});

stopTrackingBtn.addEventListener('click', stopLiveLocation);

// ================== Utility ==================
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateGpsStatus(status) {
    const indicator = document.getElementById('gps-indicator');
    const text = document.getElementById('gps-text');

    indicator.className = 'gps-indicator';
    indicator.classList.add(`gps-${status}`);

    if (status === 'active') text.textContent = 'GPS Active - Tracking';
    else if (status === 'searching') text.textContent = 'GPS Searching';
    else text.textContent = 'GPS Inactive';
}

// Expose modal function to HTML
window.openActionModal = openActionModal;

// ================== Initialize ==================
document.addEventListener('DOMContentLoaded', initMap);
