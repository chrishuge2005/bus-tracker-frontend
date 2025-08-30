// ================== Variables ==================
        let map;
        let markers = {};
        let userMarker = null;
        let selectedBusId = null;
        let gpsWatchId = null;

        // 👇 Replace with your PC's actual IP address
        const API_BASE_URL = "http://192.168.1.100:8000";  // Change this to your PC's IP

        // ================== DOM Elements ==================
        const busModal = document.getElementById('bus-modal');
        const busSelectBtn = document.getElementById('bus-select-btn');
        const stopTrackingBtn = document.getElementById('stop-tracking');
        const closeModal = document.querySelector('.close-modal');
        const cancelSelect = document.getElementById('cancel-select');
        const confirmSelect = document.getElementById('confirm-select');
        const busOptions = document.querySelectorAll('.bus-option');
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

            // Add map controls
            zoomInBtn.addEventListener('click', () => {
                map.zoomIn();
            });

            zoomOutBtn.addEventListener('click', () => {
                map.zoomOut();
            });

            locateMeBtn.addEventListener('click', () => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        map.setView([lat, lon], 15);
                    });
                }
            });

            // Debug panel
            debugToggle.addEventListener('click', () => {
                debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
            });

            fetchBuses();
            setInterval(fetchBuses, 5000); // refresh every 5 sec
        }

        // ================== Fetch Buses ==================
        async function fetchBuses() {
            try {
                const response = await fetch(`${API_BASE_URL}/buses`);
                const busData = await response.json();

                // Update debug info
                debugContent.innerHTML = JSON.stringify(busData, null, 2);
                
                // Update last update time
                document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
                
                // Update bus count
                document.getElementById('active-buses').textContent = Object.keys(busData).length;
                document.getElementById('total-buses').textContent = Object.keys(busData).length;

                for (const busId in busData) {
                    const bus = busData[busId];
                    const position = [bus.lat, bus.lon];

                    if (markers[busId]) {
                        markers[busId].setLatLng(position);
                    } else {
                        markers[busId] = L.marker(position).addTo(map)
                            .bindPopup(`<b>${bus.name}</b><br>Status: ${bus.status}<br>Last Update: ${bus.lastUpdate}`);
                    }
                }
            } catch (err) {
                console.error("Error fetching buses:", err);
                debugContent.innerHTML = "Error fetching bus data: " + err.message;
            }
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

                        // update user marker
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

                        // Center map on user location
                        map.setView([lat, lon], 15);
                        
                        // send to backend
                        sendLocationToServer(selectedBusId, lat, lon);
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

        // ================== Modal Functionality ==================
        // Open modal when bus select button is clicked
        busSelectBtn.addEventListener('click', () => {
            busModal.style.display = 'flex';
        });

        // Close modal functions
        closeModal.addEventListener('click', () => {
            busModal.style.display = 'none';
        });

        cancelSelect.addEventListener('click', () => {
            busModal.style.display = 'none';
        });

        // Select a bus option
        busOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                busOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Select current option
                option.classList.add('selected');
                selectedBusOption = option;
            });
        });

        // Confirm bus selection
        confirmSelect.addEventListener('click', () => {
            if (!selectedBusOption) {
                showToast('Please select a bus first');
                return;
            }
            
            const busId = selectedBusOption.getAttribute('data-bus-id');
            const busName = selectedBusOption.querySelector('strong').textContent;
            
            // Close modal
            busModal.style.display = 'none';
            
            // Start live location tracking for the selected bus
            startLiveLocation(busId);
            
            // Update UI to show which bus is being tracked
            showToast(`Now tracking location for ${busName}`);
            
            // Update GPS status
            updateGpsStatus('active');
            
            // Show stop tracking button
            busSelectBtn.style.display = 'none';
            stopTrackingBtn.style.display = 'block';
        });

        // Stop tracking button
        stopTrackingBtn.addEventListener('click', stopLiveLocation);

        // Show toast notification
        function showToast(message) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toast-message');
            
            toastMessage.textContent = message;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        // Update GPS status indicator
        function updateGpsStatus(status) {
            const indicator = document.getElementById('gps-indicator');
            const text = document.getElementById('gps-text');
            
            indicator.className = 'gps-indicator';
            indicator.classList.add(`gps-${status}`);
            
            if (status === 'active') {
                text.textContent = 'GPS Active - Tracking';
            } else if (status === 'searching') {
                text.textContent = 'GPS Searching';
            } else {
                text.textContent = 'GPS Inactive';
            }
        }

        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            initMap();
        });