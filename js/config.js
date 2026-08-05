/**
 * Smart Light System Configuration File
 * เทศบาลตำบลตันหยงมัส - ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ
 */

// ==========================================
// 1. ตั้งค่า Firebase Configuration
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBFapFJVU-g5TyBi4ItudHOeqS4Mc3W_fc",
  authDomain: "tm-municipal-smartlight.firebaseapp.com",
  projectId: "tm-municipal-smartlight",
  storageBucket: "tm-municipal-smartlight.firebasestorage.app",
  messagingSenderId: "1056211682644",
  appId: "1:1056211682644:web:7e26d60bd8e55e2e5974c1",
  measurementId: "G-9N8K32KDPM"
};

// ==========================================
// 2. ตั้งค่า LINE Messaging API & Backend Notification Configuration
// ==========================================
// คำเตือนด้านความปลอดภัย: เพื่อป้องกันการดักจับ Channel Access Token รั่วไหล
// การส่งข้อความ LINE Push Notification ถูกปรับให้เรียกผ่าน Backend (Firebase Cloud Functions / API Gateway)
// ห้ามใส่ Channel Access Token ในโค้ดส่วนหน้าบ้าน (Client-side) เด็ดขาด
const lineConfig = {
  // Endpoint สำหรับส่งแจ้งเตือนผ่าน Firebase Cloud Function (ปลอดภัย 100%)
  backendNotifyApiUrl: "https://asia-southeast1-tm-municipal-smartlight.cloudfunctions.net/sendLineUserUpdateNotification",
  
  // สำหรับสภาพแวดล้อม Development เท่านั้น (หากไม่ได้ระบุ Backend ระบบจะข้ามการส่ง Push โดยไม่ทำให้แอปพลิเคชันพัง)
  channelAccessToken: "",                             // ไม่ใส่ Token ฝั่ง Client เพื่อความปลอดภัย
  useCorsProxy: false,
  corsProxyUrl: "https://corsproxy.io/?"
};

// ==========================================
// 3. ตั้งค่า LINE LIFF Configuration
// ==========================================
const liffConfig = {
  liffId: "2010313933-7q4q3WSR"
};
