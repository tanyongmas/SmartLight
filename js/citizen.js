/**
 * Citizen App Script (index.html)
 * ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ - เทศบาลตำบลตันหยงมัส (ส่วนประชาชน)
 */

let userLineProfile = null;
let db;
let isDemoMode = false;
let map;
let markersGroup;
let allLights = [];
let selectedImages = [];
let isUrlParamsChecked = false;

// ==========================================
// 1. การเริ่มต้นระบบ (Initialization)
// ==========================================
function startCitizenApp() {
  // ซ่อนหน้าจอโหลดดิงทันทีเพื่อป้องกันการหมุนค้าง
  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.opacity = 0;
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }

  initFirebase();
  initMap();
  loadLights();
  initLiff();
  initImageUploadListener();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startCitizenApp);
} else {
  startCitizenApp();
}

// ==========================================
// 2. LINE Messaging API Notifications
// ==========================================

// ส่งการแจ้งเตือนเจ้าหน้าที่ผ่าน LINE Messaging API
function sendLineStaffNotification(reportData) {
  if (lineConfig.backendNewReportApiUrl) {
    // การส่งแจ้งเตือนเจ้าหน้าที่ถูกรวมใน Cloud Function backendNewReportApiUrl เรียบร้อยแล้ว
    return;
  }
  if (!lineConfig.staffAccessToken || lineConfig.staffAccessToken === "YOUR_LINE_CHANNEL_ACCESS_TOKEN") {
    console.warn("LINE Messaging API Channel Access Token is missing. Skipping notification.");
    return;
  }

  // สร้าง Link สำหรับ Dashboard
  const currentUrl = window.location.href;
  let dashboardUrl = "https://tanyongmas.github.io/SmartLight";
  if (currentUrl.startsWith("http")) {
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
    dashboardUrl = `${baseUrl}/dashboard.html`;
  }

  const staffTimeStr = new Date().toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }) + ' น.';

  const lat = reportData.lat || (reportData.latitude ? reportData.latitude : null);
  const lng = reportData.lng || (reportData.longitude ? reportData.longitude : null);

  let navUrl;
  if (lat && lng) {
    navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  } else {
    navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(reportData.lightName || "เสาไฟ") + " เทศบาลตำบลตันหยงมัส")}`;
  }

  const reportIdStr = reportData.id || reportData.reportId || "";
  const officerUpdateUrl = reportIdStr ? `${dashboardUrl}?reportId=${reportIdStr}` : dashboardUrl;
  const acceptUrl = reportIdStr ? `${dashboardUrl}?reportId=${reportIdStr}&action=in_progress` : dashboardUrl;
  const completeUrl = reportIdStr ? `${dashboardUrl}?reportId=${reportIdStr}&action=resolved` : dashboardUrl;

  const staffBodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 },
        { type: "text", text: String(reportData.lightCode || "-"), weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }
      ]
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "อาการเสีย:", size: "xs", color: "#64748b", flex: 3 },
        { type: "text", text: String(reportData.issueType || "-"), weight: "bold", size: "xs", color: "#ef4444", flex: 5 }
      ]
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 },
        { type: "text", text: String(reportData.lightName || "-"), size: "xs", color: "#334155", wrap: true, flex: 5 }
      ]
    }
  ];

  if (lat && lng) {
    staffBodyContents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "พิกัด GPS:", size: "xs", color: "#64748b", flex: 3 },
        { type: "text", text: `${lat}, ${lng}`, size: "xs", color: "#0284c7", weight: "bold", flex: 5 }
      ]
    });
  }

  staffBodyContents.push(
    { type: "separator", color: "#f1f5f9", margin: "xs" },
    {
      type: "box",
      layout: "vertical",
      spacing: "none",
      margin: "xs",
      contents: [
        { type: "text", text: "📝 รายละเอียดเพิ่มเติม:", size: "xs", color: "#64748b", weight: "bold" },
        { type: "text", text: String(reportData.details || "ไม่มีรายละเอียดเพิ่มเติม"), size: "xs", color: "#475569", wrap: true, margin: "xs" }
      ]
    },
    { type: "separator", color: "#f1f5f9", margin: "xs" },
    {
      type: "box",
      layout: "vertical",
      spacing: "none",
      margin: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "👤 ผู้แจ้งเรื่อง:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: String(reportData.lineDisplayName || "ประชาชนผู้แจ้ง"), size: "xs", color: "#334155", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "📞 เบอร์ติดต่อ:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: String(reportData.reporterPhone || "ไม่ได้ระบุ"), size: "xs", color: "#0f172a", weight: "bold", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "🕒 เวลาที่แจ้ง:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: staffTimeStr || "-", size: "xs", color: "#0f172a", flex: 5 }
          ]
        }
      ]
    }
  );

  const flexMessage = {
    type: "bubble",
    styles: {
      header: { backgroundColor: "#8c0a13" },
      body: { backgroundColor: "#ffffff" },
      footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
    },
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        { type: "text", text: "📢 แจ้งซ่อมใหม่ (เจ้าหน้าที่)", color: "#fca5a5", size: "xs", weight: "bold" },
        { type: "text", text: "🚨 มีรายการแจ้งซ่อมใหม่!", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
        { type: "text", text: "ระบบไฟถนนอัจฉริยะ เทศบาลตำบลตันหยงมัส", color: "#e8e8e8", size: "xs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      spacing: "xs",
      contents: staffBodyContents
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "sm",
      spacing: "xs",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#0284c7",
          height: "sm",
          action: { type: "uri", label: "🗺️ นำทาง", uri: navUrl }
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#d97706",
              height: "sm",
              action: { type: "uri", label: "🛠️ รับเรื่องซ่อม", uri: acceptUrl }
            },
            {
              type: "button",
              style: "primary",
              color: "#16a34a",
              height: "sm",
              action: { type: "uri", label: "✅ ซ่อมเสร็จสิ้น", uri: completeUrl }
            }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#16a34a",
          height: "sm",
          action: { type: "uri", label: "📋 อัปเดตสถานะผ่าน Dashboard", uri: officerUpdateUrl }
        }
      ]
    }
  };

  const payload = {
    messages: [
      {
        type: "flex",
        altText: `🚨 แจ้งซ่อมใหม่: ${reportData.lightCode}`,
        contents: flexMessage
      }
    ]
  };

  if (reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith('http')) {
    flexMessage.hero = {
      type: "image",
      url: reportData.images[0],
      size: "full",
      aspectRatio: "20:11",
      aspectMode: "cover",
      action: { type: "uri", uri: reportData.images[0] }
    };
  }

  const url = "https://api.line.me/v2/bot/message/broadcast";
  const requestUrl = lineConfig.useCorsProxy ? (lineConfig.corsProxyUrl + url) : url;

  fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + lineConfig.staffAccessToken
    },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) throw new Error("HTTP status " + response.status);
      return response.json();
    })
    .then(data => console.log("LINE Broadcast Flex Notification sent successfully:", data))
    .catch(err => console.error("Error sending LINE broadcast flex notification:", err));
}

// ส่งข้อความ Flex Message แจ้งประชาชนว่า "ได้รับข้อมูลเรียบร้อย"
function sendLineCitizenSubmitNotification(reportData) {
  if (lineConfig.backendNewReportApiUrl) {
    fetch(lineConfig.backendNewReportApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportData })
    })
      .then(res => res.json())
      .then(data => console.log("New report notification sent via backend Cloud Function:", data))
      .catch(err => console.error("Error calling backend new report API:", err));
    return;
  }

  const targetUserId = reportData.lineUserId;
  if (!targetUserId || targetUserId.startsWith("MOCK_")) {
    console.log("No real lineUserId or mock user. Skipping citizen notification.");
    return;
  }

  const citizenUrl = "https://liff.line.me/2010313933-7q4q3WSR?page=track";

  const citizenTimeStr = new Date().toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }) + ' น.';

  const flexMessage = {
    type: "bubble",
    styles: {
      header: { backgroundColor: "#dc2626" },
      body: { backgroundColor: "#ffffff" },
      footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
    },
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        { type: "text", text: "📌 ขั้นตอนที่ 1/3", color: "#fecaca", size: "xs", weight: "bold" },
        { type: "text", text: "🚨 ส่งข้อมูลแจ้งซ่อมสำเร็จ", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
        { type: "text", text: "👉 อยู่ในขั้นตอนนี้ (ได้รับเรื่องแล้ว)", color: "#ffffff", size: "xs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: String(reportData.lightCode || "-"), weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "อาการเสีย:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: String(reportData.issueType || "-"), weight: "bold", size: "xs", color: "#ef4444", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 },
            { type: "text", text: String(reportData.lightName || "-"), size: "xs", color: "#334155", wrap: true, flex: 5 }
          ]
        },
        { type: "separator", color: "#f1f5f9", margin: "xs" },
        {
          type: "box",
          layout: "vertical",
          spacing: "none",
          margin: "xs",
          contents: [
            { type: "text", text: "🕒 เวลาที่รับเรื่อง:", size: "xs", color: "#64748b", weight: "bold" },
            { type: "text", text: citizenTimeStr || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
            { type: "text", text: "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบ", size: "xs", color: "#475569", wrap: true, margin: "xs" }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          color: "#dc2626",
          action: { type: "uri", label: "🔍 ติดตามสถานะการซ่อม", uri: citizenUrl }
        }
      ]
    }
  };

  if (reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith('http')) {
    flexMessage.hero = {
      type: "image",
      url: reportData.images[0],
      size: "full",
      aspectRatio: "20:11",
      aspectMode: "cover",
      action: { type: "uri", uri: reportData.images[0] }
    };
  }

  const payload = {
    to: targetUserId,
    messages: [
      {
        type: "flex",
        altText: `✅ ส่งข้อมูลแจ้งซ่อมสำเร็จ: ${reportData.lightCode}`,
        contents: flexMessage
      }
    ]
  };

  if (reportData.images && reportData.images.length > 0 && reportData.images[0].startsWith('http')) {
    flexMessage.hero = {
      type: "image",
      url: reportData.images[0],
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
      action: { type: "uri", uri: reportData.images[0] }
    };
  }

  const url = "https://api.line.me/v2/bot/message/push";
  const requestUrl = lineConfig.useCorsProxy ? (lineConfig.corsProxyUrl + url) : url;

  fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + lineConfig.citizenAccessToken
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
    .then(data => console.log("LINE push notification sent to citizen upon submission:", data))
    .catch(err => console.error("Error sending LINE notification to citizen upon submission:", err));
}

// แสดงคำแนะนำการใช้งานป๊อปอัป SweetAlert2
function showHelpPopup() {
  Swal.fire({
    title: 'ขั้นตอนการแจ้งซ่อมไฟฟ้า',
    html: `
      <div style="text-align: left; font-family: 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #0f172a;">
        <p style="margin-bottom: 12px; font-weight: 600; color: #0f172a;">ท่านสามารถแจ้งปัญหาไฟฟ้าชำรุดในเขตเทศบาลได้ง่ายๆ ตามขั้นตอนดังนี้:</p>
        <ol style="padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: #334155;">
          <li><strong>สแกน QR Code</strong> ที่แปะอยู่บนเสาไฟ หรือมองหาหมุดเสาไฟบนแผนที่</li>
          <li>คลิกที่สัญลักษณ์หมุดเสาไฟจุดที่ต้องการแจ้งเสีย</li>
          <li>กดปุ่ม <strong>"คลิกเพื่อแจ้งเสีย/ชำรุด"</strong></li>
          <li>เลือกประเภทปัญหา กรอกรายละเอียดเพิ่มเติม และกดปุ่ม <strong>"ส่งข้อมูลแจ้งซ่อม"</strong></li>
        </ol>
        <p style="margin-top: 14px; font-size: 12px; color: #64748b; text-align: center;">🙏 ขอขอบพระคุณที่ร่วมแจ้งข้อมูลดูแลท้องถิ่นของเรา</p>
      </div>
    `,
    icon: 'info',
    confirmButtonText: 'ตกลง, ทราบแล้ว',
    confirmButtonColor: '#0284c7',
    background: '#ffffff',
    color: '#0f172a'
  });
}

// ==========================================
// 3. LINE LIFF & Friendship Check Systems
// ==========================================
function updateFriendshipUI(isFriend) {
  const container = document.getElementById('friendshipStatusContainer');
  if (!container) return;

  if (isFriend === true) {
    container.innerHTML = `
      <div class="friendship-status-badge badge-friend">
        <i class="fa-solid fa-user-check"></i> เป็นเพื่อนแล้ว
      </div>
    `;
  } else if (isFriend === false) {
    container.innerHTML = `
      <div class="friendship-status-badge badge-unfriend">
        <i class="fa-solid fa-user-plus"></i> ยังไม่ได้เพิ่มเพื่อน
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="friendship-status-badge badge-guest">
        <i class="fa-solid fa-globe"></i> เว็บเบราว์เซอร์
      </div>
    `;
  }
}

function initLiff() {
  if (typeof liff === 'undefined') {
    console.warn("LINE LIFF SDK is not loaded.");
    updateFriendshipUI(null);
    return;
  }
  liff.init({ liffId: liffConfig.liffId })
    .then(() => {
      if (liff.isLoggedIn()) {
        loadUserReports();
        checkUrlParams();
        checkFriendshipStatus();

        liff.getProfile().then(profile => {
          userLineProfile = profile;
          console.log("LINE Profile loaded:", profile);
          loadUserReports();
        }).catch(err => {
          console.error("Error getting profile:", err);
        });
      } else {
        const isLocalFile = window.location.protocol === 'file:';
        const isLocalHost = window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.startsWith('192.168.') ||
          window.location.hostname.startsWith('10.') ||
          window.location.hostname.startsWith('172.') ||
          /^[0-9.]+$/.test(window.location.hostname) ||
          window.location.hostname === '';

        const showAddFriendFirstAndLogin = () => {
          Swal.fire({
            title: '<span style="font-size: 20px; font-weight: 700; color: #d97706; font-family: var(--font-family);">💡 จำเป็นต้องเพิ่มเพื่อน</span>',
            html: `
              <div style="text-align: left; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                <p style="margin-bottom: 12px; font-weight: 500; font-size: 15px; color: #0f172a; text-align: center;">
                  บัญชี LINE ของท่านยังไม่ได้เป็นเพื่อนกับ LINE OA
                </p>
                <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 12px; border-radius: 8px; margin-bottom: 14px;">
                  <strong style="color: #0369a1; display: block; margin-bottom: 4px;">ประโยชน์ของการเพิ่มเพื่อน:</strong>
                  <ul style="margin: 0; padding-left: 18px; color: #334155; font-size: 13px; display: flex; flex-direction: column; gap: 4px;">
                    <li>รับการแจ้งเตือนความคืบหน้าเมื่อได้รับการแก้ไข</li>
                    <li>ดูประวัติการแจ้งซ่อมของตนเองได้ตลอดเวลา</li>
                    <li>สื่อสารกับเจ้าหน้าที่ผ่านห้องแชทได้โดยตรง</li>
                  </ul>
                </div>
                <p style="font-size: 13px; color: #475569; margin-bottom: 4px; text-align: center;">
                  กรุณากดเพิ่มเพื่อนกับ <strong>แจ้งซ่อมไฟ_ประชาชน (@086kdhvh)</strong>
                </p>
              </div>
            `,
            icon: 'warning',
            showCancelButton: false,
            confirmButtonText: '<i class="fa-brands fa-line" style="margin-right: 6px;"></i>เพิ่มเพื่อนทันที',
            allowOutsideClick: false,
            allowEscapeKey: false,
            background: '#ffffff',
            color: '#0f172a',
            confirmButtonColor: '#16a34a'
          }).then((result) => {
            if (result.isConfirmed) {
              liff.openWindow({
                url: 'https://line.me/R/ti/p/%40086kdhvh',
                external: true
              });
              Swal.fire({
                title: '<span style="font-size: 20px; font-weight: 700; color: #0284c7; font-family: var(--font-family);">🔑 อนุญาตสิทธิ์การใช้งาน</span>',
                html: `
                  <div style="text-align: center; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155; padding: 6px 0;">
                    <p style="margin-bottom: 8px; font-weight: 500; color: #0f172a;">เมื่อกดเพิ่มเพื่อนในแอป LINE สำเร็จแล้ว</p>
                    <p style="font-size: 13px; color: #475569;">กรุณากดปุ่มด้านล่างเพื่ออนุญาตสิทธิ์เข้าใช้งานระบบ</p>
                  </div>
                `,
                icon: 'info',
                showCancelButton: false,
                confirmButtonText: '🔑 อนุญาตสิทธิ์และเข้าใช้งาน',
                allowOutsideClick: false,
                allowEscapeKey: false,
                background: '#ffffff',
                color: '#0f172a',
                confirmButtonColor: '#0284c7'
              }).then(() => {
                liff.login();
              });
            }
          });
        };

        if (liff.isInClient() || (!isLocalFile && !isLocalHost)) {
          showAddFriendFirstAndLogin();
        } else {
          console.log("Local testing detected. Skipping auto-login redirect.");
          const mockFriendParam = getQueryParam('mockFriend');
          if (mockFriendParam !== null) {
            userLineProfile = {
              userId: "MOCK_LINE_USER_123",
              displayName: "ผู้ใช้จำลอง (Demo User)"
            };
            loadUserReports();
            checkUrlParams();

            if (mockFriendParam === 'true') {
              updateFriendshipUI(true);
              Swal.fire({
                title: '<span style="font-size: 20px; font-weight: 700; color: #16a34a; font-family: var(--font-family);">🎉 เชื่อมต่อสำเร็จ</span>',
                html: `
                  <div style="text-align: center; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                    <p style="font-weight: 500; color: #0f172a; margin-bottom: 4px;">บัญชี LINE ของท่านเชื่อมต่อเรียบร้อยแล้ว</p>
                    <p style="font-size: 12px; color: #475569;">ยินดีต้อนรับเข้าสู่ระบบแจ้งซ่อมไฟสาธารณะ เทศบาลตำบลตันหยงมัส</p>
                  </div>
                `,
                icon: 'success',
                timer: 2200,
                showConfirmButton: false,
                background: '#ffffff',
                color: '#0f172a'
              });
            } else {
              updateFriendshipUI(false);
              showAddFriendFirstAndLogin();
            }
          } else {
            loadUserReports();
            checkUrlParams();
            updateFriendshipUI(null);
          }
        }
      }
    })
    .catch(err => {
      console.error("LIFF Initialization failed:", err);
      loadUserReports();
      checkUrlParams();
      updateFriendshipUI(null);
      Swal.fire({
        title: '<span style="font-size: 18px; font-weight: 700; color: #dc2626; font-family: var(--font-family);">ระบบไม่สามารถเริ่มต้นไลน์ LIFF ได้</span>',
        text: 'รายละเอียดความผิดพลาด: ' + err.toString(),
        icon: 'error',
        confirmButtonText: 'ตกลง',
        background: '#ffffff',
        color: '#0f172a',
        confirmButtonColor: '#dc2626'
      });
    });
}

function checkFriendshipStatus() {
  if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
    liff.getFriendship()
      .then(data => {
        console.log("LINE Friendship Status:", data);
        if (!data.friendFlag) {
          updateFriendshipUI(false);
          Swal.fire({
            title: '<span style="font-size: 20px; font-weight: 700; color: #d97706; font-family: var(--font-family);">💡 จำเป็นต้องเพิ่มเพื่อน</span>',
            html: `
              <div style="text-align: left; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                <p style="margin-bottom: 12px; font-weight: 500; font-size: 15px; color: #0f172a; text-align: center;">
                  บัญชี LINE ของท่านยังไม่ได้เป็นเพื่อนกับ LINE OA
                </p>
                <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 12px; border-radius: 8px; margin-bottom: 14px;">
                  <strong style="color: #0369a1; display: block; margin-bottom: 4px;">ประโยชน์ของการเพิ่มเพื่อน:</strong>
                  <ul style="margin: 0; padding-left: 18px; color: #334155; font-size: 13px; display: flex; flex-direction: column; gap: 4px;">
                    <li>รับการแจ้งเตือนความคืบหน้าเมื่อได้รับการแก้ไข</li>
                    <li>ดูประวัติการแจ้งซ่อมของตนเองได้ตลอดเวลา</li>
                    <li>สื่อสารกับเจ้าหน้าที่ผ่านห้องแชทได้โดยตรง</li>
                  </ul>
                </div>
                <p style="font-size: 13px; color: #475569; margin-bottom: 4px; text-align: center;">
                  กรุณากดเพิ่มเพื่อนกับ <strong>แจ้งซ่อมไฟ_ประชาชน (@086kdhvh)</strong>
                </p>
              </div>
            `,
            icon: 'warning',
            showCancelButton: false,
            confirmButtonText: '<i class="fa-brands fa-line" style="margin-right: 6px;"></i>เพิ่มเพื่อนทันที',
            allowOutsideClick: false,
            allowEscapeKey: false,
            background: '#ffffff',
            color: '#0f172a',
            confirmButtonColor: '#16a34a'
          }).then((result) => {
            if (result.isConfirmed) {
              liff.openWindow({
                url: 'https://line.me/R/ti/p/%40086kdhvh',
                external: true
              });
              Swal.fire({
                title: '<span style="font-size: 20px; font-weight: 700; color: #0284c7; font-family: var(--font-family);">🔄 รอตรวจสอบการเพิ่มเพื่อน</span>',
                html: `
                  <div style="text-align: center; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155; padding: 6px 0;">
                    <p style="margin-bottom: 8px; font-weight: 500; color: #0f172a;">เมื่อกดเพิ่มเพื่อนเรียบร้อยแล้ว</p>
                    <p style="font-size: 13px; color: #475569;">กรุณากดปุ่มด้านล่างเพื่อตรวจสอบสถานะการเป็นเพื่อนอีกครั้ง</p>
                  </div>
                `,
                icon: 'info',
                showCancelButton: false,
                confirmButtonText: '🔄 ตรวจสอบสถานะการเป็นเพื่อน',
                allowOutsideClick: false,
                allowEscapeKey: false,
                background: '#ffffff',
                color: '#0f172a',
                confirmButtonColor: '#0284c7'
              }).then(() => {
                location.reload();
              });
            }
          });
        } else {
          updateFriendshipUI(true);
          Swal.fire({
            title: '<span style="font-size: 20px; font-weight: 700; color: #16a34a; font-family: var(--font-family);">🎉 เชื่อมต่อสำเร็จ</span>',
            html: `
              <div style="text-align: center; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                <p style="font-weight: 500; color: #0f172a; margin-bottom: 4px;">บัญชี LINE ของท่านเชื่อมต่อเรียบร้อยแล้ว</p>
                <p style="font-size: 12px; color: #475569;">ยินดีต้อนรับเข้าสู่ระบบแจ้งซ่อมไฟสาธารณะ เทศบาลตำบลตันหยงมัส</p>
              </div>
            `,
            icon: 'success',
            timer: 2200,
            showConfirmButton: false,
            background: '#ffffff',
            color: '#0f172a'
          });
        }
      })
      .catch(err => {
        console.error("Error checking friendship status:", err);
        updateFriendshipUI(null);
        const errStr = err.toString();
        if (errStr.includes("There is no login bot linked to this channel") || errStr.includes("login bot")) {
          Swal.fire({
            title: '<span style="font-size: 18px; font-weight: 700; color: #dc2626; font-family: var(--font-family);">ยังไม่ได้เชื่อมโยง LINE Login กับ LINE OA</span>',
            html: `
              <div style="text-align: left; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                <p style="color: #dc2626; font-weight: bold; margin-bottom: 12px;">⚠️ พบข้อผิดพลาดการเชื่อมต่อช่องทางไลน์ (สำหรับผู้พัฒนาระบบ):</p>
                <p style="margin-bottom: 8px;"><strong>รายละเอียด:</strong><br><span style="color: #475569; font-family: monospace; font-size: 12px;">${errStr}</span></p>
                <p style="margin-bottom: 12px;">สาเหตุเกิดจาก <strong>LINE Login Channel</strong> ยังไม่ได้เชื่อมโยงเข้ากับ <strong>LINE Official Account (Bot)</strong> (@086kdhvh)</p>
                <p style="font-weight: 600; color: #16a34a; margin-bottom: 6px;">วิธีแก้ไขสำหรับผู้ดูแลระบบ:</p>
                <ol style="padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: #475569; font-size: 13px;">
                  <li>เข้าสู่ระบบ <a href="https://developers.line.biz/" target="_blank" style="color: #0284c7;">LINE Developers Console</a></li>
                  <li>เลือก <strong>LINE Login Channel</strong> ที่ใช้งาน</li>
                  <li>คลิกแท็บ <strong>LINE Login settings</strong></li>
                  <li>เลื่อนลงไปที่ <strong>Linked OA</strong> (หรือ Bot link)</li>
                  <li>คลิก <strong>Edit</strong> เลือก LINE Official Account (@086kdhvh) และกด Update</li>
                </ol>
              </div>
            `,
            icon: 'error',
            confirmButtonText: 'ตกลง',
            background: '#ffffff',
            color: '#0f172a',
            confirmButtonColor: '#dc2626'
          });
        }
      });
  } else {
    updateFriendshipUI(null);
  }
}

// ==========================================
// 4. UI Switcher & User Reports Timeline
// ==========================================
function switchSidebarTab(tabName) {
  const tabReportBtn = document.getElementById('tabReportBtn');
  const tabTrackBtn = document.getElementById('tabTrackBtn');
  const reportPanel = document.getElementById('reportPanel');
  const trackPanel = document.getElementById('trackPanel');

  if (!tabReportBtn || !tabTrackBtn || !reportPanel || !trackPanel) return;

  if (tabName === 'report') {
    tabReportBtn.classList.add('active');
    tabTrackBtn.classList.remove('active');
    reportPanel.style.display = 'block';
    trackPanel.style.display = 'none';
  } else {
    tabReportBtn.classList.remove('active');
    tabTrackBtn.classList.add('active');
    reportPanel.style.display = 'none';
    trackPanel.style.display = 'block';
    loadUserReports();
  }
}

function loadUserReports() {
  const lineUserId = userLineProfile ? userLineProfile.userId : "MOCK_LINE_USER_123";
  const container = document.getElementById('userReportsList');
  if (!container) return;

  container.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 13px; margin-top: 20px;">กำลังโหลดข้อมูล...</p>';

  if (isDemoMode) {
    const localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
    const myReports = localReports.filter(r => r.lineUserId === lineUserId);
    renderMyReports(myReports);
  } else {
    db.collection('reports')
      .where('lineUserId', '==', lineUserId)
      .get()
      .then((querySnapshot) => {
        const myReports = [];
        querySnapshot.forEach((doc) => {
          myReports.push({ id: doc.id, ...doc.data() });
        });

        myReports.sort((a, b) => {
          const timeA = a.timestamp ? (a.timestamp.seconds ? a.timestamp.toDate() : new Date(a.timestamp)) : 0;
          const timeB = b.timestamp ? (b.timestamp.seconds ? b.timestamp.toDate() : new Date(b.timestamp)) : 0;
          return timeB - timeA;
        });

        renderMyReports(myReports);
      })
      .catch(err => {
        console.error("Error loading user reports:", err);
        container.innerHTML = '<p style="color: var(--color-danger); text-align: center; font-size: 12px; margin-top: 20px;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
      });
  }
}

function renderMyReports(reports) {
  const container = document.getElementById('userReportsList');
  if (!container) return;

  if (reports.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 0; color: var(--text-muted); font-size: 13px;">
        <i class="fa-solid fa-clipboard-list" style="font-size: 36px; color: var(--border-light); margin-bottom: 8px;"></i>
        <p>ยังไม่มีประวัติการแจ้งซ่อมของคุณ</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  reports.forEach(report => {
    let statusText = 'รอดำเนินการ';
    let badgeClass = 'badge-broken';
    if (report.status === 'in_progress') {
      statusText = 'กำลังซ่อม';
      badgeClass = 'badge-pending';
    } else if (report.status === 'resolved') {
      statusText = 'ซ่อมเสร็จสิ้น';
      badgeClass = 'badge-working';
    }

    let imagesHtml = '';
    if (report.images && report.images.length > 0) {
      imagesHtml = `
        <div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;">
          ${report.images.map(imgUrl => `
            <img src="${imgUrl}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-light); cursor: pointer;" onclick="viewReportImage('${imgUrl}')">
          `).join('')}
        </div>
      `;
    }

    let timelineHtml = '';
    if (report.statusHistory && report.statusHistory.length > 0) {
      const sortedHistory = [...report.statusHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      timelineHtml = `
        <div class="timeline">
          ${sortedHistory.map(hist => {
        let statusClass = 'pending';
        if (hist.status === 'in_progress') statusClass = 'in_progress';
        else if (hist.status === 'resolved') statusClass = 'resolved';

        const histTime = formatTime(hist.timestamp);

        return `
              <div class="timeline-item ${statusClass}">
                <div class="timeline-badge"></div>
                <div class="timeline-content">
                  <div class="timeline-title">${hist.label || getStatusLabel(hist.status)}</div>
                  <div class="timeline-time">${histTime}</div>
                  <div class="timeline-note">${hist.note || ''}</div>
                </div>
              </div>
            `;
      }).join('')}
        </div>
      `;
    }

    const reportCard = document.createElement('div');
    reportCard.className = 'my-report-item';
    reportCard.innerHTML = `
      <div class="my-report-header">
        <span class="my-report-code"><i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan);"></i> เสาไฟ: ${report.lightCode}</span>
        <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 8px;">${statusText}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
        <div><strong>ประเภทปัญหา:</strong> ${report.issueType}</div>
        ${report.details ? `<div><strong>เพิ่มเติม:</strong> ${report.details}</div>` : ''}
      </div>
      ${imagesHtml}
      ${timelineHtml}
    `;
    container.appendChild(reportCard);
  });
}

function getStatusLabel(status) {
  if (status === 'pending') return 'ได้รับเรื่องแล้ว';
  if (status === 'in_progress') return 'กำลังดำเนินการ';
  if (status === 'resolved') return 'ซ่อมแซมเสร็จสิ้น';
  return status;
}

function formatTime(timestampString) {
  if (!timestampString) return '';
  let date;
  if (timestampString.toDate && typeof timestampString.toDate === 'function') {
    date = timestampString.toDate();
  } else {
    date = new Date(timestampString);
  }

  return date.toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }) + ' น.';
}

function viewReportImage(imgUrl) {
  Swal.fire({
    imageUrl: imgUrl,
    imageAlt: 'รูปภาพแจ้งซ่อม',
    showConfirmButton: false,
    showCloseButton: true,
    width: 'auto',
    maxWidth: '90%',
    background: '#161c2d',
    color: '#f3f4f6'
  });
}

// ==========================================
// 5. Firebase Initialization & Map Setup
// ==========================================
function initFirebase() {
  if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
    console.warn("Firebase not configured. Entering Demo Mode.");
    isDemoMode = true;
    const banner = document.getElementById('demoBanner');
    if (banner) banner.style.display = 'block';
    initDemoData();
  } else {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch (e) {
      console.error("Firebase init failed, switching to Demo Mode", e);
      isDemoMode = true;
      const banner = document.getElementById('demoBanner');
      if (banner) banner.style.display = 'block';
      initDemoData();
    }
  }
}

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
}

function loadLights() {
  if (isDemoMode) {
    const localLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
    allLights = localLights;
    displayLightsOnMap(allLights);
    checkUrlParams();
  } else {
    db.collection('lights').onSnapshot((querySnapshot) => {
      allLights = [];
      querySnapshot.forEach((doc) => {
        allLights.push({ id: doc.id, ...doc.data() });
      });
      displayLightsOnMap(allLights);
      checkUrlParams();
    }, (error) => {
      console.error("Error loading Firestore data: ", error);
    });
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
    html: `<div style="background: #ffffff; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid ${status === 'broken' ? 'var(--color-danger)' : status === 'pending' ? 'var(--color-warning)' : 'var(--color-success)'}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)">${iconMarkup}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function displayLightsOnMap(lights) {
  markersGroup.clearLayers();
  if (lights.length === 0) return;

  const bounds = [];
  lights.forEach(light => {
    const marker = L.marker([light.lat, light.lng], { icon: getMarkerIcon(light.status) });

    const statusText = light.status === 'working' ? 'ใช้งานปกติ' : light.status === 'pending' ? 'กำลังซ่อมแซม' : 'ไฟดับ/ชำรุด';
    const badgeClass = light.status === 'working' ? 'badge-working' : light.status === 'pending' ? 'badge-pending' : 'badge-broken';

    const popupContent = `
      <div style="min-width: 240px; font-family: var(--font-family);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 14px; color: var(--text-main);"><i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan)"></i> รหัส: ${light.code}</span>
          <span class="badge ${badgeClass}" style="padding: 2px 8px; font-size: 11px;">${statusText}</span>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
          <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-main);">
            <i class="fa-solid fa-location-dot" style="color: var(--text-muted); margin-top: 3px; font-size: 13px; width: 14px;"></i>
            <div style="flex: 1; font-weight: 500;">${light.name}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted);">
            <i class="fa-solid fa-border-all" style="width: 14px;"></i>
            <div>เขตดูแล: <span style="font-weight: 600; color: var(--text-main);">${light.zone || 'ไม่ระบุ'}</span></div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="openReportPanel('${light.id}')" style="padding: 8px 12px; font-size: 12px; width: 100%; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fa-solid fa-triangle-exclamation"></i> คลิกเพื่อแจ้งเสีย/ชำรุด
        </button>
      </div>
    `;

    marker.bindPopup(popupContent);
    markersGroup.addLayer(marker);
    bounds.push([light.lat, light.lng]);
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('lightId') && bounds.length > 0) {
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}

// ==========================================
// 6. URL Parameters & QR Scan Handler
// ==========================================
function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  let val = urlParams.get(name);
  if (val) return val;

  const liffState = urlParams.get('liff.state');
  if (liffState) {
    try {
      const decodedState = decodeURIComponent(liffState);
      const qIdx = decodedState.indexOf('?');
      if (qIdx !== -1) {
        const stateParams = new URLSearchParams(decodedState.substring(qIdx + 1));
        val = stateParams.get(name);
        if (val) return val;
      }
    } catch (e) {
      console.error("Error parsing liff.state:", e);
    }
  }
  return null;
}

function checkUrlParams() {
  if (isUrlParamsChecked) return;

  const lightId = getQueryParam('lightId');
  const page = getQueryParam('page');

  if (page === 'track') {
    openSidebarWithoutLight('track');
    isUrlParamsChecked = true;
  }

  if (lightId) {
    const selectedLight = allLights.find(l => l.id === lightId);
    if (selectedLight) {
      map.setView([selectedLight.lat, selectedLight.lng], 18);
      openReportPanel(lightId);

      markersGroup.eachLayer(layer => {
        if (layer.getLatLng().lat === selectedLight.lat && layer.getLatLng().lng === selectedLight.lng) {
          layer.openPopup();
        }
      });
      isUrlParamsChecked = true;
    }
  }
}

// ==========================================
// 7. Report Panel & Form Controls
// ==========================================
function openSidebarWithoutLight(tabName = 'track') {
  document.getElementById('reportLightId').value = '';
  document.getElementById('noLightSelectedGuide').style.display = 'block';
  document.getElementById('reportFormContainer').style.display = 'none';

  switchSidebarTab(tabName);

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.style.display = 'flex';
    sidebar.classList.add('active');
  }
}

