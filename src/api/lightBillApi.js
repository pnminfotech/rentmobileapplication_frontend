import { api } from "./client";

export async function getLightBills(params = {}) {
  const { data } = await api.get("/light-bill/all-bills", { params });
  return data;
}

export async function getLightBillSettings() {
  const { data } = await api.get("/light-bill/settings");
  return data;
}

export async function updateLightBillSettings(payload) {
  const { data } = await api.put("/light-bill/settings", payload);
  return data.settings || data;
}

export async function createLightBill(payload) {
  const { data } = await api.post("/light-bill", payload);
  return data.entry || data;
}

export async function updateLightBill(id, payload) {
  const { data } = await api.put(`/light-bill/${id}`, payload);
  return data;
}

export async function deleteLightBill(id) {
  const { data } = await api.delete(`/light-bill/${id}`);
  return data;
}
