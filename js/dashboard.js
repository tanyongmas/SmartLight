/**
 * Dashboard Staff App Script (dashboard.html)
 * ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ - เทศบาลตำบลตันหยงมัส (ส่วนเจ้าหน้าที่)
 */

let db, auth;
let isDemoMode = false;
let map;
let markersGroup;
let allLights = [];
let allReports = [];
let qrcodeObj = null;
let activeMarkerLocation = null;
let printQueue = JSON.parse(localStorage.getItem('smart_print_queue')) || [];
let activeModalLightId = null;
let isAddingPoleMode = false;
let pieChartInstance = null;
let barChartInstance = null;
let currentDashboardView = 'map';

// ==========================================
// 1. การเริ่มต้นระบบ (Initialization)
// ==========================================
function startDashboardApp() {
  // ซ่อนหน้าจอโหลดดิงทันทีเพื่อป้องกันการหมุนค้าง
  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.opacity = 0;
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }

  // ตั้งค่าเดือน/ปีปัจจุบันล่วงหน้าในตัวเลือกรายงาน
  const currentDate = new Date();
  const monthSelect = document.getElementById('reportFilterMonth');
  const yearSelect = document.getElementById('reportFilterYear');
  if (monthSelect && yearSelect) {
    monthSelect.value = currentDate.getMonth();
    const curYearStr = currentDate.getFullYear().toString();
    let hasYear = false;
    for (let i = 0; i < yearSelect.options.length; i++) {
      if (yearSelect.options[i].value === curYearStr) {
        hasYear = true;
        break;
      }
    }
    if (!hasYear) {
      const opt = document.createElement('option');
      opt.value = curYearStr;
      opt.text = curYearStr;
      yearSelect.add(opt);
    }
    yearSelect.value = curYearStr;
  }

  initFirebase();
  initMap();
  initFormListeners();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startDashboardApp);
} else {
  startDashboardApp();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

window.addEventListener('resize', debounce(() => {
  if (currentDashboardView === 'stats') {
    renderMonthlyDashboard();
  }
}, 250));

// สร้างลิงก์ QR Code ปลายทาง
function getCitizenUrl(lightId = null, page = null) {
  const isLocalFile = window.location.protocol === 'file:';
  const isLocalHost = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.') ||
    /^[0-9.]+$/.test(window.location.hostname) ||
    window.location.hostname === '';

  const currentUrl = window.location.href;
  let baseUrl = "https://tanyongmas.github.io/SmartLight";
  if (currentUrl.startsWith("http")) {
    baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
  }

  if (isLocalFile || isLocalHost) {
    let url = `${baseUrl}/index.html`;
    const params = [];
    if (lightId) params.push(`lightId=${lightId}`);
    if (page) params.push(`page=${page}`);
    params.push("mockFriend=false");
    return `${url}?${params.join('&')}`;
  } else {
    if (page) {
      return `https://liff.line.me/${liffConfig.liffId}?page=${page}`;
    }
    return `https://liff.line.me/${liffConfig.liffId}?lightId=${lightId}`;
  }
}

// ==========================================
// 2. Firebase Auth & System Initialization
// ==========================================
function initFirebase() {
  const savedDemoUser = sessionStorage.getItem('demo_user');
  if (savedDemoUser) {
    isDemoMode = true;
    const banner = document.getElementById('demoBanner');
    if (banner) banner.style.display = 'block';
  }

  if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
    console.warn("Firebase not configured. Entering Demo Mode.");
    isDemoMode = true;
    const banner = document.getElementById('demoBanner');
    if (banner) banner.style.display = 'block';

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim() || 'Admin';
        sessionStorage.setItem('demo_user', username);
        loginSuccess({ email: username });
      });
    }
    if (savedDemoUser) {
      loginSuccess({ email: savedDemoUser });
    }
  } else {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();

      auth.onAuthStateChanged((user) => {
        if (user) {
          isDemoMode = false;
          sessionStorage.removeItem('demo_user');
          loginSuccess(user);
        } else if (isDemoMode && sessionStorage.getItem('demo_user')) {
          loginSuccess({ email: sessionStorage.getItem('demo_user') });
        } else {
          logoutSuccess();
        }
      });

      const loginForm = document.getElementById('loginForm');
      if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const usernameInput = document.getElementById('loginUsername');
          const username = usernameInput ? (usernameInput.value.trim() || 'Admin') : 'Admin';
          const passwordInput = document.getElementById('loginPassword');
          const password = passwordInput ? passwordInput.value : '';

          const isLocal = window.location.protocol === 'file:' ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.') ||
            window.location.hostname === '';

          // หากเปิดผ่าน Live Server / Localhost / file:// หรือไม่ได้กรอกอีเมลคลาวด์ ให้เข้าสู่ระบบโหมดเดโมได้ทันที 100%
          if (isLocal || !username.includes('@') || isDemoMode) {
            isDemoMode = true;
            sessionStorage.setItem('demo_user', username);
            const banner = document.getElementById('demoBanner');
            if (banner) banner.style.display = 'block';
            loginSuccess({ email: username });
            return;
          }

          let email = username;
          auth.signInWithEmailAndPassword(email, password)
            .catch(err => {
              console.warn("Firebase Auth Error / Falling back to Demo Mode: ", err);
              isDemoMode = true;
              sessionStorage.setItem('demo_user', username);
              const banner = document.getElementById('demoBanner');
              if (banner) banner.style.display = 'block';
              loginSuccess({ email: username });
            });
        });
      }

      if (savedDemoUser) {
        loginSuccess({ email: savedDemoUser });
      }
    } catch (e) {
      console.error("Firebase init failed", e);
      isDemoMode = true;
      const banner = document.getElementById('demoBanner');
      if (banner) banner.style.display = 'block';
      const loginForm = document.getElementById('loginForm');
      if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const username = document.getElementById('loginUsername').value.trim() || 'Admin';
          sessionStorage.setItem('demo_user', username);
          loginSuccess({ email: username });
        });
      }
      if (savedDemoUser) {
        loginSuccess({ email: savedDemoUser });
      }
    }
  }
}

function loginSuccess(user) {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'flex';

  let displayName = user.email || 'Admin';
  if (displayName.endsWith('@smartlight.local')) {
    displayName = displayName.split('@')[0];
  }
  document.getElementById('staffEmail').innerText = displayName;

  loadData();
  setTimeout(() => map && map.invalidateSize(), 300);
}

function logout() {
  isDemoMode = false;
  sessionStorage.removeItem('demo_user');
  if (auth && typeof auth.signOut === 'function') {
    auth.signOut().then(() => logoutSuccess()).catch(() => logoutSuccess());
  } else {
    logoutSuccess();
  }
}

function logoutSuccess() {
  if (isDemoMode && sessionStorage.getItem('demo_user')) return;
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('loginSection').style.display = 'flex';
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.reset();
}

// ==========================================
// 3. Map System & Interactive Controls
// ==========================================
function initMap() {
  const defaultLatLng = [6.29445, 101.72362];
  map = L.map('map', { zoomControl: false }).setView(defaultLatLng, 15);
  L.control.zoom({ position: 'topright' }).addTo(map);

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  });

  const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18
  });

  osmLayer.addTo(map);

  const baseMaps = {
    "แผนที่ปกติ (OSM)": osmLayer,
    "แผนที่ดาวเทียม (Esri)": esriSatelliteLayer
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  markersGroup = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    if (!isAddingPoleMode) return;

    const editPoleId = document.getElementById('editPoleId').value;
    if (editPoleId) {
      const light = allLights.find(l => l.id === editPoleId);
      const code = light ? light.code : '';
      document.getElementById('formActionTitle').innerText = `แก้ไขเสาไฟรหัส: ${code} (เลือกพิกัดใหม่แล้ว)`;
    } else {
      document.getElementById('formActionTitle').innerText = "เพิ่มเสาไฟใหม่ (คลิกบนแผนที่แล้ว)";
    }
    document.getElementById('poleLat').value = e.latlng.lat.toFixed(6);
    document.getElementById('poleLng').value = e.latlng.lng.toFixed(6);

    if (activeMarkerLocation) {
      map.removeLayer(activeMarkerLocation);
    }
    activeMarkerLocation = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'temp-marker',
        html: '<i class="fa-solid fa-location-crosshairs" style="color:var(--accent-cyan); font-size:24px;"></i>',
        iconAnchor: [12, 12]
      })
    }).addTo(map);
  });
}