function selectIssueType(value, element) {
  const hiddenInput = document.getElementById('issueType');
  if (hiddenInput) {
    hiddenInput.value = value;
  }

  const cards = document.querySelectorAll('#issueTypeGrid .issue-card');
  cards.forEach(card => card.classList.remove('active'));

  if (element) {
    element.classList.add('active');
  }

  const errContainer = document.getElementById('issueTypeErrorMsg');
  if (errContainer) {
    errContainer.style.display = 'none';
  }
}

function resetIssueTypeSelection() {
  const hiddenInput = document.getElementById('issueType');
  if (hiddenInput) hiddenInput.value = '';
  const cards = document.querySelectorAll('#issueTypeGrid .issue-card');
  cards.forEach(card => card.classList.remove('active'));
  const errContainer = document.getElementById('issueTypeErrorMsg');
  if (errContainer) errContainer.style.display = 'none';
}

function openReportPanel(lightId) {
  const light = allLights.find(l => l.id === lightId);
  if (!light) return;

  resetIssueTypeSelection();

  document.getElementById('reportLightId').value = light.id;
  document.getElementById('infoCode').innerText = light.code;
  document.getElementById('infoName').innerText = light.name;
  document.getElementById('infoZone').innerText = light.zone || 'ไม่ได้ระบุ';

  const statusText = light.status === 'working' ? 'ใช้งานปกติ' : light.status === 'pending' ? 'กำลังซ่อมแซม' : 'ไฟดับ/ชำรุด';
  const badgeClass = light.status === 'working' ? 'badge-working' : light.status === 'pending' ? 'badge-pending' : 'badge-broken';
  document.getElementById('infoStatusBadge').innerHTML = `<span class="badge ${badgeClass}">${statusText}</span>`;

  document.getElementById('noLightSelectedGuide').style.display = 'none';
  document.getElementById('reportFormContainer').style.display = 'block';

  switchSidebarTab('report');

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.style.display = 'flex';
    sidebar.classList.add('active');
  }
}

