const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const axios = require("axios");

initializeApp();
const db = getFirestore();

function formatThaiTime(timestamp) {
  if (!timestamp) return "";
  let date;
  if (timestamp && timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return "";

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  }) + " น.";
}

function getStatusLabel(status) {
  if (status === "pending" || status === "broken") return "ได้รับเรื่องแล้ว";
  if (status === "in_progress") return "กำลังดำเนินการ";
  if (status === "resolved") return "ซ่อมแซมเสร็จสิ้น";
  return status;
}

// Telegram Configuration สำหรับเจ้าหน้าที่ (100% Free & Unlimited)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8971834465:AAFkv4NwXeKCOn3E2PuYmclemhERNNgzw6s";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-5310724253";

// Helper ส่งข้อความแจ้งเตือนเคสใหม่เข้ากลุ่ม Telegram เจ้าหน้าที่
async function sendTelegramNewReportNotification(reportData) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.warn("Telegram bot token or chat ID is missing. Skipping Telegram notification.");
    return;
  }

  const timeStr = formatThaiTime(reportData.timestamp || new Date());
  const lightCode = reportData.lightCode || "-";
  const lightName = reportData.lightName || "ไม่ระบุตำแหน่ง";
  const issueType = reportData.issueType || "ไม่ระบุ";
  const reporterName = reportData.lineDisplayName || "ประชาชนผู้แจ้ง";
  const phone = reportData.reporterPhone || "ไม่ได้ระบุ";
  const details = reportData.details || "ไม่มีรายละเอียดเพิ่มเติม";
  const lat = reportData.lat || (reportData.latitude ? reportData.latitude : null);
  const lng = reportData.lng || (reportData.longitude ? reportData.longitude : null);

  let navUrl;
  if (lat && lng) {
    navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  } else {
    navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(lightName) + " เทศบาลตำบลตันหยงมัส")}`;
  }

  const reportIdStr = reportData.id || reportData.reportId || "";
  const dashboardUrl = "https://tanyongmas.github.io/SmartLight/dashboard.html";
  const officerUrl = reportIdStr ? `${dashboardUrl}?reportId=${reportIdStr}` : dashboardUrl;

  const caption = 
`🚨 <b>มีรายการแจ้งซ่อมไฟฟ้าใหม่!</b>
━━━━━━━━━━━━━━━━━━━━
💡 <b>รหัสเสาไฟ:</b> <code>${lightCode}</code>
⚠️ <b>อาการเสีย:</b> ${issueType}
📍 <b>สถานที่:</b> ${lightName}
${lat && lng ? `🗺️ <b>พิกัด GPS:</b> <code>${lat}, ${lng}</code>\n` : ""}` +
`📝 <b>รายละเอียด:</b> ${details}
━━━━━━━━━━━━━━━━━━━━
👤 <b>ผู้แจ้ง:</b> ${reporterName}
📞 <b>เบอร์ติดต่อ:</b> ${phone}
🕒 <b>เวลาที่แจ้ง:</b> ${timeStr}

🏛️ <i>เทศบาลตำบลตันหยงมัส อ.ระแงะ จ.นราธิวาส</i>`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🗺️ นำทาง Google Maps", url: navUrl },
        { text: "📋 เปิด Web Dashboard", url: officerUrl }
      ]
    ]
  };

  const hasImage = reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith("http");

  try {
    if (hasImage) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        chat_id: TELEGRAM_CHAT_ID,
        photo: reportData.images[0],
        caption: caption,
        parse_mode: "HTML",
        reply_markup: inlineKeyboard
      });
    } else {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption,
        parse_mode: "HTML",
        reply_markup: inlineKeyboard
      });
    }
    logger.info("Successfully sent Telegram notification to staff group:", { chat_id: TELEGRAM_CHAT_ID });
  } catch (err) {
    logger.error("Error sending Telegram notification:", err.response ? err.response.data : err.message);
  }
}

// Helper ส่งข้อความอัปเดตสถานะงานเข้ากลุ่ม Telegram เจ้าหน้าที่
async function sendTelegramStatusUpdateNotification(lightCode, status, lightName, updateTimeStr) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const statusEmoji = status === "resolved" ? "✅" : "🛠️";
  const statusLabel = status === "resolved" ? "ซ่อมแซมเสร็จสิ้นแล้ว" : "รับเรื่องซ่อมแล้ว (กำลังดำเนินการ)";

  const text = 
`${statusEmoji} <b>อัปเดตสถานะงานซ่อม</b>
━━━━━━━━━━━━━━━━━━━━
💡 <b>รหัสเสาไฟ:</b> <code>${lightCode}</code>
📌 <b>สถานะใหม่:</b> ${statusLabel}
📍 <b>สถานที่:</b> ${lightName || "-"}
🕒 <b>เวลาอัปเดต:</b> ${updateTimeStr || "-"}

