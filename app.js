// Initialize variables
let map;
let markers = {};
let userMarker = null;
let selectedBusId = null;
let gpsWatchId = null;
let accuracyCircle = null;
let isLoggedIn = false;
let currentUser = null;
let userLocation = null;
let userRole = null;
let trackedBusMarker = null;
let busData = {};
let busActivityStatus = {
    "1": false,
    "2": false, 
    "3": false,
    "4": false
};

const API_BASE_URL = "https://bus-tracker-backend-96uu.onrender.com";
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

// Credentials
const driverCredentials = {
    "driver1": { password: "pass1", busId: "1", name: "John Smith" },
    "driver2": { password: "pass2", busId: "2", name: "Maria Garcia" },
    "driver3": { password: "pass3", busId: "3", name: "Robert Johnson" },
    "driver4": { password: "pass4", busId: "4", name: "Sarah Wilson" }
};

const studentCredentials = {
    "student1": { password: "pass1", name: "Alex Johnson" },
    "student2": { password: "pass2", name: "Emma Davis" },
    "student3": { password: "pass3", name: "Michael Brown" }
};

const fallbackBusData = {
    "1": { lat: 12.9716, lng: 77.5946, name: "Campus Shuttle A", status: "inactive", lastUpdate: new Date() },
    "2": { lat: 12.9352, lng: 77.6245, name: "North Route", status: "inactive", lastUpdate: new Date(Date.now() - 120000) },
    "3": { lat: 12.9876, lng: 77.5512, name: "South Route", status: "inactive", lastUpdate: new Date(Date.now() - 30000) },
    "4": { lat: 12.9563, lng: 77.5768, name: "East Route", status: "inactive", lastUpdate: new Date(Date.now() - 60000) }
};

// Initialize application
function init() {
    // Initialize map with default location
    map = L.map("map").setView([12.9716, 77.5946], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    
    checkGPSAvailability();
    setupEventListeners();
    
    // Try to get location, but don't block if denied
    if (navigator.geolocation) {
        updateGPSStatus("searching");
        
        const locationTimeout = setTimeout(() => {
            updateGPSStatus("inactive");
            showToast("Location request taking too long. Using default location.");
            userLocation = { lat: 12.9716, lng: 77.5946 };
            loadBusData();
        }, 5000);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                clearTimeout(locationTimeout);
                const { latitude, longitude } = position.coords;
                userLocation = { lat: latitude, lng: longitude };
                map.setView([latitude, longitude], 14);
                updateGPSStatus("active");
                document.getElementById('location-permission').style.display = 'none';
                loadBusData();
            },
            (error) => {
                clearTimeout(locationTimeout);
                console.error("Error getting location:", error);
                handleLocationError(error);
                userLocation = { lat: 12.9716, lng: 77.5946 };
                loadBusData();
            },
            { timeout: 10000, enableHighAccuracy: false }
        );
    } else {
        document.getElementById('location-permission').style.display = 'block';
        document.getElementById('enable-location').disabled = true;
        document.getElementById('enable-location').textContent = "Geolocation not supported";
        userLocation = { lat: 12.9716, lng: 77.5946 };
        loadBusData();
    }

    setInterval(loadBusData, 15000);
}

function setupEventListeners() {
    // Login buttons
    document.getElementById('driver-login-btn')?.addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'flex';
    });
    
    document.getElementById('student-login-btn')?.addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'flex';
    });
    
    // Close modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // Cancel buttons
    document.getElementById('cancel-driver-login')?.addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'none';
    });
    
    document.getElementById('cancel-student-login')?.addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'none';
    });
    
    // Login confirm buttons
    document.getElementById('confirm-driver-login')?.addEventListener('click', handleDriverLogin);
    document.getElementById('confirm-student-login')?.addEventListener('click', handleStudentLogin);
    
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // Enable location button
    document.getElementById('enable-location')?.addEventListener('click', enableLocation);
    
    // Map controls
    document.getElementById('zoom-in')?.addEventListener('click', () => {
        map.zoomIn();
    });
    
    document.getElementById('zoom-out')?.addEventListener('click', () => {
        map.zoomOut();
    });
    
    document.getElementById('locate-me')?.addEventListener('click', centerMapOnUser);
    
    // Driver controls
    document.getElementById('start-tracking')?.addEventListener('click', startDriverTracking);
    document.getElementById('stop-tracking')?.addEventListener('click', stopDriverTracking);
    
    // Student controls
    document.getElementById('track-bus')?.addEventListener('click', trackBus);
    
    // Bus selection
    document.querySelectorAll('.bus-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.bus-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
        });
    });
    
    // Search functionality
    document.getElementById('bus-search')?.addEventListener('input', filterBusList);
    document.querySelector('.search-box button')?.addEventListener('click', filterBusList);
}

