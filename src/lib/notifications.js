export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

export async function showLocalNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", ...options });
      return;
    }
  } catch (err) {
    console.error("Service worker notification failed, falling back:", err);
  }
  new Notification(title, options);
}
