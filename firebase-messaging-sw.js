importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBFapFJVU-g5TyBi4ItudHOeqS4Mc3W_fc",
  authDomain: "tm-municipal-smartlight.firebaseapp.com",
  projectId: "tm-municipal-smartlight",
  storageBucket: "tm-municipal-smartlight.firebasestorage.app",
  messagingSenderId: "1056211682644",
  appId: "1:1056211682644:web:7e26d60bd8e55e2e5974c1",
  measurementId: "G-9N8K32KDPM"
});

const messaging = firebase.messaging();

// รับข้อมูลและแสดงพุชเมื่อเว็บบัญชีปิดอยู่
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);
  const notificationTitle = payload.notification.title || 'อัปเดตสถานะเสาไฟ';
  const notificationOptions = {
    body: payload.notification.body || 'มีข้อมูลใหม่เกี่ยวกับงานซ่อมไฟทาง',
    icon: payload.notification.icon || 'https://img2.pic.in.th/pic/71f81565dc59a7f9545542493a5514ab.png',
    data: {
      url: payload.notification.click_action || payload.data?.url || './index.html'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// จัดการการกดแจ้งเตือนเพื่อเปิดหน้าเว็บ
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url;
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // ตรวจสอบว่ามีแท็บเก่าที่เปิดอยู่แล้วหรือไม่ ถ้ามีให้โฟกัส
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // ถ้าไม่มีแท็บเปิดอยู่ ให้ทำการเปิดแท็บใหม่
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
