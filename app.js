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

const API_BASE_URL = "http://localhost:8000"; // Changed to localhost for testing

// Initialize map with default location
map = L.map("map").setView([12.9716, 77.5946], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

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
    checkGPSAvailability();
    setupEventListeners();
    
    // Try to get location, but don't block if denied
    if (navigator.geolocation) {
        updateGPSStatus("searching");
        
        // Use a timeout for location request
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
            { timeout: 10000, enableHighAccuracy: false } // Reduced timeout and accuracy
        );
    } else {
        document.getElementById('location-permission').style.display = 'block';
        document.getElementById('enable-location').disabled = true;
        document.getElementById('enable-location').textContent = "Geolocation not supported";
        userLocation = { lat: 12.9716, lng: 77.5946 };
        loadBusData();
    }

    setInterval(loadBusData, 15000); // Increased interval to 15 seconds
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
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

async function loadBusData() {
    try {
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_BASE_URL}/buses`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const apiBusData = await response.json();
        busData = { ...apiBusData };
        
        updateBusList(busData);
        
        for (const busId in busData) {
            const bus = busData[busId];
            let status = bus.status;
            
            if (busActivityStatus[busId] === false) {
                status = "inactive";
            }
            
            updateBusMarker(busId, bus.lat, bus.lng, status);
        }
        
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error("Fetch timeout:", error);
            showToast("Server connection timeout. Using offline data.");
        } else {
            console.error("Error fetching bus data:", error);
            showToast("Backend not reachable. Using offline data.");
        }
        
        busData = { ...fallbackBusData };
        updateBusList(fallbackBusData);
        for (const busId in fallbackBusData) {
            const bus = fallbackBusData[busId];
            updateBusMarker(busId, bus.lat, bus.lng, bus.status);
        }
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
    busList.innerHTML = '';

    let activeCount = 0;
    let inactiveCount = 0;

    for (const busId in busData) {
        const bus = busData[busId];
        const busItem = document.createElement('div');
        busItem.className = 'bus-item';
        busItem.dataset.busId = busId;

        let status = bus.status || "inactive";
        if (busActivityStatus[busId] === true) {
            status = "active";
            activeCount++;
        } else {
            inactiveCount++;
        }

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
}

// ... [rest of the functions remain the same as previous code] ...

// Update the enable location button handler
document.getElementById('enable-location').addEventListener('click', () => {
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
});

window.onload = init;