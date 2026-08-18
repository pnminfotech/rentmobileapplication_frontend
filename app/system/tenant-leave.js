import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { getLeavePreview, getTenant, markTenantLeave } from "../../src/api/tenantApi";
import { formatTenantUnit } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function TenantLeaveScreen() {
  const router = useRouter();
  const { id, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [tenant, setTenant] = useState(null);
  const [leaveDate, setLeaveDate] = useState(toDateValue());
  const [preview, setPreview] = useState(null);
  const [deductFromDeposit, setDeductFromDeposit] = useState(true);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadTenant = useCallback(async () => {
    try { setTenant(await getTenant(id)); }
    catch (err) { setError(err.response?.data?.message || "Unable to load tenant."); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { loadTenant(); }, [loadTenant]));

  useEffect(() => {
    let active = true;
    getLeavePreview(id, leaveDate)
      .then((data) => { if (active) { setPreview(data); setError(""); } })
      .catch((err) => { if (active) setError(err.response?.data?.message || "Unable to calculate settlement."); });
    return () => { active = false; };
  }, [id, leaveDate]);

  const grossDeposit = Number(preview?.grossDeposit || 0);
  const totalDue = Number(preview?.totalDue || 0);
  const refundable = deductFromDeposit ? Math.max(grossDeposit - totalDue, 0) : grossDeposit;
  const amountDue = deductFromDeposit ? Math.max(totalDue - grossDeposit, 0) : totalDue;

  async function confirmLeave() {
    if (!preview) return setError("Wait for settlement calculation.");
    try {
      setSaving(true); setError("");
      await markTenantLeave({
        tenantId: id,
        leaveDate,
        leaveSettlement: {
          deductFromDeposit,
          selectedMonths: deductFromDeposit ? preview.dueMonths.map((month) => month.month) : [],
          deductions: deductFromDeposit ? preview.dueMonths.map((month) => ({ month: month.month, amount: month.outstanding })) : [],
          grossDeposit,
          totalDeduction: deductFromDeposit ? totalDue : 0,
          refundableDeposit: refundable,
          amountDueFromTenant: amountDue,
          note: note.trim(),
        },
      });
      router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to mark tenant leaving."); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}><Pressable onPress={() => router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } })} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Tenant leaving</Text><Text style={styles.subtitle}>{tenant?.name} | {formatTenantUnit(tenant || {})}</Text></View></View>
      <FormDateField label="Leave date" value={leaveDate} onChange={setLeaveDate} minimumDate={new Date()} />

      <Text style={styles.sectionTitle}>Pending rent at leave date</Text>
      <View style={styles.dueList}>
        {!preview?.dueMonths?.length ? <Text style={styles.clearText}>No completed rent cycle is pending.</Text> : null}
        {preview?.dueMonths?.map((month) => (
          <View key={month.month} style={styles.dueRow}>
            <View style={styles.dueInfo}>
              <Text style={styles.dueMonth}>{month.month}{month.partial ? " partial" : ""}</Text>
              <Text style={styles.dueMeta}>{money(month.paid)} paid of {money(month.expected)}</Text>
              {month.partial ? (
                <Text style={styles.dueMeta}>
                  Charged {month.chargedDays || 0} of {month.totalDays || 0} days
                  {month.cycleStart && month.chargedUntil ? ` (${shortDate(month.cycleStart)} - ${shortDate(new Date(new Date(month.chargedUntil).getTime() - 86400000))})` : ""}
                </Text>
              ) : null}
            </View>
            <Text style={styles.dueAmount}>{money(month.outstanding)}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => setDeductFromDeposit((value) => !value)} style={styles.checkboxRow}>
        <View style={[styles.checkbox, deductFromDeposit && styles.checkboxChecked]}>{deductFromDeposit ? <Check size={16} color={colors.surface} /> : null}</View>
        <View><Text style={styles.checkboxTitle}>Deduct pending rent from deposit</Text><Text style={styles.checkboxHint}>Turn off to refund the full deposit and collect dues separately.</Text></View>
      </Pressable>

      <View style={styles.settlement}>
        <View style={styles.settlementRow}><Text style={styles.settlementLabel}>Deposit held</Text><Text style={styles.settlementValue}>{money(grossDeposit)}</Text></View>
        <View style={styles.settlementRow}><Text style={styles.settlementLabel}>Rent due</Text><Text style={[styles.settlementValue, styles.danger]}>{money(totalDue)}</Text></View>
        <View style={styles.divider} />
        <View style={styles.settlementRow}><Text style={styles.resultLabel}>Refund to tenant</Text><Text style={styles.refund}>{money(refundable)}</Text></View>
        {amountDue > 0 ? <View style={styles.settlementRow}><Text style={styles.resultLabel}>Collect additionally</Text><Text style={styles.danger}>{money(amountDue)}</Text></View> : null}
      </View>

      <Text style={styles.label}>Settlement note (optional)</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="Keys returned, damages, payment arrangement..." multiline style={styles.note} />
      <Text style={styles.info}>The tenant remains active until the selected leave date. Their unit becomes available after leaving.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={confirmLeave} disabled={saving || !preview} style={[styles.saveButton, (saving || !preview) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Confirm leave and settlement</Text>}</Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 6, backgroundColor: colors.background }, iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 24, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  sectionTitle: { marginTop: 20, marginBottom: 8, color: colors.text, fontSize: 16, fontWeight: "700" }, dueList: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, clearText: { padding: 16, color: colors.success, textAlign: "center", fontWeight: "600" }, dueRow: { minHeight: 58, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, dueInfo: { flex: 1, paddingRight: 10 }, dueMonth: { color: colors.text, fontWeight: "700" }, dueMeta: { marginTop: 4, color: colors.muted, fontSize: 11 }, dueAmount: { color: colors.danger, fontWeight: "700" },
  checkboxRow: { marginTop: 14, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, checkbox: { width: 24, height: 24, marginRight: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.subtle, borderRadius: 4 }, checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary }, checkboxTitle: { color: colors.text, fontWeight: "700" }, checkboxHint: { marginTop: 3, color: colors.muted, fontSize: 10 },
  settlement: { marginTop: 14, padding: 14, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, settlementRow: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, settlementLabel: { color: colors.muted }, settlementValue: { color: colors.text, fontWeight: "700" }, divider: { height: 1, marginVertical: 7, backgroundColor: colors.border }, resultLabel: { color: colors.text, fontWeight: "700" }, refund: { color: colors.success, fontSize: 17, fontWeight: "700" }, danger: { color: colors.danger, fontWeight: "700" },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" }, note: { height: 80, padding: 13, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, info: { marginTop: 12, color: colors.muted, fontSize: 11, lineHeight: 16 }, error: { marginTop: 14, color: colors.danger }, saveButton: { minHeight: 50, marginTop: 22, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.danger }, saveText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.5 },
});
