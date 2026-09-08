import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ArrowLeft, DatabaseBackup, FileDown, FileText } from "lucide-react-native";

import { getExpenses } from "../../src/api/expenseApi";
import { getLightBills } from "../../src/api/lightBillApi";
import { getRooms } from "../../src/api/roomApi";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getStaffExpenses } from "../../src/api/staffExpenseApi";
import { getRentDues, getTenants } from "../../src/api/tenantApi";
import { getCanteenAttendanceRange } from "../../src/api/canteenApi";
import { formatTenantUnit } from "../../src/utils/unitLabels";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function csvSection(title, headers, rows) {
  return [[title], headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function expenseParts(item) {
  return Array.isArray(item.expenses) ? item.expenses.filter(Boolean) : [];
}

function lightAmount(item) {
  return Number(item?.amount ?? item?.salary ?? 0);
}

function expenseAmount(item) {
  return Number(item?.mainAmount ?? item?.amount ?? 0);
}

function tenantRows(tenants, canteenEnabled = true) {
  return tenants.map((tenant) => [
    tenant.name,
    tenant.phoneNo,
    formatTenantUnit(tenant),
    tenant.category,
    tenant.roomNo,
    tenant.bedNo,
    tenant.status || (tenant.leaveDate ? "Left" : "Active"),
    tenant.baseRent || tenant.rentAmount,
    tenant.depositAmount,
    ...(canteenEnabled ? [tenant.hasCanteen ? "Taken" : "Not taken"] : []),
    formatDate(tenant.joiningDate),
    formatDate(tenant.leaveDate),
  ]);
}

function rentRows(tenants) {
  return tenants.flatMap((tenant) => (tenant.rents || []).flatMap((rent) => {
    const payments = Array.isArray(rent.payments) && rent.payments.length
      ? rent.payments
      : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
    return payments.map((payment, index) => [
      tenant.name,
      tenant.phoneNo,
      formatTenantUnit(tenant),
      rent.month,
      payment.amount,
      formatDate(payment.date),
      payment.paymentMode || rent.paymentMode,
      payment.utr,
      payment.note,
      index + 1,
    ]);
  }));
}

function unitRows(units) {
  return units.flatMap((unit) => {
    const type = unit.propertyType === "room" ? "Room" : unit.propertyType === "shop" ? "Shop" : "Hostel";
    const beds = Array.isArray(unit.beds) && unit.beds.length ? unit.beds : [{}];
    return beds.map((bed) => [
      type,
      unit.category,
      unit.roomNo,
      unit.floorNo,
      bed.bedNo,
      bed.price || unit.price,
      unit.meterNo,
      unit.lastMeterReading,
    ]);
  });
}

function lightRows(items) {
  return items.map((item) => [
    item.propertyType || "bed",
    item.billPayer || (item.isUnitLinked === false ? "owner" : "tenant"),
    item.billingMode || "",
    item.isUnitLinked === false ? "No" : "Yes",
    item.category,
    item.roomNo,
    item.meterNo,
    item.totalReading,
    lightAmount(item),
    item.status || "pending",
    formatDate(item.date),
    item.createdByName,
    formatDate(item.createdAt),
    item.updatedByName,
    formatDate(item.updatedAt),
  ]);
}

function staffRows(items) {
  return items.map((item) => [
    item.type,
    item.name,
    item.amount,
    item.status || "pending",
    formatDate(item.date),
    item.notes,
    item.createdByName,
    formatDate(item.createdAt),
    item.updatedByName,
    formatDate(item.updatedAt),
  ]);
}

function otherRows(items) {
  return items.map((item) => {
    const parts = expenseParts(item);
    return [
      parts[0] || item.category,
      parts.slice(1).join(" | "),
      item.scopeType || item.propertyType,
      item.scopeName || item.buildingName,
      item.roomNo,
      expenseAmount(item),
      item.status || "pending",
      formatDate(item.date),
      item.createdByName,
      formatDate(item.createdAt),
      item.updatedByName,
      formatDate(item.updatedAt),
    ];
  });
}

function dueRows(dues) {
  return (dues.tenants || []).map((item) => [
    item.name,
    item.phoneNo,
    item.totalDue,
    (item.dueMonths || []).map((month) => `${month.month}: ${month.outstanding ?? month.pending}`).join("; "),
  ]);
}

function canteenUnit(item) {
  return [item.category, item.roomNo ? `Room ${item.roomNo}` : "", item.bedNo ? `Bed ${item.bedNo}` : ""]
    .filter(Boolean)
    .join(" | ");
}

function attendanceStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "present") return "Present";
  if (raw === "absent") return "Absent";
  return "";
}

