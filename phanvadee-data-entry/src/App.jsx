import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-routing-machine';
import Swal from 'sweetalert2';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const API_URL = '/api';
const NONG_KHAEM_CENTER = [13.7056, 100.3582];
const TILE_URLS = {
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    light: "http://mt0.google.com/vt/lyrs=m&hl=th&x={x}&y={y}&z={z}",
    satellite: "http://mt0.google.com/vt/lyrs=y&hl=th&x={x}&y={y}&z={z}"
};
const ATTRIBUTION = '&copy; <a href="https://maps.google.com">Google Maps</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ---------------------------------------------------------------------------
// LOGIN COMPONENT
// ---------------------------------------------------------------------------
function LoginScreen({ onLogin }) {
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const endpoint = isRegisterMode ? `${API_URL}/register` : `${API_URL}/login`;
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                if (isRegisterMode) {
                    Swal.fire({
                        title: 'สำเร็จ!',
                        text: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ',
                        icon: 'success',
                        background: 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        confirmButtonColor: '#3b82f6'
                    });
                    setIsRegisterMode(false);
                    setPassword('');
                } else {
                    onLogin(data.user, data.token);
                }
            } else {
                setError(data.error || "เกิดข้อผิดพลาด");
            }
        } catch (err) {
            setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-screen">
            <div className="login-card">
                <div className="login-logo">
                    <i className="fa-solid fa-map-location-dot"></i>
                </div>
                <h2>{isRegisterMode ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
                <p>Nong Khaem Survey Map</p>
                
                {error && (
                    <div className="login-error">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        {error}
                    </div>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <input 
                            type="text" 
                            placeholder="ชื่อผู้ใช้งาน" 
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(''); }}
                            required 
                        />
                    </div>
                    <div className="form-group">
                        <input 
                            type="password" 
                            placeholder="รหัสผ่าน" 
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            required 
                        />
                    </div>
                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : (isRegisterMode ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ')}
                    </button>
                </form>
                
                <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {isRegisterMode ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'} 
                    <button 
                        type="button" 
                        onClick={() => { setIsRegisterMode(!isRegisterMode); setError(''); }}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginLeft: 6, fontWeight: 600 }}
                    >
                        {isRegisterMode ? 'เข้าสู่ระบบเลย' : 'สมัครสมาชิก'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// APP COMPONENT
// ---------------------------------------------------------------------------
function App() {
    // --- Auth State ---
    const [authToken, setAuthToken] = useState(() => localStorage.getItem("nongkhaem_token") || null);
    const [authUser, setAuthUser] = useState(() => {
        const saved = localStorage.getItem("nongkhaem_user");
        if (saved) { try { return JSON.parse(saved); } catch (e) {} }
        return null;
    });
    const isAuthenticated = !!authUser && !!authToken;

    const handleLogin = (user, token) => {
        localStorage.setItem("nongkhaem_user", JSON.stringify(user));
        localStorage.setItem("nongkhaem_token", token);
        setAuthUser(user);
        setAuthToken(token);
    };

    const handleLogout = () => {
        localStorage.removeItem("nongkhaem_user");
        localStorage.removeItem("nongkhaem_token");
        setAuthUser(null);
        setAuthToken(null);
    };

    // --- Data State ---
    const [surveyPoints, setSurveyPoints] = useState([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    const [activeFilter, setActiveFilter] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [onlineResults, setOnlineResults] = useState([]);
    const [isSearchingOnline, setIsSearchingOnline] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("survey_map_theme") || "dark-theme");
    const [isSatellite, setIsSatellite] = useState(false);

    // Floating list panel open/close
    const [listOpen, setListOpen] = useState(true);

    // Form modal
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formPoint, setFormPoint] = useState({ id: '', name: '', status: 'surveyed', lat: NONG_KHAEM_CENTER[0], lng: NONG_KHAEM_CENTER[1], notes: '', date: new Date().toISOString().split('T')[0] });
    const isFormOpenRef = useRef(isFormOpen);
    
    useEffect(() => {
        isFormOpenRef.current = isFormOpen;
    }, [isFormOpen]);

    // Navigation
    const [navActive, setNavActive] = useState(false);
    const [routeSummary, setRouteSummary] = useState('');
    const [routeInstructions, setRouteInstructions] = useState([]);

    // Stats
    const [stats, setStats] = useState({ total: 0, surveyed: 0, pending: 0, percent: 0, circleOffset: 213.6 });

    // --- Refs ---
    const mapRef = useRef(null);
    const tileLayerRef = useRef(null);
    const boundaryCircleRef = useRef(null);
    const markersRef = useRef({});
    const searchMarkerRef = useRef(null);
    const routingControlRef = useRef(null);
    const userLocationRef = useRef(null);
    const fileInputRef = useRef(null);
    const searchRef = useRef(null);

    // --- Effects ---
    
    // Fetch Data from Backend
    useEffect(() => {
        if (!isAuthenticated) return;
        
        const fetchLocations = async () => {
            try {
                const res = await fetch(`${API_URL}/locations`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                if (res.status === 401 || res.status === 403) {
                    Swal.fire({ icon: 'error', title: 'เซสชันหมดอายุ', text: 'กรุณาเข้าสู่ระบบใหม่', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                    return handleLogout();
                }
                const data = await res.json();
                setSurveyPoints(data);
                setIsDataLoaded(true);
            } catch (err) {
                console.error("Error fetching locations:", err);
            }
        };
        fetchLocations();
    }, [isAuthenticated, authToken]);

    // Theme & Map Layer Update
    useEffect(() => {
        document.body.className = theme;
        localStorage.setItem("survey_map_theme", theme);
        if (tileLayerRef.current) {
            const tileUrl = isSatellite 
                ? TILE_URLS.satellite 
                : (theme === 'dark-theme' ? TILE_URLS.dark : TILE_URLS.light);
            tileLayerRef.current.setUrl(tileUrl);
        }
        if (boundaryCircleRef.current) {
            boundaryCircleRef.current.setStyle({
                color: theme === 'dark-theme' ? '#6366f1' : '#3b82f6',
                fillColor: theme === 'dark-theme' ? '#6366f1' : '#3b82f6'
            });
        }
    }, [theme, isSatellite]);

    // Update Stats
    useEffect(() => {
        const total = surveyPoints.length;
        const surveyed = surveyPoints.filter(p => p.status === 'surveyed').length;
        const pending = total - surveyed;
        const percent = total > 0 ? Math.round((surveyed / total) * 100) : 0;
        const circumference = 213.628;
        setStats({ total, surveyed, pending, percent, circleOffset: circumference - (percent / 100) * circumference });
    }, [surveyPoints]);

    // Initialize Leaflet map
    useEffect(() => {
        if (!isAuthenticated) return;

        const map = L.map("map", { zoomControl: false }).setView(NONG_KHAEM_CENTER, 14);
        mapRef.current = map;
        L.control.zoom({ position: 'topright' }).addTo(map);

        tileLayerRef.current = L.tileLayer(
            theme === 'dark-theme' ? TILE_URLS.dark : TILE_URLS.light,
            { attribution: ATTRIBUTION, maxZoom: 20 }
        ).addTo(map);

        boundaryCircleRef.current = L.circle(NONG_KHAEM_CENTER, {
            radius: 3200,
            color: theme === 'dark-theme' ? '#6366f1' : '#3b82f6',
            fillColor: theme === 'dark-theme' ? '#6366f1' : '#3b82f6',
            fillOpacity: 0.07,
            weight: 1.5,
            dashArray: '6, 8',
            interactive: false
        }).addTo(map);

        map.on("click", async (e) => {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            if (isFormOpenRef.current) {
                // Just update lat/lng if form is already open
                setFormPoint(prev => ({ ...prev, lat, lng }));
            } else {
                setFormPoint({ id: '', name: 'กำลังค้นหาที่อยู่...', status: 'surveyed', lat, lng, notes: '', date: new Date().toISOString().split('T')[0] });
                setIsFormOpen(true);
            }

            // Reverse Geocoding
            try {
                const res = await fetch(`${API_URL}/geocode?lat=${lat}&lng=${lng}`);
                const data = await res.json();
                
                if (data.address && data.address !== 'ไม่พบที่อยู่') {
                    setFormPoint(prev => {
                        // Only auto-fill if the name is empty or still loading
                        if (prev.name === 'กำลังค้นหาที่อยู่...' || !prev.name) {
                            return { ...prev, name: data.address };
                        }
                        // If name is already filled, append to notes if not already there
                        if (!prev.notes.includes(data.address)) {
                            const newNotes = prev.notes ? prev.notes + '\nที่อยู่: ' + data.address : 'ที่อยู่: ' + data.address;
                            return { ...prev, notes: newNotes };
                        }
                        return prev;
                    });
                } else {
                    setFormPoint(prev => prev.name === 'กำลังค้นหาที่อยู่...' ? { ...prev, name: '' } : prev);
                }
            } catch (err) {
                setFormPoint(prev => prev.name === 'กำลังค้นหาที่อยู่...' ? { ...prev, name: '' } : prev);
                console.error("Geocode fetch error:", err);
            }
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const latlng = [pos.coords.latitude, pos.coords.longitude];
                userLocationRef.current = latlng;
                const userIcon = L.divIcon({
                    className: '',
                    html: `<div style="width:14px;height:14px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.8);"></div>`,
                    iconSize: [14, 14], iconAnchor: [7, 7]
                });
                const userMarker = L.marker(latlng, { icon: userIcon, zIndexOffset: 1000, draggable: true }).addTo(map).bindPopup("ตำแหน่งปัจจุบัน (ลากเพื่อเปลี่ยนจุดเริ่มต้น)");
                
                userMarker.on('dragend', (e) => {
                    const newPos = e.target.getLatLng();
                    userLocationRef.current = [newPos.lat, newPos.lng];
                });
            }, () => {});
        }

        return () => { map.remove(); };
    }, [isAuthenticated]);

    // Render markers
    useEffect(() => {
        if (!mapRef.current || !isAuthenticated || !isDataLoaded) return;
        Object.values(markersRef.current).forEach(m => mapRef.current.removeLayer(m));
        markersRef.current = {};

        const filtered = surveyPoints.filter(p => activeFilter === 'all' || p.status === activeFilter);

        filtered.forEach(point => {
            const sc = point.status === 'surveyed' ? 'surveyed' : 'pending';
            const iconHtml = point.status === 'surveyed'
                ? '<i class="fa-solid fa-check"></i>'
                : '<i class="fa-solid fa-triangle-exclamation"></i>';

            const icon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-pin ${sc}">${iconHtml}</div>`,
                iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -42]
            });

            const marker = L.marker([point.lat, point.lng], { icon, draggable: true });
            const statusLabel = point.status === 'surveyed' ? 'สำรวจแล้ว' : 'ยังไม่ได้สำรวจ';
            const badgeClass = point.status === 'surveyed' ? 'surveyed' : 'pending';

            marker.on('dragend', async (e) => {
                const newPos = e.target.getLatLng();
                const payload = { ...point, lat: newPos.lat, lng: newPos.lng };
                
                try {
                    const res = await fetch(`${API_URL}/locations/${point.id}`, {
                        method: 'PUT',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.status === 401 || res.status === 403) {
                        Swal.fire({ icon: 'error', title: 'เซสชันหมดอายุ', text: 'กรุณาเข้าสู่ระบบใหม่', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                        return handleLogout();
                    }

                    if (res.ok) {
                        setSurveyPoints(prev => prev.map(p => p.id === point.id ? payload : p));
                    } else {
                        marker.setLatLng([point.lat, point.lng]);
                        Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'อัปเดตตำแหน่งล้มเหลว', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                    }
                } catch (err) {
                    marker.setLatLng([point.lat, point.lng]);
                    console.error("Error updating marker position:", err);
                }
            });

            marker.bindPopup(`
                <div class="popup-container">
                    <div class="popup-header">
                        <span class="popup-title">${point.name}</span>
                        <span class="badge ${badgeClass}">${statusLabel}</span>
                    </div>
                    <p class="popup-desc">${point.notes || 'ไม่มีบันทึกเพิ่มเติม'}</p>
                    <div class="popup-meta">
                        <span><i class="fa-solid fa-calendar-days"></i> ${point.date || '-'}</span>
                        <span><i class="fa-solid fa-location-crosshairs"></i> ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
                    </div>
                    <div class="popup-actions">
                        <button class="popup-btn primary popup-nav-btn" data-lat="${point.lat}" data-lng="${point.lng}" data-name="${point.name.replace(/"/g,'&quot;')}">
                            <i class="fa-solid fa-route"></i> นำทาง
                        </button>
                        <button class="popup-btn popup-edit-btn" data-id="${point.id}">
                            <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                        </button>
                        <button class="popup-btn popup-del-btn" data-id="${point.id}">
                            <i class="fa-solid fa-trash-can"></i> ลบ
                        </button>
                    </div>
                </div>
            `);

            marker.addTo(mapRef.current);
            markersRef.current[point.id] = marker;
        });

        const onPopupOpen = (e) => {
            const el = e.popup.getElement();
            if (!el) return;
            const navBtn = el.querySelector('.popup-nav-btn');
            const editBtn = el.querySelector('.popup-edit-btn');
            const delBtn = el.querySelector('.popup-del-btn');
            if (navBtn) navBtn.onclick = () => startNavigation(parseFloat(navBtn.dataset.lat), parseFloat(navBtn.dataset.lng), navBtn.dataset.name);
            if (editBtn) editBtn.onclick = () => openSurveyForm(editBtn.dataset.id);
            if (delBtn) delBtn.onclick = () => deleteSurveyPoint(delBtn.dataset.id);
        };

        mapRef.current.on('popupopen', onPopupOpen);
        return () => { if (mapRef.current) mapRef.current.off('popupopen', onPopupOpen); };
    }, [surveyPoints, activeFilter, isAuthenticated, isDataLoaded]);

    // ---------------------------------------------------------------------------
    // NAVIGATION (OSRM)
    // ---------------------------------------------------------------------------
    const startNavigation = (destLat, destLng, destName) => {
        if (!mapRef.current) return;
        const startLatLng = userLocationRef.current || NONG_KHAEM_CENTER;
        const startLabel = userLocationRef.current ? "ตำแหน่งปัจจุบัน" : "จุดศูนย์กลางหนองแขม";

        if (routingControlRef.current) mapRef.current.removeControl(routingControlRef.current);

        const routeColor = theme === 'dark-theme' ? "#6366f1" : "#3b82f6";
        setRouteSummary("กำลังคำนวณเส้นทาง...");
        setRouteInstructions([]);
        setNavActive(true);
        setListOpen(false); // close list to give room

        routingControlRef.current = L.Routing.control({
            waypoints: [L.latLng(startLatLng[0], startLatLng[1]), L.latLng(destLat, destLng)],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            routeWhileDragging: false,
            addWaypoints: false,
            show: false,
            createMarker: () => null,
            lineOptions: {
                styles: [
                    { color: '#000', opacity: 0.15, weight: 9 },
                    { color: routeColor, opacity: 0.85, weight: 6 }
                ]
            }
        }).addTo(mapRef.current);

        routingControlRef.current.on('routesfound', (e) => {
            const route = e.routes[0];
            const distKm = (route.summary.totalDistance / 1000).toFixed(1);
            const durMins = Math.round(route.summary.totalTime / 60);
            setRouteSummary(`${distKm} กม. | ${durMins} นาที`);

            const steps = [{ icon: "fa-solid fa-play", text: `เริ่มจาก: ${startLabel}`, dist: "0 ม." }];
            route.instructions.forEach(step => {
                let icon = "fa-solid fa-arrow-up";
                const txt = step.text;
                if (txt.includes("left")) icon = "fa-solid fa-arrow-left";
                else if (txt.includes("right")) icon = "fa-solid fa-arrow-right";
                else if (txt.includes("roundabout")) icon = "fa-solid fa-circle-notch";
                else if (txt.includes("destination")) icon = "fa-solid fa-circle-dot text-green";
                const distStr = step.distance >= 1000 ? `${(step.distance/1000).toFixed(1)} กม.` : `${Math.round(step.distance)} ม.`;
                steps.push({ icon, text: txt, dist: distStr });
            });
            setRouteInstructions(steps);
            mapRef.current.fitBounds(L.latLngBounds([L.latLng(startLatLng[0], startLatLng[1]), L.latLng(destLat, destLng)]), { padding: [60, 60] });
        });

        routingControlRef.current.on('routingerror', () => {
            setRouteSummary("คำนวณเส้นทางขัดข้อง");
            setRouteInstructions([{ icon: "fa-solid fa-circle-exclamation text-yellow", text: "ไม่สามารถคำนวณเส้นทางได้", dist: "" }]);
        });
    };

    const cancelNavigation = () => {
        if (routingControlRef.current && mapRef.current) { 
            mapRef.current.removeControl(routingControlRef.current); 
            routingControlRef.current = null; 
        }
        setNavActive(false);
        setRouteSummary('');
        setRouteInstructions([]);
        if (mapRef.current) mapRef.current.setView(NONG_KHAEM_CENTER, 14);
    };

    // ---------------------------------------------------------------------------
    // CRUD (Connected to Backend)
    // ---------------------------------------------------------------------------
    const openSurveyForm = (id = null, lat = null, lng = null) => {
        if (id) {
            const p = surveyPoints.find(p => p.id === id);
            if (p) { setFormPoint({ ...p }); setIsFormOpen(true); }
        } else {
            setFormPoint({ id: '', name: '', status: 'surveyed', lat: lat ?? NONG_KHAEM_CENTER[0], lng: lng ?? NONG_KHAEM_CENTER[1], notes: '', date: new Date().toISOString().split('T')[0] });
            setIsFormOpen(true);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!formPoint.name.trim()) { 
            Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณากรอกชื่อสถานที่สำรวจ', background: 'var(--card-bg)', color: 'var(--text-primary)' });
            return; 
        }
        
        try {
            const isUpdate = !!formPoint.id;
            const method = isUpdate ? 'PUT' : 'POST';
            const endpoint = isUpdate ? `${API_URL}/locations/${formPoint.id}` : `${API_URL}/locations`;
            
            const payloadId = isUpdate ? formPoint.id : 'point-' + Date.now();
            const payload = { ...formPoint, id: payloadId, name: formPoint.name.trim(), notes: formPoint.notes.trim() };

            const res = await fetch(endpoint, {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(payload)
            });

            if (res.status === 401 || res.status === 403) {
                Swal.fire({ icon: 'error', title: 'เซสชันหมดอายุ', text: 'กรุณาเข้าสู่ระบบใหม่', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                return handleLogout();
            }

            if (res.ok) {
                if (isUpdate) {
                    setSurveyPoints(prev => prev.map(p => p.id === formPoint.id ? payload : p));
                } else {
                    setSurveyPoints(prev => [...prev, payload]);
                }
                Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกข้อมูลเรียบร้อย', timer: 1500, showConfirmButton: false, background: 'var(--card-bg)', color: 'var(--text-primary)' });
                setIsFormOpen(false);
            } else {
                Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'บันทึกข้อมูลไม่สำเร็จ', background: 'var(--card-bg)', color: 'var(--text-primary)' });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: `บันทึกข้อมูลล้มเหลว: ${err.message}`, background: 'var(--card-bg)', color: 'var(--text-primary)' });
        }
    };

    const deleteSurveyPoint = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "ต้องการลบจุดสำรวจนี้ใช่หรือไม่?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)'
        });
        
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/locations/${id}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });

                if (res.status === 401 || res.status === 403) {
                    Swal.fire({ icon: 'error', title: 'เซสชันหมดอายุ', text: 'กรุณาเข้าสู่ระบบใหม่', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                    return handleLogout();
                }

                if (res.ok) {
                    setSurveyPoints(prev => prev.filter(p => p.id !== id));
                    cancelNavigation();
                    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', showConfirmButton: false, timer: 1500, background: 'var(--card-bg)', color: 'var(--text-primary)' });
                } else {
                    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ลบข้อมูลไม่สำเร็จ', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                }
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`, background: 'var(--card-bg)', color: 'var(--text-primary)' });
            }
        }
    };

    // ---------------------------------------------------------------------------
    // NOMINATIM SEARCH
    // ---------------------------------------------------------------------------
    const searchOnline = async () => {
        const query = searchText.trim();
        if (!query) { setOnlineResults([]); return; }
        setIsSearchingOnline(true);
        try {
            const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(query)}&f=json&maxLocations=5`);
            const data = await res.json();
            
            if (data.candidates && data.candidates.length > 0) {
                const mappedResults = data.candidates.map(item => ({
                    display_name: item.address,
                    name: item.address.split(' ')[0] || item.address,
                    lat: item.location.y,
                    lon: item.location.x,
                    source: 'arcgis'
                }));
                setOnlineResults(mappedResults);
            } else {
                setOnlineResults([]);
            }
        } catch (err) { setOnlineResults([]); }
        finally { setIsSearchingOnline(false); }
    };

    const handleSearchItemClick = (item) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const shortName = item.name || item.display_name.split(',')[0];

        if (searchMarkerRef.current) mapRef.current.removeLayer(searchMarkerRef.current);

        const icon = L.divIcon({
            className: 'custom-map-marker',
            html: `<div class="marker-pin" style="background:#3b82f6;"><i class="fa-solid fa-star"></i></div>`,
            iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -42]
        });

        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        searchMarkerRef.current = marker;

        marker.bindPopup(`
            <div class="popup-container">
                <div class="popup-header">
                    <span class="popup-title">${shortName}</span>
                    <span class="badge" style="background:var(--primary-glow);color:var(--primary);">ค้นพบ</span>
                </div>
                <p class="popup-desc">คลิกปุ่มด้านล่างเพื่อดำเนินการ</p>
                <div class="popup-actions">
                    <button class="popup-btn primary popup-search-nav-btn" data-lat="${lat}" data-lng="${lng}" data-name="${shortName.replace(/"/g,'&quot;')}">
                        <i class="fa-solid fa-route"></i> นำทาง
                    </button>
                    <button class="popup-btn popup-search-add-btn" data-lat="${lat}" data-lng="${lng}" data-name="${shortName.replace(/"/g,'&quot;')}">
                        <i class="fa-solid fa-plus"></i> บันทึกจุดสำรวจ
                    </button>
                </div>
            </div>
        `).openPopup();

        mapRef.current.flyTo([lat, lng], 16, { duration: 1.2 });

        setTimeout(() => {
            const el = marker.getPopup()?.getElement();
            if (el) {
                const nb = el.querySelector('.popup-search-nav-btn');
                const ab = el.querySelector('.popup-search-add-btn');
                if (nb) nb.onclick = () => startNavigation(lat, lng, shortName);
                if (ab) ab.onclick = () => {
                    setFormPoint(p => ({ ...p, lat, lng, name: shortName }));
                    setIsFormOpen(true);
                };
            }
        }, 100);

        setOnlineResults([]);
    };

    const clearSearch = () => {
        setSearchText('');
        setOnlineResults([]);
        if (searchMarkerRef.current && mapRef.current) { 
            mapRef.current.removeLayer(searchMarkerRef.current); 
            searchMarkerRef.current = null; 
        }
    };

    // ---------------------------------------------------------------------------
    // EXPORT / IMPORT (Backend connected)
    // ---------------------------------------------------------------------------
    const exportData = () => {
        const headers = ["ID", "ชื่อสถานที่/บ้านเลขที่", "สถานะ", "ละติจูด", "ลองจิจูด", "บันทึกเพิ่มเติม", "วันที่"];
        const rows = surveyPoints.map(p => [
            p.id,
            `"${(p.name || '').replace(/"/g, '""')}"`,
            p.status === 'surveyed' ? 'สำรวจแล้ว' : 'ยังไม่ได้สำรวจ',
            p.lat,
            p.lng,
            `"${(p.notes || '').replace(/"/g, '""')}"`,
            p.date
        ]);
        // \uFEFF for Excel UTF-8 BOM
        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `nongkhaem_survey_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    const handleImportFile = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (Array.isArray(parsed) && parsed.every(p => p.id && p.name && p.status && p.lat && p.lng)) {
                    // Send to backend
                    const res = await fetch(`${API_URL}/locations/import`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify(parsed)
                    });
                    
                    if (res.status === 401 || res.status === 403) {
                        Swal.fire({ icon: 'error', title: 'เซสชันหมดอายุ', text: 'กรุณาเข้าสู่ระบบใหม่', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                        return handleLogout();
                    }

                    if (res.ok) {
                        setSurveyPoints(parsed);
                        Swal.fire({ icon: 'success', title: 'สำเร็จ', text: `นำเข้าข้อมูล ${parsed.length} จุด ลงในฐานข้อมูล!`, background: 'var(--card-bg)', color: 'var(--text-primary)' });
                    } else {
                        Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: "การบันทึกลง Database ล้มเหลว", background: 'var(--card-bg)', color: 'var(--text-primary)' });
                    }
                } else { Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'ไฟล์ JSON ผิดรูปแบบ', background: 'var(--card-bg)', color: 'var(--text-primary)' }); }
            } catch (err) { Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: "อ่านไฟล์ไม่ได้: " + err.message, background: 'var(--card-bg)', color: 'var(--text-primary)' }); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Filter and sort list (pending first)
    const listItems = surveyPoints.filter(p => {
        if (activeFilter !== 'all' && p.status !== activeFilter) return false;
        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            return p.name.toLowerCase().includes(q) || (p.notes && p.notes.toLowerCase().includes(q));
        }
        return true;
    }).sort((a, b) => {
        if (a.status === 'pending' && b.status === 'surveyed') return -1;
        if (a.status === 'surveyed' && b.status === 'pending') return 1;
        return 0;
    });

    const handleListItemClick = (point) => {
        if (!mapRef.current) return;
        mapRef.current.flyTo([point.lat, point.lng], 16, { duration: 1 });
        const marker = markersRef.current[point.id];
        if (marker) setTimeout(() => marker.openPopup(), 1000);
    };


    // ---------------------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------------------
    if (!isAuthenticated) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return (
        <div className="app-container">

            {/* ===== TOPBAR ===== */}
            <header className="topbar">

                {/* Logo */}
                <div className="logo-area">
                    <div className="logo-icon">
                        <i className="fa-solid fa-map-location-dot"></i>
                    </div>
                    <div className="logo-text">
                        <h1>สำรวจหนองแขม</h1>
                        <span className="subtitle">Nong Khaem Survey Map</span>
                    </div>
                </div>

                <div className="topbar-divider"></div>

                {/* Compact stats */}
                <div className="stats-bar">
                    {/* Mini progress ring */}
                    <div className="progress-ring-sm">
                        <svg width="36" height="36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
                            <circle
                                cx="18" cy="18" r="14" fill="none"
                                stroke="#10b981" strokeWidth="3"
                                strokeDasharray="87.96"
                                strokeDashoffset={87.96 - (stats.percent / 100) * 87.96}
                                style={{ transform: 'rotate(-90deg)', transformOrigin: '18px 18px', transition: 'stroke-dashoffset 0.6s ease' }}
                            />
                        </svg>
                        <span className="pct">{stats.percent}%</span>
                    </div>

                    <div className="stat-pill total">
                        <span className="dot"></span>
                        <span className="count">{stats.total}</span>
                        <span className="label">ทั้งหมด</span>
                    </div>
                    <div className="stat-pill done">
                        <span className="dot"></span>
                        <span className="count">{stats.surveyed}</span>
                        <span className="label">สำรวจแล้ว</span>
                    </div>
                    <div className="stat-pill pending">
                        <span className="dot"></span>
                        <span className="count">{stats.pending}</span>
                        <span className="label">ยังไม่ตรวจ</span>
                    </div>
                </div>

                <div className="topbar-divider"></div>

                {/* Search bar */}
                <div className="topbar-search" ref={searchRef}>
                    <div className="search-box">
                        <i className="fa-solid fa-magnifying-glass search-icon"></i>
                        <input
                            type="text"
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchOnline()}
                            placeholder="ค้นหาสถานที่ทั่วประเทศ..."
                        />
                        {searchText && (
                            <button className="clear-btn" onClick={clearSearch}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        )}
                        <button className="search-action-btn" onClick={searchOnline}>
                            <i className="fa-solid fa-search"></i>
                        </button>
                    </div>

                    {/* Search dropdown */}
                    {(isSearchingOnline || onlineResults.length > 0) && (
                        <div className="search-dropdown">
                            {isSearchingOnline ? (
                                <div className="search-result-item" style={{ justifyContent: 'center' }}>
                                    <i className="fa-solid fa-spinner fa-spin"></i>&nbsp; ค้นหา...
                                </div>
                            ) : onlineResults.map((item, idx) => {
                                const shortName = item.name || item.display_name.split(',')[0];
                                return (
                                    <div key={idx} className="search-result-item" onClick={() => handleSearchItemClick(item)}>
                                        <i className="fa-solid fa-map-pin"></i>
                                        <div>
                                            <div className="result-title">
                                                {shortName}
                                                {item.source === 'google' && <span style={{ fontSize: 9, marginLeft: 6, background: '#ea4335', color: '#fff', padding: '2px 5px', borderRadius: 4 }}>Google Maps</span>}
                                                {item.source === 'arcgis' && <span style={{ fontSize: 9, marginLeft: 6, background: '#007ac2', color: '#fff', padding: '2px 5px', borderRadius: 4 }}>ArcGIS (Global)</span>}
                                            </div>
                                            <div className="result-address">{item.display_name}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="topbar-divider"></div>

                {/* Filter tabs */}
                <div className="filter-tabs">
                    {[
                        { key: 'all', label: 'ทั้งหมด', icon: null },
                        { key: 'surveyed', label: 'ตรวจแล้ว', icon: 'fa-solid fa-circle-check text-green' },
                        { key: 'pending', label: 'ยังไม่ตรวจ', icon: 'fa-solid fa-triangle-exclamation text-yellow' }
                    ].map(f => (
                        <button key={f.key} className={`filter-tab ${activeFilter === f.key ? 'active' : ''}`} onClick={() => setActiveFilter(f.key)}>
                            {f.icon && <i className={f.icon}></i>}
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Spacer */}
                <div style={{ flex: 1 }}></div>

                {/* Action buttons */}
                <div className="topbar-actions">
                    <button className="icon-btn primary" onClick={() => { const c = mapRef.current?.getCenter(); openSurveyForm(null, c?.lat, c?.lng); }} title="เพิ่มจุดสำรวจ">
                        <i className="fa-solid fa-plus"></i>
                        <span className="icon-btn-tooltip">เพิ่มจุดสำรวจ</span>
                    </button>
                    <button className="icon-btn" onClick={() => setListOpen(o => !o)} title="รายการจุดสำรวจ">
                        <i className="fa-solid fa-list-ul"></i>
                        <span className="icon-btn-tooltip">รายการ</span>
                    </button>
                    <button className="icon-btn" onClick={exportData} title="ส่งออก CSV">
                        <i className="fa-solid fa-file-export"></i>
                        <span className="icon-btn-tooltip">ส่งออก CSV</span>
                    </button>
                    <button className="icon-btn" onClick={() => fileInputRef.current.click()} title="นำเข้า JSON">
                        <i className="fa-solid fa-file-import"></i>
                        <span className="icon-btn-tooltip">นำเข้า JSON</span>
                    </button>

                    <div className="topbar-divider"></div>

                    <div style={{ fontSize: 12, marginRight: 8, color: 'var(--text-secondary)' }}>
                        <i className="fa-solid fa-user-circle"></i> {authUser?.username}
                    </div>

                    <button className="theme-toggle-btn" onClick={() => setTheme(t => t === 'dark-theme' ? 'light-theme' : 'dark-theme')} title="เปลี่ยนธีม">
                        <i className={theme === 'dark-theme' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'}></i>
                    </button>

                    <button className="icon-btn danger" onClick={handleLogout} title="ออกจากระบบ" style={{ marginLeft: 4 }}>
                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                        <span className="icon-btn-tooltip">ออกจากระบบ</span>
                    </button>

                    <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" style={{ display: 'none' }} />
                </div>
            </header>

            {/* ===== MAP ===== */}
            <main className="map-container-wrapper">
                <div id="map" className="map-view"></div>

                {/* Floating Map Controls */}
                <div className="map-floating-controls">
                    <button 
                        className={`map-ctrl-btn ${isSatellite ? 'active' : ''}`} 
                        onClick={() => setIsSatellite(!isSatellite)}
                        title="โหมดดาวเทียม"
                    >
                        <i className="fa-solid fa-satellite"></i>
                    </button>
                    <button 
                        className="map-ctrl-btn" 
                        onClick={() => {
                            if (userLocationRef.current && mapRef.current) {
                                mapRef.current.flyTo(userLocationRef.current, 18, { duration: 1.5 });
                            } else {
                                Swal.fire({ icon: 'info', title: 'ไม่พบตำแหน่ง', text: 'กำลังรอรับข้อมูล GPS ของคุณ หรือเบราว์เซอร์ไม่รองรับ', background: 'var(--card-bg)', color: 'var(--text-primary)' });
                            }
                        }}
                        title="ตำแหน่งของฉัน"
                    >
                        <i className="fa-solid fa-location-crosshairs"></i>
                    </button>
                </div>

                {/* Floating location list panel */}
                {listOpen ? (
                    <div className={`floating-list-panel ${listOpen ? '' : 'collapsed'}`}>
                        <div className="float-panel-header">
                            <div className="title">
                                <i className="fa-solid fa-list-ul"></i>
                                รายชื่อจุดสำรวจ
                                <span className="badge" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', marginLeft: 4 }}>
                                    {listItems.length}
                                </span>
                            </div>
                            <div className="hdr-actions">
                                <button className="btn-add-float" onClick={() => { const c = mapRef.current?.getCenter(); openSurveyForm(null, c?.lat, c?.lng); }}>
                                    <i className="fa-solid fa-plus"></i> เพิ่มจุด
                                </button>
                                <button className="btn-collapse" onClick={() => setListOpen(false)} title="ซ่อนรายการ">
                                    <i className="fa-solid fa-chevron-left"></i>
                                </button>
                            </div>
                        </div>

                        <div className="locations-list">
                            {!isDataLoaded ? (
                                <div className="empty-state">
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                    <p>กำลังโหลดข้อมูล...</p>
                                </div>
                            ) : listItems.length === 0 ? (
                                <div className="empty-state">
                                    <i className="fa-solid fa-location-dot"></i>
                                    <p>{searchText ? 'ไม่พบข้อมูลที่ตรงกับการค้นหา' : 'ไม่มีจุดสำรวจในหมวดหมู่นี้'}</p>
                                </div>
                            ) : listItems.map(point => {
                                const statusLabel = point.status === 'surveyed' ? 'สำรวจแล้ว' : 'ยังไม่ตรวจ';
                                const badgeClass = point.status === 'surveyed' ? 'surveyed' : 'pending';
                                return (
                                    <div key={point.id} className={`location-item ${point.status}`} onClick={() => handleListItemClick(point)}>
                                        <div className="item-header">
                                            <span className="item-title">{point.name}</span>
                                            <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                                        </div>
                                        <div className="item-details">
                                            <p>{point.notes ? (point.notes.length > 55 ? point.notes.substring(0, 52) + '...' : point.notes) : 'ไม่มีบันทึกเพิ่มเติม'}</p>
                                            <div className="item-meta">
                                                <span><i className="fa-solid fa-calendar-day"></i> {point.date || '-'}</span>
                                                <span><i className="fa-solid fa-location-arrow"></i> {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</span>
                                            </div>
                                        </div>
                                        <div className="item-actions">
                                            <button className="item-action-btn" onClick={e => { e.stopPropagation(); startNavigation(point.lat, point.lng, point.name); }}>
                                                <i className="fa-solid fa-route text-green"></i> นำทาง
                                            </button>
                                            <button className="item-action-btn" onClick={e => { e.stopPropagation(); openSurveyForm(point.id); }}>
                                                <i className="fa-solid fa-pen-to-square"></i> แก้ไข
                                            </button>
                                            <button className="item-action-btn delete" onClick={e => { e.stopPropagation(); deleteSurveyPoint(point.id); }}>
                                                <i className="fa-solid fa-trash-can"></i> ลบ
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* Floating circle trigger when list is hidden */
                    <button className="float-trigger-btn" onClick={() => setListOpen(true)} title="แสดงรายการจุดสำรวจ">
                        <i className="fa-solid fa-map-marker-alt"></i>
                        <span className="badge-count">{listItems.length}</span>
                    </button>
                )}

                {/* Navigation directions overlay */}
                {navActive && (
                    <div className="navigation-overlay-panel">
                        <div className="nav-overlay-header">
                            <div className="nav-icon"><i className="fa-solid fa-route"></i></div>
                            <div className="nav-title-box">
                                <h3>การนำทาง</h3>
                                <p>{routeSummary}</p>
                            </div>
                            <button className="nav-close-btn" onClick={cancelNavigation}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div className="nav-instructions">
                            {routeInstructions.map((step, idx) => (
                                <div key={idx} className="nav-instruction-item">
                                    <div className="icon"><i className={step.icon}></i></div>
                                    <div className="text">
                                        <div>{step.text}</div>
                                        <div className="distance">{step.dist}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Map hint toast */}
                <div className="map-helper-toast">
                    <i className="fa-solid fa-circle-info"></i> คลิกบนแผนที่เพื่อเพิ่มจุดสำรวจได้เลย
                </div>
            </main>

            {/* ===== FORM MODAL ===== */}
            {isFormOpen && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <header className="modal-header">
                            <h3>{formPoint.id ? 'แก้ไขจุดสำรวจ' : 'เพิ่มจุดสำรวจใหม่'}</h3>
                            <button className="modal-close" onClick={() => setIsFormOpen(false)}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </header>
                        <form onSubmit={handleFormSubmit} id="surveyForm">
                            <div className="form-group">
                                <label>ชื่อจุดสำรวจ / สถานที่ *</label>
                                <input type="text" value={formPoint.name} onChange={e => setFormPoint(p => ({ ...p, name: e.target.value }))} placeholder="เช่น โรงเรียนวัดหนองแขม, หน้าตลาด..." maxLength="80" required />
                            </div>
                            <div className="form-group">
                                <label>สถานะการสำรวจ *</label>
                                <div className="status-radio-group">
                                    <label className="status-radio-label surveyed">
                                        <input type="radio" name="formStatus" value="surveyed" checked={formPoint.status === 'surveyed'} onChange={() => setFormPoint(p => ({ ...p, status: 'surveyed' }))} />
                                        <span className="custom-radio"></span>
                                        <i className="fa-solid fa-circle-check"></i> สำรวจแล้ว
                                    </label>
                                    <label className="status-radio-label pending">
                                        <input type="radio" name="formStatus" value="pending" checked={formPoint.status === 'pending'} onChange={() => setFormPoint(p => ({ ...p, status: 'pending' }))} />
                                        <span className="custom-radio"></span>
                                        <i className="fa-solid fa-triangle-exclamation"></i> ยังไม่ตรวจ
                                    </label>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group col">
                                    <label>ละติจูด</label>
                                    <input type="number" value={formPoint.lat} readOnly />
                                </div>
                                <div className="form-group col">
                                    <label>ลองจิจูด</label>
                                    <input type="number" value={formPoint.lng} readOnly />
                                </div>
                            </div>
                            <p className="form-hint"><i className="fa-solid fa-info-circle"></i> คลิกบนแผนที่เพื่อย้ายพิกัด</p>
                            <div className="form-group">
                                <label>บันทึกเพิ่มเติม</label>
                                <textarea rows="3" value={formPoint.notes} onChange={e => setFormPoint(p => ({ ...p, notes: e.target.value }))} placeholder="ข้อมูลปัญหา, ข้อเสนอแนะ..." maxLength="200" />
                            </div>
                            <div className="form-group">
                                <label>วันที่ลงพื้นที่</label>
                                <input type="date" value={formPoint.date} onChange={e => setFormPoint(p => ({ ...p, date: e.target.value }))} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>ยกเลิก</button>
                                <button type="submit" className="btn btn-primary">บันทึกข้อมูล</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
