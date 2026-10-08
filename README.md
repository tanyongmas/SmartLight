# 💡 ระบบแจ้งซ่อมไฟฟ้าสาธารณะอัจฉริยะ (Smart Light Reporting & Management System)
### เทศบาลตำบลตันหยงมัส อำเภอระแงะ จังหวัดนราธิวาส

ระบบเว็บแอปพลิเคชันบริการสาธารณะสำหรับประชาชนในเขตเทศบาลตำบลตันหยงมัส ในการแจ้งปัญหาไฟฟ้าสาธารณะชำรุดผ่านระบบแผนที่เชิงพิกัด (GIS Map) และสแกน QR Code บนเสาไฟ พร้อมระบบติดตามสถานะการซ่อมแซมผ่าน LINE Official Account และแผงควบคุมเจ้าหน้าที่ (Admin Dashboard)

---

## 🌟 ฟีเจอร์หลักของระบบ (Key Features)

### 1. ฝั่งประชาชน (`index.html`)
- 📍 **ค้นหาเสาไฟบนแผนที่เชิงพิกัด**: แสดงหมุดเสาไฟแยกตามสีสถานะ (เขียว = ใช้งานปกติ, ส้ม = กำลังซ่อม, แดง = ไฟดับ/ชำรุด) ผ่านแผนที่ Leaflet (OSM & ภาพถ่ายดาวเทียม Esri)
- 📲 **สแกน QR Code ประจำเสาไฟ**: เมื่อสแกน QR Code ที่ติดอยู่บนเสาไฟจริง ระบบจะซูมเข้าหาเสาไฟและเปิดแบบฟอร์มแจ้งซ่อมโดยอัตโนมัติ
- 🖼️ **ระบบแนบรูปภาพพร้อมบีบอัดอัตโนมัติ**: รองรับแนบรูปภาพประกอบ 1-4 รูป โดยมีระบบบีบอัดภาพ Canvas ฝั่ง Client ช่วยประหยัดพื้นที่คลาวด์และ bandwidth
- 💬 **LINE Integration & Friendship Check**: ตรวจสอบความเป็นเพื่อนกับ LINE OA (`@086kdhvh`) ก่อนแจ้ง เพื่อให้ระบบสามารถส่งข้อความ Push Notification แจ้งเตือนความคืบหน้าได้
- ⏱️ **ไทม์ไลน์ติดตามสถานะ (Track Timeline)**: ประชาชนสามารถติดตามประวัติและขั้นตอนการดำเนินงานซ่อมแซมเสาไฟของตนเองย้อนหลังได้แบบ Realtime (Card 1: รับเรื่องแล้ว -> Card 2: กำลังดำเนินการ -> Card 3: ซ่อมเสร็จสิ้น)

