import { api } from "./client";

export async function getCanteenAttendance(dateKey, meal) {
  const { data } = await api.get("/canteen-attendance", {
    params: { date: dateKey, meal },
  });
  return data;
}

export async function getCanteenAttendanceRange(params = {}) {
  const { data } = await api.get("/canteen-attendance/range", { params });
  return data;
}

export async function getCanteenSettings() {
  const { data } = await api.get("/canteen-attendance/settings");
  return data;
}

export async function updateCanteenSettings(payload) {
  const { data } = await api.put("/canteen-attendance/settings", payload);
  return data;
}

export async function markCanteenAttendance(payload) {
  const { data } = await api.post("/canteen-attendance/mark", payload);
  return data;
}

export async function markAllCanteenAttendance(payload) {
  const { data } = await api.post("/canteen-attendance/bulk", payload);
  return data;
}
