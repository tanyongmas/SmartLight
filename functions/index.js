const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// Cloud Function (v2 API) แบบ HTTPS Endpoint
exports.sendLineUserUpdateNotification = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send({ error: "Method Not Allowed" });
  }

  try {
    const { reportId, newStatus } = req.body;
    if (!reportId || !newStatus) {
      return res.status(400).send({ error: "Missing reportId or newStatus" });
    }

    // 1. ดึง Token จากไฟล์ .env (ผ่าน process.env)
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!lineToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not defined in .env");
      return res.status(500).send({
        error: "Server Configuration Error: Missing Token"
      });
    }

    // 2. ดึงข้อมูลรายงานแจ้งซ่อมจาก Firestore
    const reportDoc = await db.collection("reports").doc(reportId).get();
    if (!reportDoc.exists) {
      return res.status(404).send({ error: "Report document not found" });
    }

    const report = reportDoc.data();
    const targetUserId = report.lineUserId;

    // ข้ามการส่งกรณีเป็นข้อมูลงจำลอง (Mock User)
    if (!targetUserId || targetUserId.startsWith("MOCK_")) {
      return res.status(200).send({
        message: "Mock user or missing LINE ID, notification skipped."
      });
    }

    // 3. กำหนดข้อความและสีตามสถานะ
    let statusLabel = "รอดำเนินการ";
    let headerColor = "#dc2626";
    if (newStatus === "in_progress") {
      statusLabel = "กำลังดำเนินการ";
      headerColor = "#d97706";
    } else if (newStatus === "resolved") {
      statusLabel = "ซ่อมแซมเสร็จสิ้น";
      headerColor = "#16a34a";
    }

    // 4. สร้าง Timeline ใน Flex Message
    const historyList = report.statusHistory || [];
    const timelineContents = historyList.map((hist) => {
      let dotColor = "#cbd5e1";
      if (hist.status === "pending" || hist.status === "broken") {
        dotColor = "#dc2626";
      } else if (hist.status === "in_progress") {
        dotColor = "#d97706";
      } else if (hist.status === "resolved") {
        dotColor = "#16a34a";
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
                width: "12px",
                height: "12px",
                cornerRadius: "xxl",
                backgroundColor: dotColor
              }
            ]
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: hist.label || hist.status,
                weight: "bold",
                size: "sm",
                color: "#0f172a"
              },
              {
                type: "text",
                text: hist.note || "",
                size: "xs",
                color: "#475569",
                wrap: true
              }
            ]
          }
        ]
      };
    });

    // 5. โครงสร้าง Flex Message Payload
    const payload = {
      to: targetUserId,
      messages: [
        {
          type: "flex",
          altText: `🔔 อัปเดตสถานะเสาไฟ: ${report.lightCode}`,
          contents: {
            type: "bubble",
            styles: { header: { backgroundColor: headerColor } },
            header: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `📢 สถานะ: ${statusLabel}`,
                  weight: "bold",
                  color: "#ffffff",
                  size: "md"
                },
                {
                  type: "text",
                  text: "ระบบแจ้งซ่อมไฟถนน เทศบาลตำบลตันหยงมัส",
                  color: "#e8e8e8",
                  size: "xs"
                }
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
                    {
                      type: "text",
                      text: "รหัสเสาไฟ:",
                      size: "sm",
                      color: "#64748b",
                      flex: 2
                    },
                    {
                      type: "text",
                      text: report.lightCode || "-",
                      weight: "bold",
                      size: "sm",
                      color: "#0f172a",
                      flex: 4
                    }
                  ]
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "สถานที่:",
                      size: "sm",
                      color: "#64748b",
                      flex: 2
                    },
                    {
                      type: "text",
                      text: report.lightName || "-",
                      size: "sm",
                      color: "#334155",
                      wrap: true,
                      flex: 4
                    }
                  ]
                },
                { type: "separator", color: "#f1f5f9", margin: "md" },
                {
                  type: "text",
                  text: "📃 ประวัติการดำเนินงาน:",
                  size: "sm",
                  weight: "bold",
                  color: "#0f172a"
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents:
                    timelineContents.length > 0
                      ? timelineContents
                      : [
                          {
                            type: "text",
                            text: "ยังไม่มีข้อมูล",
                            size: "xs",
                            color: "#94a3b8"
                          }
                        ]
                }
              ]
            }
          }
        }
      ]
    };

    // 6. ยิง Push Notification ไปที่ LINE API
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
    logger.error("Cloud Function Error:", err.response ? err.response.data : err.message);
    return res.status(500).send({
      error: "Failed to send LINE notification",
      details: err.message
    });
  }
});
