import { api } from "./client";
import { Platform } from "react-native";

export async function getTenants() {
  const { data } = await api.get("/forms");
  return data;
}

export async function getTenant(tenantId) {
  const { data } = await api.get(`/form/${tenantId}`);
  return data;
}

export async function addTenantRent(tenantId, payload) {
  const { data } = await api.put(`/form/${tenantId}`, payload);
  return data;
}

export async function editTenantRentPayment(tenantId, rentId, paymentIndex, payload) {
  const { data } = await api.patch(
    `/forms/${tenantId}/rents/${rentId}/payments/${paymentIndex}`,
    payload
  );
  return data;
}

export async function voidTenantRentPayment(tenantId, rentId, paymentIndex, reason) {
  const { data } = await api.post(
    `/forms/${tenantId}/rents/${rentId}/payments/${paymentIndex}/void`,
    { reason }
  );
  return data;
}

export async function getTenantRentDue(tenantId) {
  const { data } = await api.get(`/form/${tenantId}/rent-due`);
  return data;
}

export async function getRentDues() {
  const { data } = await api.get("/forms/rent-dues");
  return data;
}

export async function getRentSummary(month) {
  const { data } = await api.get("/forms/rent-summary", { params: { month } });
  return data;
}

export async function getRentRangeSummary(start, end) {
  const { data } = await api.get("/forms/rent-range-summary", { params: { start, end } });
  return data;
}

export async function getTenantRentQuote(tenantId, month) {
  const { data } = await api.get(`/form/${tenantId}/rent-quote`, { params: { month } });
  return data;
}

export async function updateTenantProfile(tenantId, payload) {
  const { data } = await api.put(`/forms/${tenantId}`, payload);
  return data.form || data;
}

export async function shiftTenant(tenantId, payload) {
  const { data } = await api.post(`/forms/${tenantId}/shift`, payload);
  return data;
}

export async function getShiftRentPreview(tenantId, payload) {
  const { data } = await api.post(`/forms/${tenantId}/shift-preview`, payload);
  return data;
}

export async function getLeavePreview(tenantId, leaveDate) {
  const { data } = await api.get(`/forms/${tenantId}/leave-preview`, {
    params: { leaveDate },
  });
  return data;
}

export async function markTenantLeave(payload) {
  const { data } = await api.post("/leave", payload);
  return data;
}

export async function archiveTenant(tenantId) {
  const { data } = await api.post("/forms/archive", { id: tenantId });
  return data;
}

export async function deleteTenant(tenantId, password) {
  const id = encodeURIComponent(String(tenantId));
  const payload = { password: String(password).trim() };

  try {
    const { data } = await api.post(`/forms/${id}/delete`, payload);
    return data;
  } catch (error) {
    // Compatibility for a backend process that has not yet loaded the newest route.
    if (error.response?.status !== 404 && error.response?.status !== 405) throw error;
  }

  try {
    const { data } = await api.post(`/form/${id}/delete`, payload);
    return data;
  } catch (error) {
    if (error.response?.status !== 404 && error.response?.status !== 405) throw error;
  }

  const { data } = await api.delete(`/form/${id}`, { data: payload });
  return data;
}

export async function getArchivedTenants() {
  const { data } = await api.get("/forms/archived");
  return data;
}

export async function restoreTenant(tenantId, allocation) {
  const { data } = await api.post("/forms/restore", { id: tenantId, ...(allocation ? { allocation } : {}) });
  return data;
}

export async function updateTenantDocuments(tenantId, documents) {
  const formData = new FormData();
  formData.append("formId", tenantId);
  for (const [field, document] of Object.entries(documents)) {
    if (!document) continue;
    if (Platform.OS === "web") {
      const response = await fetch(document.uri);
      const blob = await response.blob();
      formData.append(field, blob, document.name || `${field}.jpg`);
    } else {
      formData.append(field, {
        uri: document.uri,
        name: document.name || `${field}.jpg`,
        type: "image/jpeg",
      });
    }
  }
  const { data } = await api.post("/tenant-docs/with-docs", formData, {
    timeout: 60000,
  });
  return data;
}

export async function createTenant(payload) {
  const { data } = await api.post("/forms", payload);
  return data;
}

export async function importTenantsFromSheet(propertyType, rows) {
  const { data } = await api.post("/forms/import", { propertyType, rows });
  return data;
}

export async function createTenantInvite(payload) {
  const { data } = await api.post("/invites", payload);
  return data;
}

export async function createTenantInviteForForm(tenantId, payload = {}) {
  const { data } = await api.post(`/invites/for-form/${encodeURIComponent(String(tenantId))}`, payload);
  return data;
}

export async function validateTenantInvite(token) {
  const { data } = await api.get(`/invites/${encodeURIComponent(token)}`);
  return data;
}

export async function submitTenantInvite(token, payload) {
  const { data } = await api.put(`/invites/${encodeURIComponent(token)}/submit`, payload);
  return data;
}

export async function uploadTenantInviteDocuments(documents, inviteToken) {
  const body = new FormData();
  for (const [index, document] of documents.entries()) {
    if (document.file) {
      body.append("documents", document.file);
    } else if (Platform.OS === "web") {
      const response = await fetch(document.uri);
      const blob = await response.blob();
      body.append("documents", blob, document.name || `tenant-document-${index + 1}.jpg`);
    } else {
      body.append("documents", {
        uri: document.uri,
        name: document.name || `tenant-document-${index + 1}.jpg`,
        type: document.mimeType || "image/jpeg",
      });
    }
  }
  body.append("source", "tenant-intake");
  if (inviteToken) body.append("inviteToken", String(inviteToken).trim());

  const token = String(inviteToken || "").trim();
  const { data } = await api.post("/uploads/docs", body, {
    params: token ? { inviteToken: token } : undefined,
    headers: {
      ...(token ? { "X-Invite-Token": token } : {}),
    },
    timeout: 60000,
  });
  return data.files || data.data?.files || [];
}

export async function createTenantWithDocuments(fields, documents) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value));
    }
  });

  documents.forEach((document, index) => {
    formData.append("documents", {
      uri: document.uri,
      name: document.name || `tenant-document-${index + 1}.jpg`,
      type: "image/jpeg",
    });
    formData.append("relations", document.relation);
  });

  const { data } = await api.post("/forms-with-docs", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}
