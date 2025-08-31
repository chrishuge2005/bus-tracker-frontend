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
        let userRole = null; // 'driver' or 'student'
        let trackedBusMarker = null;

        // Backend API URL
        const API_BASE_URL = "https://bus-tracker-backend-96uu.onrender.com";

        // Create map with a default view (will be updated once location is available)
        map = L.map("map").setView([12.9716, 77.5946], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© OpenStreetMap contributors',
        }).addTo(map);

        // Driver credentials
        const driverCredentials = {
            "driver1": { password: "pass1", busId: "1", name: "John Smith" },
            "driver2": { password: "pass2", busId: "2", name: "Maria Garcia" },
            "driver3": { password: "pass3", busId: "3", name: "Robert Johnson" },
            "driver4": { password: "pass4", busId: "4", name: "Sarah Wilson" }
        };

        // Student credentials
        const studentCredentials = {
            "student1": { password: "pass1", name: "Alex Johnson" },
            "student2": { password: "pass2", name: "Emma Davis" },
            "student3": { password: "pass3", name: "Michael Brown" }
        };

        // Fallback data in case backend is not reachable
        const fallbackBusData = {
            "1": { lat: 12.9716, lng: 77.5946, name: "Campus Shuttle A", status: "on-time", lastUpdate: new Date() },
            "2": { lat: 12.9352, lng: 77.6245, name: "North Route", status: "delayed", lastUpdate: new Date(Date.now() - 120000) },
            "3": { lat: 12.9876, lng: 77.5512, name: "South Route", status: "arriving", lastUpdate: new Date(Date.now() - 30000) },
            "4": { lat: 12.9563, lng: 77.5768, name: "East Route", status: "on-time", lastUpdate: new Date(Date.now() - 60000) }
        };

        // Initialize the application
        function init() {
            // Try to get user's current location first
            if (navigator.geolocation) {
                updateGPSStatus("searching");
                
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        userLocation = { lat: latitude, lng: longitude };
                        map.setView([latitude, longitude], 14);
                        updateGPSStatus("active");
                        
                        // Hide permission prompt
                        document.getElementById('location-permission').style.display = 'none';
                        
                        // Load bus data
                        loadBusData();
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        // Show permission prompt if location access is denied
                        document.getElementById('location-permission').style.display = 'block';
                        updateGPSStatus("inactive");
                        
                        // Set a default location (Central coordinates)
                        userLocation = { lat: 12.9716, lng: 77.5946 };
                        map.setView([12.9716, 77.5946], 14);
                        
                        // Load bus data anyway
                        loadBusData();
                    }
                );
            } else {
                // Geolocation not supported
                document.getElementById('location-permission').style.display = 'block';
                document.getElementById('enable-location').disabled = true;
                document.getElementById('enable-location').textContent = "Geolocation not supported";
                
                // Set a default location
                userLocation = { lat: 12.9716, lng: 77.5946 };
                map.setView([12.9716, 77.5946], 14);
                
                // Load bus data
                loadBusData();
            }

            // Set up periodic data refresh
            setInterval(loadBusData, 10000);

            // Check GPS availability
            checkGPSAvailability();

            // Event listeners
            setupEventListeners();
        }

        // Update GPS status indicator
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

        // Check if GPS is available
        function checkGPSAvailability() {
            if ("geolocation" in navigator) {
                updateGPSStatus("inactive");
            } else {
                updateGPSStatus("unavailable");
                showToast("GPS is not available on this device");
            }
        }

        // Show toast notification
        function showToast(message, duration = 3000) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toast-message');
            
            toastMessage.textContent = message;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        }

        // Load bus data from backend with fallback
        async function loadBusData() {
            try {
                // Fetch from backend API
                const response = await fetch(`${API_BASE_URL}/buses`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const busData = await response.json();
                
                // Update bus list
                updateBusList(busData);
                
                // Update bus markers on map
                for (const busId in busData) {
                    const bus = busData[busId];
                    updateBusMarker(busId, bus.lat, bus.lng, bus.status);
                }
                
                document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
            } catch (error) {
                console.error("Error fetching bus data:", error);
                
                // Use fallback data if backend is unavailable
                updateBusList(fallbackBusData);
                for (const busId in fallbackBusData) {
                    const bus = fallbackBusData[busId];
                    updateBusMarker(busId, bus.lat, bus.lng, bus.status);
                }
                
                showToast("Using offline data. Backend not reachable.");
            }
        }

        // Add/update bus marker
        function updateBusMarker(busId, lat, lng, status) {
            let markerColor;
            switch(status) {
                case "on-time": markerColor = "#10b981"; break;
                case "delayed": markerColor = "#ef4444"; break;
                case "arriving": markerColor = "#f59e0b"; break;
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
            } else {
                markers[busId] = L.marker([lat, lng], { icon: busIcon })
                    .addTo(map)
                    .bindPopup(`<strong>Bus ${busId}</strong><br>Status: <span class="status-${status}">${status}</span>`);
                    
                // Add click event to center map on bus
                markers[busId].on('click', function() {
                    map.setView([lat, lng], 16);
                });
            }
        }

        // Update bus list
        function updateBusList(busData) {
            const busList = document.getElementById('bus-list');
            busList.innerHTML = '';

            let onTimeCount = 0;
            let delayedCount = 0;
            let arrivingCount = 0;

            for (const busId in busData) {
                const bus = busData[busId];
                const busItem = document.createElement('div');
                busItem.className = 'bus-item';
                busItem.dataset.busId = busId;

                // For demo purposes, assign a status based on bus ID if not provided
                let status = bus.status;
                if (!status) {
                    switch(busId) {
                        case "1": status = "on-time"; break;
                        case "2": status = "delayed"; break;
                        case "3": status = "arriving"; break;
                        default: status = "on-time";
                    }
                }

                // Count statuses
                switch(status) {
                    case "on-time": onTimeCount++; break;
                    case "delayed": delayedCount++; break;
                    case "arriving": arrivingCount++; break;
                }

                busItem.innerHTML = `
                    <div class="bus-icon"><i class="fas fa-bus"></i></div>
                    <div class="bus-info">
                        <h3>${bus.name || `Bus ${busId}`}</h3>
                        <p>ID: ${busId} | Location: ${bus.lat.toFixed(4)}, ${bus.lng.toFixed(4)}</p>
                    </div>
                    <span class="bus-status status-${status}">${status}</span>
                `;

                busItem.addEventListener('click', () => {
                    map.setView([bus.lat, bus.lng], 16);
                    if (markers[busId]) {
                        markers[busId].openPopup();
                    }
                });

                busList.appendChild(busItem);
            }

            document.getElementById('active-buses').textContent = Object.keys(busData).length;
            document.getElementById('total-buses').textContent = Object.keys(busData).length;
            document.getElementById('on-time').textContent = onTimeCount;
            document.getElementById('delayed').textContent = delayedCount;
        }

        // Start tracking user location as bus
        function startTrackingAsBus() {
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
            }
            
            if (!selectedBusId) {
                showToast('Please select a bus first');
                return;
            }
            
            updateGPSStatus("searching");
            
            gpsWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    updateGPSStatus("active");
                    
                    // Update user location
                    userLocation = { lat: latitude, lng: longitude };
                    
                    // Update local marker
                    updateBusMarker(selectedBusId, latitude, longitude, "on-time");
                    
                    // Send location to backend
                    updateBusLocationOnServer(selectedBusId, latitude, longitude);
                    
                    // Add accuracy circle to map
                    if (!accuracyCircle) {
                        accuracyCircle = L.circle([latitude, longitude], {
                            radius: accuracy,
                            color: 'blue',
                            fillColor: '#3388ff',
                            fillOpacity: 0.2
                        }).addTo(map);
                    } else {
                        accuracyCircle.setLatLng([latitude, longitude]);
                        accuracyCircle.setRadius(accuracy);
                    }
                    
                    // Center map on the bus location
                    map.setView([latitude, longitude], 16);
                },
                (error) => {
                    console.error("GPS Error:", error);
                    let errorMsg;
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMsg = "Location access denied. Please enable location permissions.";
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMsg = "Location information unavailable.";
                            break;
                        case error.TIMEOUT:
                            errorMsg = "Location request timed out.";
                            break;
                        default:
                            errorMsg = "Unknown location error.";
                    }
                    updateGPSStatus("error");
                    showToast(errorMsg);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        }

        // Update bus location on the server
        async function updateBusLocationOnServer(busId, lat, lng) {
            try {
                const response = await fetch(`${API_BASE_URL}/buses/${busId}/location`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        lat: lat,
                        lng: lng,
                        timestamp: new Date().toISOString()
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                console.log(`Bus ${busId} location updated successfully`);
            } catch (error) {
                console.error("Error updating bus location:", error);
            }
        }

        // Track student location and show both student and bus
        function trackStudentLocation() {
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
            }
            
            if (!selectedBusId) {
                showToast('Please select a bus first');
                return;
            }
            
            updateGPSStatus("searching");
            
            gpsWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    updateGPSStatus("active");
                    
                    // Update user location
                    userLocation = { lat: latitude, lng: longitude };
                    
                    // Update student marker
                    if (userMarker) {
                        userMarker.setLatLng([latitude, longitude]);
                    } else {
                        userMarker = L.marker([latitude, longitude], {
                            icon: L.divIcon({
                                html: `<div style="background-color:#8b5cf6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>`,
                                className: 'user-marker',
                                iconSize: [20, 20],
                                iconAnchor: [10, 10]
                            })
                        }).addTo(map).bindPopup("Your location");
                    }
                    
                    // Add accuracy circle to map
                    if (!accuracyCircle) {
                        accuracyCircle = L.circle([latitude, longitude], {
                            radius: accuracy,
                            color: 'blue',
                            fillColor: '#3388ff',
                            fillOpacity: 0.2
                        }).addTo(map);
                    } else {
                        accuracyCircle.setLatLng([latitude, longitude]);
                        accuracyCircle.setRadius(accuracy);
                    }
                    
                    // Show both student and bus on the map
                    const busLocation = fallbackBusData[selectedBusId];
                    if (busLocation) {
                        const bounds = L.latLngBounds(
                            [latitude, longitude],
                            [busLocation.lat, busLocation.lng]
                        );
                        map.fitBounds(bounds, { padding: [50, 50] });
                    }
                },
                (error) => {
                    console.error("GPS Error:", error);
                    let errorMsg;
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMsg = "Location access denied. Please enable location permissions.";
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMsg = "Location information unavailable.";
                            break;
                        case error.TIMEOUT:
                            errorMsg = "Location request timed out.";
                            break;
                        default:
                            errorMsg = "Unknown location error.";
                    }
                    updateGPSStatus("error");
                    showToast(errorMsg);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        }

        // Stop tracking
        function stopTracking() {
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
            }
            updateGPSStatus("inactive");
            
            if (accuracyCircle) {
                map.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }
        }

        // Handle driver login
        function handleDriverLogin() {
            const driverId = document.getElementById('driver-id').value;
            const password = document.getElementById('password').value;
            
            if (!driverId || !password) {
                showToast('Please enter both driver ID and password');
                return;
            }
            
            if (!selectedBusId) {
                showToast('Please select a bus');
                return;
            }
            
            // Check credentials
            if (driverCredentials[driverId] && driverCredentials[driverId].password === password) {
                if (driverCredentials[driverId].busId !== selectedBusId) {
                    showToast('This driver is not assigned to the selected bus');
                    return;
                }
                
                isLoggedIn = true;
                userRole = 'driver';
                currentUser = {
                    id: driverId,
                    name: driverCredentials[driverId].name,
                    busId: selectedBusId
                };
                
                // Update UI
                document.getElementById('login-buttons').style.display = 'none';
                document.getElementById('user-info').style.display = 'flex';
                document.getElementById('username').textContent = currentUser.name;
                document.getElementById('driver-controls').style.display = 'flex';
                document.getElementById('student-controls').style.display = 'none';
                
                // Close modal
                document.getElementById('driver-login-modal').style.display = 'none';
                
                showToast(`Logged in as ${currentUser.name}. You can now start tracking.`);
            } else {
                showToast('Invalid driver ID or password');
            }
        }

        // Handle student login
        function handleStudentLogin() {
            const studentId = document.getElementById('student-id').value;
            const password = document.getElementById('student-password').value;
            
            if (!studentId || !password) {
                showToast('Please enter both student ID and password');
                return;
            }
            
            if (!selectedBusId) {
                showToast('Please select a bus');
                return;
            }
            
            // Check credentials
            if (studentCredentials[studentId] && studentCredentials[studentId].password === password) {
                isLoggedIn = true;
                userRole = 'student';
                currentUser = {
                    id: studentId,
                    name: studentCredentials[studentId].name
                };
                
                // Update UI
                document.getElementById('login-buttons').style.display = 'none';
                document.getElementById('user-info').style.display = 'flex';
                document.getElementById('username').textContent = currentUser.name;
                document.getElementById('driver-controls').style.display = 'none';
                document.getElementById('student-controls').style.display = 'flex';
                
                // Close modal
                document.getElementById('student-login-modal').style.display = 'none';
                
                showToast(`Logged in as ${currentUser.name}. You can now track your bus.`);
            } else {
                showToast('Invalid student ID or password');
            }
        }

        // Handle user logout
        function handleLogout() {
            stopTracking();
            isLoggedIn = false;
            userRole = null;
            currentUser = null;
            selectedBusId = null;
            
            // Update UI
            document.getElementById('login-buttons').style.display = 'flex';
            document.getElementById('user-info').style.display = 'none';
            document.getElementById('driver-controls').style.display = 'none';
            document.getElementById('student-controls').style.display = 'none';
            
            // Remove user marker
            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }
            
            showToast('Logged out successfully');
        }

        // Event listeners
        function setupEventListeners() {
            document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
            document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());

            document.getElementById('locate-me').addEventListener('click', () => {
                if (!navigator.geolocation) {
                    showToast("Geolocation is not supported by your browser");
                    return;
                }
                
                if (!userLocation) {
                    showToast("Location not available yet");
                    return;
                }
                
                map.setView([userLocation.lat, userLocation.lng], 16);
                
                // Add a marker for user location
                if (userMarker) {
                    userMarker.setLatLng([userLocation.lat, userLocation.lng]);
                } else {
                    userMarker = L.marker([userLocation.lat, userLocation.lng], {
                        icon: L.divIcon({
                            html: `<div style="background-color:#8b5cf6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>`,
                            className: 'user-marker',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    }).addTo(map).bindPopup("Your location").openPopup();
                }
            });

            // Enable location button
            document.getElementById('enable-location').addEventListener('click', () => {
                if (navigator.geolocation) {
                    updateGPSStatus("searching");
                    
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            userLocation = { lat: latitude, lng: longitude };
                            map.setView([latitude, longitude], 14);
                            updateGPSStatus("active");
                            
                            // Hide permission prompt
                            document.getElementById('location-permission').style.display = 'none';
                        },
                        (error) => {
                            console.error("Error getting location:", error);
                            updateGPSStatus("inactive");
                            showToast("Unable to access your location");
                        }
                    );
                }
            });

            // Login modal logic
            const driverLoginModal = document.getElementById('driver-login-modal');
            const studentLoginModal = document.getElementById('student-login-modal');
            const driverLoginBtn = document.getElementById('driver-login-btn');
            const studentLoginBtn = document.getElementById('student-login-btn');
            const closeModalBtns = document.querySelectorAll('.close-modal');
            const cancelDriverLoginBtn = document.getElementById('cancel-driver-login');
            const cancelStudentLoginBtn = document.getElementById('cancel-student-login');
            const confirmDriverLoginBtn = document.getElementById('confirm-driver-login');
            const confirmStudentLoginBtn = document.getElementById('confirm-student-login');
            const busOptions = document.querySelectorAll('.bus-option');
            const logoutBtn = document.getElementById('logout-btn');

            driverLoginBtn.addEventListener('click', () => driverLoginModal.style.display = 'flex');
            studentLoginBtn.addEventListener('click', () => studentLoginModal.style.display = 'flex');

            const closeDriverModal = () => {
                driverLoginModal.style.display = 'none';
                busOptions.forEach(opt => opt.classList.remove('selected'));
                document.getElementById('driver-id').value = '';
                document.getElementById('password').value = '';
            };

            const closeStudentModal = () => {
                studentLoginModal.style.display = 'none';
                busOptions.forEach(opt => opt.classList.remove('selected'));
                document.getElementById('student-id').value = '';
                document.getElementById('student-password').value = '';
            };

            closeModalBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    const modal = this.closest('.modal');
                    modal.style.display = 'none';
                    busOptions.forEach(opt => opt.classList.remove('selected'));
                });
            });

            cancelDriverLoginBtn.addEventListener('click', closeDriverModal);
            cancelStudentLoginBtn.addEventListener('click', closeStudentModal);

            busOptions.forEach(option => {
                option.addEventListener('click', () => {
                    // Remove selection from all options in both modals
                    document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
                    // Select the clicked option
                    option.classList.add('selected');
                    selectedBusId = option.dataset.busId;
                });
            });

            confirmDriverLoginBtn.addEventListener('click', handleDriverLogin);
            confirmStudentLoginBtn.addEventListener('click', handleStudentLogin);
            logoutBtn.addEventListener('click', handleLogout);

            // Driver controls
            document.getElementById('start-tracking').addEventListener('click', () => {
                startTrackingAsBus();
                showToast('Started tracking your location');
            });

            document.getElementById('stop-tracking').addEventListener('click', () => {
                stopTracking();
                showToast('Stopped tracking your location');
            });

            // Student controls
            document.getElementById('track-bus').addEventListener('click', () => {
                trackStudentLocation();
                showToast('Tracking your bus and location');
            });

            // Bus search functionality
            document.getElementById('bus-search').addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
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
            });
        }

        // Initialize the application
        window.onload = init;