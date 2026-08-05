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
- ⏱️ **ไทม์ไลน์ติดตามสถานะ (Track Timeline)**: ประชาชนสามารถติดตามประวัติและขั้นตอนการดำเนินงานซ่อมแซมเสาไฟของตนเองย้อนหลังได้แบบ Realtime

### 2. ฝั่งเจ้าหน้าที่/ช่างไฟฟ้า (`dashboard.html`)
- 🔐 **ระบบเข้าสู่ระบบแบบปลอดภัย**: ยืนยันตัวตนเจ้าหน้าที่ผ่าน Firebase Authentication
- 📊 **รายงานสรุปภาพรวมและสถิติรายเดือน (Monthly Dashboard)**: 
  - หน้ารายงานภาพรวมแบบเต็มรูปแบบที่แยกหัวข้อออกมาเป็นสัดส่วน (สลับจากหน้าแผนที่หลักได้ง่าย)
  - แถบหัวข้อรายงานโทนสีฟ้าอ่อนพรีเมียมมินิมอล Slate-Blue โดดเด่น มองเห็นข้อมูลฟิลเตอร์สรุปชัดเจน
  - กล่อง KPI 4 บรรทัด (จำนวนหลอดไฟ, อัตราซ่อมเสร็จ, ชุมชนแจ้งสูงสุด, อาการแจ้งสูงสุด) แสดงรายละเอียดเจาะลึก 2 บรรทัด เช่น `ปกติ 320 | ชำรุด/ดับ 15 ดวง`
  - มีระบบปรับขนาดตัวอักษรชื่อชุมชนในกล่อง KPI อัตโนมัติ (Dynamic Font Sizing) ช่วยให้ชื่อยาว ๆ เช่น `ชุมชนโรงเรียนแหลมทองวิทยา` แสดงผลสวยงามไม่ล้นกล่อง
- 📈 **ระบบวิเคราะห์ข้อมูลขั้นสูง (Interactive Chart.js)**:
  - **Doughnut Chart (สัดส่วนอาการเสีย)**: ล็อกอัตราส่วนให้เป็นวงกลมสมบูรณ์แบบไม่ยืดเป็นรูปไข่ ย้ายรายการคำอธิบายปัญหาไปจัดแสดงด้านขวาเพื่อให้ดูสมดุลและสวยงาม
  - **Stacked Bar Chart (กราฟแท่งซ้อนชุมชน)**: แสดงสถานะเสาไฟ (ใช้งานปกติ, กำลังซ่อม, ชำรุด) เรียงซ้อนในแท่งเดียวกันแยกตามชุมชน บังคับแสดงป้ายชื่อครบถ้วนทั้ง 7 ชุมชน (`autoSkip: false`) และเอียงมุมอ่านง่าย
  - **Segment Labels**: แสดงตัวเลขกำกับสถิติจำนวนเสาไฟเป็นสีขาวสว่างอยู่ตรงกลางของแต่ละเซกเมนต์สีแท่งอย่างชัดเจน
- 🖨️ **ระบบพิมพ์รายงานแบบแนวนอน (A4 Landscape Print System)**:
  - รองรับการสั่งพิมพ์เอกสารรายงานสถิติเป็น **แนวนอน (Landscape)** โดยอัตโนมัติ
  - สรุปภาพรวม ตัวกรอง กล่อง KPI และกราฟทั้งสองจะจัดหน้าให้อยู่ภายใน **หน้า 1** อย่างเป็นระเบียบสวยงาม
  - ตารางสรุปการดำเนินงานที่ยาวจะถูกกำหนดให้ขึ้นหน้าใหม่เป็น **หน้า 2** อัตโนมัติ ป้องกันข้อมูลตัดขาดบรรทัด และห่อข้อความยาว ๆ ไม่ล้นตกขอบกระดาษ
  - แยกขาดจากการสั่งพิมพ์สติกเกอร์บาร์โค้ด QR Code ขนาดแผ่นสติกเกอร์แนวตั้ง (A4 Portrait) อย่างเป็นระบบ
- 🛠️ **การบริหารจัดการเสาไฟ (Pole Management)**: เพิ่ม แก้ไข หรือลบเสาไฟ พร้อมโหมดปักหมุดพิกัดบนแผนที่ (Click to locate Lat/Lng) และแถบสไลด์ข้างจัดการที่ลื่นไหล
- 📋 **การจัดการรายการแจ้งซ่อม (Report Handling)**: รับเรื่องซ่อม ปรับสถานะเป็น "กำลังดำเนินการ" หรือ "ซ่อมเสร็จสิ้น" โดยระบบจะส่ง LINE Flex Message แจ้งประชาชนทันที