### 2. ฝั่งเจ้าหน้าที่/ช่างไฟฟ้า (`dashboard.html` & LINE Official Account)
- ⚡ **อัปเดตสถานะแบบ Direct Postback ในแอป LINE**: ปุ่ม `"🛠️ รับเรื่องซ่อม"` และ `"✅ ซ่อมเสร็จสิ้น"` ใน Flex Message เจ้าหน้าที่ รองรับ Postback Webhook โดยประมวลผลผ่าน Firebase Cloud Function `lineOfficerWebhook` ทำให้เจ้าหน้าที่สามารถอัปเดตสถานะงานได้ในแอป LINE โดยตรงโดยไม่ต้องสลับเปิดหน้าจอเบราว์เซอร์
- 💬 **ข้อความตอบกลับยืนยันเจ้าหน้าที่ทันที**: เมื่อทำรายการสำเร็จ ระบบส่งการตอบกลับยืนยันเจ้าหน้าที่ใน LINE ทันที และส่ง Push Notification Flex Message แจ้งเตือนความคืบหน้าไปยังประชาชนผู้แจ้งโดยอัตโนมัติ
- ⚠️ **ระบบป้องกันการกดอัปเดตสถานะซ้ำ**: ตรวจสอบหากเจ้าหน้าที่กดปุ่มอัปเดตสถานะซ้ำ หรือพยายามย้อนกลับสถานะงานที่ซ่อมเสร็จสิ้นไปแล้ว ระบบจะส่งข้อความแจ้งเตือนสถานะซ้ำเพื่อความถูกต้องของข้อมูล
- 🗺️ **ปุ่มนำทาง Google Maps (`🗺️ นำทาง`)**: นำทางไปยังพิกัด GPS จุดเกิดเหตุได้อย่างแม่นยำ
- 🔴 **ปุ่มทางเลือกเปิด Dashboard สีแดงอ่อน (`#ef4444`)**: ปุ่มสำหรับเปิดแผงควบคุมบริหารจัดการบนเว็บเบราว์เซอร์
- 🔐 **ระบบเข้าสู่ระบบแบบปลอดภัย**: ยืนยันตัวตนเจ้าหน้าที่ผ่าน Firebase Authentication
- 📊 **รายงานสรุปภาพรวมและสถิติรายเดือน (Monthly Dashboard)**: 
  - หน้ารายงานภาพรวมแบบเต็มรูปแบบที่แยกหัวข้อออกมาเป็นสัดส่วน (สลับจากหน้าแผนที่หลักได้ง่าย)
  - แถบหัวข้อรายงานโทนสีฟ้าอ่อนพรีเมียมมินิมอล Slate-Blue โดดเด่น มองเห็นข้อมูลฟิลเตอร์สรุปชัดเจน
  - กล่อง KPI แสดงรายละเอียดเจาะลึก 2 บรรทัด เช่น `ปกติ 320 | ชำรุด/ดับ 15 ดวง`
  - มีระบบปรับขนาดตัวอักษรชื่อชุมชนในกล่อง KPI อัตโนมัติ (Dynamic Font Sizing) ช่วยให้ชื่อยาว ๆ แสดงผลสวยงามไม่ล้นกล่อง
- 📈 **ระบบวิเคราะห์ข้อมูลขั้นสูง (Interactive Chart.js)**:
  - **Doughnut Chart (สัดส่วนอาการเสีย)**: ล็อกอัตราส่วนวงกลมสมบูรณ์แบบ จัดวางคำอธิบายปัญหาด้านขวาอย่างสมดุล
  - **Stacked Bar Chart (กราฟแท่งซ้อนชุมชน)**: แสดงสถานะเสาไฟเรียงซ้อนในแท่งเดียวกันแยกตามชุมชน พร้อมตัวเลขกำกับสถิติ (Segment Labels)
- 🖨️ **ระบบพิมพ์รายงานแบบแนวนอน (A4 Landscape Print System)**:
  - รองรับการสั่งพิมพ์เอกสารรายงานสถิติเป็น **แนวนอน (Landscape)** โดยอัตโนมัติ
  - จัดหน้า 1 สรุปภาพรวม KPI และกราฟ และหน้า 2 สำหรับตารางสรุปการดำเนินงาน ป้องกันข้อมูลตัดขาดบรรทัด
- 🛠️ **การบริหารจัดการเสาไฟ (Pole Management)**: เพิ่ม แก้ไข หรือลบเสาไฟ พร้อมโหมดปักหมุดพิกัดบนแผนที่ (Click to locate Lat/Lng)

---

## 🏗️ โครงสร้างไฟล์และสถาปัตยกรรม (Project Structure)

```text
SmartLight/
├── index.html             # หน้าสำหรับประชาชนแจ้งเสียและติดตามสถานะ
├── dashboard.html         # หน้าสำหรับเจ้าหน้าที่บริหารจัดการและอัปเดตงาน
├── style.css              # สไตล์ชีทหลัก (Theme Light Clean, Glassmorphism, Responsive)
├── favicon.ico            # ไอคอนประจำเว็บ
├── firebase.json          # ไฟล์คอนฟิกการ Deploy Firebase Functions
├── .firebaserc            # ไฟล์คอนฟิก Firebase Project
├── README.md              # เอกสารอธิบายระบบและการใช้งาน
├── js/
│   ├── config.js          # รวมไฟล์ตั้งค่า Firebase, LINE LIFF และ Messaging API
│   ├── citizen.js         # Logic และ Event Listeners ฝั่งประชาชน (index.html)
│   └── dashboard.js       # Logic และ Event Listeners ฝั่งเจ้าหน้าที่ (dashboard.html)
└── functions/             # Firebase Cloud Functions (Node.js backend)
    ├── index.js           # Cloud Functions (sendLineNewReportNotification, sendLineUserUpdateNotification, lineOfficerWebhook)
    ├── package.json       # Dependencies (firebase-admin, firebase-functions, axios)
    └── .env               # Environment variables (LINE Tokens)
```