function handleDriverLogin() {
    const driverId = document.getElementById('driver-id')?.value;
    const password = document.getElementById('password')?.value;
    const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');
    
    if (!driverId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }
    
    const busId = selectedBusOption.getAttribute('data-bus-id');
    
    if (driverCredentials[driverId] && driverCredentials[driverId].password === password) {
        isLoggedIn = true;
        currentUser = driverId;
        userRole = 'driver';
        
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = driverCredentials[driverId].name;
        document.getElementById('driver-controls').style.display = 'flex';
        document.getElementById('student-controls').style.display = 'none';
        
        document.getElementById('driver-login-modal').style.display = 'none';
        
        showToast(`Welcome, ${driverCredentials[driverId].name}`);
    } else {
        showToast("Invalid driver ID or password");
    }
}

function handleStudentLogin() {
    const studentId = document.getElementById('student-id')?.value;
    const password = document.getElementById('student-password')?.value;
    const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');
    
    if (!studentId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }
    
    const busId = selectedBusOption.getAttribute('data-bus-id');
    
    if (studentCredentials[studentId] && studentCredentials[studentId].password === password) {
        isLoggedIn = true;
        currentUser = studentId;
        userRole = 'student';
        
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = studentCredentials[studentId].name;
        document.getElementById('driver-controls').style.display = 'none';
        document.getElementById('student-controls').style.display = 'flex';
        
        document.getElementById('student-login-modal').style.display = 'none';
        
        showToast(`Welcome, ${studentCredentials[studentId].name}`);
    } else {
        showToast("Invalid student ID or password");
    }
}

function handleLogout() {
    isLoggedIn = false;
    currentUser = null;
    userRole = null;
    
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    
    if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }
    
    for (const busId in busActivityStatus) {
        busActivityStatus[busId] = false;
    }
    
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-buttons').style.display = 'flex';
    document.getElementById('driver-controls').style.display = 'none';
    document.getElementById('student-controls').style.display = 'none';
    
    showToast("Logged out successfully");
}

function enableLocation() {
    if (navigator.geolocation) {
        updateGPSStatus("searching");
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                userLocation = { lat: latitude, lng: longitude };
                map.setView([latitude, longitude], 14);
                updateGPSStatus("active");
                
                document.getElementById('location-permission').style.display = 'none';
                showToast("Location access enabled!");
            },
            (error) => {
                console.error("Error getting location:", error);
                updateGPSStatus("inactive");
                showToast("Please enable location permissions in your browser settings");
            }
        );
    }
}

function centerMapOnUser() {
    if (userLocation) {
        map.setView([userLocation.lat, userLocation.lng], 16);
        showToast("Centered on your location");
    } else {
        showToast("Your location is not available");
    }
}

function startDriverTracking() {
    if (!isLoggedIn || userRole !== 'driver') {
        showToast("Please login as a driver first");
        return;
    }
    
    const busId = driverCredentials[currentUser].busId;
    
    busActivityStatus[busId] = true;
    selectedBusId = busId;
    
    document.getElementById('stop-tracking').style.display = 'block';
    document.getElementById('start-tracking').style.display = 'none';
    
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    
    if (navigator.geolocation) {
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                
                userLocation = { lat: latitude, lng: longitude };
                
                if (busData[busId]) {
                    busData[busId].lat = latitude;
                    busData[busId].lng = longitude;
                    busData[busId].lastUpdate = new Date();
                    busData[busId].status = "active";
                }
                
                updateUserPosition(latitude, longitude, accuracy);
                map.setView([latitude, longitude], 16);
                updateGPSStatus("active");
            },
            (error) => {
                console.error("Error watching position:", error);
                updateGPSStatus("error");
            },
            { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    }
    
    showToast(`Started tracking Bus ${busId}`);
}

function stopDriverTracking() {
    if (!isLoggedIn || userRole !== 'driver') return;
    
    const busId = driverCredentials[currentUser].busId;
    
    busActivityStatus[busId] = false;
    
    document.getElementById('stop-tracking').style.display = 'none';
    document.getElementById('start-tracking').style.display = 'block';
    
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    
    if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }
    
    updateGPSStatus("inactive");
    showToast("Stopped tracking");
}

