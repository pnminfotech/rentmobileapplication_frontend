import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react-native";

import FormDateField from "../../src/components/FormDateField";
import { editTenantRentPayment, getTenant, voidTenantRentPayment } from "../../src/api/tenantApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

function localDateValue(value = new Date()) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateFromMonthKey(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  if (!match) return new Date();
  return new Date(2000 + Number(match[2]), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]), 1);
}

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

export default function PaymentEditScreen() {
  const router = useRouter();
  const { id, rentId, paymentIndex, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [tenant, setTenant] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateValue());
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getTenant(id);
      const rent = (data.rents || []).find((entry) => String(entry._id) === String(rentId));
      if (!rent) throw new Error("Payment month not found.");
      const payments = rent.payments?.length ? rent.payments : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note, receiptUrl: rent.receiptUrl }];
      const payment = payments[Number(paymentIndex)];
      if (!payment) throw new Error("Payment transaction not found.");
      setTenant(data);
      setSelectedMonth(dateFromMonthKey(rent.month));
      setAmount(String(payment.amount || ""));
      setPaymentDate(localDateValue(payment.date));
      setPaymentMode(payment.paymentMode === "Online" ? "Online" : "Cash");
      setUtr(payment.utr || "");
      setNote(payment.note || "");
      setReceiptUrl(payment.receiptUrl || "");
    } catch (err) { setError(err.response?.data?.message || err.message || "Unable to load payment."); }
    finally { setLoading(false); }
  }, [id, paymentIndex, rentId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a payment amount greater than zero.");
    try {
      setSaving(true); setError("");
      await editTenantRentPayment(id, rentId, paymentIndex, { amount: value, month: monthKey(selectedMonth), date: paymentDate, paymentMode, utr, note, receiptUrl });
      router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to edit payment."); }
    finally { setSaving(false); }
  }

  async function voidPayment() {
    if (voidReason.trim().length < 3) return setError("Enter why this payment is being voided.");
    try {
      setVoiding(true); setError("");
      await voidTenantRentPayment(id, rentId, paymentIndex, voidReason.trim());
      router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to void payment."); }
    finally { setVoiding(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
    <View style={styles.header}><Pressable onPress={() => router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } })} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Edit payment</Text><Text style={styles.subtitle}>{tenant?.name || "Tenant"} | Admin correction</Text></View></View>
    <Text style={styles.label}>Rent month</Text>
    <View style={styles.monthPicker}><Pressable onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))} style={styles.monthButton}><ChevronLeft size={21} color={colors.primary} /></Pressable><Text style={styles.monthText}>{selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</Text><Pressable onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))} style={styles.monthButton}><ChevronRight size={21} color={colors.primary} /></Pressable></View>
    <Text style={styles.label}>Paid amount</Text><TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.input} />
    <FormDateField label="Payment date" value={paymentDate} onChange={setPaymentDate} maximumDate={new Date()} />
    <Text style={styles.label}>Payment mode</Text><View style={styles.segment}>{["Cash", "Online"].map((mode) => <Pressable key={mode} onPress={() => setPaymentMode(mode)} style={[styles.segmentButton, paymentMode === mode && styles.segmentActive]}><Text style={[styles.segmentText, paymentMode === mode && styles.segmentTextActive]}>{mode}</Text></Pressable>)}</View>
    {paymentMode === "Online" ? <><Text style={styles.label}>UTR/reference number (optional)</Text><TextInput value={utr} onChangeText={setUtr} style={styles.input} /></> : null}
    <Text style={styles.label}>Note</Text><TextInput value={note} onChangeText={setNote} multiline style={[styles.input, styles.multiline]} />
    <Text style={styles.label}>Receipt URL</Text><TextInput value={receiptUrl} onChangeText={setReceiptUrl} autoCapitalize="none" keyboardType="url" style={styles.input} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable onPress={save} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save correction</Text>}</Pressable>
    <View style={styles.dangerSection}>
      {!showVoid ? <Pressable onPress={() => setShowVoid(true)} style={styles.voidOutline}><Text style={styles.voidOutlineText}>Void this payment</Text></Pressable> : <><Text style={styles.dangerTitle}>Void payment</Text><Text style={styles.dangerHint}>The amount will be removed from paid totals. The audit record will remain.</Text><TextInput value={voidReason} onChangeText={setVoidReason} placeholder="Reason for voiding" multiline style={[styles.input, styles.multiline, styles.voidReason]} /><View style={styles.dangerActions}><Pressable onPress={() => { setShowVoid(false); setVoidReason(""); }} style={styles.cancelVoid}><Text style={styles.cancelVoidText}>Cancel</Text></Pressable><Pressable onPress={voidPayment} disabled={voiding} style={[styles.confirmVoid, voiding && styles.disabled]}>{voiding ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.confirmVoidText}>Confirm void</Text>}</Pressable></View></>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 40 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.background }, iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 25, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" }, input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 }, multiline: { height: 76, paddingTop: 13, textAlignVertical: "top" },
  monthPicker: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, monthButton: { width: 48, height: 50, alignItems: "center", justifyContent: "center" }, monthText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  segment: { height: 48, padding: 3, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border }, segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 }, segmentActive: { backgroundColor: colors.surface }, segmentText: { color: colors.muted, fontWeight: "600" }, segmentTextActive: { color: colors.primary },
  error: { marginTop: 14, color: colors.danger }, saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, saveText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.5 },
  dangerSection: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border }, voidOutline: { height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger, borderRadius: 7 }, voidOutlineText: { color: colors.danger, fontWeight: "700" }, dangerTitle: { color: colors.danger, fontSize: 16, fontWeight: "700" }, dangerHint: { marginTop: 5, color: colors.muted, fontSize: 12 }, voidReason: { marginTop: 12 }, dangerActions: { marginTop: 10, flexDirection: "row", gap: 9 }, cancelVoid: { flex: 1, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7 }, cancelVoidText: { color: colors.muted, fontWeight: "700" }, confirmVoid: { flex: 1, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.danger }, confirmVoidText: { color: colors.surface, fontWeight: "700" },
});
