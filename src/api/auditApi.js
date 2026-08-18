import { api } from "./client";

export async function getAuditLogs(params = {}) {
  const { data } = await api.get("/audit-logs", { params });
  return data;
}
