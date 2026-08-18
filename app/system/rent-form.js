import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { addTenantRent, getTenant, getTenantRentDue, getTenantRentQuote } from "../../src/api/tenantApi";
import { formatTenantUnit } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

function localDateValue(date = new Date()) {
  return toDateValue(date);
}

function parseDateValue(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateFromMonthKey(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]);
  return new Date(2000 + Number(match[2]), month, 1);
}

function formatBreakdownLine(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  const amount = Number(item.amount || 0);
  const suffix = amount > 0 ? ` Rs. ${amount.toLocaleString("en-IN")}` : "";
  return `${item.label || "Light bill"}${suffix}`;
}

export default function RentFormScreen() {
  const router = useRouter();
  const { id, returnTo = "/system/tenants", month: requestedMonthParam } = useLocalSearchParams();
  const requestedMonth = Array.isArray(requestedMonthParam) ? requestedMonthParam[0] : requestedMonthParam;
  const [tenant, setTenant] = useState(null);
  const [due, setDue] = useState({ totalDue: 0, dueMonths: [] });
  const [selectedMonth, setSelectedMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateValue());
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);

  const loadTenant = useCallback(async () => {
    try {
      const [data, dueData] = await Promise.all([getTenant(id), getTenantRentDue(id)]);
      setTenant(data);
      setDue(dueData);
      const requestedDate = dateFromMonthKey(requestedMonth);
      if (requestedDate) {
        const requestedDue = dueData.dueMonths?.find((item) => item.month === requestedMonth);
        const rentEntry = (data.rents || []).find((rent) => rent.month === requestedMonth);
        const paid = Number(requestedDue?.paid ?? rentEntry?.rentAmount ?? 0);
        const expectedAmount = Number(requestedDue?.expected ?? data.baseRent ?? 0);
        const outstanding = requestedDue?.outstanding ?? Math.max(expectedAmount - paid, 0);
        setSelectedMonth(requestedDate);
        setAmount(String(outstanding || ""));
        return;
      }
      const firstDue = dueData.dueMonths?.[0];
      const dueDate = dateFromMonthKey(firstDue?.month);
      if (firstDue && dueDate) {
        setSelectedMonth(dueDate);
        setAmount(String(firstDue.outstanding || ""));
      } else {
        const currentKey = monthKey(new Date());
        const paid = Number((data.rents || []).find((rent) => rent.month === currentKey)?.rentAmount || 0);
        setAmount(String(Math.max(Number(data.baseRent || 0) - paid, 0) || ""));
      }
    }
    catch (err) { setError(err.response?.data?.message || "Unable to load tenant."); }
    finally { setLoading(false); }
  }, [id, requestedMonth]);
  useFocusEffect(useCallback(() => { loadTenant(); }, [loadTenant]));

  const key = monthKey(selectedMonth);
  const selectedDue = useMemo(() => (due.dueMonths || []).find((month) => month.month === key), [due.dueMonths, key]);
  const existingPaid = useMemo(() => Number(selectedDue?.paid ?? (tenant?.rents || []).find((rent) => rent.month === key)?.rentAmount ?? 0), [key, selectedDue?.paid, tenant]);
  const expected = Number(selectedDue?.expected ?? quote?.expected ?? tenant?.baseRent ?? 0);
  const balance = Math.max(expected - existingPaid, 0);
  const canteenExpected = Number(quote?.canteen?.expected || 0);
  const canteenPaid = Number(quote?.canteen?.paid || 0);
  const canteenBalance = Math.max(canteenExpected - canteenPaid, 0);
  const lightBillExpected = Number(quote?.lightBill?.expected || 0);
  const lightBillPaid = Number(quote?.lightBill?.paid || 0);
  const lightBillBalance = Math.max(lightBillExpected - lightBillPaid, 0);
  const totalExpected = Number(quote?.totalExpected ?? expected + canteenExpected + lightBillExpected);
  const totalPaid = Number(quote?.totalPaid ?? existingPaid + canteenPaid + lightBillPaid);
  const totalBalance = Math.max(Number(quote?.totalBalance ?? balance + canteenBalance + lightBillBalance), 0);

  useEffect(() => {
    if (!id || !tenant) return;
    let active = true;
    getTenantRentQuote(id, key).then((data) => {
      if (!active) return;
      setQuote(data);
      setAmount(String(Math.max(Number(data.totalBalance ?? data.balance ?? 0), 0) || ""));
    }).catch(() => { if (active) setQuote(null); });
    return () => { active = false; };
  }, [existingPaid, id, key, selectedDue, tenant]);

  function changeMonth(amountToShift) {
    const next = shiftMonth(selectedMonth, amountToShift);
    setSelectedMonth(next);
    setQuote(null);
    setAmount("");
  }

  function selectDueMonth(dueMonth) {
    const date = dateFromMonthKey(dueMonth.month);
    if (!date) return;
    setSelectedMonth(date);
    setAmount(String(dueMonth.outstanding || ""));
    setError("");
  }

  const goBack = useCallback(() => {
    router.replace(String(returnTo || "/system/tenants"));
  }, [returnTo, router]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]));

  async function saveRent() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a payment amount greater than zero.");
    const selectedPaymentDate = parseDateValue(paymentDate);
    if (!selectedPaymentDate) return setError("Select a valid payment date.");
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (selectedPaymentDate > todayEnd) return setError("Payment date cannot be in the future.");
    const safeReceiptUrl = receiptUrl.trim();
    if (safeReceiptUrl && !/^https?:\/\/\S+$/i.test(safeReceiptUrl)) {
      return setError("Receipt URL must start with http:// or https://.");
    }
    try {
      setSaving(true); setError("");
      const updatedTenant = await addTenantRent(id, {
        rentAmount: value,
        month: key,
        date: paymentDate,
        paymentMode,
        rentUpdateMode: "add",
        utr: paymentMode === "Online" ? utr.trim() : "",
        note: note.trim(),
        receiptUrl: safeReceiptUrl,
      });
      const rent = (updatedTenant.rents || []).find((entry) => entry.month === key);
      const index = Math.max((rent?.payments || []).length - 1, 0);
      router.replace({ pathname: "/system/payment-receipt", params: { id, rentId: rent?._id, paymentIndex: index, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to record rent payment."); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View><Text style={styles.title}>Add rent</Text><Text style={styles.subtitle}>{tenant?.name} | {formatTenantUnit(tenant || {})}</Text></View>
      </View>

      <View style={[styles.duePanel, !due.totalDue && styles.duePanelClear]}>
        <View style={styles.dueHeader}>
          <View><Text style={[styles.dueTitle, !due.totalDue && styles.dueClearText]}>{due.totalDue ? "Select a due month" : "No previous rent due"}</Text><Text style={styles.dueHint}>{due.totalDue ? "Tap the month this payment should clear" : "You can record the current or an advance month"}</Text></View>
          <Text style={[styles.dueTotal, !due.totalDue && styles.dueClearText]}>{due.totalDue ? `Rs. ${Number(due.totalDue).toLocaleString("en-IN")}` : "Clear"}</Text>
        </View>
        {due.dueMonths?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dueMonths}>
            {due.dueMonths.map((dueMonth) => {
              const selected = dueMonth.month === key;
              return (
                <Pressable key={dueMonth.month} onPress={() => selectDueMonth(dueMonth)} style={[styles.dueMonth, selected && styles.dueMonthSelected]}>
                  <Text style={[styles.dueMonthName, selected && styles.dueMonthSelectedText]}>{dueMonth.month}</Text>
                  <Text style={[styles.dueMonthAmount, selected && styles.dueMonthSelectedText]}>Rs. {Number(dueMonth.outstanding).toLocaleString("en-IN")} due</Text>
                  <Text style={[styles.dueMonthMeta, selected && styles.dueMonthSelectedMeta]}>Paid Rs. {Number(dueMonth.paid).toLocaleString("en-IN")} / {Number(dueMonth.expected).toLocaleString("en-IN")}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <Text style={styles.label}>Rent month</Text>
      <View style={styles.monthPicker}>
        <Pressable onPress={() => changeMonth(-1)} style={styles.monthButton}><ChevronLeft size={21} color={colors.primary} /></Pressable>
        <View style={styles.monthCenter}><Text style={styles.monthText}>{selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</Text></View>
        <Pressable onPress={() => changeMonth(1)} style={styles.monthButton}><ChevronRight size={21} color={colors.primary} /></Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Payment split</Text>
        <View style={styles.splitRow}>
          <Text style={styles.splitLabel}>Rent</Text>
          <Text style={styles.splitValue}>Rs. {Number(expected).toLocaleString("en-IN")}</Text>
          <Text style={styles.splitMeta}>Paid Rs. {Number(existingPaid).toLocaleString("en-IN")} | Due Rs. {Number(balance).toLocaleString("en-IN")}</Text>
        </View>
        {quote?.canteen?.applicable || canteenExpected > 0 ? (
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>Canteen</Text>
            <Text style={styles.splitValue}>Rs. {Number(canteenExpected).toLocaleString("en-IN")}</Text>
            <Text style={styles.splitMeta}>Paid Rs. {Number(canteenPaid).toLocaleString("en-IN")} | Due Rs. {Number(canteenBalance).toLocaleString("en-IN")}</Text>
            {quote?.canteen?.mealCounts ? (
              <Text style={styles.splitMeta}>
                Breakfast {quote.canteen.mealCounts.breakfast || 0} | Lunch {quote.canteen.mealCounts.lunch || 0} | Dinner {quote.canteen.mealCounts.dinner || 0}
                {quote.canteen.presentDays ? ` | Charged ${quote.canteen.presentDays}/${quote.canteen.daysInMonth} days` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
        {quote?.lightBill?.applicable || lightBillExpected > 0 ? (
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>Light bill</Text>
            <Text style={styles.splitValue}>Rs. {Number(lightBillExpected).toLocaleString("en-IN")}</Text>
            <Text style={styles.splitMeta}>Paid Rs. {Number(lightBillPaid).toLocaleString("en-IN")} | Due Rs. {Number(lightBillBalance).toLocaleString("en-IN")}</Text>
            {quote?.lightBill?.modeLabel ? <Text style={styles.splitMeta}>{quote.lightBill.modeLabel}</Text> : null}
            {Array.isArray(quote?.lightBill?.breakdown) && quote.lightBill.breakdown.length ? (
              <Text style={styles.splitMeta}>{quote.lightBill.breakdown.slice(0, 2).map(formatBreakdownLine).filter(Boolean).join(" | ")}</Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <View>
            <Text style={styles.summaryLabel}>Total payable</Text>
            <Text style={styles.summaryValue}>Rs. {Number(totalExpected).toLocaleString("en-IN")}</Text>
          </View>
          <View>
            <Text style={styles.summaryLabel}>Total paid</Text>
            <Text style={styles.summaryValue}>Rs. {Number(totalPaid).toLocaleString("en-IN")}</Text>
          </View>
          <View>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={styles.summaryValue}>Rs. {Number(totalBalance).toLocaleString("en-IN")}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.label}>Payment amount</Text>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={totalBalance ? String(totalBalance) : "Enter amount"} style={styles.input} />

      <FormDateField label="Payment date" value={paymentDate} onChange={setPaymentDate} maximumDate={new Date()} />

      <Text style={styles.label}>Payment mode</Text>
      <View style={styles.segment}>{["Cash", "Online"].map((mode) => <Pressable key={mode} onPress={() => setPaymentMode(mode)} style={[styles.segmentButton, paymentMode === mode && styles.segmentActive]}><Text style={[styles.segmentText, paymentMode === mode && styles.segmentTextActive]}>{mode}</Text></Pressable>)}</View>

      {paymentMode === "Online" ? <><Text style={styles.label}>UTR/reference number (optional)</Text><TextInput value={utr} onChangeText={setUtr} placeholder="Payment reference" style={styles.input} /></> : null}
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="Payment note" multiline style={[styles.input, styles.multiline]} />
      <Text style={styles.label}>Receipt URL (optional)</Text>
      <TextInput value={receiptUrl} onChangeText={setReceiptUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." style={styles.input} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={saveRent} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Record payment</Text>}</Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  duePanel: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 7, backgroundColor: colors.dangerSoft },
  duePanelClear: { borderColor: colors.successSoft, backgroundColor: colors.successSoft },
  dueHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dueTitle: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  dueHint: { marginTop: 3, color: colors.muted, fontSize: 10 },
  dueTotal: { marginLeft: 10, color: colors.danger, fontSize: 16, fontWeight: "700" },
  dueClearText: { color: colors.success },
  dueMonths: { paddingTop: 11, gap: 8 },
  dueMonth: { minWidth: 138, padding: 10, borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 6, backgroundColor: colors.surface },
  dueMonthSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  dueMonthName: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  dueMonthAmount: { marginTop: 5, color: colors.danger, fontSize: 12, fontWeight: "700" },
  dueMonthMeta: { marginTop: 4, color: colors.muted, fontSize: 9 },
  dueMonthSelectedText: { color: colors.surface },
  dueMonthSelectedMeta: { color: colors.primarySoft },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  multiline: { height: 76, paddingTop: 13, textAlignVertical: "top" },
  monthPicker: { height: 52, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  monthButton: { width: 48, height: 50, alignItems: "center", justifyContent: "center" },
  monthCenter: { flex: 1, alignItems: "center" },
  monthText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  summaryCard: { marginTop: 12, padding: 12, borderRadius: 7, backgroundColor: colors.primarySoft },
  summaryTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: "800" },
  splitRow: { marginTop: 10, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  splitLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  splitValue: { marginTop: 3, color: colors.primaryDark, fontSize: 18, fontWeight: "900" },
  splitMeta: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: "700" },
  totalRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  summaryLabel: { color: colors.muted, fontSize: 11 },
  summaryValue: { marginTop: 5, color: colors.primaryDark, fontSize: 14, fontWeight: "700" },
  segment: { height: 48, padding: 3, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontWeight: "600" },
  segmentTextActive: { color: colors.primary },
  error: { marginTop: 14, color: colors.danger },
  saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  saveText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