// ==========================================
// 4. Data Fetching & UI Synchronization
// ==========================================
function loadData() {
  if (isDemoMode) {
    allLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
    allReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
    updateUI();
  } else {
    db.collection('lights').onSnapshot((snapshot) => {
      allLights = [];
      snapshot.forEach((doc) => {
        allLights.push({ id: doc.id, ...doc.data() });
      });
      updateUI();
    }, (err) => {
      console.warn("Firestore lights subscription error, fallback to local:", err);
      allLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
      updateUI();
    });

    db.collection('reports').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
      allReports = [];
      snapshot.forEach((doc) => {
        allReports.push({ id: doc.id, ...doc.data() });
      });
      updateUI();
    }, (err) => {
      console.warn("Firestore reports subscription error, fallback to local:", err);
      allReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
      updateUI();
    });
  }
}

function updateUI() {
  updateStats();
  displayLightsOnMap();
  displayReports();
  updateMonthlyStats();
  updatePrintQueueUI();
  renderMonthlyDashboard();
}

function updateStats() {
  const total = allLights.length;
  const working = allLights.filter(l => l.status === 'working').length;
  const broken = allLights.filter(l => l.status === 'broken').length;
  const pending = allLights.filter(l => l.status === 'pending').length;

  document.getElementById('statTotal').innerText = total;
  document.getElementById('statWorking').innerText = working;
  document.getElementById('statBroken').innerText = broken;
  document.getElementById('statPending').innerText = pending;
}

