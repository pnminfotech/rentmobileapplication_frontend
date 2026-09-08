import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  Search,
  Utensils,
  X,
} from "lucide-react-native";

import {
  getCanteenSettings,
  getCanteenAttendance,
  getCanteenAttendanceRange,
  markAllCanteenAttendance,
  markCanteenAttendance,
} from "../../src/api/canteenApi";
import { formatTenantUnit } from "../../src/utils/unitLabels";
import { useResponsive } from "../../src/utils/responsive";
import { systemColors as colors, systemShadow } from "../../src/theme/systemTheme";

const MEALS = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Dinner", value: "dinner" },
];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDay(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function formatDate(date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status) {
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  return "Unmarked";
}

function summarizeRows(rows = []) {
  return rows.reduce(
    (result, row) => {
      result.total += 1;
      if (row.status === "present") result.present += 1;
      else if (row.status === "absent") result.absent += 1;
      else result.unmarked += 1;
      return result;
    },
    { total: 0, present: 0, absent: 0, unmarked: 0 }
  );
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function attendanceStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "present") return "Present";
  if (raw === "absent") return "Absent";
  return "";
}

function enabledMealsFromSettings(settings) {
  const primaryMode = (settings?.activeModes || []).find((mode) => ["full_package", "per_meal", "meal_package"].includes(mode));
  if (!settings?.isConfigured || !primaryMode) return MEALS;
  if (primaryMode === "per_meal") {
    const pricedMeals = MEALS.filter((item) => Number(settings.perMeal?.[item.value] || 0) > 0);
    return pricedMeals.length ? pricedMeals : MEALS;
  }
  if (primaryMode === "meal_package") {
    const allowed = new Set(settings.mealPackage?.includedMeals || []);
    const packageMeals = MEALS.filter((item) => allowed.has(item.value));
    return packageMeals.length ? packageMeals : MEALS;
  }
  const allowed = new Set(settings.fullPackage?.includedMeals || []);
  const fullPackageMeals = MEALS.filter((item) => allowed.has(item.value));
  return fullPackageMeals.length ? fullPackageMeals : MEALS;
}

function pivotMonthlyAttendance(items = []) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = `${item.tenantId || item.tenantName}-${item.dateKey}`;
    const existing = grouped.get(key) || {
      tenantName: item.tenantName,
      phoneNo: item.phoneNo,
      unit: [item.category, item.roomNo ? `Room ${item.roomNo}` : "", item.bedNo ? `Bed ${item.bedNo}` : ""].filter(Boolean).join(" | "),
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
  return Array.from(grouped.values()).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)) || String(a.tenantName).localeCompare(String(b.tenantName)));
}

async function saveFileToAndroidFolder({ uri, filename, mimeType, textContent }) {
  const saf = FileSystem.StorageAccessFramework;
  if (Platform.OS !== "android" || !saf) {
    Alert.alert("Download unavailable", "Direct file download is available on Android. Please use Share to save this file.");
    return;
  }

  const permission = await saf.requestDirectoryPermissionsAsync();
  if (!permission.granted) return;

  const targetUri = await saf.createFileAsync(permission.directoryUri, filename, mimeType);
  if (textContent !== undefined) {
    await FileSystem.writeAsStringAsync(targetUri, textContent, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("Downloaded", `${filename} saved successfully.`);
    return;
  }

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  Alert.alert("Downloaded", `${filename} saved successfully.`);
}

function chooseShareOrDownload(file) {
  Alert.alert(
    "Export ready",
    "Choose how you want to save this report.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Share",
        onPress: async () => {
          if (!(await Sharing.isAvailableAsync())) {
            Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
            return;
          }
          await Sharing.shareAsync(file.uri, {
            mimeType: file.mimeType,
            dialogTitle: file.dialogTitle,
            UTI: file.uti,
          });
        },
      },
      {
        text: "Download",
        onPress: async () => {
          try {
            await saveFileToAndroidFolder(file);
          } catch (err) {
            Alert.alert("Unable to download", err.message || "Please try again.");
          }
        },
      },
    ]
  );
}