🏛️ <i>ระบบแจ้งซ่อมไฟ เทศบาลตำบลตันหยงมัส</i>`;

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML"
    });
    logger.info("Successfully sent Telegram status update to staff group:", { lightCode, status });
  } catch (err) {
    logger.error("Error sending Telegram status update:", err.response ? err.response.data : err.message);
  }
}

// 1. Cloud Function สำหรับแจ้งเตือนเมื่อประชาชนส่งรายงานแจ้งซ่อมใหม่
// (ส่งเข้ากลุ่ม Telegram ช่าง + ส่งเข้า LINE กลุ่มเจ้าหน้าที่ + ยืนยันประชาชนผ่าน LIFF)
exports.sendLineNewReportNotification = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send({ error: "Method Not Allowed" });
  }

  try {
    const { reportData, skipCitizenPush } = req.body;
    if (!reportData) {
      return res.status(400).send({ error: "Missing reportData" });
    }

    const citizenToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const staffToken = process.env.LINE_STAFF_ACCESS_TOKEN || citizenToken;
    const staffGroupId = process.env.LINE_STAFF_GROUP_ID;

    // 1.0 ส่งแจ้งเตือนเข้ากลุ่ม Telegram สำหรับเจ้าหน้าที่ทันที (ฟรี 100% ไม่เสียโควต้า)
    await sendTelegramNewReportNotification(reportData);

    const dashboardUrl = "https://tanyongmas.github.io/SmartLight/dashboard.html";

    // 1.1 โครงสร้าง Flex Message แจ้งเตือนเข้าไลน์เจ้าหน้าที่ (Officer Flex Message)
    const staffTimeStr = formatThaiTime(reportData.timestamp || new Date());
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

    const flexStaffMessage = {
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
                action: {
                  type: "postback",
                  label: "🛠️ รับเรื่องซ่อม",
                  data: `action=update_status&reportId=${reportIdStr}&status=in_progress`,
                  displayText: "🛠️ รับเรื่องซ่อม"
                }
              },
              {
                type: "button",
                style: "primary",
                color: "#16a34a",
                height: "sm",
                action: {
                  type: "postback",
                  label: "✅ ซ่อมเสร็จสิ้น",
                  data: `action=update_status&reportId=${reportIdStr}&status=resolved`,
                  displayText: "✅ ซ่อมเสร็จสิ้น"
                }
              }
            ]
          },
          {
            type: "button",
            style: "primary",
            color: "#ef4444",
            height: "sm",
            action: { type: "uri", label: "📋 อัปเดตสถานะผ่าน Dashboard", uri: officerUpdateUrl }
          }
        ]
      }
    };

    if (reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith("http")) {
      flexStaffMessage.hero = {
        type: "image",
        url: reportData.images[0],
        size: "full",
        aspectRatio: "20:11",
        aspectMode: "cover",
        action: { type: "uri", uri: reportData.images[0] }
      };
    }

    // 1.2 โครงสร้าง Flex Message แจ้งยืนยันหาประชาชน (ส่งเป็น Card 1 สีแดง กะทัดรัด)
    const citizenTimeStr = formatThaiTime(new Date());
    const flexCitizenMessage = {
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
            action: { type: "uri", label: "🔍 ติดตามสถานะการซ่อม", uri: "https://liff.line.me/2010313933-7q4q3WSR?page=track" }
          }
        ]
      }
    };

    if (reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith("http")) {
      flexCitizenMessage.hero = {
        type: "image",
        url: reportData.images[0],
        size: "full",
        aspectRatio: "20:11",
        aspectMode: "cover",
        action: { type: "uri", uri: reportData.images[0] }
      };
    }

    // 1.3 ยกเลิกการส่ง Push แจ้งซ่อมใหม่หาประชาชน (นโยบายฟรี 100% 0 โควต้าตลอดชีพ)
    // ประชาชนติดตามผลได้ฟรีผ่านริชเมนู หรือพิมพ์ "สถานะ" / "ติดตาม" ในห้องแชทได้ตลอดเวลา
    logger.info("New report submitted. Push to citizen skipped for 0-quota policy.", { targetUserId: reportData.lineUserId });


    // 1.4 แจ้งเตือนเข้า LINE เจ้าหน้าที่ (ส่งเข้ากลุ่ม staffGroupId หรือ Broadcast)
    if (staffToken) {
      if (staffGroupId) {
        // ประหยัดโควต้า: ส่ง Push Message เข้าห้องกลุ่มเจ้าหน้าที่เพียง 1 ข้อความต่อ 1 เคส
        const staffGroupPayload = {
          to: staffGroupId,
          messages: [{
            type: "flex",
            altText: `🚨 แจ้งซ่อมใหม่: ${reportData.lightCode || ""}`,
            contents: flexStaffMessage
          }]
        };
        await axios.post("https://api.line.me/v2/bot/message/push", staffGroupPayload, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffToken}` }
        }).catch(err => logger.error("Staff group push error:", err.response ? err.response.data : err.message));
        logger.info("Successfully sent LINE alert to staff group:", { staffGroupId });
      } else {
        // Fallback: หากยังไม่ได้ระบุ LINE_STAFF_GROUP_ID ให้ Broadcast หาเจ้าหน้าที่ตามปกติ
        const staffPayload = {
          messages: [{
            type: "flex",
            altText: `🚨 แจ้งซ่อมใหม่: ${reportData.lightCode || ""}`,
            contents: flexStaffMessage
          }]
        };
        await axios.post("https://api.line.me/v2/bot/message/broadcast", staffPayload, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffToken}` }
        }).catch(err => logger.error("Staff broadcast new report error:", err.response ? err.response.data : err.message));
      }
    }

    return res.status(200).send({ success: true });
  } catch (err) {
    logger.error("sendLineNewReportNotification error:", err);
    return res.status(500).send({ error: err.message });
  }
});

// 2. Cloud Function สำหรับแจ้งเตือนเมื่อเจ้าหน้าที่กดอัปเดตสถานะการซ่อม (ส่งหาประชาชน)
exports.sendLineUserUpdateNotification = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send({ error: "Method Not Allowed" });
  }

  try {
    const { reportId, newStatus, reportData: bodyReportData } = req.body;
    if (!reportId || !newStatus) {
      return res.status(400).send({ error: "Missing reportId or newStatus" });
    }

    // แบบที่ 1: ฟรี 100% 0 Quota (ปิด Push แจ้งเตือนสถานะหาประชาชนทั้งหมด)
    // ประชาชนสามารถพิมพ์คำว่า "สถานะ" หรือ "ติดตาม" ในห้องแชทเพื่อตรวจสอบสถานะได้ตลอดเวลา (ใช้ replyToken ฟรี 100%)
    logger.info("Zero-Quota Mode: Skipped citizen push notification on status update.", { reportId, newStatus });
    return res.status(200).send({
      success: true,
      message: "Zero-Quota Mode: Citizen Push notification is safely disabled. Citizens track via Auto-Reply or Rich Menu."
    });


    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!lineToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not defined in .env");
      return res.status(500).send({
        error: "Server Configuration Error: Missing Token"
      });
    }

    let report = bodyReportData || null;

    if (!report) {
      const reportDoc = await db.collection("reports").doc(reportId).get();
      if (reportDoc.exists) {
        report = reportDoc.data();
      }
    }

    if (!report) {
      return res.status(404).send({ error: "Report document not found" });
    }

    const targetUserId = report.lineUserId;
    if (!targetUserId || targetUserId.startsWith("MOCK_")) {
      logger.info("Mock user or missing LINE ID, notification skipped.", { targetUserId });
      return res.status(200).send({
        message: "Mock user or missing LINE ID, notification skipped."
      });
    }

    let statusHeaderLabel = "รอดำเนินการ";
    if (newStatus === "in_progress") {
      statusHeaderLabel = "กำลังดำเนินการ";
    } else if (newStatus === "resolved") {
      statusHeaderLabel = "ซ่อมแซมเสร็จสิ้น";
    }

    const historyList = report.statusHistory || [
      {
        status: "pending",
        label: "ได้รับเรื่องแล้ว",
        timestamp: report.timestamp || new Date().toISOString(),
        note: "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว"
      }
    ];

    function findHistory(statusKey) {
      if (statusKey === "pending") {
        return historyList.find(h => h.status === "pending" || h.status === "broken") || null;
      }
      return historyList.find(h => h.status === statusKey) || null;
    }

    const pendingHist = findHistory("pending");
    const inProgressHist = findHistory("in_progress");
    const resolvedHist = findHistory("resolved");

    let currentRank = 1;
    if (newStatus === "in_progress") currentRank = 2;
    if (newStatus === "resolved") currentRank = 3;

    const lightCode = String(report.lightCode || report.code || "-");
    const lightName = String(report.lightName || report.name || "-");
    const issueType = String(report.issueType || "ไม่ระบุ");
    const citizenUrl = `https://liff.line.me/2010313933-7q4q3WSR?page=track`;

    // 🔴 Card 1: รับเรื่องแล้ว (สีแดง #dc2626)
    const card1Time = pendingHist ? formatThaiTime(pendingHist.timestamp) : (report.timestamp ? formatThaiTime(report.timestamp) : "-");
    const card1Note = pendingHist && pendingHist.note ? String(pendingHist.note) : "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว";

    const card1 = {
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
          { type: "text", text: "🚨 รับเรื่องแจ้งซ่อม", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
          { type: "text", text: currentRank === 1 ? "👉 อยู่ในขั้นตอนนี้" : "✅ ดำเนินการแล้ว", color: "#ffffff", size: "xs", margin: "xs" }
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
              { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "อาการเสีย:", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: issueType, weight: "bold", size: "xs", color: "#ef4444", flex: 5 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }
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
              { type: "text", text: card1Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
              { type: "text", text: card1Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
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
            action: { type: "uri", label: "🔍 ติดตามรายละเอียด", uri: citizenUrl }
          }
        ]
      }
    };

    if (report.images && report.images.length > 0 && String(report.images[0]).startsWith("http")) {
      card1.hero = {
        type: "image",
        url: report.images[0],
        size: "full",
        aspectRatio: "20:11",
        aspectMode: "cover",
        action: { type: "uri", uri: report.images[0] }
      };
    }

    const activeCards = [card1];

    // 🟠 Card 2: กำลังดำเนินการ (สีส้ม #d97706) - แสดงเฉพาะเมื่อถึงขั้นตอนที่ 2
    if (currentRank >= 2) {
      const card2Time = inProgressHist ? formatThaiTime(inProgressHist.timestamp) : "-";
      const card2Note = inProgressHist && inProgressHist.note ? String(inProgressHist.note) : "ช่างไฟฟ้ากำลังลงพื้นที่ตรวจสอบและซ่อมแซม";

      const card2 = {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#d97706" },
          body: { backgroundColor: "#ffffff" },
          footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
        },
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "md",
          contents: [
            { type: "text", text: "⚙️ ขั้นตอนที่ 2/3", color: "#fde68a", size: "xs", weight: "bold" },
            { type: "text", text: "🛠️ กำลังดำเนินการ", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
            { type: "text", text: currentRank === 2 ? "👉 อยู่ในขั้นตอนนี้" : "✅ ดำเนินการแล้ว", color: "#ffffff", size: "xs", margin: "xs" }
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
                { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "สถานะงาน:", size: "xs", color: "#64748b", flex: 3 },
                { type: "text", text: "กำลังซ่อมแซม", weight: "bold", size: "xs", color: "#d97706", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 },
                { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }
              ]
            },
            { type: "separator", color: "#f1f5f9", margin: "xs" },
            {
              type: "box",
              layout: "vertical",
              spacing: "none",
              margin: "xs",
              contents: [
                { type: "text", text: "🕒 เวลาที่อัปเดต:", size: "xs", color: "#64748b", weight: "bold" },
                { type: "text", text: card2Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
                { type: "text", text: card2Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
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
              color: "#d97706",
              action: { type: "uri", label: "🔍 ติดตามรายละเอียด", uri: citizenUrl }
            }
          ]
        }
      };

      activeCards.push(card2);
    }

    // 🟢 Card 3: ซ่อมแซมเสร็จสิ้น (สีเขียว #16a34a) - แสดงเฉพาะเมื่อถึงขั้นตอนที่ 3
    if (currentRank >= 3) {
      const card3Time = resolvedHist ? formatThaiTime(resolvedHist.timestamp) : "-";
      const card3Note = resolvedHist && resolvedHist.note ? String(resolvedHist.note) : "แก้ไขและซ่อมแซมเสร็จสิ้นแล้ว ไฟสาธารณะพร้อมใช้งานปกติ";

      const card3 = {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#16a34a" },
          body: { backgroundColor: "#ffffff" },
          footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
        },
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "md",
          contents: [
            { type: "text", text: "✅ ขั้นตอนที่ 3/3", color: "#bbf7d0", size: "xs", weight: "bold" },
            { type: "text", text: "🎉 ซ่อมแซมเสร็จสิ้น", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
            { type: "text", text: "🎉 สำเร็จเรียบร้อยแล้ว", color: "#ffffff", size: "xs", margin: "xs" }
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
                { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "ผลการซ่อม:", size: "xs", color: "#64748b", flex: 3 },
                { type: "text", text: "ใช้งานได้ปกติ", weight: "bold", size: "xs", color: "#16a34a", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 },
                { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }
              ]
            },
            { type: "separator", color: "#f1f5f9", margin: "xs" },
            {
              type: "box",
              layout: "vertical",
              spacing: "none",
              margin: "xs",
              contents: [
                { type: "text", text: "🕒 เวลาที่เสร็จสิ้น:", size: "xs", color: "#64748b", weight: "bold" },
                { type: "text", text: card3Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
                { type: "text", text: card3Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
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
              style: "primary",
              height: "sm",
              color: "#16a34a",
              action: { type: "uri", label: "🔍 ดูประวัติแจ้งซ่อม", uri: citizenUrl }
            }
          ]
        }
      };

      activeCards.push(card3);
    }

    let flexContents;
    if (activeCards.length === 1) {
      flexContents = activeCards[0];
    } else {
      flexContents = {
        type: "carousel",
        contents: activeCards
      };
    }

    const payload = {
      to: targetUserId,
      messages: [
        {
          type: "flex",
          altText: `🔔 อัปเดตสถานะงานซ่อมเสาไฟ (${lightCode}): ${statusHeaderLabel}`,
          contents: flexContents
        }
      ]
    };

    const lineResponse = await axios.post(
      "https://api.line.me/v2/bot/message/push",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineToken}`
        }
      }
    );

    return res.status(200).send({ success: true, lineResult: lineResponse.data });
  } catch (err) {
    const errorDetails = err.response ? err.response.data : err.message;
    logger.error("Cloud Function Error:", errorDetails);
    return res.status(500).send({
      error: "Failed to send LINE notification",
      details: errorDetails
    });
  }
});

// 3. Cloud Function สำหรับรองรับ LINE Bot Webhook (Postback จากเจ้าหน้าที่ใน LINE โดยตรง)
exports.lineOfficerWebhook = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const events = req.body.events || [];
    const staffToken = process.env.LINE_STAFF_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;

    logger.info("lineOfficerWebhook received events:", { count: events.length });

    for (const event of events) {
      logger.info("Processing LINE event:", { type: event.type, source: event.source });

      if (event.type === "postback") {
        const replyToken = event.replyToken;
        const sourceId = event.source ? (event.source.userId || event.source.groupId || event.source.roomId) : null;
        const dataStr = event.postback && event.postback.data ? event.postback.data : "";
        logger.info("LINE Postback received:", { dataStr, replyToken, sourceId });

        const params = new URLSearchParams(dataStr);
        const action = params.get("action");
        const reportId = params.get("reportId");
        const targetStatus = params.get("status");

        if (action === "update_status" && reportId && targetStatus) {
          await processOfficerPostbackStatusUpdate(reportId, targetStatus, replyToken, sourceId, staffToken);
        }
      }
    }
    return res.status(200).send({ success: true });
  } catch (err) {
    logger.error("lineOfficerWebhook error:", err);
    return res.status(500).send({ error: err.message });
  }
});

async function processOfficerPostbackStatusUpdate(reportId, targetStatus, replyToken, sourceId, staffToken) {
  logger.info("processOfficerPostbackStatusUpdate starting:", { reportId, targetStatus });

  let reportRef = db.collection("reports").doc(reportId);
  let reportDoc = await reportRef.get();
  let report = null;

  if (reportDoc.exists) {
    report = reportDoc.data();
  } else {
    logger.warn(`Report doc ${reportId} not found directly, trying fallback query...`);
    const querySnap = await db.collection("reports").where("lightCode", "==", reportId).orderBy("timestamp", "desc").limit(1).get();
    if (!querySnap.empty) {
      reportDoc = querySnap.docs[0];
      reportRef = reportDoc.ref;
      report = reportDoc.data();
    }
  }

  if (!report) {
    logger.error("Report document not found in Firestore:", { reportId });
    await sendLINEOfficerReplyOrPush(replyToken, sourceId, [{ type: "text", text: "❌ ไม่พบข้อมูลรายการแจ้งซ่อมนี้ในระบบ" }], staffToken);
    return;
  }

  const currentStatus = report.status || "pending";
  const lightCode = String(report.lightCode || report.code || "-");
  const lightName = String(report.lightName || report.name || "-");

  // ตรวจสอบการกดอัปเดตสถานะซ้ำ
  if (currentStatus === targetStatus) {
    const currentStatusLabel = currentStatus === "in_progress" ? "กำลังดำเนินการ (รับเรื่องซ่อมแล้ว)" : currentStatus === "resolved" ? "ซ่อมเสร็จสิ้นแล้ว" : "รอดำเนินการ";
    logger.info("Duplicate status update detected:", { reportId, currentStatus, targetStatus });
    await sendLINEOfficerReplyOrPush(replyToken, sourceId, [{
      type: "text",
      text: `⚠️ [แจ้งเตือน: อัปเดตสถานะซ้ำ]\n\n📍 รหัสเสาไฟ: ${lightCode}\n📌 สถานะปัจจุบัน: ${currentStatusLabel}\n\nรายการแจ้งซ่อมนี้อยู่ในสถานะดังกล่าวเรียบร้อยแล้ว`
    }], staffToken);
    return;
  }

  if (currentStatus === "resolved" && targetStatus === "in_progress") {
    logger.info("Attempted to revert resolved status to in_progress:", { reportId });
    await sendLINEOfficerReplyOrPush(replyToken, sourceId, [{
      type: "text",
      text: `⚠️ [แจ้งเตือน: ไม่สามารถเปลี่ยนสถานะได้]\n\n📍 รหัสเสาไฟ: ${lightCode}\nรายการนี้ได้รับการซ่อมเสร็จสิ้นแล้ว ไม่สามารถย้อนกลับเป็นกำลังดำเนินการได้`
    }], staffToken);
    return;
  }

  // อัปเดตสถานะใน Firestore
  const newLightStatus = targetStatus === "resolved" ? "working" : "pending";
  let statusLabel = "รอดำเนินการ";
  let statusNote = "เทศบาลตำบลตันหยงมัสได้รับเรื่องแจ้งแล้ว ช่างไฟฟ้าจะเข้าตรวจสอบพิกัด";
  if (targetStatus === "in_progress") {
    statusLabel = "กำลังดำเนินการ";
    statusNote = "เจ้าหน้าที่รับเรื่องซ่อมแล้ว และกำลังจัดส่งทีมช่างไฟฟ้าเดินทางเข้าแก้ไขหน้างาน";
  } else if (targetStatus === "resolved") {
    statusLabel = "ซ่อมแซมเสร็จสิ้น";
    statusNote = "ดำเนินการเปลี่ยนหลอดไฟ/ซ่อมโคมไฟสำเร็จ ไฟฟ้าสาธารณะส่องสว่างปกติแล้ว";
  }

  const historyEntry = {
    status: targetStatus,
    label: statusLabel,
    timestamp: new Date().toISOString(),
    note: statusNote
  };

  await reportRef.update({
    status: targetStatus,
    statusHistory: FieldValue.arrayUnion(historyEntry)
  });

  if (report.lightId) {
    await db.collection("lights").doc(report.lightId).update({
      status: newLightStatus,
      lastUpdated: FieldValue.serverTimestamp()
    }).catch(err => logger.error("Error updating light doc:", err));
  }

  logger.info("Report status updated successfully in Firestore:", { reportId, targetStatus });

  const updateTimeStr = formatThaiTime(new Date());

  // หากช่างกด "ซ่อมเสร็จสิ้น" (targetStatus === 'resolved') ส่ง Push แจ้งเตือนประชาชนผู้แจ้ง 1 ข้อความ (กินเพียง 1 โควต้าต่อเคสสำเร็จ)
  const citizenToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (targetStatus === "resolved" && report.lineUserId && !report.lineUserId.startsWith("MOCK_") && citizenToken) {
    const resolvedCard = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#16a34a" },
        body: { backgroundColor: "#ffffff" },
        footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
      },
      header: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          { type: "text", text: "✅ ขั้นตอนที่ 3/3", color: "#bbf7d0", size: "xs", weight: "bold" },
          { type: "text", text: "🎉 ซ่อมแซมเสร็จสิ้นแล้ว!", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
          { type: "text", text: "ไฟฟ้าสาธารณะส่องสว่างพร้อมใช้งานปกติ", color: "#ffffff", size: "xs", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ผลการซ่อม:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: "แก้ไขเรียบร้อย ส่องสว่างปกติ", weight: "bold", size: "xs", color: "#16a34a", flex: 5 }] },
          { type: "separator", color: "#f1f5f9", margin: "xs" },
          {
            type: "box", layout: "vertical", spacing: "none", margin: "xs",
            contents: [
              { type: "text", text: "🕒 เวลาที่เสร็จสิ้น:", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: updateTimeStr, size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
              { type: "text", text: "เทศบาลตำบลตันหยงมัสขอขอบพระคุณที่ร่วมเป็นหูเป็นตาดูแลท้องถิ่นของเราครับ", size: "xs", color: "#475569", wrap: true, margin: "xs" }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "sm",
        contents: [
          {
            type: "button", style: "primary", height: "sm", color: "#16a34a",
            action: { type: "uri", label: "🔍 ดูประวัติการแจ้งซ่อม", uri: "https://liff.line.me/2010313933-7q4q3WSR?page=track" }
          }
        ]
      }
    };

    try {
      await axios.post("https://api.line.me/v2/bot/message/push", {
        to: report.lineUserId,
        messages: [{
          type: "flex",
          altText: `🎉 เสาไฟ ${lightCode} ซ่อมแซมเสร็จสิ้นแล้ว`,
          contents: resolvedCard
        }]
      }, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${citizenToken}` }
      });
      logger.info("Successfully pushed completion message to citizen:", { lineUserId: report.lineUserId });
    } catch (err) {
      logger.error("Error pushing completion to citizen:", err.response ? err.response.data : err.message);
    }
  } else {
    logger.info("Status is not resolved or no citizen lineUserId. Push skipped (0-quota).", { targetStatus, lineUserId: report.lineUserId });
  }

  // ส่งแจ้งเตือนการอัปเดตสถานะเข้ากลุ่ม Telegram เจ้าหน้าที่พร้อมกันทันที (ฟรี 100%)
  await sendTelegramStatusUpdateNotification(lightCode, targetStatus, lightName, updateTimeStr);


  const replyFlex = {
    type: "flex",
    altText: `✅ อัปเดตสถานะสำเร็จ: ${lightCode}`,
    contents: {
      type: "bubble",
      styles: {
        header: { backgroundColor: targetStatus === "resolved" ? "#16a34a" : "#d97706" },
        body: { backgroundColor: "#ffffff" }
      },
      header: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          { type: "text", text: "✅ อัปเดตสถานะสำเร็จ!", color: "#ffffff", size: "md", weight: "bold" },
          { type: "text", text: `สถานะใหม่: ${statusLabel}`, color: "#ffffff", size: "xs", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "เวลาอัปเดต:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: updateTimeStr, size: "xs", color: "#0f172a", weight: "bold", flex: 5 }] }
        ]
      }
    }
  };

  await sendLINEOfficerReplyOrPush(replyToken, sourceId, [replyFlex], staffToken);
}