function trackBus() {
    if (!isLoggedIn || userRole !== 'student') {
        showToast("Please login as a student first");
        return;
    }
    
    const availableBuses = Object.keys(busData).filter(id => busActivityStatus[id]);
    
    if (availableBuses.length === 0) {
        showToast("No active buses available for tracking");
        return;
    }
    
    selectedBusId = availableBuses[0];
    const bus = busData[selectedBusId];
    
    map.setView([bus.lat, bus.lng], 16);
    
    if (trackedBusMarker) {
        map.removeLayer(trackedBusMarker);
    }
    
    const trackedBusIcon = L.divIcon({
        html: '<div class="tracked-bus-marker"><i class="fas fa-bus"></i></div>',
        className: 'tracked-bus-marker-container',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    trackedBusMarker = L.marker([bus.lat, bus.lng], { icon: trackedBusIcon })
        .addTo(map)
        .bindPopup(`<strong>Tracked Bus ${selectedBusId}</strong><br>${bus.name}`)
        .openPopup();
        
    showToast(`Now tracking Bus ${selectedBusId}`);
}

function updateUserPosition(lat, lng, accuracy) {
    const userIcon = L.divIcon({
        html: '<div class="user-marker"><i class="fas fa-user"></i></div>',
        className: 'user-marker-container',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
    }
    
    if (!accuracyCircle) {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.2,
            weight: 1
        }).addTo(map);
    } else {
        accuracyCircle.setLatLng([lat, lng]);
        accuracyCircle.setRadius(accuracy);
    }
}

function filterBusList() {
    const searchTerm = document.getElementById('bus-search')?.value.toLowerCase();
    const busItems = document.querySelectorAll('.bus-item');
    
    busItems.forEach(item => {
        const busName = item.querySelector('h3').textContent.toLowerCase();
        const busId = item.dataset.busId;
        
        if (busName.includes(searchTerm) || busId.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function handleLocationError(error) {
    let errorMsg = "Unable to get your location";
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMsg = "Location access denied. Please enable location permissions in your browser settings.";
            document.getElementById('location-permission').style.display = 'block';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information unavailable.";
            break;
        case error.TIMEOUT:
            errorMsg = "Location request timed out.";
            break;
    }
    updateGPSStatus("inactive");
    showToast(errorMsg);
}

function updateGPSStatus(status) {
    const indicator = document.getElementById('gps-indicator');
    const text = document.getElementById('gps-text');
    
    if (indicator && text) {
        indicator.classList.remove('gps-active', 'gps-inactive', 'gps-searching');
        switch(status) {
            case "active":
                indicator.classList.add('gps-active');
                text.textContent = 'GPS Active';
                break;
            case "inactive":
                indicator.classList.add('gps-inactive');
                text.textContent = 'GPS Inactive';
                break;
            case "searching":
                indicator.classList.add('gps-searching');
                text.textContent = 'Searching...';
                break;
            case "unavailable":
                indicator.classList.add('gps-inactive');
                text.textContent = 'GPS Unavailable';
                break;
            case "error":
                indicator.classList.add('gps-inactive');
                text.textContent = 'GPS Error';
                break;
        }
    }
}

function checkGPSAvailability() {
    if ("geolocation" in navigator) {
        updateGPSStatus("inactive");
    } else {
        updateGPSStatus("unavailable");
        showToast("GPS is not available on this device");
    }
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

async function loadBusData(attempt = 1) {
    if (!navigator.onLine) {
        console.warn("Device is offline, using fallback data");
        showToast("Device is offline. Using offline data.", 3000);
        busData = { ...fallbackBusData };
        updateBusList(busData);
        for (const busId in busData) {
            const bus = busData[busId];
            updateBusMarker(busId, bus.lat, bus.lng, bus.status);
        }
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
        return;
    }

    let timeoutId;
    try {
        updateConnectionStatus('connecting');
        
        const controller = new AbortController();
        timeoutId = setTimeout(() => {
            controller.abort(new Error("Request timed out after 30000ms"));
        }, 30000);
        
        const response = await fetch(`${API_BASE_URL}/buses`, {
            signal: controller.signal,
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const apiBusData = await response.json();
        if (!apiBusData || typeof apiBusData !== 'object') {
            throw new Error("Invalid API response format");
        }
        
        busData = { ...apiBusData };
        updateBusList(busData);
        
        for (const busId in busData) {
            const bus = busData[busId];
            let status = bus.status || "inactive";
            if (busActivityStatus[busId] === false) {
                status = "inactive";
            }
            updateBusMarker(busId, bus.lat, bus.lng, status);
        }
        
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
        updateConnectionStatus('online');
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            console.error("Fetch timeout:", error.message);
            showToast(`Server connection timeout (attempt ${attempt}/${MAX_RETRIES}).`, 3000);
        } else if (error.message.includes("HTTP error")) {
            console.error("HTTP error:", error.message);
            showToast(`Server error: ${error.message} (attempt ${attempt}/${MAX_RETRIES}).`, 3000);
        } else {
            console.error("Error fetching bus data:", error.message);
            showToast(`Failed to fetch data: ${error.message} (attempt ${attempt}/${MAX_RETRIES}).`, 3000);
        }
        
        updateConnectionStatus('offline');
        
        if (attempt < MAX_RETRIES) {
            const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
            console.log(`Retrying fetch in ${delay}ms... Attempt ${attempt + 1}/${MAX_RETRIES}`);
            setTimeout(() => loadBusData(attempt + 1), delay);
            return;
        }
        
        console.warn("Max retries reached, using fallback data");
        showToast("Unable to connect to server. Using offline data.", 3000);
        busData = { ...fallbackBusData };
        updateBusList(busData);
        for (const busId in busData) {
            const bus = busData[busId];
            updateBusMarker(busId, bus.lat, bus.lng, bus.status);
        }
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    }
}

function updateConnectionStatus(status) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    
    if (dot && text) {
        dot.classList.remove('online', 'offline', 'connecting');
        dot.classList.add(status);
        text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
}

function updateBusMarker(busId, lat, lng, status) {
    let markerColor;
    switch(status) {
        case "on-time": markerColor = "#10b981"; break;
        case "delayed": markerColor = "#ef4444"; break;
        case "arriving": markerColor = "#f59e0b"; break;
        case "inactive": markerColor = "#6b7280"; break;
        case "active": markerColor = "#2563eb"; break;
        default: markerColor = "#2563eb";
    }

    const busIcon = L.divIcon({
        html: `<div style="background-color:${markerColor};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-bus"></i></div>`,
        className: 'bus-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    if (markers[busId]) {
        markers[busId].setLatLng([lat, lng]);
        markers[busId].setIcon(busIcon);
    } else {
        markers[busId] = L.marker([lat, lng], { icon: busIcon })
            .addTo(map)
            .bindPopup(`<strong>Bus ${busId}</strong><br>Status: <span class="status-${status}">${status}</span>`);
            
        markers[busId].on('click', function() {
            map.setView([lat, lng], 16);
        });
    }
}

function updateBusList(busData) {
    const busList = document.getElementById('bus-list');
    if (!busList) return;
    
    busList.innerHTML = '';
    let activeCount = 0;
    let onTimeCount = 0;
    let delayedCount = 0;

    for (const busId in busData) {
        const bus = busData[busId];
        const busItem = document.createElement('div');
        busItem.className = 'bus-item';
        busItem.dataset.busId = busId;

        let status = bus.status || "inactive";
        if (busActivityStatus[busId] === true) {
            status = "active";
            activeCount++;
        }

        if (status === "on-time") onTimeCount++;
        if (status === "delayed") delayedCount++;

        busItem.innerHTML = `
            <div class="bus-icon"><i class="fas fa-bus"></i></div>
            <div class="bus-info">
                <h3>${bus.name || `Bus ${busId}`}</h3>
                <p>ID: ${busId} | Status: <span class="status-${status}">${status}</span></p>
            </div>
            <span class="bus-status status-${status}">${status}</span>
        `;

        busItem.addEventListener('click', () => {
            const busLocation = busData[busId] || fallbackBusData[busId];
            map.setView([busLocation.lat, busLocation.lng], 16);
            if (markers[busId]) {
                markers[busId].openPopup();
            }
        });

        busList.appendChild(busItem);
    }

    document.getElementById('active-buses').textContent = activeCount;
    document.getElementById('total-buses').textContent = Object.keys(busData).length;
    document.getElementById('on-time').textContent = onTimeCount;
    document.getElementById('delayed').textContent = delayedCount;
}

// Initialize the application
window.onload = init;