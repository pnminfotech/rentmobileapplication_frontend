import { api } from "./client";

export async function getNotifications(params = {}) {
  const { data } = await api.get("/notifications", { params });
  return data;
}

export async function getUnreadNotificationCount() {
  const { data } = await api.get("/notifications/unread-count");
  return data;
}

export async function markNotificationRead(notificationId) {
  const { data } = await api.patch(`/notifications/${notificationId}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch("/notifications/read-all");
  return data;
}

export async function resolveNotification(notificationId) {
  const { data } = await api.patch(`/notifications/${notificationId}/resolve`);
  return data;
}