// Helper ส่งข้อความกลับหาเจ้าหน้าที่ (ลอง Reply ก่อน หากไม่สำเร็จให้ Fallback เป็น Push)
async function sendLINEOfficerReplyOrPush(replyToken, sourceId, messages, accessToken) {
  if (!accessToken) {
    logger.warn("No accessToken provided for officer response.");
    return;
  }

  let success = false;
  if (replyToken) {
    try {
      await axios.post("https://api.line.me/v2/bot/message/reply", {
        replyToken: replyToken,
        messages: messages
      }, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }
      });
      success = true;
      logger.info("Successfully replied to officer via replyToken (Free 0-quota).");
    } catch (err) {
      logger.error("Reply token failed, attempting fallback push:", err.response ? err.response.data : err.message);
    }
  }

  if (!success && sourceId) {
    try {
      await axios.post("https://api.line.me/v2/bot/message/push", {
        to: sourceId,
        messages: messages
      }, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }
      });
      logger.info("Successfully pushed response to officer sourceId:", { sourceId });
    } catch (err) {
      logger.error("Fallback push to officer failed:", err.response ? err.response.data : err.message);
    }
  }
}

// 4. Cloud Function: lineCitizenWebhook (ระบบ Auto-Reply ตอบกลับสถานะให้ประชาชนฟรี 100% 0 Quota)
exports.lineCitizenWebhook = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const events = req.body.events || [];
    const citizenToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!citizenToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not defined for citizen webhook.");
      return res.status(200).send("OK");
    }

    for (const event of events) {
      if (event.type === "message" && event.message && event.message.type === "text") {
        const userText = (event.message.text || "").trim().toLowerCase();
        const replyToken = event.replyToken;
        const userId = event.source ? event.source.userId : null;

        logger.info("lineCitizenWebhook received text message:", { userText, userId });

        // ตรวจสอบคีย์เวิร์ดที่เกี่ยวข้องกับการติดตามสถานะ
        const statusKeywords = ["สถานะ", "เช็คสถานะ", "ติดตาม", "ติดตามสถานะ", "แจ้งซ่อมของฉัน", "ซ่อมไฟ", "status", "track", "history", "เช็ค", "ไฟ"];
        const isStatusQuery = statusKeywords.some(kw => userText.includes(kw));

        if (isStatusQuery && replyToken && userId) {
          await handleCitizenStatusAutoReply(userId, replyToken, citizenToken);
        }
      }
    }

    return res.status(200).send({ success: true });
  } catch (err) {
    logger.error("lineCitizenWebhook error:", err);
    return res.status(500).send({ error: err.message });
  }
});

