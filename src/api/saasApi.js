import { api } from "./client";
import { saveAuthSession } from "../storage/authStorage";

export async function loginSaas(email, password) {
  const { data } = await api.post("/saas/auth/login", {
    email,
    password,
  });

  if (data.token) {
    await saveAuthSession({
      token: data.token,
      user: data.user,
    });
  }

  return data;
}

export async function verifySaasLoginEmailCode(challengeId, code) {
  const { data } = await api.post("/saas/auth/login/verify-email", { challengeId, code });
  await saveAuthSession({ token: data.token, user: data.user });
  return data;
}

export async function resendSaasLoginEmailCode(challengeId) {
  const { data } = await api.post("/saas/auth/login/resend-email-code", { challengeId });
  return data;
}

export async function requestSuperadminEmailChange(newEmail, password) {
  const { data } = await api.post("/saas/admin/security/email-change/request", { newEmail, password });
  return data;
}

export async function verifySuperadminEmailChange(challengeId, code) {
  const { data } = await api.post("/saas/admin/security/email-change/verify", { challengeId, code });
  return data;
}

export async function resendSuperadminEmailChangeCode(challengeId) {
  const { data } = await api.post("/saas/admin/security/email-change/resend", { challengeId });
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

export async function updateOrganizationStatus(organizationId, status, securityPin) {
  const { data } = await api.patch(`/saas/admin/organizations/${organizationId}/status`, { status, securityPin });
  return data;
}

export async function getOrganizationVacantUnits(organizationId) {
  const { data } = await api.get(`/saas/admin/organizations/${organizationId}/vacant-units`);
  return data;
}

export async function removeOrganizationVacantUnit(organizationId, unitId, payload) {
  const { data } = await api.delete(`/saas/admin/organizations/${organizationId}/vacant-units/${unitId}`, { data: payload });
  return data;
}

export async function activateSubscription(subscriptionId, securityPin) {
  const { data } = await api.post(`/saas/admin/subscriptions/${subscriptionId}/activate`, { securityPin });
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

export async function deleteSubscriptionPlan(planId, securityPin) {
  const { data } = await api.delete(`/saas/admin/plans/${planId}`, { data: { securityPin } });
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

export async function deleteReferralCode(referralId, securityPin) {
  const { data } = await api.delete(`/saas/admin/referrals/${referralId}`, { data: { securityPin } });
  return data;
}

export async function getSecurityPinStatus() {
  const { data } = await api.get("/saas/admin/security/pin-status");
  return data;
}

export async function getSystemSecurityPinStatus() {
  const { data } = await api.get("/saas/security/pin-status");
  return data;
}

export async function saveSystemSecurityPin(payload) {
  const { data } = await api.post("/saas/security/pin", payload);
  return data;
}

export async function resetSystemSecurityPin(payload) {
  const { data } = await api.post("/saas/security/pin/reset", payload);
  return data;
}

export async function saveSecurityPin(payload) {
  const { data } = await api.post("/saas/admin/security/pin", payload);
  return data;
}

export async function resetSecurityPin(payload) {
  const { data } = await api.post("/saas/admin/security/pin/reset", payload);
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
