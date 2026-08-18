import { api } from "./client";

export async function getStaffExpenses() {
  const { data } = await api.get("/staff-expenses/all");
  return data;
}

export async function createStaffExpense(payload) {
  const { data } = await api.post("/staff-expenses", payload);
  return data;
}

export async function updateStaffExpense(id, payload) {
  const { data } = await api.put(`/staff-expenses/${id}`, payload);
  return data;
}

export async function deleteStaffExpense(id) {
  const { data } = await api.delete(`/staff-expenses/${id}`);
  return data;
}