---

## 🏗️ โครงสร้างไฟล์และสถาปัตยกรรม (Project Structure)

```text
SmartLight/
├── index.html             # หน้าสำหรับประชาชนแจ้งเสียและติดตามสถานะ
├── dashboard.html         # หน้าสำหรับเจ้าหน้าที่บริหารจัดการและอัปเดตงาน
├── style.css              # สไตล์ชีทหลัก (Theme Light Clean, Glassmorphism, Responsive)
├── favicon.ico            # ไอคอนประจำเว็บ
├── .gitignore             # ไฟล์กำหนดรายการที่ไม่ต้องนำขึ้น Git
├── README.md              # เอกสารอธิบายระบบและการใช้งาน
└── js/
    ├── config.js          # รวมไฟล์ตั้งค่า Firebase, LINE LIFF และ Messaging API
    ├── citizen.js         # Logic และ Event Listeners ฝั่งประชาชน (index.html)
    └── dashboard.js       # Logic และ Event Listeners ฝั่งเจ้าหน้าที่ (dashboard.html)
```

---

## 🛠️ เทคโนโลยีที่เลือกใช้ (Tech Stack)

- **Frontend Core**: HTML5, Vanilla JavaScript (ES6 Modules), CSS3 (Vanilla CSS)
- **Mapping Library**: [Leaflet.js](https://leafletjs.com/) (OpenStreetMap & Esri World Imagery)
- **Data Visualization**: [Chart.js v4](https://www.chartjs.org/)
- **Backend & Database**: [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore) & [Firebase Storage](https://firebase.google.com/docs/storage)
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth)
- **LINE Integration**: LINE LIFF SDK v2 & LINE Messaging API (Flex Messages)
- **UI Components**: [SweetAlert2](https://sweetalert2.github.io/), FontAwesome 6 Icons, [QRCode.js](https://davidshimjs.github.io/qrcodejs/)

---

## 🚀 การเริ่มต้นใช้งานและการทดสอบ (Getting Started)

### 1. การเปิดใช้งานแบบ Local / Demo Mode
หากยังไม่ได้ตั้งค่าคีย์ Firebase ระบบจะเปลี่ยนเข้าสู่ **Demo Mode** โดยอัตโนมัติ:
1. เปิดไฟล์ `index.html` หรือ `dashboard.html` บนเว็บเบราว์เซอร์ได้ทันทีโดยไม่ต้องรัน Web Server (รองรับการเปิดผ่าน `file://` หรือ `localhost`)
2. ระบบจะสร้างข้อมูลเสาไฟและรายงานจำลองเก็บไว้ใน `localStorage` ของเบราว์เซอร์

### 2. การเชื่อมต่อ Firebase จริง (Production Mode)
เปิดไฟล์ [`js/config.js`](file:///f:/Municipality%202568/WebApp/SmartLight-main/js/config.js) และใส่ค่า Configuration จาก Firebase Console:

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

#### Firestore Security Rules (แนะนำ)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /lights/{lightId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /reports/{reportId} {
      allow read, create: if true;
      allow update, delete: if request.auth != null;
    }
  }
}
```

### 3. การตั้งค่า LINE Official Account & LIFF
1. สร้าง **LINE Official Account (Bot)** ใน [LINE Official Account Manager](https://manager.line.biz/)
2. สร้าง **LINE Login Channel** และเปิดใช้งาน **LIFF App** ใน [LINE Developers Console](https://developers.line.biz/)
3. ในแท็บ **LINE Login settings** หัวข้อ **Linked OA** ให้กด Edit แล้วเลือก LINE Official Account ของท่าน
4. นำ LIFF ID มาใส่ใน [`js/config.js`](file:///f:/Municipality%202568/WebApp/SmartLight-main/js/config.js):
   ```javascript
   const liffConfig = {
     liffId: "YOUR_LIFF_ID"
   };
   ```

---

## 📦 การนำขึ้น Git และ Deploy ขึ้น GitHub Pages

### คำสั่ง Git ขั้นพื้นฐาน
```bash
# 1. เพิ่มไฟล์ทั้งหมดเข้า Staging
git add .

# 2. บันทึก Commit
git commit -m "Update README: document dedicated Monthly Report and print-layout enhancements"

# 3. Push ขึ้น GitHub
git push
```

---

## 📄 ลิขสิทธิ์และการดูแลรักษา
**เทศบาลตำบลตันหยงมัส** อำเภอระแงะ จังหวัดนราธิวาส  
ออกแบบและพัฒนาเพื่อประโยชน์สาธารณะในการดูแลระบบไฟฟ้าและอำนวยความสะดวกแก่ประชาชนในท้องถิ่น