---

## 🛠️ เทคโนโลยีที่เลือกใช้ (Tech Stack)

- **Frontend Core**: HTML5, Vanilla JavaScript (ES6 Modules), CSS3 (Vanilla CSS)
- **Mapping Library**: [Leaflet.js](https://leafletjs.com/) (OpenStreetMap & Esri World Imagery)
- **Data Visualization**: [Chart.js v4](https://www.chartjs.org/)
- **Backend & Database**: [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore) & [Firebase Storage](https://firebase.google.com/docs/storage)
- **Serverless Backend**: [Firebase Cloud Functions v2](https://firebase.google.com/docs/functions) (Node.js 20)
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth)
- **LINE Integration**: LINE LIFF SDK v2 & LINE Messaging API (Flex Messages, Webhook Postback)
- **UI Components**: [SweetAlert2](https://sweetalert2.github.io/), FontAwesome 6 Icons, [QRCode.js](https://davidshimjs.github.io/qrcodejs/)

---

## 🚀 การเริ่มต้นใช้งานและการตั้งค่า (Getting Started & Setup)

### 1. การเปิดใช้งานแบบ Local / Demo Mode
หากยังไม่ได้ตั้งค่าคีย์ Firebase ระบบจะเปลี่ยนเข้าสู่ **Demo Mode** โดยอัตโนมัติ:
1. เปิดไฟล์ `index.html` หรือ `dashboard.html` บนเว็บเบราว์เซอร์ได้ทันทีโดยไม่ต้องรัน Web Server
2. ระบบจะสร้างข้อมูลเสาไฟและรายงานจำลองเก็บไว้ใน `localStorage` ของเบราว์เซอร์

### 2. การเชื่อมต่อ Firebase จริง (Production Mode)
เปิดไฟล์ [`js/config.js`](file:///js/config.js) และใส่ค่า Configuration จาก Firebase Console:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. การตั้งค่า LINE Official Account, LIFF & Webhook
1. สร้าง **LINE Official Account (Bot)** สำหรับประชาชนและเจ้าหน้าที่ ใน [LINE Official Account Manager](https://manager.line.biz/)
2. สร้าง **LINE Login Channel** และเปิดใช้งาน **LIFF App** ใน [LINE Developers Console](https://developers.line.biz/)
3. ตั้งค่า Webhook สำหรับช่องเจ้าหน้าที่ (Officer Bot Channel):
   - **Webhook URL**: `https://lineofficerwebhook-fty4674n2q-as.a.run.app` *(หรือ `https://asia-southeast1-tm-municipal-smartlight.cloudfunctions.net/lineOfficerWebhook`)*
   - **Use Webhook**: เปิดใช้งานเป็น **ON** 🟢
4. นำ LIFF ID มาใส่ใน [`js/config.js`](file:///js/config.js):
   ```javascript
   const liffConfig = {
     liffId: "YOUR_LIFF_ID"
   };
   ```

---

## 📦 การนำขึ้น Git และ Deploy ขึ้น Firebase Functions

### 1. คำสั่ง Git ขั้นพื้นฐาน
```bash
git add .
git commit -m "Update README: add officer direct postback webhook & status update features"
git push origin main
```

### 2. คำสั่ง Deploy ขึ้น Firebase Functions
```bash
npx firebase deploy --only functions
```

---

## 📄 ลิขสิทธิ์และการดูแลรักษา
**เทศบาลตำบลตันหยงมัส** อำเภอระแงะ จังหวัดนราธิวาส  
ออกแบบและพัฒนาเพื่อประโยชน์สาธารณะในการดูแลระบบไฟฟ้าและอำนวยความสะดวกแก่ประชาชนในท้องถิ่น