export default function CanteenAttendanceScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const [date, setDate] = useState(new Date());
  const [meal, setMeal] = useState("breakfast");
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, unmarked: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState("");
  const enabledMeals = useMemo(() => enabledMealsFromSettings(settings), [settings]);
  const enabledMealValues = useMemo(() => enabledMeals.map((item) => item.value), [enabledMeals]);

  const dateKey = useMemo(() => toDateKey(date), [date]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((tenant) => [
      tenant.name,
      tenant.phoneNo,
      tenant.category,
      tenant.floorNo,
      tenant.roomNo,
      tenant.bedNo,
      formatTenantUnit(tenant),
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [query, rows]);

  const loadAttendance = useCallback(async () => {
    try {
      setError("");
      const canteenSettings = await getCanteenSettings();
      setSettings(canteenSettings);
      if (!canteenSettings?.isConfigured) {
        setRows([]);
        setSummary({ total: 0, present: 0, absent: 0, unmarked: 0 });
        return;
      }
      const allowedMeals = enabledMealsFromSettings(canteenSettings);
      const nextMeal = allowedMeals.some((item) => item.value === meal) ? meal : allowedMeals[0]?.value || "breakfast";
      if (nextMeal !== meal) {
        setMeal(nextMeal);
        return;
      }
      const data = await getCanteenAttendance(dateKey, nextMeal);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary || { total: 0, present: 0, absent: 0, unmarked: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load canteen attendance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateKey, meal]);

  useFocusEffect(useCallback(() => { loadAttendance(); }, [loadAttendance]));

  async function markTenant(tenant, status) {
    const key = `${tenant._id}-${status}`;
    const previousRows = rows;
    const nextRows = rows.map((row) => String(row._id) === String(tenant._id) ? { ...row, status } : row);
    try {
      setSavingKey(key);
      setRows(nextRows);
      setSummary(summarizeRows(nextRows));
      await markCanteenAttendance({ tenantId: tenant._id, dateKey, meal, status });
    } catch (err) {
      setRows(previousRows);
      setSummary(summarizeRows(previousRows));
      Alert.alert("Unable to mark attendance", err.response?.data?.message || "Please try again.");
    } finally {
      setSavingKey("");
    }
  }

  async function markAll(status) {
    if (!rows.length) return;
    const previousRows = rows;
    const nextRows = rows.map((row) => ({ ...row, status }));
    try {
      setSavingKey(`all-${status}`);
      setRows(nextRows);
      setSummary(summarizeRows(nextRows));
      await markAllCanteenAttendance({ dateKey, meal, status });
    } catch (err) {
      setRows(previousRows);
      setSummary(summarizeRows(previousRows));
      Alert.alert("Unable to mark all", err.response?.data?.message || "Please try again.");
    } finally {
      setSavingKey("");
    }
  }

  function refresh() {
    setRefreshing(true);
    loadAttendance();
  }

  async function loadMonthlyRows() {
    const range = monthRange(date);
    const data = await getCanteenAttendanceRange(range);
    return pivotMonthlyAttendance(Array.isArray(data.rows) ? data.rows : []);
  }

  async function exportMonthlyCsv() {
    try {
      setExporting("csv");
      const monthlyRows = (await loadMonthlyRows()).filter((row) => row);
      const range = monthRange(date);
      const mealHeaders = enabledMeals.map((item) => item.label);
      const lines = [
        ["Monthly Canteen Attendance", `${range.start} to ${range.end}`],
        [],
        ["Tenant", "Phone", "Unit", "Date", ...mealHeaders],
        ...monthlyRows.map((row) => [row.tenantName, row.phoneNo, row.unit, row.dateKey, ...enabledMealValues.map((key) => row[key])]),
      ];
      const csv = lines.map((line) => line.map(csvCell).join(",")).join("\n");
      const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (Platform.OS === "web") {
        const anchor = globalThis.document.createElement("a");
        anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        anchor.download = `canteen-attendance-${label}.csv`;
        anchor.click();
        return;
      }
      const uri = `${FileSystem.cacheDirectory}canteen-attendance-${label}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      chooseShareOrDownload({
        uri,
        filename: `canteen-attendance-${label}.csv`,
        mimeType: "text/csv",
        dialogTitle: "Monthly canteen attendance",
        uti: "public.comma-separated-values-text",
        textContent: csv,
      });
    } catch (err) {
      Alert.alert("Unable to export CSV", err.response?.data?.message || err.message || "Please try again.");
    } finally {
      setExporting("");
    }
  }

  async function exportMonthlyPdf() {
    try {
      setExporting("pdf");
      const monthlyRows = await loadMonthlyRows();
      const range = monthRange(date);
      const mealHeaders = enabledMeals.map((item) => `<th>${escapeHtml(item.label)}</th>`).join("");
      const bodyRows = monthlyRows.map((row) => `<tr><td>${escapeHtml(row.tenantName)}</td><td>${escapeHtml(row.unit)}</td><td>${escapeHtml(row.dateKey)}</td>${enabledMealValues.map((key) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("");
      const colspan = 3 + enabledMeals.length;
      const html = `<!doctype html><html><head><style>body{font-family:Arial;padding:24px;color:#17202a}h1{font-size:22px}p{color:#667085}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#e7f1f8}</style></head><body><h1>Monthly Canteen Attendance</h1><p>${escapeHtml(range.start)} to ${escapeHtml(range.end)}</p><table><tr><th>Tenant</th><th>Unit</th><th>Date</th>${mealHeaders}</tr>${bodyRows || `<tr><td colspan="${colspan}">No attendance records</td></tr>`}</table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      chooseShareOrDownload({
        uri,
        filename: `canteen-attendance-${label}.pdf`,
        mimeType: "application/pdf",
        dialogTitle: "Monthly canteen attendance",
        uti: "com.adobe.pdf",
      });
    } catch (err) {
      Alert.alert("Unable to export PDF", err.response?.data?.message || err.message || "Please try again.");
    } finally {
      setExporting("");
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: responsive.pagePadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.replace("/system/more")} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>HOSTEL MANAGEMENT</Text>
            <Text style={styles.title}>Canteen Attendance</Text>
            <Text style={styles.subtitle}>Mark meals for canteen tenants</Text>
          </View>
        </View>

        <View style={styles.dateCard}>
          <Pressable onPress={() => setDate((current) => shiftDay(current, -1))} style={styles.dateButton}>
            <ChevronLeft size={21} color={colors.deep} />
          </Pressable>
          <View style={styles.dateCenter}>
            <CalendarDays size={17} color={colors.deep} />
            <Text style={styles.dateText}>{formatDate(date)}</Text>
          </View>
          <Pressable onPress={() => setDate((current) => shiftDay(current, 1))} style={styles.dateButton}>
            <ChevronRight size={21} color={colors.deep} />
          </Pressable>
        </View>

        <View style={styles.mealTabs}>
          {enabledMeals.map((item) => {
            const active = item.value === meal;
            return (
              <Pressable key={item.value} onPress={() => setMeal(item.value)} style={[styles.mealTab, active && styles.mealTabActive]}>
                <Text style={[styles.mealText, active && styles.mealTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}><Text style={styles.summaryValue}>{summary.total}</Text><Text style={styles.summaryLabel}>Total</Text></View>
          <View style={styles.summaryCard}><Text style={[styles.summaryValue, styles.presentText]}>{summary.present}</Text><Text style={styles.summaryLabel}>Present</Text></View>
          <View style={styles.summaryCard}><Text style={[styles.summaryValue, styles.absentText]}>{summary.absent}</Text><Text style={styles.summaryLabel}>Absent</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryValue}>{summary.unmarked}</Text><Text style={styles.summaryLabel}>Pending</Text></View>
        </View>

        <View style={styles.bulkRow}>
          <Pressable disabled={!rows.length || Boolean(savingKey)} onPress={() => markAll("present")} style={[styles.bulkButton, styles.presentBulk, (!rows.length || Boolean(savingKey)) && styles.disabled]}>
            <Check size={17} color={colors.deep} />
            <Text style={styles.presentBulkText}>Mark all present</Text>
          </Pressable>
          <Pressable disabled={!rows.length || Boolean(savingKey)} onPress={() => markAll("absent")} style={[styles.bulkButton, styles.absentBulk, (!rows.length || Boolean(savingKey)) && styles.disabled]}>
            <X size={17} color={colors.red} />
            <Text style={styles.absentBulkText}>Mark all absent</Text>
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tenant, room or bed"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.exportRow}>
          <Pressable disabled={Boolean(exporting)} onPress={exportMonthlyCsv} style={[styles.exportButton, exporting && styles.disabled]}>
            {exporting === "csv" ? <ActivityIndicator size="small" color={colors.deep} /> : <FileDown size={17} color={colors.deep} />}
            <Text style={styles.exportText}>Monthly CSV</Text>
          </Pressable>
          <Pressable disabled={Boolean(exporting)} onPress={exportMonthlyPdf} style={[styles.exportButton, exporting && styles.disabled]}>
            {exporting === "pdf" ? <ActivityIndicator size="small" color={colors.deep} /> : <FileText size={17} color={colors.deep} />}
            <Text style={styles.exportText}>Monthly PDF</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.deep} /></View>
        ) : error ? (
          <View style={styles.loading}><Text style={styles.error}>{error}</Text></View>
        ) : settings && !settings.isConfigured ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Canteen setup required</Text>
            <Text style={styles.emptyText}>Choose your canteen billing modes before marking attendance.</Text>
            <Pressable onPress={() => router.push("/system/canteen-settings")} style={styles.setupButton}>
              <Text style={styles.setupButtonText}>Open canteen settings</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {!rows.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No canteen tenants found</Text>
                <Text style={styles.emptyText}>Only active hostel tenants with canteen enabled will appear here.</Text>
              </View>
            ) : !visibleRows.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No matching tenant</Text>
                <Text style={styles.emptyText}>Try searching by another name, room, bed or phone number.</Text>
              </View>
            ) : null}
            {visibleRows.map((tenant) => (
              <View key={tenant._id} style={styles.tenantCard}>
                <Pressable
                  onPress={() => router.push({ pathname: "/system/tenant-details", params: { id: tenant._id, returnTo: "/system/canteen-attendance" } })}
                  style={styles.tenantInfo}
                >
                  <View style={styles.tenantAvatar}><Utensils size={19} color={colors.deep} /></View>
                  <View style={styles.tenantText}>
                    <Text style={styles.tenantName} numberOfLines={1}>{tenant.name}</Text>
                    <Text style={styles.tenantUnit} numberOfLines={1}>{formatTenantUnit(tenant)}</Text>
                    <Text style={[styles.statusText, tenant.status === "present" && styles.presentText, tenant.status === "absent" && styles.absentText]}>
                      {statusLabel(tenant.status)}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.markActions}>
                  <Pressable
                    disabled={Boolean(savingKey)}
                    onPress={() => markTenant(tenant, "present")}
                    style={[styles.markButton, tenant.status === "present" && styles.presentSelected]}
                  >
                    {savingKey === `${tenant._id}-present` ? <ActivityIndicator size="small" color={colors.deep} /> : <Check size={18} color={colors.deep} />}
                  </Pressable>
                  <Pressable
                    disabled={Boolean(savingKey)}
                    onPress={() => markTenant(tenant, "absent")}
                    style={[styles.markButton, tenant.status === "absent" && styles.absentSelected]}
                  >
                    {savingKey === `${tenant._id}-absent` ? <ActivityIndicator size="small" color={colors.red} /> : <X size={18} color={colors.red} />}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  backButton: { width: 42, height: 42, marginRight: 7, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.deep, fontSize: 11, fontWeight: "900" },
  title: { marginTop: 2, color: colors.text, fontSize: 26, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13, fontWeight: "700" },
  dateCard: { height: 50, marginTop: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.card, ...systemShadow },
  dateButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  dateCenter: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  dateText: { color: colors.text, fontSize: 15, fontWeight: "900" },
  mealTabs: { marginTop: 12, padding: 5, flexDirection: "row", gap: 6, borderRadius: 15, backgroundColor: "#F2E8DA" },
  mealTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  mealTabActive: { backgroundColor: colors.card, ...systemShadow },
  mealText: { width: "100%", color: colors.muted, fontSize: 12, fontWeight: "900", textAlign: "center" },
  mealTextActive: { color: colors.deep },
  summaryGrid: { marginTop: 12, flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, minWidth: 0, minHeight: 70, padding: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card, ...systemShadow },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  summaryLabel: { marginTop: 4, color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: "center" },
  presentText: { color: colors.mid },
  absentText: { color: colors.red },
  bulkRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  bulkButton: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderRadius: 13 },
  presentBulk: { borderColor: colors.soft, backgroundColor: colors.soft },
  absentBulk: { borderColor: colors.redSoft, backgroundColor: colors.redSoft },
  presentBulkText: { color: colors.deep, fontSize: 12, fontWeight: "900" },
  absentBulkText: { color: colors.red, fontSize: 12, fontWeight: "900" },
  searchBox: { height: 48, marginTop: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.card, ...systemShadow },
  searchInput: { flex: 1, height: "100%", marginLeft: 9, color: colors.text, fontSize: 14, fontWeight: "700" },
  exportRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  exportButton: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card, ...systemShadow },
  exportText: { color: colors.deep, fontSize: 12, fontWeight: "900" },
  loading: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  list: { marginTop: 12, gap: 9 },
  tenantCard: { minHeight: 78, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, ...systemShadow },
  tenantInfo: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  tenantAvatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.soft },
  tenantText: { flex: 1, minWidth: 0, marginLeft: 10 },
  tenantName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  tenantUnit: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: "700" },
  statusText: { marginTop: 4, color: colors.subtle, fontSize: 11, fontWeight: "900" },
  markActions: { flexDirection: "row", gap: 6 },
  markButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  presentSelected: { borderColor: colors.mid, backgroundColor: colors.soft },
  absentSelected: { borderColor: colors.red, backgroundColor: colors.redSoft },
  empty: { padding: 18, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  emptyText: { marginTop: 5, color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  setupButton: { height: 46, marginTop: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.deep },
  setupButtonText: { color: colors.card, fontSize: 14, fontWeight: "900" },
  error: { color: colors.red, textAlign: "center", fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
