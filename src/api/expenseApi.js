import { api } from "./client";

export async function getExpenses() {
  const { data } = await api.get("/other-expense/all");
  return data;
}

export async function createExpense(payload) {
  const { data } = await api.post("/other-expense", payload);
  return data.data || data;
}

export async function updateExpense(id, payload) {
  const { data } = await api.put(`/other-expense/${id}`, payload);
  return data;
}

export async function deleteExpense(id) {
  const { data } = await api.delete(`/other-expense/${id}`);
  return data;
}