function closeReportPanel() {
  const reportForm = document.getElementById('reportForm');
  if (reportForm) reportForm.reset();
  resetIssueTypeSelection();
  resetImageUpload();

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.style.display = 'none';
    sidebar.classList.remove('active');
  }

  const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname;
  window.history.pushState({ path: newurl }, '', newurl);
}

// ==========================================
// 8. Image Handling & Compression
// ==========================================
function initImageUploadListener() {
  const imgInput = document.getElementById('imageInput');
  if (imgInput) {
    imgInput.addEventListener('change', function (e) {
      const files = Array.from(e.target.files);

      if (selectedImages.length + files.length > 4) {
        Swal.fire({
          title: 'ข้อจำกัดการอัปโหลด',
          text: 'สามารถเลือกรูปภาพประกอบได้สูงสุดไม่เกิน 4 รูป',
          icon: 'warning',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0284c7'
        });
        this.value = '';
        return;
      }

      Swal.fire({
        title: 'กำลังประมวลผลรูปภาพ...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      let processedCount = 0;
      const totalImagesToProcess = files.filter(f => f.type.startsWith('image/')).length;

      if (totalImagesToProcess === 0) {
        Swal.close();
        this.value = '';
        return;
      }

      files.forEach(file => {
        if (!file.type.startsWith('image/')) return;

        compressImage(file, 800, 800, 0.7, (compressedBase64) => {
          selectedImages.push({
            file: file,
            dataUrl: compressedBase64
          });
          processedCount++;

          if (processedCount === totalImagesToProcess) {
            Swal.close();
            updateImagePreviews();
          }
        });
      });

      this.value = '';
    });
  }

  const reportForm = document.getElementById('reportForm');
  if (reportForm) {
    reportForm.addEventListener('submit', handleReportSubmit);
  }
}

function compressImage(file, maxWidth, maxHeight, quality, callback) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function (event) {
    const img = new Image();
    img.src = event.target.result;
    img.onload = function () {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(dataUrl);
    };
  };
}

function updateImagePreviews() {
  const previewsContainer = document.getElementById('imagePreviews');
  const uploadBtnLabel = document.getElementById('uploadBtnLabel');
  const imageCountText = document.getElementById('imageCountText');

  if (!previewsContainer || !uploadBtnLabel || !imageCountText) return;

  previewsContainer.innerHTML = '';

  selectedImages.forEach((imgObj, index) => {
    const item = document.createElement('div');
    item.className = 'image-preview-item';
    item.innerHTML = `
      <img src="${imgObj.dataUrl}" alt="Preview image">
      <button type="button" class="remove-btn" onclick="removeImage(${index})">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    previewsContainer.appendChild(item);
  });

  const count = selectedImages.length;
  imageCountText.innerText = `เลือกแล้ว ${count} / 4 รูป (แนบอย่างน้อย 1 รูป)`;

  const imgInput = document.getElementById('imageInput');
  if (count >= 4) {
    uploadBtnLabel.classList.add('disabled');
    if (imgInput) imgInput.disabled = true;
  } else {
    uploadBtnLabel.classList.remove('disabled');
    if (imgInput) imgInput.disabled = false;
  }
}

function removeImage(index) {
  selectedImages.splice(index, 1);
  updateImagePreviews();
}

function resetImageUpload() {
  selectedImages = [];
  updateImagePreviews();
}

// ==========================================
// 9. Report Submission Handler
// ==========================================
async function handleReportSubmit(e) {
  e.preventDefault();

  try {
    const lightId = document.getElementById('reportLightId').value;
    const issueType = document.getElementById('issueType').value;
    const details = document.getElementById('reportDetail').value;
    const reporterPhone = document.getElementById('reporterPhone').value;

    if (!issueType) {
      const errContainer = document.getElementById('issueTypeErrorMsg');
      if (errContainer) errContainer.style.display = 'flex';
      const grid = document.getElementById('issueTypeGrid');
      if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        grid.classList.add('shake-animation');
        setTimeout(() => grid.classList.remove('shake-animation'), 600);
      }
      Swal.fire({
        title: '<span style="font-size: 18px; font-weight: 700; color: #dc2626;">โปรดระบุประเภทปัญหา</span>',
        text: 'กรุณาคลิกเลือกประเภทปัญหาที่พบบนการ์ดไอคอน 1 ข้อก่อนส่งข้อมูล',
        icon: 'warning',
        confirmButtonText: 'ตกลง เลือกปัญหา',
        confirmButtonColor: '#0284c7'
      });
      return;
    }

    const targetLight = allLights.find(l => l.id === lightId);
    if (!targetLight) return;

    if (targetLight.status === 'broken' || targetLight.status === 'pending') {
      const statusLabel = targetLight.status === 'pending' ? 'กำลังดำเนินการซ่อมแซม' : 'ได้รับเรื่องแจ้งซ่อมแล้ว (รอดำเนินการ)';
      const badgeClass = targetLight.status === 'pending' ? 'badge-pending' : 'badge-broken';
      const statusColor = targetLight.status === 'pending' ? '#d97706' : '#dc2626';

      Swal.fire({
        title: `<span style="font-size: 20px; font-weight: 700; color: ${statusColor}; font-family: var(--font-family);">💡 แจ้งซ่อมซ้ำซ้อน</span>`,
        html: `
          <div style="text-align: left; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155; padding: 4px 0;">
            <div style="background: #f8fafc; border: 1px solid var(--border-light); padding: 14px; border-radius: 12px; margin-bottom: 14px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.01);">
              <div style="font-weight: 700; font-size: 15px; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan);"></i> รหัสเสาไฟ: ${targetLight.code}
              </div>
              <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                <i class="fa-solid fa-location-dot" style="margin-right: 4px; color: var(--text-muted);"></i> ${targetLight.name}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">สถานะปัจจุบัน:</span>
                <span class="badge ${badgeClass}" style="font-size: 11px; padding: 2px 8px;">${statusLabel}</span>
              </div>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
              <p style="margin: 0; color: #b45309; font-size: 13.5px; font-weight: 600; line-height: 1.5;">
                <i class="fa-solid fa-circle-info" style="margin-right: 6px;"></i>
                หลอดไฟนี้ (${targetLight.code}) กำลังอยู่ในขั้นตอนดำเนินการซ่อมแล้ว
              </p>
            </div>
            <p style="font-size: 13px; color: #475569; text-align: center; margin-top: 14px; margin-bottom: 0;">
              ขณะนี้ระบบได้รับเรื่องแจ้งจากพลเมืองดีท่านอื่นเรียบร้อยแล้ว เจ้าหน้าที่กำลังเร่งดำเนินการตรวจสอบและแก้ไข ขออภัยในความไม่สะดวกครับ
            </p>
          </div>
        `,
        icon: 'warning',
        confirmButtonText: '<i class="fa-solid fa-circle-check" style="margin-right: 6px;"></i>รับทราบ',
        confirmButtonColor: '#0284c7',
        background: '#ffffff',
        color: '#0f172a'
      });
      return;
    }

    if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
      try {
        const friendship = await liff.getFriendship();
        if (!friendship.friendFlag) {
          Swal.fire({
            title: '<span style="font-size: 20px; font-weight: 700; color: #d97706; font-family: var(--font-family);">💡 จำเป็นต้องเพิ่มเพื่อนก่อน</span>',
            html: `
              <div style="text-align: left; font-family: 'Inter', 'Noto Sans Thai', sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
                <p style="margin-bottom: 12px; font-weight: 500; font-size: 15px; color: #0f172a; text-align: center;">ไม่สามารถส่งรายงานแจ้งซ่อมได้</p>
                <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; border-radius: 8px; margin-bottom: 14px;">
                  <p style="margin: 0; color: #b91c1c; font-size: 13px;">คุณจำเป็นต้องเป็นเพื่อนกับ LINE OA <strong>(@086kdhvh)</strong> เพื่อให้บอตสามารถส่งข้อความแจ้งเตือนผลการซ่อม</p>
                </div>
                <p style="font-size: 13px; color: #475569; margin-bottom: 4px; text-align: center;">กรุณากดเพิ่มเพื่อนก่อนกดส่งรายงานแจ้งซ่อมครับ</p>
              </div>
            `,
            icon: 'warning',
            showCancelButton: false,
            confirmButtonText: '<i class="fa-brands fa-line" style="margin-right: 6px;"></i>เพิ่มเพื่อนทันที',
            background: '#ffffff',
            color: '#0f172a',
            confirmButtonColor: '#16a34a'
          }).then((result) => {
            if (result.isConfirmed) {
              liff.openWindow({
                url: 'https://line.me/R/ti/p/%40086kdhvh',
                external: true
              });
            }
          });
          return;
        }
      } catch (friendshipErr) {
        console.error("Failed to check friendship status on submit:", friendshipErr);
      }
    }

    if (selectedImages.length === 0) {
      Swal.fire({
        title: 'กรุณาอัปโหลดรูปภาพ',
        text: 'กรุณาแนบรูปภาพจุดเสาไฟหรือจุดที่เกิดปัญหาอย่างน้อย 1 รูป (สูงสุดไม่เกิน 4 รูป)',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    Swal.fire({
      title: 'กำลังบันทึกข้อมูลและอัปโหลดรูปภาพ...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const lineUserId = userLineProfile ? userLineProfile.userId : "MOCK_LINE_USER_123";
    const lineDisplayName = userLineProfile ? userLineProfile.displayName : "ผู้ใช้จำลอง (Demo User)";

    if (isDemoMode) {
      const localLights = JSON.parse(localStorage.getItem('smart_lights')) || [];
      const index = localLights.findIndex(l => l.id === lightId);
      if (index !== -1) {
        localLights[index].status = 'broken';
        localLights[index].lastUpdated = new Date().toISOString();
        localStorage.setItem('smart_lights', JSON.stringify(localLights));
      }

      const imageUrls = selectedImages.map(img => img.dataUrl);

      const reportData = {
        lightId: lightId,
        lightCode: targetLight.code,
        lightName: targetLight.name,
        lat: targetLight ? targetLight.lat : null,
        lng: targetLight ? targetLight.lng : null,
        issueType: issueType,
        details: details,
        reporterPhone: reporterPhone,
        images: imageUrls,
        status: 'pending',
        timestamp: new Date().toISOString(),
        lineUserId: lineUserId,
        lineDisplayName: lineDisplayName,
        statusHistory: [
          {
            status: 'pending',
            label: 'ได้รับเรื่องแล้ว',
            timestamp: new Date().toISOString(),
            note: 'ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบและพิกัดเสาไฟ'
          }
        ]
      };

      const localReports = JSON.parse(localStorage.getItem('smart_reports')) || [];
      localReports.push({ id: 'REP_' + Math.random().toString(36).substr(2, 9), ...reportData });
      localStorage.setItem('smart_reports', JSON.stringify(localReports));

      sendLineStaffNotification(reportData);
      sendLineCitizenSubmitNotification(reportData);

      Swal.fire({
        title: '<span style="font-size: 20px; font-weight: 700; color: #16a34a; font-family: var(--font-family);">ส่งรายงานสำเร็จ!</span>',
        text: 'บันทึกจำลองข้อมูลแจ้งเสียพร้อมรูปภาพเสร็จเรียบร้อย (โหมดเดโม)',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        background: '#ffffff',
        color: '#0f172a',
        confirmButtonColor: '#0284c7'
      });
      resetImageUpload();
      closeReportPanel();
      loadLights();
    } else {
      if (typeof firebase.storage !== 'function') {
        throw new Error("ระบบอัปโหลดภาพ (Firebase Storage) ไม่พร้อมใช้งานในขณะนี้ กรุณาเปิดใช้งานบริการ Storage ใน Firebase Console หรือตรวจสอบการเชื่อมต่อ");
      }

      const docRef = db.collection('reports').doc();
      const reportId = docRef.id;

      const uploadPromises = selectedImages.map((imgObj, idx) => {
        const fileRef = firebase.storage().ref().child(`reports/${reportId}/image_${idx}.jpg`);
        return fileRef.putString(imgObj.dataUrl, 'data_url').then(snapshot => snapshot.ref.getDownloadURL());
      });

      const downloadUrls = await Promise.all(uploadPromises);

      const reportData = {
        id: reportId,
        lightId: lightId,
        lightCode: targetLight.code,
        lightName: targetLight.name,
        lat: targetLight ? targetLight.lat : null,
        lng: targetLight ? targetLight.lng : null,
        issueType: issueType,
        details: details,
        reporterPhone: reporterPhone,
        images: downloadUrls,
        status: 'pending',
        timestamp: new Date(),
        lineUserId: lineUserId,
        lineDisplayName: lineDisplayName,
        statusHistory: [
          {
            status: 'pending',
            label: 'ได้รับเรื่องแล้ว',
            timestamp: new Date().toISOString(),
            note: 'ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบและพิกัดเสาไฟ'
          }
        ]
      };

      await docRef.set(reportData);

      sendLineStaffNotification(reportData);
      sendLineCitizenSubmitNotification(reportData);

      await db.collection('lights').doc(lightId).update({
        status: 'broken',
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });

      Swal.fire({
        title: '<span style="font-size: 20px; font-weight: 700; color: #16a34a; font-family: var(--font-family);">ส่งรายงานสำเร็จ!</span>',
        text: 'ขอบพระคุณสำหรับข้อมูล เทศบาลได้รับเรื่องแจ้งเสียเสาไฟและรูปภาพเรียบร้อยแล้วและจะรีบดำเนินการซ่อมแซม',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        background: '#ffffff',
        color: '#0f172a',
        confirmButtonColor: '#16a34a'
      });
      resetImageUpload();
      closeReportPanel();
    }
  } catch (error) {
    console.error("Error submitting report:", error);
    Swal.fire({
      title: '<span style="font-size: 20px; font-weight: 700; color: #dc2626; font-family: var(--font-family);">เกิดข้อผิดพลาด!</span>',
      text: error.message || 'ไม่สามารถอัปโหลดรูปภาพหรือส่งข้อมูลการแจ้งเสียได้ กรุณาลองใหม่อีกครั้ง',
      icon: 'error',
      confirmButtonText: 'ตกลง',
      background: '#ffffff',
      color: '#0f172a',
      confirmButtonColor: '#dc2626'
    });
  }
}

// ==========================================
// 10. Demo Data Initialization
// ==========================================
function initDemoData() {
  const existingData = localStorage.getItem('smart_lights');
  if (!existingData) {
    const dummyLights = [
      {
        id: "pole_01",
        code: "L-101",
        name: "หน้าอาคารสำนักงานเทศบาลตำบลตันหยงมัส",
        lat: 6.29445,
        lng: 101.72362,
        status: "working",
        zone: "ชุมชนตลาดกลางผลไม้",
        lastUpdated: new Date().toISOString()
      },
      {
        id: "pole_02",
        code: "L-102",
        name: "ใกล้สี่แยกตันหยงมัส",
        lat: 6.29520,
        lng: 101.72450,
        status: "broken",
        zone: "ชุมชนโรงเรียนแหลมทองวิทยา",
        lastUpdated: new Date().toISOString()
      },
      {
        id: "pole_03",
        code: "L-103",
        name: "บริเวณใกล้สถานีรถไฟตันหยงมัส",
        lat: 6.29350,
        lng: 101.72250,
        status: "pending",
        zone: "ชุมชนวงเวียนลองกอง",
        lastUpdated: new Date().toISOString()
      },
      {
        id: "pole_04",
        code: "L-104",
        name: "หน้าโรงเรียนอนุบาลระแงะ",
        lat: 6.29600,
        lng: 101.72180,
        status: "working",
        zone: "ชุมชนโรงเรียนดารุสสลาม",
        lastUpdated: new Date().toISOString()
      }
    ];
    localStorage.setItem('smart_lights', JSON.stringify(dummyLights));
  }
}
