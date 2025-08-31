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
const confirmSelect = document.getElementById('confirm-select');
const busOptions = document.querySelectorAll('.bus-option');
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
let selectedBusOption = null;

// ================== Init Map ==================
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
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                map.setView([lat, lon], 15);
            });
        }
    });

    debugToggle.addEventListener('click', () => {
        debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
    });

    // Populate bus list dynamically
    const busList = document.getElementById('bus-list');
    busList.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const div = document.createElement('div');
        div.classList.add('bus-item');
        div.innerHTML = `
            <div class="bus-icon"><i class="fas fa-bus"></i></div>
            <div class="bus-info">
                <h3>Bus ${i}</h3>
                <p>Click to view options</p>
            </div>
            <span class="bus-status status-on-time">Available</span>
        `;
        div.addEventListener('click', () => openActionModal(i));
        busList.appendChild(div);
    }

    fetchBuses();
    setInterval(fetchBuses, 5000);
}

// ================== Fetch Buses ==================
async function fetchBuses() {
    try {
        const response = await fetch(`${API_BASE_URL}/buses`);
        const busData = await response.json();

        debugContent.innerHTML = JSON.stringify(busData, null, 2);
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
        document.getElementById('active-buses').textContent = Object.keys(busData).length;
        document.getElementById('total-buses').textContent = Object.keys(busData).length;

        for (const busId in busData) {
            const bus = busData[busId];
            const position = [bus.lat, bus.lon];

            if (markers[busId]) {
                markers[busId].setLatLng(position);
                markers[busId].setPopupContent(`
                    <b>${bus.name}</b><br>
                    Status: ${bus.status}<br>
                    Last Update: ${bus.lastUpdate}<br>
                    <button onclick="openActionModal(${busId})" style="margin-top:10px;padding:5px 10px;background:#3498db;color:white;border:none;border-radius:3px;cursor:pointer;">Options</button>
                `);
            } else {
                markers[busId] = L.marker(position).addTo(map)
                    .bindPopup(`
                        <b>${bus.name}</b><br>
                        Status: ${bus.status}<br>
                        Last Update: ${bus.lastUpdate}<br>
                        <button onclick="openActionModal(${busId})" style="margin-top:10px;padding:5px 10px;background:#3498db;color:white;border:none;border-radius:3px;cursor:pointer;">Options</button>
                    `);
            }
        }
    } catch (err) {
        console.error("Error fetching buses:", err);
        debugContent.innerHTML = "Error fetching bus data: " + err.message;
    }
}

// ================== Open Action Modal ==================
function openActionModal(busId) {
    currentPopupBusId = busId;
    document.getElementById('action-modal-title').textContent = `Bus ${busId} Options`;
    actionModal.style.display = 'flex';
}

// ================== User Live Location ==================
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
        const response = await fetch(`${API_BASE_URL}/update_location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bus_id: busId, lat: lat, lon: lon }),
        });

        const result = await response.json();
        debugContent.innerHTML = `Location sent: ${JSON.stringify(result, null, 2)}`;
    } catch (err) {
        console.error("Error sending location:", err);
        debugContent.innerHTML = "Error sending location: " + err.message;
    }
}

// ================== Authentication Functions ==================
function authenticateDriver(driverId, password) {
    return driverId === "driver123" && password === "pass123";
}

function authenticateUser(userId, password) {
    return userId && password;
}

// ================== Modal Functionality ==================
busSelectBtn.addEventListener('click', () => busModal.style.display = 'flex');

closeModals.forEach(closeBtn => closeBtn.addEventListener('click', () => {
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
    const driverId = document.getElementById('driver-id').value;
    const password = document.getElementById('driver-password').value;

    if (authenticateDriver(driverId, password)) {
        // ❌ don't clear inputs
        driverLoginModal.style.display = 'none';
        startLiveLocation(currentPopupBusId);
        showToast(`Driver connected to Bus ${currentPopupBusId}`);
        busSelectBtn.style.display = 'none';
        stopTrackingBtn.style.display = 'block';
    } else {
        showToast('Invalid driver credentials');
    }
});

confirmUserLogin.addEventListener('click', () => {
    const userId = document.getElementById('user-id').value;
    const password = document.getElementById('user-password').value;

    if (authenticateUser(userId, password)) {
        // ❌ don't clear inputs
        userLoginModal.style.display = 'none';
        showToast(`Viewing Bus ${currentPopupBusId} location`);

        if (markers[currentPopupBusId]) {
            const position = markers[currentPopupBusId].getLatLng();
            map.setView(position, 15);
        }
    } else {
        showToast('Invalid user credentials');
    }
});

stopTrackingBtn.addEventListener('click', stopLiveLocation);

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

// Expose to HTML buttons
window.openActionModal = openActionModal;

// Initialize
document.addEventListener('DOMContentLoaded', initMap);