// Helper ประมวลผลและตอบกลับสถานะงานแจ้งซ่อมของประชาชน (ใช้ replyToken ฟรี 100%)
async function handleCitizenStatusAutoReply(userId, replyToken, citizenToken) {
  try {
    // ดึงรายงานของประชาชนคนนี้โดยตรง (ไม่ต้องพึ่ง Firestore Composite Index)
    const reportsSnap = await db.collection("reports")
      .where("lineUserId", "==", userId)
      .get();

    const citizenTrackUrl = "https://liff.line.me/2010313933-7q4q3WSR?page=track";
    const citizenReportUrl = "https://liff.line.me/2010313933-7q4q3WSR";

    // กรณีที่ 1: ยังไม่มีประวัติแจ้งซ่อม
    if (reportsSnap.empty) {
      const emptyFlex = {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#0284c7" },
          body: { backgroundColor: "#ffffff" },
          footer: { backgroundColor: "#f8fafc" }
        },
        header: {
          type: "box", layout: "vertical", paddingAll: "md",
          contents: [
            { type: "text", text: "💡 ระบบไฟสาธารณะอัจฉริยะ", color: "#bae6fd", size: "xs", weight: "bold" },
            { type: "text", text: "🔍 ตรวจสอบประวัติแจ้งซ่อม", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
          ]
        },
        body: {
          type: "box", layout: "vertical", paddingAll: "md", spacing: "sm",
          contents: [
            { type: "text", text: "ไม่พบประวัติการแจ้งซ่อม", weight: "bold", size: "sm", color: "#0f172a" },
            { type: "text", text: "ขณะนี้ยังไม่มีรายการแจ้งซ่อมไฟฟ้าจากบัญชี LINE ของท่าน หากพบเห็นไฟฟ้าสาธารณะชำรุด สามารถกดแจ้งได้ทันทีครับ", size: "xs", color: "#64748b", wrap: true }
          ]
        },
        footer: {
          type: "box", layout: "vertical", paddingAll: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#0284c7",
              height: "sm",
              action: { type: "uri", label: "📍 แจ้งซ่อมไฟฟ้าบนแผนที่", uri: citizenReportUrl }
            }
          ]
        }
      };

      await axios.post("https://api.line.me/v2/bot/message/reply", {
        replyToken: replyToken,
        messages: [{
          type: "flex",
          altText: "🔍 ผลการตรวจสอบสถานะการแจ้งซ่อม",
          contents: emptyFlex
        }]
      }, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${citizenToken}` }
      });
      return;
    }

    // กรณีที่ 2: มีรายการแจ้งซ่อม (เรียงลำดับจากล่าสุดใน Memory 3 รายการ)
    const allUserReports = [];
    reportsSnap.forEach(doc => allUserReports.push(doc.data()));
    allUserReports.sort((a, b) => {
      const getMs = (t) => {
        if (!t) return 0;
        if (t.seconds) return t.seconds * 1000;
        const d = new Date(t);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      return getMs(b.timestamp) - getMs(a.timestamp);
    });

    // สร้าง Carousel 3 การ์ด 3 สถานะ สำหรับรายการแจ้งซ่อมล่าสุด
    const report = allUserReports[0];
    const lightCode = String(report.lightCode || report.code || "-");
    const lightName = String(report.lightName || report.name || "ไม่ระบุตำแหน่ง");
    const issueType = String(report.issueType || "ไม่ระบุ");
    const currentStatus = report.status || "pending";

    let currentRank = 1;
    if (currentStatus === "in_progress") currentRank = 2;
    if (currentStatus === "resolved") currentRank = 3;

    const historyList = report.statusHistory || [
      {
        status: "pending",
        label: "ได้รับเรื่องแล้ว",
        timestamp: report.timestamp || new Date().toISOString(),
        note: "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบและพิกัดเสาไฟ"
      }
    ];

    const pendingHist = historyList.find(h => h.status === "pending" || h.status === "broken");
    const inProgressHist = historyList.find(h => h.status === "in_progress");
    const resolvedHist = historyList.find(h => h.status === "resolved");

    const card1Time = pendingHist ? formatThaiTime(pendingHist.timestamp) : (report.timestamp ? formatThaiTime(report.timestamp) : "-");
    const card1Note = pendingHist && pendingHist.note ? String(pendingHist.note) : "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบและพิกัดเสาไฟ";

    const card2Time = inProgressHist ? formatThaiTime(inProgressHist.timestamp) : "-";
    const card2Note = inProgressHist && inProgressHist.note ? String(inProgressHist.note) : "เจ้าหน้าที่รับเรื่องแล้ว และกำลังจัดส่งทีมช่างไฟฟ้าเดินทางเข้าแก้ไขหน้างาน";

    const card3Time = resolvedHist ? formatThaiTime(resolvedHist.timestamp) : "-";
    const card3Note = resolvedHist && resolvedHist.note ? String(resolvedHist.note) : "ดำเนินการเปลี่ยนหลอดไฟ/ซ่อมโคมไฟสำเร็จ ไฟฟ้าสาธารณะส่องสว่างปกติแล้ว";

    // 🔴 Card 1: รับเรื่องซ่อมแล้ว (ขั้นตอนที่ 1/3)
    const card1 = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#dc2626" },
        body: { backgroundColor: "#ffffff" },
        footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
      },
      header: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          { type: "text", text: "📌 ขั้นตอนที่ 1/3", color: "#fecaca", size: "xs", weight: "bold" },
          { type: "text", text: "🚨 รับเรื่องแจ้งซ่อม", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
          { type: "text", text: currentRank === 1 ? "👉 อยู่ในขั้นตอนนี้ (รับเรื่องแล้ว)" : "✅ ผ่านขั้นตอนนี้แล้ว", color: "#ffffff", size: "xs", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "อาการเสีย:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: issueType, weight: "bold", size: "xs", color: "#ef4444", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }] },
          { type: "separator", color: "#f1f5f9", margin: "xs" },
          {
            type: "box", layout: "vertical", spacing: "none", margin: "xs",
            contents: [
              { type: "text", text: "🕒 เวลาที่รับเรื่อง:", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: card1Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
              { type: "text", text: card1Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "sm",
        contents: [
          { type: "button", style: "secondary", height: "sm", color: "#dc2626", action: { type: "uri", label: "🔍 ดูไทม์ไลน์สถานะเต็ม", uri: citizenTrackUrl } }
        ]
      }
    };
    if (report.images && report.images.length > 0 && String(report.images[0]).startsWith("http")) {
      card1.hero = {
        type: "image",
        url: report.images[0],
        size: "full",
        aspectRatio: "20:11",
        aspectMode: "cover",
        action: { type: "uri", uri: report.images[0] }
      };
    }

    // 🟠 Card 2: กำลังดำเนินการ (ขั้นตอนที่ 2/3)
    const card2 = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#d97706" },
        body: { backgroundColor: "#ffffff" },
        footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
      },
      header: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          { type: "text", text: "⚙️ ขั้นตอนที่ 2/3", color: "#fde68a", size: "xs", weight: "bold" },
          { type: "text", text: "🛠️ กำลังดำเนินการ", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
          { type: "text", text: currentRank === 2 ? "👉 อยู่ในขั้นตอนนี้ (ช่างกำลังซ่อม)" : (currentRank > 2 ? "✅ ผ่านขั้นตอนนี้แล้ว" : "⏳ รอดำเนินการ (รอคิวลงพื้นที่)"), color: "#ffffff", size: "xs", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานะงาน:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: currentRank >= 2 ? "ช่างกำลังลงพื้นที่ซ่อม" : "รอจัดคิวช่าง", weight: "bold", size: "xs", color: "#d97706", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }] },
          { type: "separator", color: "#f1f5f9", margin: "xs" },
          {
            type: "box", layout: "vertical", spacing: "none", margin: "xs",
            contents: [
              { type: "text", text: "🕒 เวลาที่เริ่มดำเนินการ:", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: card2Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
              { type: "text", text: card2Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "sm",
        contents: [
          { type: "button", style: "secondary", height: "sm", color: "#d97706", action: { type: "uri", label: "🔍 ดูไทม์ไลน์สถานะเต็ม", uri: citizenTrackUrl } }
        ]
      }
    };

    // 🟢 Card 3: ซ่อมเสร็จสิ้น (ขั้นตอนที่ 3/3)
    const card3 = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#16a34a" },
        body: { backgroundColor: "#ffffff" },
        footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
      },
      header: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          { type: "text", text: "✅ ขั้นตอนที่ 3/3", color: "#bbf7d0", size: "xs", weight: "bold" },
          { type: "text", text: "🎉 ซ่อมแซมเสร็จสิ้น", color: "#ffffff", size: "md", weight: "bold", margin: "xs" },
          { type: "text", text: currentRank === 3 ? "👉 สำเร็จเรียบร้อยแล้ว (ใช้งานได้ปกติ)" : "⏳ รอดำเนินการ (รอช่างซ่อมเสร็จ)", color: "#ffffff", size: "xs", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "รหัสเสาไฟ:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightCode, weight: "bold", size: "xs", color: "#0ea5e9", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ผลการซ่อม:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: currentRank === 3 ? "ใช้งานได้ปกติ (ส่องสว่างแล้ว)" : "รอการซ่อมแซมเสร็จสิ้น", weight: "bold", size: "xs", color: "#16a34a", flex: 5 }] },
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สถานที่:", size: "xs", color: "#64748b", flex: 3 }, { type: "text", text: lightName, size: "xs", color: "#334155", wrap: true, flex: 5 }] },
          { type: "separator", color: "#f1f5f9", margin: "xs" },
          {
            type: "box", layout: "vertical", spacing: "none", margin: "xs",
            contents: [
              { type: "text", text: "🕒 เวลาที่เสร็จสิ้น:", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: card3Time || "-", size: "xs", color: "#0f172a", weight: "bold", margin: "none" },
              { type: "text", text: card3Note, size: "xs", color: "#475569", wrap: true, margin: "xs" }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "sm",
        contents: [
          { type: "button", style: "primary", height: "sm", color: "#16a34a", action: { type: "uri", label: "🔍 ดูประวัติการแจ้งซ่อม", uri: citizenTrackUrl } }
        ]
      }
    };

    // ปรับการ์ดติดตามสถานะ: แสดงสะสมตามขั้นตอนจริงของงาน (เรียงลำดับขั้นตอน)
    // 1. ถ้ายังไม่รับเรื่อง (pending) -> แสดงการ์ดที่ 1 (1 ใบ)
    // 2. ถ้ากำลังดำเนินการ (in_progress) -> แสดงการ์ดที่ 1 และ 2 (2 ใบเรียงกัน)
    // 3. ถ้าซ่อมเสร็จสิ้น (resolved) -> แสดงการ์ดที่ 1, 2 และ 3 (3 ใบเรียงกัน)
    const activeCards = [card1];
    let statusText = "รับเรื่องแล้ว";
    if (currentRank >= 2) {
      activeCards.push(card2);
      statusText = "กำลังดำเนินการ";
    }
    if (currentRank >= 3) {
      activeCards.push(card3);
      statusText = "ซ่อมเสร็จสิ้นแล้ว";
    }

    const replyPayload = {
      type: "flex",
      altText: `🔍 สถานะงานซ่อม (${lightCode}): ${statusText}`,
      contents: activeCards.length === 1 ? activeCards[0] : {
        type: "carousel",
        contents: activeCards
      }
    };

    await axios.post("https://api.line.me/v2/bot/message/reply", {
      replyToken: replyToken,
      messages: [replyPayload]
    }, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${citizenToken}` }
    });

    logger.info("Successfully sent citizen auto-reply status via replyToken:", { userId, cardCount: activeCards.length });
  } catch (err) {
    logger.error("Error in handleCitizenStatusAutoReply:", err.response ? err.response.data : err.message);
  }
}