function displayLightsOnMap() {
  markersGroup.clearLayers();
  const bounds = [];

  allLights.forEach(light => {
    const marker = L.marker([light.lat, light.lng], { icon: getMarkerIcon(light.status) });

    const statusText = light.status === 'working' ? 'ใช้งานปกติ' : light.status === 'pending' ? 'กำลังซ่อมแซม' : 'ไฟดับ/ชำรุด';
    const badgeClass = light.status === 'working' ? 'badge-working' : light.status === 'pending' ? 'badge-pending' : 'badge-broken';

    const isInQueue = printQueue.includes(light.id);
    const queueBtnText = isInQueue ? 'นำออกจากคิวพิมพ์' : 'เพิ่มเข้าคิวพิมพ์';
    const queueBtnIcon = isInQueue ? 'fa-solid fa-minus' : 'fa-solid fa-plus';
    const queueBtnStyle = isInQueue ? 'background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;' : 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;';

    const popupContent = `
      <div style="min-width: 250px; font-family: var(--font-family);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 15px; color: var(--text-main);"><i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan)"></i> รหัส: ${escapeHtml(light.code)}</span>
          <span class="badge ${badgeClass}" style="padding: 2px 8px; font-size: 11px;">${statusText}</span>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
          <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-main);">
            <i class="fa-solid fa-location-dot" style="color: var(--text-muted); margin-top: 3px; font-size: 13px; width: 14px;"></i>
            <div style="flex: 1; font-weight: 500;">${escapeHtml(light.name)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted);">
            <i class="fa-solid fa-border-all" style="width: 14px;"></i>
            <div>เขตดูแล: <span style="font-weight: 600; color: var(--text-main);">${escapeHtml(light.zone || 'ไม่ระบุ')}</span></div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted);">
            <i class="fa-solid fa-earth-asia" style="width: 14px;"></i>
            <div>พิกัด: <span style="font-family: monospace;">${light.lat.toFixed(5)}, ${light.lng.toFixed(5)}</span></div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary" onclick="openQrModal('${light.id}')" style="padding: 6px 10px; font-size: 12px; flex: 1;">
              <i class="fa-solid fa-qrcode"></i> แสดง QR
            </button>
            <button class="btn" onclick="toggleQueueFromMap('${light.id}')" style="padding: 6px 10px; font-size: 12px; flex: 1.2; font-weight: 600; transition: var(--transition-fast); ${queueBtnStyle}">
              <i class="${queueBtnIcon}"></i> ${queueBtnText}
            </button>
          </div>
          <div style="display: flex; gap: 6px; border-top: 1px solid var(--border-light); padding-top: 6px;">
            <button class="btn btn-secondary" onclick="editPole('${light.id}')" style="padding: 5px; font-size: 11px; flex: 1;">
              <i class="fa-solid fa-pen-to-square"></i> แก้ไข
            </button>
            <button class="btn" onclick="deletePole('${light.id}')" style="padding: 5px; font-size: 11px; flex: 1; background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626;">
              <i class="fa-solid fa-trash"></i> ลบเสาไฟ
            </button>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    markersGroup.addLayer(marker);
    bounds.push([light.lat, light.lng]);
  });

  if (bounds.length > 0 && allLights.length > 0 && !map._hasFitBounds) {
    map.fitBounds(bounds, { padding: [50, 50] });
    map._hasFitBounds = true;
  }
}

function getMarkerIcon(status) {
  let iconMarkup = '<i class="fa-solid fa-lightbulb" style="color:var(--color-success); font-size:16px;"></i>';
  if (status === 'broken') {
    iconMarkup = '<i class="fa-solid fa-lightbulb" style="color:var(--color-danger); font-size:16px; animation: pulse 1s infinite alternate;"></i>';
  } else if (status === 'pending') {
    iconMarkup = '<i class="fa-solid fa-screwdriver-wrench" style="color:var(--color-warning); font-size:14px;"></i>';
  }
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background: #ffffff; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid ${status === 'broken' ? 'var(--color-danger)' : status === 'pending' ? 'var(--color-warning)' : 'var(--color-success)'}; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)">${iconMarkup}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

// ==========================================
// 5. Reports & Status Updates Management
// ==========================================
function displayReports() {
  const container = document.getElementById('reportsList');
  if (!container) return;

  document.getElementById('reportCountBadge').innerText = allReports.filter(r => r.status !== 'resolved').length;

  if (allReports.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 30px;">ไม่มีข้อมูลรายการแจ้งเสีย</p>`;
    return;
  }

  container.innerHTML = '';
  allReports.forEach(report => {
    const timeFormatted = formatTime(report.timestamp);
    const cardStatusClass = report.status === 'resolved' ? 'badge-working' : report.status === 'in_progress' ? 'badge-pending' : 'badge-broken';
    const cardStatusText = report.status === 'resolved' ? 'ซ่อมเสร็จสิ้น' : report.status === 'in_progress' ? 'กำลังซ่อม' : 'รอดำเนินการ';

    let imagesHtml = '';
    if (report.images && report.images.length > 0) {
      imagesHtml = `
        <div class="report-card-gallery" style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;">
          ${report.images.map((imgUrl, idx) => `
            <img src="${imgUrl}" alt="รูปภาพแจ้งซ่อม ${idx + 1}" onclick="viewReportImage('${imgUrl}')" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-light); cursor: pointer; transition: var(--transition-fast);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          `).join('')}
        </div>
      `;
    }

    const cardHtml = `
      <div class="report-card">
        <div class="report-header">
          <span class="report-time"><i class="fa-solid fa-clock"></i> ${timeFormatted}</span>
          <span class="badge ${cardStatusClass}">${cardStatusText}</span>
        </div>
        <div style="font-weight:600; color: var(--text-main); font-size:14px;">
          เสาไฟ: ${escapeHtml(report.lightCode)} <span style="font-weight:normal; font-size:12px; color:var(--text-muted)">(${escapeHtml(report.lightName)})</span>
        </div>
        <div style="font-size:13px; color: var(--text-muted);">
          <strong>อาการ:</strong> ${escapeHtml(report.issueType)}
          ${report.details ? `<br><span style="color: var(--text-muted); font-size:12px;">รายละเอียด: ${escapeHtml(report.details)}</span>` : ''}
        </div>
        ${imagesHtml}
        ${report.reporterPhone ? `<div style="font-size:12px; color:var(--accent-cyan);"><i class="fa-solid fa-phone"></i> เบอร์ติดต่อ: ${escapeHtml(report.reporterPhone)}</div>` : ''}
        
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button class="btn btn-secondary" onclick="locateLight('${report.lightId}')" style="padding:4px 8px; font-size:11px; flex:1;">
            <i class="fa-solid fa-magnifying-glass-location"></i> ชี้บนแผนที่
          </button>
          ${report.status === 'pending' ? `
            <button class="btn btn-primary" onclick="updateReportStatus('${report.id}', '${report.lightId}', 'in_progress')" style="padding:4px 8px; font-size:11px; flex:1;">
              <i class="fa-solid fa-person-digging"></i> รับเรื่องซ่อม
            </button>
          ` : ''}
          ${report.status === 'in_progress' ? `
            <button class="btn btn-primary" onclick="updateReportStatus('${report.id}', '${report.lightId}', 'resolved')" style="padding:4px 8px; font-size:11px; flex:1; background:var(--color-success);">
              <i class="fa-solid fa-check"></i> ซ่อมเสร็จสิ้น
            </button>
          ` : ''}
          <button class="btn btn-secondary" onclick="deleteReport('${report.id}')" style="padding:4px 8px; font-size:11px; background:#fee2e2; border-color:#fca5a5; color:#dc2626;">
            ลบ
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', cardHtml);
  });
}

function locateLight(lightId) {
  const light = allLights.find(l => l.id === lightId);
  if (light) {
    map.setView([light.lat, light.lng], 18);
    markersGroup.eachLayer(layer => {
      if (layer.getLatLng().lat === light.lat && layer.getLatLng().lng === light.lng) {
        layer.openPopup();
      }
    });
  }
}

function viewReportImage(imgUrl) {
  Swal.fire({
    imageUrl: imgUrl,
    imageAlt: 'รูปภาพแจ้งซ่อม',
    showConfirmButton: false,
    showCloseButton: true,
    width: 'auto',
    maxWidth: '90%',
    background: '#ffffff',
    color: '#0f172a'
  });
}

function updateReportStatus(reportId, lightId, newStatus) {
  const newLightStatus = newStatus === 'resolved' ? 'working' : 'pending';

  let statusLabel = 'รอดำเนินการ';
  let statusNote = 'เทศบาลตำบลตันหยงมัสได้รับเรื่องแจ้งแล้ว ช่างไฟฟ้าจะเข้าตรวจสอบพิกัด';
  if (newStatus === 'in_progress') {
    statusLabel = 'กำลังดำเนินการ';
    statusNote = 'เจ้าหน้าที่รับเรื่องซ่อมแล้ว และกำลังจัดส่งทีมช่างไฟฟ้าเดินทางเข้าแก้ไขหน้างาน';
  } else if (newStatus === 'resolved') {
    statusLabel = 'ซ่อมแซมเสร็จสิ้น';
    statusNote = 'ดำเนินการเปลี่ยนหลอดไฟ/ซ่อมโคมไฟสำเร็จ ไฟฟ้าสาธารณะส่องสว่างปกติแล้ว';
  }

  const historyEntry = {
    status: newStatus,
    label: statusLabel,
    timestamp: new Date().toISOString(),
    note: statusNote
  };

  if (isDemoMode) {
    const localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
    const rIndex = localReports.findIndex(r => r.id === reportId);
    if (rIndex !== -1) {
      localReports[rIndex].status = newStatus;
      if (!localReports[rIndex].statusHistory) {
        localReports[rIndex].statusHistory = [];
      }
      localReports[rIndex].statusHistory.push(historyEntry);
      localStorage.setItem('smart_reports', JSON.stringify(localReports));
    }

    const localLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
    const lIndex = localLights.findIndex(l => l.id === lightId);
    if (lIndex !== -1) {
      localLights[lIndex].status = newLightStatus;
      localLights[lIndex].lastUpdated = new Date().toISOString();
      localStorage.setItem('smart_lights', JSON.stringify(localLights));
    }

    sendLineUserUpdateNotification(reportId, newStatus);
    loadData();
  } else {
    db.collection('reports').doc(reportId).update({
      status: newStatus,
      statusHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry)
    }).then(() => {
      return db.collection('lights').doc(lightId).update({
        status: newLightStatus,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(() => {
      sendLineUserUpdateNotification(reportId, newStatus);
    }).catch(err => console.error("Error updating status: ", err));
  }
}

// ส่ง Push Message แจ้งเตือนความคืบหน้าหาประชาชน
function sendLineUserUpdateNotification(reportId, newStatus) {
  let reportData = null;
  if (isDemoMode) {
    const localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
    reportData = localReports.find(r => r.id === reportId);
  } else {
    reportData = allReports.find(r => r.id === reportId);
  }

  if (lineConfig.backendNotifyApiUrl) {
    // ส่งข้อมูลไปยัง Backend API / Cloud Function (การทำงานที่ปลอดภัย)
    fetch(lineConfig.backendNotifyApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, newStatus, reportData })
    })
      .then(res => res.json())
      .then(data => console.log("LINE notification sent via backend:", data))
      .catch(err => console.error("Error calling backend notify API:", err));
    return;
  }

  if (!lineConfig.channelAccessToken) {
    console.warn("No backend API or Channel Access Token configured. Skipping LINE Push Notification safely.");
    return;
  }

  let reportData = null;
  if (isDemoMode) {
    const localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
    reportData = localReports.find(r => r.id === reportId);
    if (!reportData) return;
    triggerLineNotification(reportData, newStatus);
  } else {
    db.collection('reports').doc(reportId).get().then(doc => {
      if (doc.exists) {
        reportData = doc.data();
        triggerLineNotification(reportData, newStatus);
      }
    }).catch(err => console.error("Error getting report for push notification:", err));
  }
}

function triggerLineNotification(report, newStatus) {
  const targetUserId = report.lineUserId;
  if (!targetUserId || targetUserId.startsWith("MOCK_")) {
    console.log("No real lineUserId or mock user. Skipping LINE notification.");
    return;
  }

  let statusLabel = 'รอดำเนินการ';
  if (newStatus === 'in_progress') statusLabel = 'กำลังดำเนินการ';
  else if (newStatus === 'resolved') statusLabel = 'ซ่อมแซมเสร็จสิ้น';

  let citizenUrl = getCitizenUrl(null, 'track');

  function getStatusLabel(status) {
    if (status === 'pending' || status === 'broken') return 'ได้รับเรื่องแล้ว';
    if (status === 'in_progress') return 'กำลังดำเนินการ';
    if (status === 'resolved') return 'ซ่อมแซมเสร็จสิ้น';
    return status;
  }

  const historyList = report.statusHistory || [
    {
      status: 'pending',
      label: 'ได้รับเรื่องแล้ว',
      timestamp: report.timestamp || new Date().toISOString(),
      note: 'ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว'
    }
  ];
  const sortedHistory = [...historyList].sort((a, b) => {
    const timeA = a.timestamp ? (a.timestamp.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime()) : 0;
    const timeB = b.timestamp ? (b.timestamp.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime()) : 0;
    return timeA - timeB;
  });

  const timelineContents = sortedHistory.map((hist, idx) => {
    let dotColor = "#cbd5e1";
    let isLast = idx === sortedHistory.length - 1;

    if (hist.status === 'pending' || hist.status === 'broken') dotColor = "#dc2626";
    else if (hist.status === 'in_progress') dotColor = "#d97706";
    else if (hist.status === 'resolved') dotColor = "#16a34a";

    const histTime = formatTime(hist.timestamp);

    const itemBox = {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "24px",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "2px",
              backgroundColor: "#cbd5e1",
              position: "absolute",
              offsetTop: idx === 0 ? "12px" : "0px",
              offsetBottom: isLast ? "12px" : "0px",
              offsetStart: "11px",
              contents: [{ type: "text", text: " ", size: "xxs" }]
            },
            {
              type: "box",
              layout: "vertical",
              width: "12px",
              height: "12px",
              cornerRadius: "xxl",
              backgroundColor: dotColor,
              position: "absolute",
              offsetTop: "6px",
              offsetStart: "6px",
              contents: [{ type: "text", text: " ", size: "xxs" }]
            }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          flex: 1,
          paddingBottom: isLast ? "0px" : "12px",
          contents: [
            {
              type: "text",
              text: hist.label || getStatusLabel(hist.status),
              weight: "bold",
              size: "sm",
              color: isLast ? "#0f172a" : "#64748b"
            },
            {
              type: "text",
              text: histTime,
              size: "xs",
              color: "#94a3b8",
              margin: "xs"
            }
          ]
        }
      ]
    };

    if (hist.note) {
      itemBox.contents[1].contents.push({
        type: "text",
        text: hist.note,
        size: "xs",
        color: "#475569",
        wrap: true,
        margin: "xs"
      });
    }

    return itemBox;
  });

  const payload = {
    to: targetUserId,
    messages: [
      {
        type: "flex",
        altText: `🔔 แจ้งความคืบหน้าการแจ้งซ่อมเสาไฟ: ${report.lightCode}`,
        contents: {
          type: "bubble",
          styles: {
            header: { backgroundColor: newStatus === 'resolved' ? "#16a34a" : newStatus === 'in_progress' ? "#d97706" : "#dc2626" },
            body: { backgroundColor: "#ffffff" },
            footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
          },
          header: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: `📢 อัปเดตสถานะ: ${statusLabel}`, weight: "bold", color: "#ffffff", size: "md" },
              { type: "text", text: "ระบบแจ้งซ่อมไฟถนน เทศบาลตำบลตันหยงมัส", color: "#e8e8e8", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "รหัสเสาไฟ:", size: "sm", color: "#64748b", flex: 2 },
                  { type: "text", text: report.lightCode, weight: "bold", size: "sm", color: "#0f172a", flex: 4 }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "สถานที่:", size: "sm", color: "#64748b", flex: 2 },
                  { type: "text", text: report.lightName, size: "sm", color: "#334155", wrap: true, flex: 4 }
                ]
              },
              { type: "separator", color: "#f1f5f9", margin: "md" },
              { type: "text", text: "📃 ไทม์ไลน์การดำเนินงาน:", size: "sm", weight: "bold", color: "#0f172a", margin: "sm" },
              {
                type: "box",
                layout: "vertical",
                spacing: "none",
                margin: "xs",
                contents: timelineContents
              }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#0ea5e9",
                action: { type: "uri", label: "🔍 ติดตามรายละเอียดในประวัติ", uri: citizenUrl }
              }
            ]
          }
        }
      }
    ]
  };

  const url = "https://api.line.me/v2/bot/message/push";
  const requestUrl = lineConfig.useCorsProxy ? (lineConfig.corsProxyUrl + url) : url;

  fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + lineConfig.channelAccessToken
    },
    body: JSON.stringify(payload)
  })
    .then(async response => {
      if (!response.ok) {
        const errText = await response.text();
        throw new Error("HTTP status " + response.status + ": " + errText);
      }
      return response.json();
    })
    .then(data => console.log("LINE push notification sent to citizen:", data))
    .catch(err => console.error("Error sending LINE push notification to citizen:", err));
}

function deleteReport(reportId) {
  Swal.fire({
    title: 'ยืนยันการลบรายการ?',
    text: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการแจ้งซ่อมนี้ออกจากระบบ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#4b5563',
    confirmButtonText: 'ใช่, ต้องการลบ',
    cancelButtonText: 'ยกเลิก',
    background: '#161c2d',
    color: '#f3f4f6'
  }).then((result) => {
    if (result.isConfirmed) {
      if (isDemoMode) {
        let localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
        localReports = localReports.filter(r => r.id !== reportId);
        localStorage.setItem('smart_reports', JSON.stringify(localReports));
        loadData();
        Swal.fire({
          title: 'ลบเสร็จสิ้น!',
          text: 'ข้อมูลรายการแจ้งซ่อมถูกลบออกจากระบบชั่วคราวแล้ว',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          background: '#161c2d',
          color: '#f3f4f6',
          confirmButtonColor: '#10b981'
        });
      } else {
        db.collection('reports').doc(reportId).delete()
          .then(() => {
            Swal.fire({
              title: 'ลบเสร็จสิ้น!',
              text: 'ข้อมูลรายการแจ้งซ่อมถูกลบออกจากคลาวด์แล้ว',
              icon: 'success',
              confirmButtonText: 'ตกลง',
              background: '#161c2d',
              color: '#f3f4f6',
              confirmButtonColor: '#10b981'
            });
          })
          .catch(err => console.error(err));
      }
    }
  });
}

// ==========================================
// 6. Drawer & Light Pole CRUD Management
// ==========================================
function openDrawer(mode) {
  const drawer = document.getElementById('leftDrawer');
  const title = document.getElementById('drawerTitle');
  const managePanel = document.getElementById('drawerManagePanel');
  const addPanel = document.getElementById('drawerAddPanel');

  if (!drawer || !title || !managePanel || !addPanel) return;

  if (mode !== 'add' && addPanel.style.display === 'block') {
    resetPoleForm();
  }

  managePanel.style.display = 'none';
  addPanel.style.display = 'none';

  isAddingPoleMode = false;

  if (mode === 'manage') {
    title.innerHTML = `<i class="fa-solid fa-print" style="color: var(--accent-blue); font-size: 16px;"></i> คิวพิมพ์สติกเกอร์`;
    managePanel.style.display = 'block';
    updatePrintQueueUI();
  } else if (mode === 'add') {
    title.innerHTML = `<i class="fa-solid fa-circle-plus" style="color: var(--color-success); font-size: 16px;"></i> เพิ่ม/แก้ไขเสาไฟ`;
    addPanel.style.display = 'block';
    isAddingPoleMode = true;

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: 'โหมดเลือกพิกัด: คลิกบนแผนที่เพื่อระบุตำแหน่งเสาไฟ',
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true
    });
  }

  drawer.style.transform = 'translateX(0)';
}

function closeDrawer() {
  const drawer = document.getElementById('leftDrawer');
  if (drawer) drawer.style.transform = 'translateX(-100%)';
  isAddingPoleMode = false;

  if (document.getElementById('editPoleId').value) {
    resetPoleForm();
  }
}

function initFormListeners() {
  const poleForm = document.getElementById('poleForm');
  if (poleForm) {
    poleForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const id = document.getElementById('editPoleId').value;
      const code = document.getElementById('poleCode').value;
      const name = document.getElementById('poleName').value;
      const zone = document.getElementById('poleZone').value;
      const lat = parseFloat(document.getElementById('poleLat').value);
      const lng = parseFloat(document.getElementById('poleLng').value);
      const status = document.getElementById('poleStatus').value;

      const poleData = {
        code: code,
        name: name,
        zone: zone,
        lat: lat,
        lng: lng,
        status: status,
        lastUpdated: new Date()
      };

      if (isDemoMode) {
        const localLights = JSON.parse(localStorage.getItem('smart_lights')) || [];

        if (id) {
          const index = localLights.findIndex(l => l.id === id);
          if (index !== -1) {
            localLights[index] = { ...localLights[index], ...poleData, lastUpdated: new Date().toISOString() };
          }
        } else {
          const newId = 'pole_' + Math.random().toString(36).substr(2, 9);
          localLights.push({ id: newId, ...poleData, lastUpdated: new Date().toISOString() });
        }

        localStorage.setItem('smart_lights', JSON.stringify(localLights));
        Swal.fire({
          title: 'บันทึกสำเร็จ!',
          text: 'บันทึกข้อมูลเสาไฟเสร็จเรียบร้อย (โหมดเดโม)',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          background: '#161c2d',
          color: '#f3f4f6',
          confirmButtonColor: '#06b6d4'
        });
        resetPoleForm();
        closeDrawer();
        loadData();
      } else {
        const promise = id ?
          db.collection('lights').doc(id).update(poleData) :
          db.collection('lights').add(poleData);

        promise.then(() => {
          Swal.fire({
            title: 'บันทึกสำเร็จ!',
            text: 'ข้อมูลเสาไฟในระบบได้รับการอัปเดตเรียบร้อยแล้ว',
            icon: 'success',
            confirmButtonText: 'ตกลง',
            background: '#161c2d',
            color: '#f3f4f6',
            confirmButtonColor: '#10b981'
          });
          resetPoleForm();
          closeDrawer();
        }).catch(err => {
          console.error("Save Error: ", err);
          Swal.fire({
            title: 'เกิดข้อผิดพลาด!',
            text: 'ไม่สามารถบันทึกข้อมูลเสาไฟได้ กรุณาลองใหม่อีกครั้ง',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            background: '#161c2d',
            color: '#f3f4f6',
            confirmButtonColor: '#ef4444'
          });
        });
      }
    });
  }
}

function editPole(id) {
  const light = allLights.find(l => l.id === id);
  if (!light) return;

  openDrawer('add');
  document.getElementById('formActionTitle').innerText = "แก้ไขเสาไฟรหัส: " + light.code;

  document.getElementById('editPoleId').value = light.id;
  document.getElementById('poleCode').value = light.code;
  document.getElementById('poleName').value = light.name;
  document.getElementById('poleZone').value = light.zone || 'ชุมชนตลาดกลางผลไม้';
  document.getElementById('poleLat').value = light.lat;
  document.getElementById('poleLng').value = light.lng;
  document.getElementById('poleStatus').value = light.status;
  document.getElementById('saveBtn').innerHTML = `<i class="fa-solid fa-save"></i> บันทึกการแก้ไข`;

  map.setView([light.lat, light.lng], 18);
}

function deletePole(id) {
  Swal.fire({
    title: 'ยืนยันการลบเสาไฟ?',
    text: 'ข้อมูลเสาไฟจะสูญหายอย่างถาวร และคิวอาร์โค้ดที่ติดอยู่กับเสาจริงจะไม่สามารถแจ้งเสียได้อีกต่อไป',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#4b5563',
    confirmButtonText: 'ใช่, ยืนยันการลบ',
    cancelButtonText: 'ยกเลิก',
    background: '#161c2d',
    color: '#f3f4f6'
  }).then((result) => {
    if (result.isConfirmed) {
      if (isDemoMode) {
        let localLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
        localLights = localLights.filter(l => l.id !== id);
        localStorage.setItem('smart_lights', JSON.stringify(localLights));
        resetPoleForm();
        loadData();
        Swal.fire({
          title: 'ลบสำเร็จ!',
          text: 'ข้อมูลเสาไฟได้รับการลบออกจากระบบจำลองแล้ว',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          background: '#161c2d',
          color: '#f3f4f6',
          confirmButtonColor: '#10b981'
        });
      } else {
        db.collection('lights').doc(id).delete()
          .then(() => {
            Swal.fire({
              title: 'ลบสำเร็จ!',
              text: 'ข้อมูลเสาไฟได้รับการลบออกจากฐานข้อมูลคลาวด์แล้ว',
              icon: 'success',
              confirmButtonText: 'ตกลง',
              background: '#161c2d',
              color: '#f3f4f6',
              confirmButtonColor: '#10b981'
            });
            resetPoleForm();
          })
          .catch(err => {
            console.error(err);
            Swal.fire({
              title: 'เกิดข้อผิดพลาด!',
              text: 'ไม่สามารถลบข้อมูลเสาไฟได้ กรุณาลองใหม่อีกครั้ง',
              icon: 'error',
              confirmButtonText: 'ตกลง',
              background: '#161c2d',
              color: '#f3f4f6',
              confirmButtonColor: '#ef4444'
            });
          });
      }
    }
  });
}

function resetPoleForm() {
  const poleForm = document.getElementById('poleForm');
  if (poleForm) poleForm.reset();
  document.getElementById('editPoleId').value = '';
  document.getElementById('formActionTitle').innerText = "เพิ่มเสาไฟใหม่";
  document.getElementById('saveBtn').innerHTML = `<i class="fa-solid fa-save"></i> บันทึกข้อมูล`;
  isAddingPoleMode = false;

  if (activeMarkerLocation) {
    map.removeLayer(activeMarkerLocation);
    activeMarkerLocation = null;
  }
}

// ==========================================
// 7. QR Code Generation & Sticker Printing System
// ==========================================
function openQrModal(lightId) {
  const light = allLights.find(l => l.id === lightId);
  if (!light) return;

  activeModalLightId = lightId;
  document.getElementById('qrPoleCode').innerText = light.code;
  document.getElementById('qrPoleName').innerText = light.name;
  document.getElementById('qrPoleZone').innerText = `เขตการดูแล: ${light.zone || 'ไม่ระบุ'}`;

  updateModalQueueButton();

  const citizenUrl = getCitizenUrl(light.id);
  const qrcodeContainer = document.getElementById('qrcode');
  if (qrcodeContainer) {
    qrcodeContainer.innerHTML = '';
    qrcodeObj = new QRCode(qrcodeContainer, {
      text: citizenUrl,
      width: 150,
      height: 150,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  document.getElementById('qrModal').style.display = 'flex';
}

function closeQrModal() {
  activeModalLightId = null;
  document.getElementById('qrModal').style.display = 'none';
}

function downloadQrCode() {
  const imgElement = document.querySelector('#qrcode img');
  const canvasElement = document.querySelector('#qrcode canvas');
  const poleCode = document.getElementById('qrPoleCode').innerText;

  if (imgElement && imgElement.src) {
    const link = document.createElement('a');
    link.href = imgElement.src;
    link.download = `QR_${poleCode}.png`;
    link.click();
  } else if (canvasElement) {
    const link = document.createElement('a');
    link.href = canvasElement.toDataURL("image/png");
    link.download = `QR_${poleCode}.png`;
    link.click();
  }
}

function printQrSticker() {
  if (!activeModalLightId) return;

  const printArea = document.getElementById('bulkPrintArea');
  if (!printArea) return;

  printArea.innerHTML = '';
  const light = allLights.find(l => l.id === activeModalLightId);

  if (light) {
    const citizenUrl = getCitizenUrl(light.id);

    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';

    const card = document.createElement('div');
    card.className = 'print-sticker-card';
    card.innerHTML = `
      <div style="text-align: center; font-family: var(--font-family); color: #000; background: #fff; padding: 10px; width: 100%;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; width: 100%;">
          <img src="assets/logo.png" alt="โลโก้เทศบาล" style="height: 38px; width: auto; object-fit: contain;">
          <div style="text-align: left;">
            <h4 style="font-size: 13px; font-weight: 800; margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', sans-serif;">เทศบาลตำบลตันหยงมัส</h4>
            <p style="font-size: 9px; font-weight: 600; margin: 0; color: #475569; font-family: 'Noto Sans Thai', sans-serif;">ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ</p>
          </div>
        </div>
        
        <p style="font-size: 10px; font-weight: bold; margin-bottom: 8px; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'Noto Sans Thai', sans-serif;">
          <i class="fa-solid fa-circle-exclamation"></i> พบไฟดับ/ชำรุด สแกนแจ้งซ่อมที่นี่
        </p>

        <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block; border: 1px solid #e2e8f0; margin: 5px 0;">
          <div id="bulk-qr-${light.id}"></div>
        </div>

        <div style="margin-top: 8px; width: 100%;">
          <h2 style="font-weight: 800; font-size: 18px; color: #0f172a; background: #f1f5f9; display: inline-block; padding: 4px 16px; border-radius: 8px; margin-bottom: 6px; border: 2px dashed #0f172a; font-family: 'Noto Sans Thai', sans-serif;">${escapeHtml(light.code)}</h2>
          <div style="font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.3; font-family: 'Noto Sans Thai', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; margin: 0 auto;">${escapeHtml(light.name)}</div>
          <div style="font-size: 9px; color: #64748b; margin-top: 2px; font-family: 'Noto Sans Thai', sans-serif;">เขตการดูแล: ${escapeHtml(light.zone || 'ไม่ระบุ')}</div>
        </div>
      </div>
    `;

    pageDiv.appendChild(card);
    printArea.appendChild(pageDiv);

    new QRCode(document.getElementById(`bulk-qr-${light.id}`), {
      text: citizenUrl,
      width: 150,
      height: 150,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

    setTimeout(() => { window.print(); }, 500);
  }
}

// ==========================================
// 8. Print Queue Management
// ==========================================
function toggleQueue(lightId) {
  const index = printQueue.indexOf(lightId);
  if (index === -1) {
    printQueue.push(lightId);
    Swal.fire({
      toast: true, position: 'top-end', icon: 'success', title: 'เพิ่มเข้าคิวพิมพ์สำเร็จ', showConfirmButton: false, timer: 1500
    });
  } else {
    printQueue.splice(index, 1);
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info', title: 'นำออกจากคิวพิมพ์แล้ว', showConfirmButton: false, timer: 1500
    });
  }
  localStorage.setItem('smart_print_queue', JSON.stringify(printQueue));
  updatePrintQueueUI();
}

function toggleQueueFromMap(lightId) {
  toggleQueue(lightId);
  displayLightsOnMap();

  markersGroup.eachLayer(layer => {
    const latLng = layer.getLatLng();
    const light = allLights.find(l => l.id === lightId);
    if (light && latLng.lat === light.lat && latLng.lng === light.lng) {
      layer.openPopup();
    }
  });
}

function toggleQueueFromModal() {
  if (!activeModalLightId) return;
  toggleQueue(activeModalLightId);
  updateModalQueueButton();
  displayLightsOnMap();
}

function updateModalQueueButton() {
  if (!activeModalLightId) return;
  const btn = document.getElementById('modalQueueBtn');
  if (!btn) return;

  const isInQueue = printQueue.includes(activeModalLightId);
  if (isInQueue) {
    btn.innerHTML = `<i class="fa-solid fa-minus"></i> นำออกจากคิวพิมพ์`;
    btn.style.cssText = "width: 100%; font-size: 13px; font-weight: 600; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> เพิ่มเข้าคิวพิมพ์พร้อมกัน`;
    btn.style.cssText = "width: 100%; font-size: 13px; font-weight: 600; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;";
  }
}

function updatePrintQueueUI() {
  const badge = document.getElementById('printQueueBadge');
  const list = document.getElementById('printQueueList');
  const emptyText = document.getElementById('printQueueEmptyText');
  const btnPrint = document.getElementById('btnPrintBulk');
  const btnClear = document.getElementById('btnClearBulk');

  if (!badge || !list || !emptyText || !btnPrint || !btnClear) return;

  badge.innerText = printQueue.length;

  if (printQueue.length === 0) {
    list.style.display = 'none';
    emptyText.style.display = 'block';
    btnPrint.disabled = true;
    btnClear.disabled = true;
    return;
  }

  list.style.display = 'block';
  emptyText.style.display = 'none';
  btnPrint.disabled = false;
  btnClear.disabled = false;

  list.innerHTML = '';
  printQueue.forEach(id => {
    const light = allLights.find(l => l.id === id);
    if (light) {
      const item = document.createElement('div');
      item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: white; border: 1px solid var(--border-light); border-radius: 6px; margin-bottom: 6px;";
      item.innerHTML = `
        <div style="font-weight: 600;">${light.code} <span style="font-weight: normal; color: var(--text-muted); font-size: 11px;">(${light.name})</span></div>
        <button onclick="toggleQueue('${light.id}'); displayLightsOnMap();" style="border: none; background: none; color: var(--color-danger); cursor: pointer; padding: 2px 6px;">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      list.appendChild(item);
    }
  });
}

function clearPrintQueue() {
  printQueue = [];
  localStorage.setItem('smart_print_queue', JSON.stringify(printQueue));
  updatePrintQueueUI();
  displayLightsOnMap();
  if (activeModalLightId) {
    updateModalQueueButton();
  }
  Swal.fire({
    toast: true, position: 'top-end', icon: 'info', title: 'ล้างคิวพิมพ์เรียบร้อยแล้ว', showConfirmButton: false, timer: 1500
  });
}

function printBulkQr() {
  const printArea = document.getElementById('bulkPrintArea');
  if (!printArea) return;

  printArea.innerHTML = '';
  const chunkSize = 2;
  for (let i = 0; i < printQueue.length; i += chunkSize) {
    const chunk = printQueue.slice(i, i + chunkSize);

    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';

    chunk.forEach(id => {
      const light = allLights.find(l => l.id === id);
      if (light) {
        const citizenUrl = getCitizenUrl(light.id);

        const card = document.createElement('div');
        card.className = 'print-sticker-card';
        card.innerHTML = `
          <div style="text-align: center; font-family: var(--font-family); color: #000; background: #fff; padding: 10px; width: 100%;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; width: 100%;">
              <img src="assets/logo.png" alt="โลโก้เทศบาล" style="height: 38px; width: auto; object-fit: contain;">
              <div style="text-align: left;">
                <h4 style="font-size: 13px; font-weight: 800; margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', sans-serif;">เทศบาลตำบลตันหยงมัส</h4>
                <p style="font-size: 9px; font-weight: 600; margin: 0; color: #475569; font-family: 'Noto Sans Thai', sans-serif;">ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ</p>
              </div>
            </div>

            <p style="font-size: 10px; font-weight: bold; margin-bottom: 8px; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'Noto Sans Thai', sans-serif;">
              <i class="fa-solid fa-circle-exclamation"></i> พบไฟดับ/ชำรุด สแกนแจ้งซ่อมที่นี่
            </p>

            <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block; border: 1px solid #e2e8f0; margin: 5px 0;">
              <div id="bulk-qr-${light.id}"></div>
            </div>

            <div style="margin-top: 8px; width: 100%;">
              <h2 style="font-weight: 800; font-size: 18px; color: #0f172a; background: #f1f5f9; display: inline-block; padding: 4px 16px; border-radius: 8px; margin-bottom: 6px; border: 2px dashed #0f172a; font-family: 'Noto Sans Thai', sans-serif;">${escapeHtml(light.code)}</h2>
              <div style="font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.3; font-family: 'Noto Sans Thai', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; margin: 0 auto;">${escapeHtml(light.name)}</div>
              <div style="font-size: 9px; color: #64748b; margin-top: 2px; font-family: 'Noto Sans Thai', sans-serif;">เขตการดูแล: ${escapeHtml(light.zone || 'ไม่ระบุ')}</div>
            </div>
          </div>
        `;

        pageDiv.appendChild(card);
      }
    });

    printArea.appendChild(pageDiv);

    chunk.forEach(id => {
      const light = allLights.find(l => l.id === id);
      if (light) {
        const citizenUrl = getCitizenUrl(light.id);
        new QRCode(document.getElementById(`bulk-qr-${light.id}`), {
          text: citizenUrl,
          width: 150,
          height: 150,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    });
  }

  setTimeout(() => { window.print(); }, 500);
}

// ==========================================
// 9. Monthly Statistics & Detail Summary
// ==========================================
function updateMonthlyStats() {
  const monthSelect = document.getElementById('filterMonth');
  const yearSelect = document.getElementById('filterYear');
  if (!monthSelect || !yearSelect) return;

  const month = parseInt(monthSelect.value);
  const year = parseInt(yearSelect.value);

  const monthlyReports = allReports.filter(report => {
    if (!report.timestamp) return false;
    let date;
    if (report.timestamp.seconds) {
      date = new Date(report.timestamp.seconds * 1000);
    } else {
      date = new Date(report.timestamp);
    }
    return date.getMonth() === month && date.getFullYear() === year;
  });

  const totalCount = monthlyReports.length;
  const resolvedCount = monthlyReports.filter(r => r.status === 'resolved').length;

  document.getElementById('monthlyTotalCount').innerText = totalCount;
  document.getElementById('monthlyResolvedCount').innerText = resolvedCount;
}

function showMonthlyReportsDetail() {
  const monthSelect = document.getElementById('filterMonth');
  const yearSelect = document.getElementById('filterYear');
  if (!monthSelect || !yearSelect) return;

  const monthName = monthSelect.options[monthSelect.selectedIndex].text;
  const yearVal = yearSelect.value;

  const month = parseInt(monthSelect.value);
  const year = parseInt(yearVal);

  const monthlyReports = allReports.filter(report => {
    if (!report.timestamp) return false;
    let date;
    if (report.timestamp.seconds) {
      date = new Date(report.timestamp.seconds * 1000);
    } else {
      date = new Date(report.timestamp);
    }
    return date.getMonth() === month && date.getFullYear() === year;
  });

  if (monthlyReports.length === 0) {
    Swal.fire({
      title: `รายงานประจำเดือน ${monthName} ${parseInt(yearVal) + 543}`,
      text: 'ไม่มีรายการแจ้งซ่อมหรือการดำเนินงานในเดือนนี้',
      icon: 'info',
      confirmButtonText: 'ตกลง',
      background: '#ffffff',
      color: 'var(--text-main)',
      confirmButtonColor: 'var(--accent-blue)'
    });
    return;
  }

  let reportsHtml = `
    <div style="text-align: left; max-height: 400px; overflow-y: auto; font-family: var(--font-family); font-size: 13px;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border-light); color: var(--text-main);">
            <th style="padding: 8px 4px; font-weight: 700; width: 80px;">วัน/เวลา</th>
            <th style="padding: 8px 4px; font-weight: 700;">รหัสเสาไฟ</th>
            <th style="padding: 8px 4px; font-weight: 700;">ปัญหาที่พบ</th>
            <th style="padding: 8px 4px; font-weight: 700; text-align: right; width: 90px;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
  `;

  monthlyReports.forEach(report => {
    const dateStr = formatTime(report.timestamp).replace(' น.', '');
    const statusText = report.status === 'resolved' ? 'ซ่อมเสร็จ' : report.status === 'in_progress' ? 'กำลังซ่อม' : 'รอดำเนินการ';
    const statusColor = report.status === 'resolved' ? '#16a34a' : report.status === 'in_progress' ? '#d97706' : '#dc2626';
    const statusBg = report.status === 'resolved' ? '#d1fae5' : report.status === 'in_progress' ? '#fef3c7' : '#fee2e2';

    reportsHtml += `
      <tr style="border-bottom: 1px solid var(--border-light);">
        <td style="padding: 10px 4px; color: var(--text-muted); font-size: 11px;">${dateStr}</td>
        <td style="padding: 10px 4px; font-weight: 600; color: var(--text-main);">${escapeHtml(report.lightCode)}<br><span style="font-weight: normal; font-size: 10px; color: var(--text-muted);">${escapeHtml(report.lightName)}</span></td>
        <td style="padding: 10px 4px; color: var(--text-muted); font-size: 12px;">
          <strong>${escapeHtml(report.issueType)}</strong>
          ${report.details ? `<br><span style="font-size: 11px; color: #64748b;">(${escapeHtml(report.details)})</span>` : ''}
          ${report.images && report.images.length > 0 ? `
            <div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap;">
              ${report.images.map(imgUrl => `
                <img src="${imgUrl}" alt="รูปภาพ" onclick="viewReportImage('${imgUrl}')" style="width:32px; height:32px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid #e2e8f0; transition:var(--transition-fast);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              `).join('')}
            </div>
          ` : ''}
        </td>
        <td style="padding: 10px 4px; text-align: right;">
          <span style="background: ${statusBg}; color: ${statusColor}; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; display: inline-block;">
            ${statusText}
          </span>
        </td>
      </tr>
    `;
  });

  reportsHtml += `
        </tbody>
      </table>
    </div>
  `;

  Swal.fire({
    title: `รายงานประจำเดือน ${monthName} ${parseInt(yearVal) + 543}`,
    html: reportsHtml,
    width: '600px',
    confirmButtonText: 'ปิดหน้าต่าง',
    background: '#ffffff',
    color: 'var(--text-main)',
    confirmButtonColor: 'var(--accent-blue)'
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  let date;
  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  return date.toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }) + ' น.';
}

// ==========================================
// 10. Dedicated Monthly Report Page View & Analytics
// ==========================================
const COMMUNITY_LIST = [
  "ชุมชนตลาดกลางผลไม้",
  "ชุมชนโรงเรียนแหลมทองวิทยา",
  "ชุมชนโรงเรียนเจริญศึกษา",
  "ชุมชนวงเวียนลองกอง",
  "ชุมชนโรงภาพยนตร์",
  "ชุมชนสุขาภิบาล 9",
  "ชุมชนโรงเรียนดารุสสลาม"
];

function switchDashboardView(viewMode) {
  currentDashboardView = viewMode;
  const mapViewSec = document.getElementById('mapViewSection');
  const monthlyReportSec = document.getElementById('monthlyReportSection');
  const navBtnMap = document.getElementById('navBtnMap');
  const navBtnStats = document.getElementById('navBtnStats');

  if (!mapViewSec || !monthlyReportSec) return;

  if (viewMode === 'stats') {
    mapViewSec.style.display = 'none';
    monthlyReportSec.style.display = 'flex';

    if (navBtnMap && navBtnStats) {
      navBtnMap.className = 'btn btn-secondary';
      navBtnStats.className = 'btn btn-primary';
    }

    renderMonthlyDashboard();
  } else {
    monthlyReportSec.style.display = 'none';
    mapViewSec.style.display = 'flex';

    if (navBtnMap && navBtnStats) {
      navBtnMap.className = 'btn btn-primary';
      navBtnStats.className = 'btn btn-secondary';
    }

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);
  }
}

function resetReportFilters() {
  const zoneSel = document.getElementById('reportFilterZone');
  const monthSel = document.getElementById('reportFilterMonth');
  const yearSel = document.getElementById('reportFilterYear');

  if (zoneSel) zoneSel.value = 'all';
  if (monthSel) monthSel.value = 'all';
  if (yearSel) yearSel.value = 'all';

  renderMonthlyDashboard();
}

function printMonthlyReport() {
  document.body.classList.add('print-monthly-report-mode');

  let styleEl = document.getElementById('landscape-print-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'landscape-print-style';
    styleEl.innerHTML = `@page { size: landscape; margin: 8mm 10mm; }`;
    document.head.appendChild(styleEl);
  }

  if (pieChartInstance) {
    pieChartInstance.resize();
    pieChartInstance.update();
  }
  if (barChartInstance) {
    barChartInstance.resize();
    barChartInstance.update();
  }

  setTimeout(() => {
    window.print();
  }, 250);

  const cleanup = () => {
    document.body.classList.remove('print-monthly-report-mode');
    const dynamicStyle = document.getElementById('landscape-print-style');
    if (dynamicStyle) dynamicStyle.remove();
    if (pieChartInstance) pieChartInstance.resize();
    if (barChartInstance) barChartInstance.resize();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
}

function renderMonthlyDashboard() {
  const zoneVal = document.getElementById('reportFilterZone')?.value || 'all';
  const monthVal = document.getElementById('reportFilterMonth')?.value || 'all';
  const yearVal = document.getElementById('reportFilterYear')?.value || 'all';

  // 0. Update Filter Summary Text for Print Header
  const summaryEl = document.getElementById('reportFilterSummaryText');
  if (summaryEl) {
    const zoneText = zoneVal === 'all' ? 'ทุกชุมชน (7 ชุมชน)' : zoneVal;
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const monthText = monthVal === 'all' ? 'ทุกเดือน' : `เดือน${months[parseInt(monthVal)]}`;
    const yearText = yearVal === 'all' ? 'ทุกปี' : `ปี ${parseInt(yearVal)}`;
    const todayStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    summaryEl.innerText = `ข้อมูลตัวกรอง: ${zoneText} | ${monthText} | ${yearText} (พิมพ์เมื่อ: ${todayStr})`;
  }

  // 1. Filter lights
  let filteredLights = allLights;
  if (zoneVal !== 'all') {
    filteredLights = allLights.filter(l => l.zone === zoneVal);
  }

  // 2. Filter reports
  let filteredReports = allReports.filter(report => {
    // Zone filter
    if (zoneVal !== 'all') {
      const light = allLights.find(l => l.id === report.lightId || l.code === report.lightCode);
      const repZone = report.zone || (light ? light.zone : '');
      if (repZone !== zoneVal) return false;
    }

    // Month & Year filter
    if (report.timestamp) {
      let date;
      if (report.timestamp.seconds) {
        date = new Date(report.timestamp.seconds * 1000);
      } else {
        date = new Date(report.timestamp);
      }

      if (monthVal !== 'all' && date.getMonth() !== parseInt(monthVal)) {
        return false;
      }
      if (yearVal !== 'all' && date.getFullYear() !== parseInt(yearVal)) {
        return false;
      }
    }
    return true;
  });

  // 3. Update KPI Cards & Subtexts
  const totalLightsEl = document.getElementById('kpiTotalLights');
  const totalLightsSubEl = document.getElementById('kpiTotalLightsSub');
  const repairRateEl = document.getElementById('kpiRepairRate');
  const repairRateSubEl = document.getElementById('kpiRepairRateSub');
  const topZoneEl = document.getElementById('kpiTopZone');
  const topZoneSubEl = document.getElementById('kpiTopZoneSub');
  const topSymptomEl = document.getElementById('kpiTopSymptom');
  const topSymptomSubEl = document.getElementById('kpiTopSymptomSub');

  // KPI 1: Total Lights (Working vs Broken)
  const workingLightsCount = filteredLights.filter(l => l.status === 'working').length;
  const brokenLightsCount = filteredLights.filter(l => l.status === 'broken' || l.status === 'pending').length;
  if (totalLightsEl) totalLightsEl.innerText = `${filteredLights.length} ดวง`;
  if (totalLightsSubEl) totalLightsSubEl.innerText = `ปกติ ${workingLightsCount} | ชำรุด/ดับ ${brokenLightsCount} ดวง`;

  // KPI 2: Repair Rate (Resolved vs Total Reports)
  const totalRep = filteredReports.length;
  const resolvedRep = filteredReports.filter(r => r.status === 'resolved').length;
  if (repairRateEl) {
    if (totalRep === 0) {
      repairRateEl.innerText = '100%';
    } else {
      const rate = Math.round((resolvedRep / totalRep) * 100);
      repairRateEl.innerText = `${rate}%`;
    }
  }
  if (repairRateSubEl) {
    repairRateSubEl.innerText = `ซ่อมเสร็จ ${resolvedRep} จาก ${totalRep} รายการ`;
  }

  // KPI 3: Top Zone (Highest Reported Community) - Font Auto-size for fitting box
  if (topZoneEl) {
    const zoneCounts = {};
    filteredReports.forEach(r => {
      const light = allLights.find(l => l.id === r.lightId || l.code === r.lightCode);
      const z = r.zone || (light ? light.zone : 'ไม่ระบุ');
      zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    });

    let maxZone = '-';
    let maxZCount = 0;
    Object.keys(zoneCounts).forEach(z => {
      if (zoneCounts[z] > maxZCount) {
        maxZCount = zoneCounts[z];
        maxZone = z;
      }
    });

    if (maxZCount > 0) {
      topZoneEl.innerText = maxZone;
      // Adjust font size according to community name length so it fits neatly
      if (maxZone.length > 20) {
        topZoneEl.style.fontSize = '13px';
      } else if (maxZone.length > 15) {
        topZoneEl.style.fontSize = '15px';
      } else if (maxZone.length > 10) {
        topZoneEl.style.fontSize = '17px';
      } else {
        topZoneEl.style.fontSize = '22px';
      }
      if (topZoneSubEl) topZoneSubEl.innerText = `แจ้งเสียรวม ${maxZCount} รายการ`;
    } else {
      topZoneEl.innerText = '-';
      topZoneEl.style.fontSize = '24px';
      if (topZoneSubEl) topZoneSubEl.innerText = 'ไม่มีข้อมูลแจ้งเสีย';
    }
  }

  // KPI 4: Top Symptom (Highest Symptom Type) - Font Auto-size for fitting box
  if (topSymptomEl) {
    const symptomCounts = {};
    filteredReports.forEach(r => {
      const type = r.issueType || 'ไม่ระบุ';
      symptomCounts[type] = (symptomCounts[type] || 0) + 1;
    });

    let maxSym = '-';
    let maxSCount = 0;
    Object.keys(symptomCounts).forEach(sym => {
      if (symptomCounts[sym] > maxSCount) {
        maxSCount = symptomCounts[sym];
        maxSym = sym;
      }
    });

    if (maxSCount > 0) {
      topSymptomEl.innerText = maxSym;
      if (maxSym.length > 20) {
        topSymptomEl.style.fontSize = '13px';
      } else if (maxSym.length > 15) {
        topSymptomEl.style.fontSize = '15px';
      } else if (maxSym.length > 10) {
        topSymptomEl.style.fontSize = '17px';
      } else {
        topSymptomEl.style.fontSize = '22px';
      }
      if (topSymptomSubEl) topSymptomSubEl.innerText = `พบปัญหานี้ ${maxSCount} รายการ`;
    } else {
      topSymptomEl.innerText = '-';
      topSymptomEl.style.fontSize = '24px';
      if (topSymptomSubEl) topSymptomSubEl.innerText = 'ไม่มีข้อมูลแจ้งเสีย';
    }
  }

  // 4. Pie/Donut Chart
  renderPieChart(filteredReports);

  // 5. Bar Chart
  renderBarChart(filteredLights, zoneVal);

  // 6. Detailed Operations Table
  renderOperationTable(filteredReports);
}

function renderPieChart(reports) {
  const canvasEl = document.getElementById('issueTypePieChart');
  const emptyNotice = document.getElementById('pieEmptyState');

  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  if (pieChartInstance) {
    pieChartInstance.destroy();
    pieChartInstance = null;
  }

  if (!reports || reports.length === 0) {
    canvasEl.style.display = 'none';
    if (emptyNotice) emptyNotice.style.display = 'flex';
    return;
  }

  canvasEl.style.display = 'block';
  if (emptyNotice) emptyNotice.style.display = 'none';

  const countsMap = {};
  reports.forEach(r => {
    const type = r.issueType || 'อื่น ๆ';
    countsMap[type] = (countsMap[type] || 0) + 1;
  });

  const rawLabels = Object.keys(countsMap);
  const dataValues = rawLabels.map(k => countsMap[k]);
  const totalCount = reports.length;

  const displayLabels = rawLabels.map(label => {
    const count = countsMap[label];
    const pct = ((count / totalCount) * 100).toFixed(1);
    return `${label}: ${count} รายการ (${pct}%)`;
  });

  const chartColors = [
    '#dc2626', '#d97706', '#2563eb', '#0284c7', '#16a34a',
    '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1', '#14b8a6'
  ];

  const isMobile = window.innerWidth < 640;

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: displayLabels,
      datasets: [{
        data: dataValues,
        backgroundColor: chartColors.slice(0, rawLabels.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: (isMobile && !document.body.classList.contains('print-monthly-report-mode')) ? 1.1 : 1.9,
      plugins: {
        legend: {
          position: (isMobile && !document.body.classList.contains('print-monthly-report-mode')) ? 'bottom' : 'right',
          labels: {
            font: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: (isMobile && !document.body.classList.contains('print-monthly-report-mode')) ? 10 : 11 },
            padding: (isMobile && !document.body.classList.contains('print-monthly-report-mode')) ? 6 : 10,
            boxWidth: (isMobile && !document.body.classList.contains('print-monthly-report-mode')) ? 8 : 12,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = rawLabels[context.dataIndex] || '';
              const value = context.parsed || 0;
              const pct = ((value / totalCount) * 100).toFixed(1);
              return ` ${label}: ${value} รายการ (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderBarChart(lights, selectedZone) {
  const canvasEl = document.getElementById('zoneStatusBarChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  if (barChartInstance) {
    barChartInstance.destroy();
    barChartInstance = null;
  }

  const isMobile = window.innerWidth < 640;

  const workingData = [];
  const pendingData = [];
  const brokenData = [];

  COMMUNITY_LIST.forEach(community => {
    const communityLights = lights.filter(l => l.zone === community);
    workingData.push(communityLights.filter(l => l.status === 'working').length);
    pendingData.push(communityLights.filter(l => l.status === 'pending').length);
    brokenData.push(communityLights.filter(l => l.status === 'broken').length);
  });

  // Custom Plugin แสดงตัวเลขกำกับด้านในของกราฟแท่งแบบซ้อน (Stacked Bar Chart)
  const barValuePlugin = {
    id: 'barValuePlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 ${isMobile ? '8px' : '10px'} 'Google Sans', 'Noto Sans Thai', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        meta.data.forEach((bar, index) => {
          const val = dataset.data[index];
          if (val !== undefined && val !== null && val > 0) {
            // คำนวณจุดกึ่งกลางแนวตั้งของแต่ละเซกเมนต์แท่งที่ซ้อนกัน
            const centerY = (bar.y + bar.base) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(val, bar.x, centerY);
          }
        });
      });
      ctx.restore();
    }
  };

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: COMMUNITY_LIST.map(c => c.replace('ชุมชน', '')),
      datasets: [
        {
          label: 'ใช้งานปกติ',
          data: workingData,
          backgroundColor: '#16a34a',
          borderRadius: 4
        },
        {
          label: 'กำลังซ่อมแซม',
          data: pendingData,
          backgroundColor: '#d97706',
          borderRadius: 4
        },
        {
          label: 'ไฟดับ/ชำรุด',
          data: brokenData,
          backgroundColor: '#dc2626',
          borderRadius: 4
        }
      ]
    },
    plugins: [barValuePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: {
            autoSkip: false,
            font: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: isMobile ? 8 : 10 },
            maxRotation: isMobile ? 45 : 30,
            minRotation: isMobile ? 35 : 30
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          stacked: true,
          ticks: {
            stepSize: 1,
            font: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: isMobile ? 9 : 11 }
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: isMobile ? 10 : 12 },
            padding: isMobile ? 6 : 10,
            boxWidth: isMobile ? 8 : 12,
            usePointStyle: true
          }
        },
        tooltip: {
          titleFont: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: isMobile ? 11 : 13 },
          bodyFont: { family: "'Google Sans', 'Noto Sans Thai', sans-serif", size: isMobile ? 10 : 12 }
        }
      }
    }
  });
}

function renderOperationTable(reports) {
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 8px; color: #cbd5e1;"></i><br>
          ไม่พบข้อมูลรายการดำเนินงานตามตัวกรองที่เลือก
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  reports.forEach((report, index) => {
    const light = allLights.find(l => l.id === report.lightId || l.code === report.lightCode);
    const zoneName = report.zone || (light ? light.zone : 'ไม่ระบุ');
    const timeFormatted = formatTime(report.timestamp);

    let statusBadge = '';
    if (report.status === 'resolved') {
      statusBadge = '<span class="badge badge-working" style="padding: 4px 10px; font-size: 11px;">ซ่อมเสร็จสิ้น</span>';
    } else if (report.status === 'in_progress') {
      statusBadge = '<span class="badge badge-pending" style="padding: 4px 10px; font-size: 11px;">กำลังซ่อม</span>';
    } else {
      statusBadge = '<span class="badge badge-broken" style="padding: 4px 10px; font-size: 11px;">รอดำเนินการ</span>';
    }

    let imagesHtml = '-';
    if (report.images && report.images.length > 0) {
      imagesHtml = `
        <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
          ${report.images.map((imgUrl, i) => `
            <img src="${imgUrl}" alt="รูปภาพ ${i + 1}" onclick="viewReportImage('${imgUrl}')" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-light); cursor: pointer;">
          `).join('')}
        </div>
      `;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${index + 1}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${timeFormatted}</td>
      <td>
        <strong style="color: var(--accent-cyan); font-size: 14px;">${escapeHtml(report.lightCode)}</strong>
        <br><span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(report.lightName || '-')}</span>
      </td>
      <td><span style="font-weight: 500;">${escapeHtml(zoneName)}</span></td>
      <td>
        <strong>${escapeHtml(report.issueType)}</strong>
        ${report.details ? `<br><span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(report.details)}</span>` : ''}
        ${report.reporterPhone ? `<br><span style="font-size: 11px; color: var(--accent-cyan);"><i class="fa-solid fa-phone"></i> ${escapeHtml(report.reporterPhone)}</span>` : ''}
      </td>
      <td style="text-align: center;">${imagesHtml}</td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="locateLightAndSwitchView('${report.lightId}')" style="padding: 4px 8px; font-size: 11px;" title="ชี้บนแผนที่">
            <i class="fa-solid fa-location-crosshairs"></i> แผนที่
          </button>
          ${report.status === 'pending' ? `
            <button class="btn btn-primary" onclick="updateReportStatus('${report.id}', '${report.lightId}', 'in_progress')" style="padding: 4px 8px; font-size: 11px;" title="รับเรื่องซ่อม">
              <i class="fa-solid fa-wrench"></i> รับซ่อม
            </button>
          ` : ''}
          ${report.status === 'in_progress' ? `
            <button class="btn btn-primary" onclick="updateReportStatus('${report.id}', '${report.lightId}', 'resolved')" style="padding: 4px 8px; font-size: 11px; background: var(--color-success);" title="เสร็จสิ้น">
              <i class="fa-solid fa-check"></i> เสร็จสิ้น
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function locateLightAndSwitchView(lightId) {
  switchDashboardView('map');
  setTimeout(() => {
    locateLight(lightId);
  }, 300);
}
