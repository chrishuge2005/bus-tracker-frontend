let map;
let markers = {};
let userMarker = null;
let selectedBusId = null;
let gpsWatchId = null;
let studentAccuracyCircle = null;
let driverAccuracyCircle = null;
let isLoggedIn = false;
let currentUser = null;
let userLocation = null;
let userRole = null; // 'driver' or 'student'

// Backend API
const API_BASE_URL = "https://bus-tracker-backend-96uu.onrender.com";

// Driver & Student credentials
const driverCredentials = { /* same as before */ };
const studentCredentials = { /* same as before */ };

// Fallback bus data
const fallbackBusData = { /* same as before */ };

// Initialize map
function init() {
    map = L.map("map").setView([12.9716,77.5946],14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'© OpenStreetMap contributors'}).addTo(map);

    getUserLocation();
    setInterval(fetchBusDataForStudent, 10000);
    setupEventListeners();
}

// Get user location
function getUserLocation() {
    if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos => {
            userLocation = {lat: pos.coords.latitude, lng: pos.coords.longitude};
            map.setView([userLocation.lat, userLocation.lng], 14);
            loadBusData();
        }, err => {
            console.warn(err);
            userLocation = {lat:12.9716,lng:77.5946};
            map.setView([userLocation.lat,userLocation.lng],14);
            loadBusData();
        });
    } else {
        userLocation = {lat:12.9716,lng:77.5946};
        map.setView([userLocation.lat,userLocation.lng],14);
        loadBusData();
    }
}

// Fetch bus data (for students only)
async function fetchBusDataForStudent(){
    if(userRole !== 'student' || !selectedBusId) return;

    try{
        const res = await fetch(`${API_BASE_URL}/buses`);
        const busData = await res.json();
        const bus = busData[selectedBusId] || fallbackBusData[selectedBusId];
        if(bus) updateBusMarker(selectedBusId, bus.lat, bus.lng, bus.status);
    } catch(err){
        console.warn("Using fallback bus data", err);
        const bus = fallbackBusData[selectedBusId];
        if(bus) updateBusMarker(selectedBusId, bus.lat, bus.lng, bus.status);
    }
}

// Update bus marker
function updateBusMarker(busId, lat, lng, status){
    let color = status==="on-time"? "#10b981" : status==="delayed"? "#ef4444" : "#f59e0b";

    const busIcon = L.divIcon({
        html:`<div style="background-color:${color};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;"><i class="fas fa-bus"></i></div>`,
        className:'bus-marker', iconSize:[24,24], iconAnchor:[12,12]
    });

    if(markers[busId]){
        markers[busId].setLatLng([lat,lng]);
    }else{
        markers[busId] = L.marker([lat,lng],{icon:busIcon}).addTo(map)
            .bindPopup(`<strong>Bus ${busId}</strong><br>Status: ${status}`)
            .on('click',()=> map.setView([lat,lng],16));
    }
}

// Start driver tracking
function startTrackingAsBus(){
    if(userRole!=='driver') return showToast("Only drivers can track");
    if(!selectedBusId) return showToast("Select a bus first");

    if(gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);

    gpsWatchId = navigator.geolocation.watchPosition(pos=>{
        const {latitude,longitude,accuracy} = pos.coords;
        userLocation = {lat:latitude,lng:longitude};

        // Driver updates backend only, no map marker update for students
        updateBusLocationOnServer(selectedBusId, latitude, longitude);

        // Driver accuracy circle
        if(!driverAccuracyCircle){
            driverAccuracyCircle = L.circle([latitude,longitude],{radius:accuracy,color:'red',fillOpacity:0.2}).addTo(map);
        }else{
            driverAccuracyCircle.setLatLng([latitude,longitude]);
            driverAccuracyCircle.setRadius(accuracy);
        }

    },err=> showToast("GPS Error: "+err.message),{enableHighAccuracy:true,maximumAge:0});
}

// Student tracking
function trackStudentLocation(){
    if(userRole!=='student') return showToast("Only students can track");
    if(!selectedBusId) return showToast("Select a bus first");

    if(gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);

    gpsWatchId = navigator.geolocation.watchPosition(pos=>{
        const {latitude,longitude,accuracy} = pos.coords;
        userLocation = {lat:latitude,lng:longitude};

        if(!userMarker){
            userMarker = L.marker([latitude,longitude],{icon:L.divIcon({html:'<div style="background-color:#8b5cf6;width:20px;height:20px;border-radius:50%;border:3px solid white;"></div>',className:'user-marker',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);
        }else userMarker.setLatLng([latitude,longitude]);

        if(!studentAccuracyCircle){
            studentAccuracyCircle = L.circle([latitude,longitude],{radius:accuracy,color:'blue',fillOpacity:0.2}).addTo(map);
        }else{
            studentAccuracyCircle.setLatLng([latitude,longitude]);
            studentAccuracyCircle.setRadius(accuracy);
        }

        fetchBusDataForStudent(); // update bus marker

        // Fit bounds
        const bus = fallbackBusData[selectedBusId];
        if(bus){
            const bounds = L.latLngBounds([latitude,longitude],[bus.lat,bus.lng]);
            map.fitBounds(bounds,{padding:[50,50]});
        }

    },err=> showToast("GPS Error: "+err.message),{enableHighAccuracy:true,maximumAge:0});
}

// Stop tracking
function stopTracking(){
    if(gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId=null;

    if(studentAccuracyCircle){ map.removeLayer(studentAccuracyCircle); studentAccuracyCircle=null; }
    if(driverAccuracyCircle){ map.removeLayer(driverAccuracyCircle); driverAccuracyCircle=null; }
}

// Update bus location on server
async function updateBusLocationOnServer(busId,lat,lng){
    try{
        await fetch(`${API_BASE_URL}/buses/${busId}/location`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({lat,lng,timestamp:new Date().toISOString()})
        });
    }catch(err){ console.warn(err); }
}
