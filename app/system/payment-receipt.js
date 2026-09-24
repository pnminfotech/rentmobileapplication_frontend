import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import { ArrowLeft, Share2 } from "lucide-react-native";

import { getTenant } from "../../src/api/tenantApi";
import { formatTenantUnit } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";
import { shareHtmlAsPdf } from "../../src/utils/sharePdf";

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

export default function PaymentReceiptScreen() {
  const baseRouter = useRouter();
  const { id, rentId, paymentIndex, returnTo = "/system/tenants" } = useLocalSearchParams();
  const resolvedReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const [tenant, setTenant] = useState(null);
  const [rent, setRent] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const goBack = useCallback(() => {
    baseRouter.replace(String(resolvedReturnTo || "/system/tenants"));
  }, [baseRouter, resolvedReturnTo]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]));

  const load = useCallback(async () => {
    try {
      const data = await getTenant(id);
      const rentEntry = (data.rents || []).find((entry) => String(entry._id) === String(rentId));
      if (!rentEntry) throw new Error("Receipt payment not found.");
      const payments = rentEntry.payments?.length ? rentEntry.payments : [{ amount: rentEntry.rentAmount, date: rentEntry.date, paymentMode: rentEntry.paymentMode, utr: rentEntry.utr, note: rentEntry.note }];
      const transaction = payments[Number(paymentIndex)];
      if (!transaction) throw new Error("Receipt transaction not found.");
      setTenant(data); setRent(rentEntry); setPayment(transaction);
    } catch (err) { setError(err.response?.data?.message || err.message || "Unable to load receipt."); }
    finally { setLoading(false); }
  }, [id, paymentIndex, rentId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const receiptNumber = `R-${String(tenant?.srNo || "0").padStart(4, "0")}-${String(rent?._id || "").slice(-6).toUpperCase()}-${Number(paymentIndex) + 1}`;
  const html = useMemo(() => !tenant || !rent || !payment ? "" : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#17202a;padding:32px}.head{border-bottom:2px solid #4f7fa6;padding-bottom:16px}.brand{font-size:25px;font-weight:700}.type{color:#4f7fa6;margin-top:5px}.meta{margin-top:20px;background:#f5f7fa;padding:14px}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb}.label{color:#6b7280}.amount{font-size:28px;font-weight:700;color:#244f70;margin:22px 0}.foot{margin-top:28px;color:#6b7280;font-size:12px}</style></head><body><div class="head"><div class="brand">${escapeHtml(tenant.category || "Rent Management")}</div><div class="type">Rent payment receipt</div></div><div class="meta"><div>Receipt: ${escapeHtml(receiptNumber)}</div><div>Date: ${escapeHtml(formatDate(payment.date))}</div></div><div class="amount">${escapeHtml(money(payment.amount))}</div><div class="row"><span class="label">Received from</span><b>${escapeHtml(tenant.name)}</b></div><div class="row"><span class="label">Rent month</span><b>${escapeHtml(rent.month)}</b></div><div class="row"><span class="label">Unit</span><b>${escapeHtml(formatTenantUnit(tenant))}</b></div><div class="row"><span class="label">Payment mode</span><b>${escapeHtml(payment.paymentMode || "Cash")}</b></div>${payment.utr ? `<div class="row"><span class="label">Reference</span><b>${escapeHtml(payment.utr)}</b></div>` : ""}${payment.note ? `<div class="row"><span class="label">Note</span><b>${escapeHtml(payment.note)}</b></div>` : ""}<div class="foot">Computer-generated receipt. No signature is required.</div></body></html>`, [payment, receiptNumber, rent, tenant]);

  async function printReceipt() {
    try { setGenerating(true); await Print.printAsync({ html }); }
    catch (err) { Alert.alert("Unable to print", err.message); }
    finally { setGenerating(false); }
  }

  async function shareReceipt() {
    try {
      setGenerating(true);
      if (Platform.OS === "web") return await Print.printAsync({ html });
      await shareHtmlAsPdf(html, { fileName: `${receiptNumber}.pdf`, dialogTitle: `Receipt ${receiptNumber}` });
    } catch (err) { Alert.alert("Unable to share PDF", err.message); }
    finally { setGenerating(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!payment) return <View style={styles.loading}><Text style={styles.error}>{error}</Text></View>;

  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={goBack} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View style={styles.headerText}><Text style={styles.title}>Payment receipt</Text><Text style={styles.subtitle}>{receiptNumber}</Text></View></View><ScrollView contentContainerStyle={styles.content}><View style={styles.receipt}><View style={styles.receiptHead}><Text style={styles.brand}>{tenant.category || "Rent Management"}</Text><Text style={styles.receiptType}>Rent payment receipt</Text></View><View style={styles.receiptMeta}><Text style={styles.metaText}>Receipt: {receiptNumber}</Text><Text style={styles.metaText}>Date: {formatDate(payment.date)}</Text></View><Text style={styles.amount}>{money(payment.amount)}</Text><View style={styles.row}><Text style={styles.label}>Received from</Text><Text style={styles.value}>{tenant.name}</Text></View><View style={styles.row}><Text style={styles.label}>Rent month</Text><Text style={styles.value}>{rent.month}</Text></View><View style={styles.row}><Text style={styles.label}>Unit</Text><Text style={styles.value}>{formatTenantUnit(tenant)}</Text></View><View style={styles.row}><Text style={styles.label}>Payment mode</Text><Text style={styles.value}>{payment.paymentMode || "Cash"}</Text></View>{payment.utr ? <View style={styles.row}><Text style={styles.label}>Reference</Text><Text style={styles.value}>{payment.utr}</Text></View> : null}{payment.note ? <View style={styles.row}><Text style={styles.label}>Note</Text><Text style={styles.value}>{payment.note}</Text></View> : null}<Text style={styles.footer}>Computer-generated receipt. No signature is required.</Text></View><View style={styles.actions}><Pressable onPress={Platform.OS === "web" ? printReceipt : shareReceipt} disabled={generating} style={styles.primaryButton}>{generating ? <ActivityIndicator color={colors.surface} /> : <><Share2 size={19} color={colors.surface} /><Text style={styles.primaryText}>PDF</Text></>}</Pressable></View></ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }, header: { width: "100%", maxWidth: 680, alignSelf: "center", padding: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }, iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, headerText: { marginLeft: 4 }, title: { color: colors.text, fontSize: 23, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 }, content: { width: "100%", maxWidth: 680, alignSelf: "center", padding: 18, paddingBottom: 40 },
  receipt: { padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface }, receiptHead: { paddingBottom: 15, borderBottomWidth: 2, borderBottomColor: colors.primary }, brand: { color: colors.text, fontSize: 23, fontWeight: "700" }, receiptType: { marginTop: 5, color: colors.primary, fontWeight: "600" }, receiptMeta: { marginTop: 17, padding: 12, backgroundColor: colors.background }, metaText: { marginVertical: 2, color: colors.muted, fontSize: 12 }, amount: { marginVertical: 22, color: colors.success, fontSize: 28, fontWeight: "700" }, row: { minHeight: 45, paddingVertical: 10, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }, label: { width: "42%", color: colors.muted }, value: { flex: 1, color: colors.text, fontWeight: "700", textAlign: "right" }, footer: { marginTop: 25, color: colors.muted, fontSize: 11, textAlign: "center" },
  actions: { marginTop: 14, flexDirection: "row", gap: 10 }, secondaryButton: { flex: 1, height: 50, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: 7 }, secondaryText: { color: colors.primary, fontWeight: "700" }, primaryButton: { flex: 1, height: 50, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, primaryText: { color: colors.surface, fontWeight: "700" }, error: { color: colors.danger, textAlign: "center" },
});
