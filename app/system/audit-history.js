import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, History } from "lucide-react-native";

import { getAuditLogs } from "../../src/api/auditApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

const ENTITY_LABELS = {
  lightBill: "Light bill",
  staffExpense: "Staff expense",
  otherExpense: "Other expense",
  rentPayment: "Rent payment",
};

const FIELD_LABELS = {
  amount: "Amount",
  mainAmount: "Amount",
  salary: "Amount",
  rentAmount: "Rent amount",
  date: "Date",
  paymentMode: "Payment mode",
  utr: "UTR / reference",
  note: "Note",
  notes: "Notes",
  receiptUrl: "Receipt URL",
  month: "Rent month",
  name: "Name",
  type: "Type",
  status: "Status",
  propertyType: "Property type",
  roomNo: "Room / unit no.",
  roomId: "Room ID",
  meterNo: "Meter no.",
  totalReading: "Meter reading",
  customLabel: "Custom label",
  buildingName: "Building",
  scopeType: "Expense scope",
  scopeName: "Scope name",
  expenses: "Expense details",
  voidReason: "Void reason",
};

const MONEY_FIELDS = new Set(["amount", "mainAmount", "salary", "rentAmount"]);
const DATE_FIELDS = new Set(["date", "createdAt", "updatedAt"]);
const HIDDEN_FIELDS = new Set(["_id", "__v", "tenantId", "rentId", "organizationId"]);

function paramValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN");
}

function friendlyField(field) {
  return FIELD_LABELS[field] || String(field || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase());
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `Rs. ${amount.toLocaleString("en-IN")}` : cleanValue("", value);
}

function compactText(value) {
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function cleanValue(field, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (MONEY_FIELDS.has(field)) return formatMoney(value);
  if (DATE_FIELDS.has(field) || value instanceof Date) return formatDate(value);
  if (Array.isArray(value)) return compactText(value.filter(Boolean).join(" | "));
  if (typeof value === "object") return compactText(JSON.stringify(value));
  return compactText(value);
}

function actionLabel(action) {
  if (action === "create") return "Created";
  if (action === "delete") return "Deleted";
  return "Updated";
}

function changeRows(changes) {
  return Object.entries(changes || {})
    .filter(([field]) => !HIDDEN_FIELDS.has(field))
    .map(([field, value]) => ({
      field,
      label: friendlyField(field),
      before: cleanValue(field, value?.before),
      after: cleanValue(field, value?.after),
    }));
}

function recordSummary(log) {
  const record = log.action === "delete" ? log.before : log.after;
  if (!record) return log.action === "create" ? "Record was created." : "Record was deleted.";
  const pieces = [];
  if (record.tenantName) pieces.push(record.tenantName);
  if (record.month) pieces.push(record.month);
  if (record.amount || record.mainAmount || record.salary) {
    pieces.push(formatMoney(record.amount ?? record.mainAmount ?? record.salary));
  }
  if (record.status) pieces.push(`Status: ${record.status}`);
  return pieces.length ? pieces.join(" | ") : (log.action === "create" ? "Record was created." : "Record was deleted.");
}

export default function AuditHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const entityType = paramValue(params.entityType);
  const entityId = paramValue(params.entityId);
  const title = paramValue(params.title);
  const returnTo = paramValue(params.returnTo) || "/system/more";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const heading = useMemo(() => title || ENTITY_LABELS[entityType] || "Record", [entityType, title]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getAuditLogs({ entityType, entityId });
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load audit history.");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace(returnTo)} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Audit history</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{heading}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && !logs.length ? (
          <View style={styles.empty}>
            <History size={34} color={colors.subtle} />
            <Text style={styles.emptyTitle}>No audit history</Text>
            <Text style={styles.emptyText}>New edits will appear here after this feature is active.</Text>
          </View>
        ) : null}

        {logs.map((log) => {
          const rows = changeRows(log.changes);
          return (
            <View key={log._id} style={styles.log}>
              <View style={styles.logTop}>
                <View>
                  <Text style={[styles.action, log.action === "delete" && styles.deleteAction]}>{actionLabel(log.action)}</Text>
                  <Text style={styles.meta}>{formatDate(log.createdAt)} by {log.actorName || "Admin"}</Text>
                </View>
                <Text style={styles.role}>{log.actorRole || "admin"}</Text>
              </View>

              {rows.length ? (
                <View style={styles.changes}>
                  {rows.map((row) => (
                    <View key={row.field} style={styles.changeRow}>
                      <Text style={styles.field}>{row.label}</Text>
                      <View style={styles.valuePair}>
                        <View style={styles.valueBlock}>
                          <Text style={styles.valueLabel}>Before</Text>
                          <Text style={styles.changeText}>{row.before}</Text>
                        </View>
                        <View style={styles.valueBlock}>
                          <Text style={styles.valueLabel}>After</Text>
                          <Text style={styles.changeText}>{row.after}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noChanges}>{recordSummary(log)}</Text>
              )}

              {log.reason ? <Text style={styles.reason}>Reason: {log.reason}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { width: "100%", maxWidth: 780, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, marginLeft: 4 },
  title: { color: colors.text, fontSize: 23, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  body: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingBottom: 36, gap: 10 },
  loading: { minHeight: 260, alignItems: "center", justifyContent: "center" },
  error: { marginTop: 20, color: colors.danger, textAlign: "center" },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 10, color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: { marginTop: 5, color: colors.muted, textAlign: "center" },
  log: { padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  logTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  action: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  deleteAction: { color: colors.danger },
  meta: { marginTop: 4, color: colors.muted, fontSize: 11 },
  role: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  changes: { marginTop: 12, gap: 8 },
  changeRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.surfaceSoft },
  field: { color: colors.text, fontSize: 12, fontWeight: "800" },
  valuePair: { marginTop: 6, flexDirection: "row", gap: 8 },
  valueBlock: { flex: 1, minWidth: 0, padding: 8, borderRadius: 6, backgroundColor: colors.surfaceSoft },
  valueLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  changeText: { marginTop: 3, color: colors.muted, fontSize: 11 },
  noChanges: { marginTop: 12, color: colors.muted, fontSize: 12 },
  reason: { marginTop: 10, color: colors.warning, fontSize: 12, fontWeight: "700" },
});