function canteenAttendanceRows(items) {
  const grouped = new Map();
  (items || []).forEach((item) => {
    const key = `${item.tenantId || item.tenantName}-${item.dateKey}`;
    const existing = grouped.get(key) || {
      tenantName: item.tenantName,
      phoneNo: item.phoneNo,
      unit: canteenUnit(item),
      dateKey: item.dateKey,
      breakfast: "",
      lunch: "",
      dinner: "",
    };
    if (item.meal === "breakfast") existing.breakfast = attendanceStatus(item.status);
    if (item.meal === "lunch") existing.lunch = attendanceStatus(item.status);
    if (item.meal === "dinner") existing.dinner = attendanceStatus(item.status);
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)) || String(a.tenantName).localeCompare(String(b.tenantName)))
    .map((item) => [
      item.tenantName,
      item.phoneNo,
      item.unit,
      item.dateKey,
      item.breakfast,
      item.lunch,
      item.dinner,
    ]);
}

function buildSections(data) {
  return [
    { key: "tenants", title: "Tenants", headers: ["Name", "Phone", "Unit", "Building", "Room", "Bed", "Status", "Rent", "Deposit", ...(data.canteenEnabled ? ["Canteen"] : []), "Joining", "Leaving"], rows: tenantRows(data.tenants, data.canteenEnabled) },
    { key: "rent", title: "Rent payment history", headers: ["Tenant", "Phone", "Unit", "Month", "Amount", "Date", "Mode", "Reference", "Note", "Payment no"], rows: rentRows(data.tenants) },
    { key: "dues", title: "Rent dues", headers: ["Tenant", "Phone", "Total due", "Due months"], rows: dueRows(data.dues) },
    ...(data.canteenEnabled ? [{ key: "canteen-attendance", title: "Canteen attendance", headers: ["Tenant", "Phone", "Unit", "Date", "Breakfast", "Lunch", "Dinner"], rows: canteenAttendanceRows(data.canteenAttendance) }] : []),
    { key: "units", title: "Units", headers: ["Type", "Building", "Room", "Floor", "Bed", "Rent", "Meter no", "Last reading"], rows: unitRows(data.units) },
    { key: "light", title: "Light bills", headers: ["Type", "Paid by", "Billing mode", "Linked to unit", "Building", "Room", "Meter no", "Reading", "Amount", "Status", "Date", "Created by", "Created at", "Last changed by", "Last changed at"], rows: lightRows(data.lightBills) },
    { key: "staff", title: "Staff expenses", headers: ["Type", "Name", "Amount", "Status", "Date", "Notes", "Created by", "Created at", "Last changed by", "Last changed at"], rows: staffRows(data.staffExpenses) },
    { key: "other", title: "Other expenses", headers: ["Category", "Details", "Scope type", "Scope name", "Unit", "Amount", "Status", "Date", "Created by", "Created at", "Last changed by", "Last changed at"], rows: otherRows(data.otherExpenses) },
  ];
}

function buildFullCsv(data) {
  return buildSections(data).map((section) => csvSection(section.title, section.headers, section.rows)).join("\n\n");
}

function buildHtml(data) {
  const sections = buildSections(data).map((section) => {
    const headers = section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const rows = section.rows.slice(0, 250).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    return `<h2>${escapeHtml(section.title)} (${section.rows.length})</h2><table><tr>${headers}</tr>${rows || `<tr><td colspan="${section.headers.length}">No records</td></tr>`}</table>`;
  }).join("");
  return `<!doctype html><html><head><style>body{font-family:Arial;color:#17202a;padding:28px}h1{font-size:24px}h2{font-size:16px;margin-top:26px;color:#2563eb}p{color:#555}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#eef1f5}</style></head><body><h1>Rent Management Backup</h1><p>Generated on ${escapeHtml(new Date().toLocaleString("en-IN"))}</p>${sections}</body></html>`;
}

async function shareTextFile(filename, content, dialogTitle) {
  if (Platform.OS === "web") {
    const anchor = globalThis.document.createElement("a");
    anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
    anchor.download = filename;
    anchor.click();
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle, UTI: "public.comma-separated-values-text" });
}

