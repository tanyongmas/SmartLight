const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

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

// 1. Cloud Function สำหรับแจ้งเตือนเมื่อประชาชนส่งรายงานแจ้งซ่อมใหม่ (ส่งหาประชาชน + บรอดแคสต์หาเจ้าหน้าที่)
exports.sendLineNewReportNotification = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send({ error: "Method Not Allowed" });
  }

  try {
    const { reportData } = req.body;
    if (!reportData) {
      return res.status(400).send({ error: "Missing reportData" });
    }

    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!lineToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not defined in .env");
      return res.status(500).send({ error: "Server Configuration Error: Missing Token" });
    }

    const dashboardUrl = "https://tanyongmas.github.io/SmartLight/dashboard.html";

    // 1.1 สร้าง Flex Message สำหรับส่งให้เจ้าหน้าที่ (Staff Broadcast Notification)
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
        contents: [
          { type: "text", text: "🚨 มีการแจ้งซ่อมใหม่", weight: "bold", color: "#ffffff", size: "lg" },
          { type: "text", text: "ระบบไฟถนนอัจฉริยะ เทศบาลตำบลตันหยงมัส", color: "#e8e8e8", size: "xs", margin: "xs" }
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
              { type: "text", text: String(reportData.lightCode || "-"), weight: "bold", size: "sm", color: "#0ea5e9", flex: 4 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ประเภทปัญหา:", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: String(reportData.issueType || "-"), weight: "bold", size: "sm", color: "#ef4444", flex: 4 }
            ]
          },
          { type: "separator", color: "#f1f5f9", margin: "md" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "📍 สถานที่/ตำแหน่ง:", size: "sm", weight: "bold", color: "#334155" },
              { type: "text", text: String(reportData.lightName || "-"), size: "sm", color: "#475569", wrap: true }
            ]
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "📝 รายละเอียดเพิ่มเติม:", size: "sm", weight: "bold", color: "#334155" },
              { type: "text", text: String(reportData.details || "ไม่มีรายละเอียดเพิ่มเติม"), size: "sm", color: "#475569", wrap: true }
            ]
          },
          { type: "separator", color: "#f1f5f9", margin: "md" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "📞 เบอร์ติดต่อผู้แจ้ง:", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: String(reportData.reporterPhone || "ไม่ได้ระบุ"), size: "sm", color: "#0f172a", weight: "bold", flex: 4 }
            ]
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
            action: { type: "uri", label: "📋 ไปยัง Dashboard เจ้าหน้าที่", uri: dashboardUrl }
          }
        ]
      }
    };

    if (reportData.images && reportData.images.length > 0 && String(reportData.images[0]).startsWith("http")) {
      flexStaffMessage.hero = {
        type: "image",
        url: reportData.images[0],
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
        action: { type: "uri", uri: reportData.images[0] }
      };
    }

    // 1.2 สร้าง Flex Message สำหรับส่งยืนยันให้ประชาชน (Citizen Submit Confirmation)
    const flexCitizenMessage = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#16a34a" },
        body: { backgroundColor: "#ffffff" },
        footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "✅ ส่งข้อมูลแจ้งซ่อมสำเร็จ", weight: "bold", color: "#ffffff", size: "md" },
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
              { type: "text", text: String(reportData.lightCode || "-"), weight: "bold", size: "sm", color: "#0ea5e9", flex: 4 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ประเภทปัญหา:", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: String(reportData.issueType || "-"), weight: "bold", size: "sm", color: "#ef4444", flex: 4 }
            ]
          },
          { type: "separator", color: "#f1f5f9", margin: "md" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "📍 สถานที่/ตำแหน่ง:", size: "sm", weight: "bold", color: "#334155" },
              { type: "text", text: String(reportData.lightName || "-"), size: "sm", color: "#475569", wrap: true }
            ]
          },
          { type: "separator", color: "#f1f5f9", margin: "md" },
          { type: "text", text: "📃 ไทม์ไลน์การดำเนินงาน:", size: "sm", weight: "bold", color: "#0f172a", margin: "sm" },
          {
            type: "box",
            layout: "vertical",
            spacing: "none",
            margin: "xs",
            contents: [
              {
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
                        offsetTop: "12px",
                        offsetBottom: "0px",
                        offsetStart: "11px",
                        contents: [{ type: "text", text: " ", size: "xxs" }]
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        width: "12px",
                        height: "12px",
                        cornerRadius: "xxl",
                        backgroundColor: "#16a34a",
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
                    contents: [
                      { type: "text", text: "ได้รับเรื่องแล้ว", weight: "bold", size: "sm", color: "#0f172a" },
                      { type: "text", text: "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว ช่างไฟฟ้าจะเข้าดำเนินการตรวจสอบและพิกัดเสาไฟ", size: "xs", color: "#475569", wrap: true }
                    ]
                  }
                ]
              }
            ]
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
        aspectRatio: "20:13",
        aspectMode: "cover",
        action: { type: "uri", uri: reportData.images[0] }
      };
    }

    // 1.3 ส่ง Push Message หาประชาชนผู้แจ้ง (หากเป็น real lineUserId)
    const targetUserId = reportData.lineUserId;
    if (targetUserId && !targetUserId.startsWith("MOCK_")) {
      const citizenPayload = {
        to: targetUserId,
        messages: [{
          type: "flex",
          altText: `✅ ส่งข้อมูลแจ้งซ่อมสำเร็จ: ${reportData.lightCode || ""}`,
          contents: flexCitizenMessage
        }]
      };
      await axios.post("https://api.line.me/v2/bot/message/push", citizenPayload, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` }
      }).catch(err => logger.error("Citizen push submit error:", err.response ? err.response.data : err.message));
    }

    // 1.4 บรอดแคสต์แจ้งเตือนเข้าห้องเจ้าหน้าที่
    const staffPayload = {
      messages: [{
        type: "flex",
        altText: `🚨 แจ้งซ่อมใหม่: ${reportData.lightCode || ""}`,
        contents: flexStaffMessage
      }]
    };
    await axios.post("https://api.line.me/v2/bot/message/broadcast", staffPayload, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` }
    }).catch(err => logger.error("Staff broadcast new report error:", err.response ? err.response.data : err.message));

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
    let headerColor = "#dc2626";
    if (newStatus === "in_progress") {
      statusHeaderLabel = "กำลังดำเนินการ";
      headerColor = "#d97706";
    } else if (newStatus === "resolved") {
      statusHeaderLabel = "ซ่อมแซมเสร็จสิ้น";
      headerColor = "#16a34a";
    }

    const historyList = report.statusHistory || [
      {
        status: "pending",
        label: "ได้รับเรื่องแล้ว",
        timestamp: report.timestamp || new Date().toISOString(),
        note: "ระบบได้รับแจ้งเรื่องไฟฟ้าสาธารณะชำรุดเรียบร้อยแล้ว"
      }
    ];

    const sortedHistory = [...historyList].sort((a, b) => {
      const timeA = a.timestamp ? (a.timestamp.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime()) : 0;
      const timeB = b.timestamp ? (b.timestamp.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime()) : 0;
      return timeA - timeB;
    });

    const timelineContents = sortedHistory.map((hist, idx) => {
      let dotColor = "#cbd5e1";
      const isLast = idx === sortedHistory.length - 1;

      if (hist.status === "pending" || hist.status === "broken") dotColor = "#dc2626";
      else if (hist.status === "in_progress") dotColor = "#d97706";
      else if (hist.status === "resolved") dotColor = "#16a34a";

      const histTime = formatThaiTime(hist.timestamp);

      const itemBoxContents = [
        {
          type: "text",
          text: String(hist.label || getStatusLabel(hist.status)),
          weight: "bold",
          size: "sm",
          color: isLast ? "#0f172a" : "#64748b"
        }
      ];

      if (histTime) {
        itemBoxContents.push({
          type: "text",
          text: String(histTime),
          size: "xs",
          color: "#94a3b8",
          margin: "xs"
        });
      }

      if (hist.note) {
        itemBoxContents.push({
          type: "text",
          text: String(hist.note),
          size: "xs",
          color: "#475569",
          wrap: true,
          margin: "xs"
        });
      }

      return {
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
            contents: itemBoxContents
          }
        ]
      };
    });

    const citizenUrl = `https://liff.line.me/2010313933-7q4q3WSR?page=track`;

    const payload = {
      to: targetUserId,
      messages: [
        {
          type: "flex",
          altText: `🔔 แจ้งความคืบหน้าการแจ้งซ่อมเสาไฟ: ${report.lightCode || ""}`,
          contents: {
            type: "bubble",
            styles: {
              header: { backgroundColor: headerColor },
              body: { backgroundColor: "#ffffff" },
              footer: { backgroundColor: "#f8fafc", separator: true, separatorColor: "#e2e8f0" }
            },
            header: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: `📢 อัปเดตสถานะ: ${statusHeaderLabel}`, weight: "bold", color: "#ffffff", size: "md" },
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
                    { type: "text", text: String(report.lightCode || "-"), weight: "bold", size: "sm", color: "#0f172a", flex: 4 }
                  ]
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "สถานที่:", size: "sm", color: "#64748b", flex: 2 },
                    { type: "text", text: String(report.lightName || "-"), size: "sm", color: "#334155", wrap: true, flex: 4 }
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
