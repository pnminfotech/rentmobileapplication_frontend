import { api } from "./client";
import { saveAuthSession } from "../storage/authStorage";

export async function loginSaas(email, password) {
  const { data } = await api.post("/saas/auth/login", {
    email,
    password,
  });

  await saveAuthSession({
    token: data.token,
    user: data.user,
  });

  return data;
}

export async function requestPasswordReset(email) {
  const { data } = await api.post("/saas/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token, password) {
  const { data } = await api.post("/saas/auth/reset-password", { token, password });
  return data;
}

export async function registerBusiness(payload) {
  const { data } = await api.post("/saas/register", payload);
  return data;
}

export async function quoteReferralCode(payload) {
  const { data } = await api.post("/saas/referrals/quote", payload);
  return data;
}

export async function getAppBootstrap() {
  const { data } = await api.get("/saas/app/bootstrap");
  return data;
}

export async function requestSubscriptionRenewal(payload = {}) {
  const { data } = await api.post("/saas/subscription/renew-request", payload);
  return data;
}

export async function requestSubscriptionUpgrade(payload = {}) {
  const { data } = await api.post("/saas/subscription/upgrade-request", payload);
  return data;
}

export async function saveOnboardingUnits(payload = {}) {
  const { data } = await api.post("/saas/onboarding/units", payload);
  return data;
}

export async function createSaasPayment(payload = {}) {
  const { data } = await api.post("/saas/payments/create", payload);
  return data;
}

export async function getSaasPaymentStatus(transactionId) {
  const { data } = await api.get(`/saas/payments/${transactionId}/status`);
  return data;
}

export async function completeMockSaasPayment(transactionId) {
  const { data } = await api.post(`/saas/payments/mock/success/${transactionId}`);
  return data;
}

export async function getSuperAdminDashboard() {
  const { data } = await api.get("/saas/admin/dashboard");
  return data;
}

export async function getOrganizations() {
  const { data } = await api.get("/saas/admin/organizations");
  return data;
}

export async function updateOrganizationStatus(organizationId, status) {
  const { data } = await api.patch(`/saas/admin/organizations/${organizationId}/status`, { status });
  return data;
}

export async function activateSubscription(subscriptionId) {
  const { data } = await api.post(`/saas/admin/subscriptions/${subscriptionId}/activate`);
  return data;
}

export async function renewOrganizationSubscription(organizationId, payload = {}) {
  const { data } = await api.post(`/saas/admin/organizations/${organizationId}/renew`, payload);
  return data;
}

export async function approveOrganizationUpgrade(organizationId, payload = {}) {
  const { data } = await api.post(`/saas/admin/organizations/${organizationId}/upgrade/approve`, payload);
  return data;
}

export async function getBillingTransactions(params = {}) {
  const { data } = await api.get("/saas/payments/admin/transactions", { params });
  return data;
}

export async function getSubscriptionPlans() {
  const { data } = await api.get("/saas/plans");
  return data;
}

export async function getAdminSubscriptionPlans() {
  const { data } = await api.get("/saas/admin/plans");
  return data;
}

export async function createSubscriptionPlan(payload) {
  const { data } = await api.post("/saas/admin/plans", payload);
  return data;
}

export async function updateSubscriptionPlan(planId, payload) {
  const { data } = await api.patch(`/saas/admin/plans/${planId}`, payload);
  return data;
}

export async function deleteSubscriptionPlan(planId) {
  const { data } = await api.delete(`/saas/admin/plans/${planId}`);
  return data;
}

export async function getReferralCodes() {
  const { data } = await api.get("/saas/admin/referrals");
  return data;
}

export async function createReferralCode(payload) {
  const { data } = await api.post("/saas/admin/referrals", payload);
  return data;
}

export async function updateReferralCode(referralId, payload) {
  const { data } = await api.patch(`/saas/admin/referrals/${referralId}`, payload);
  return data;
}

export async function deleteReferralCode(referralId) {
  const { data } = await api.delete(`/saas/admin/referrals/${referralId}`);
  return data;
}

export async function getSystemDashboard() {
  const { data } = await api.get("/saas/dashboard");
  return data;
}

export async function getWalletSummary() {
  const { data } = await api.get("/saas/wallet");
  return data;
}