export default function BackupExportScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await getSystemDashboard();
      const canteenEnabled = hasCanteenFeature(dashboard);
      const [tenants, units, dues, lightBills, staffExpenses, otherExpenses, canteenAttendance] = await Promise.all([
        getTenants(),
        getRooms(),
        getRentDues(),
        getLightBills(),
        getStaffExpenses(),
        getExpenses(),
        canteenEnabled ? getCanteenAttendanceRange() : Promise.resolve({ rows: [] }),
      ]);
      setData({
        tenants: Array.isArray(tenants) ? tenants : [],
        units: Array.isArray(units) ? units : [],
        dues: dues || { tenants: [] },
        lightBills: Array.isArray(lightBills) ? lightBills : [],
        staffExpenses: Array.isArray(staffExpenses) ? staffExpenses : [],
        otherExpenses: Array.isArray(otherExpenses) ? otherExpenses : [],
        canteenAttendance: Array.isArray(canteenAttendance?.rows) ? canteenAttendance.rows : [],
        canteenEnabled,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load backup data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const sections = useMemo(() => data ? buildSections(data) : [], [data]);
  const counts = useMemo(() => data ? [
    { label: "Tenants", value: data.tenants.length },
    { label: "Units", value: data.units.length },
    { label: "Rent payments", value: rentRows(data.tenants).length },
    ...(data.canteenEnabled ? [{ label: "Canteen", value: data.canteenAttendance.length }] : []),
    { label: "Light bills", value: data.lightBills.length },
    { label: "Staff expenses", value: data.staffExpenses.length },
    { label: "Other expenses", value: data.otherExpenses.length },
  ] : [], [data]);

  async function exportSection(section) {
    if (!data) return;
    try {
      setExporting(section.key);
      const csv = csvSection(section.title, section.headers, section.rows);
      await shareTextFile(`${section.key}-backup-${dateStamp()}.csv`, csv, `${section.title} backup`);
    } catch (err) {
      Alert.alert("Export failed", err.message || "Please try again.");
    } finally {
      setExporting("");
    }
  }

  async function exportFullCsv() {
    if (!data) return;
    try {
      setExporting("full-csv");
      await shareTextFile(`rent-management-full-backup-${dateStamp()}.csv`, buildFullCsv(data), "Full data backup");
    } catch (err) {
      Alert.alert("Export failed", err.message || "Please try again.");
    } finally {
      setExporting("");
    }
  }

  async function exportFullPdf() {
    if (!data) return;
    try {
      setExporting("full-pdf");
      const html = buildHtml(data);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Full data backup", UTI: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Export failed", err.message || "Please try again.");
    } finally {
      setExporting("");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/more")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Backup / export</Text>
          <Text style={styles.subtitle}>Download owner records safely</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {data && !loading ? (
          <>
            <View style={styles.summaryGrid}>
              {counts.map((item) => (
                <View key={item.label} style={styles.countCard}>
                  <Text style={styles.countValue}>{money(item.value)}</Text>
                  <Text style={styles.countLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable disabled={!!exporting} onPress={exportFullCsv} style={styles.primaryButton}>
                {exporting === "full-csv" ? <ActivityIndicator color={colors.surface} /> : <FileDown size={19} color={colors.surface} />}
                <Text style={styles.primaryText}>Export full CSV</Text>
              </Pressable>
              <Pressable disabled={!!exporting} onPress={exportFullPdf} style={styles.secondaryButton}>
                {exporting === "full-pdf" ? <ActivityIndicator color={colors.primary} /> : <FileText size={19} color={colors.primary} />}
                <Text style={styles.secondaryText}>Export PDF summary</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Separate CSV exports</Text>
            {sections.map((section) => (
              <Pressable key={section.key} disabled={!!exporting} onPress={() => exportSection(section)} style={styles.row}>
                <View style={styles.rowIcon}><DatabaseBackup size={20} color={colors.primary} /></View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{section.title}</Text>
                  <Text style={styles.rowMeta}>{section.rows.length} records</Text>
                </View>
                {exporting === section.key ? <ActivityIndicator color={colors.primary} /> : <FileDown size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </>
        ) : null}
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
  body: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingBottom: 36 },
  loading: { minHeight: 260, alignItems: "center", justifyContent: "center" },
  error: { marginTop: 20, color: colors.danger, textAlign: "center" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  countCard: { width: "48%", minHeight: 84, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  countValue: { color: colors.text, fontSize: 22, fontWeight: "800" },
  countLabel: { marginTop: 7, color: colors.muted, fontSize: 12, fontWeight: "600" },
  actions: { marginTop: 18, gap: 10 },
  primaryButton: { minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontWeight: "800" },
  secondaryButton: { minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  secondaryText: { color: colors.primary, fontWeight: "800" },
  sectionTitle: { marginTop: 22, marginBottom: 4, color: colors.text, fontSize: 17, fontWeight: "800" },
  row: { minHeight: 70, marginTop: 9, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  rowIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primarySoft },
  rowText: { flex: 1, minWidth: 0, marginLeft: 12 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
});
