import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ArrowLeft, FileDown, FileText } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { getRooms } from "../../src/api/roomApi";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getRentRangeSummary, getTenants } from "../../src/api/tenantApi";
import { getLightBills } from "../../src/api/lightBillApi";
import { getStaffExpenses } from "../../src/api/staffExpenseApi";
import { getExpenses } from "../../src/api/expenseApi";
import { getCanteenAttendanceRange } from "../../src/api/canteenApi";
import { formatTenantUnit, propertyTypeFromTenant, stackedPropertyLabel } from "../../src/utils/unitLabels";
import { shareHtmlAsPdf } from "../../src/utils/sharePdf";
import { allowedUnitTypes, firstAllowedType, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

const TABS = ["Rent", "Accounting", "Dues", "Occupancy"];
const REPORT_CONFIGS = [{ value: "combined", label: "Combined" }, { value: "separated", label: "Separated" }];
const PROPERTY_TYPE_LABELS = { bed: "Hostel Beds", room: "Residential Rooms", shop: "Commercial Shop" };
function money(value) { return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`; }
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }
function inDateRange(value, start, end) { const date = new Date(value); return !Number.isNaN(date.getTime()) && date >= start && date <= end; }
function billAmount(value) { return Number(value?.amount ?? value?.salary ?? value?.mainAmount ?? 0); }
function safeType(value) { if (value === "room" || value === "shop") return value; return "bed"; }
function canteenUnit(item) { return [item.category, item.roomNo ? `Room ${item.roomNo}` : "", item.bedNo ? `Bed ${item.bedNo}` : ""].filter(Boolean).join(" | "); }
function attendanceStatus(value) { const raw = String(value || "").trim().toLowerCase(); if (raw === "present") return "Present"; if (raw === "absent") return "Absent"; return ""; }
function pivotCanteenAttendance(items) {
  const grouped = new Map();
  (items || []).forEach((item) => {
    const key = `${item.tenantId || item.tenantName}-${item.dateKey}`;
    const existing = grouped.get(key) || { tenantName: item.tenantName, phoneNo: item.phoneNo, unit: canteenUnit(item), dateKey: item.dateKey, breakfast: "", lunch: "", dinner: "" };
    if (item.meal === "breakfast") existing.breakfast = attendanceStatus(item.status);
    if (item.meal === "lunch") existing.lunch = attendanceStatus(item.status);
    if (item.meal === "dinner") existing.dinner = attendanceStatus(item.status);
    grouped.set(key, existing);
  });
  return Array.from(grouped.values()).sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)) || String(a.tenantName).localeCompare(String(b.tenantName)));
}

function occupancyData(units, tenants, endDate) {
  const asOf = new Date(`${endDate}T23:59:59`);
  const active = tenants.filter((tenant) => {
    const joined = tenant.joiningDate ? new Date(tenant.joiningDate) : null;
    const left = tenant.leaveDate ? new Date(tenant.leaveDate) : null;
    return (!joined || joined <= asOf) && (!left || left > asOf);
  });
  const types = { bed: { label: "Hostel Beds", total: 0, occupied: 0 }, room: { label: "Residential Rooms", total: 0, occupied: 0 }, shop: { label: "Commercial Shop", total: 0, occupied: 0 } };
  units.forEach((unit) => {
    const type = types[unit.propertyType] ? unit.propertyType : "bed";
    const slots = type === "bed" ? (unit.beds || []).map((bed) => bed.bedNo) : [unit.beds?.[0]?.bedNo || "unit"];
    slots.forEach((bedNo) => {
      types[type].total += 1;
      const occupied = active.some((tenant) => {
        const sameUnit = tenant.roomId ? String(tenant.roomId) === String(unit._id) : String(tenant.category || "") === String(unit.category || "") && String(tenant.roomNo || "") === String(unit.roomNo || "");
        return sameUnit && (type !== "bed" || String(tenant.bedNo || "") === String(bedNo));
      });
      if (occupied) types[type].occupied += 1;
    });
  });
  return Object.values(types).map((row) => ({ ...row, vacant: Math.max(row.total - row.occupied, 0) }));
}

export default function CustomReportsScreen() {
  const baseRouter = useRouter();
  const router = { back: () => baseRouter.replace("/system/more") };
  const [startDate, setStartDate] = useState(toDateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(toDateValue());
  const [reportConfig, setReportConfig] = useState("combined");
  const [activeType, setActiveType] = useState("bed");
  const [tab, setTab] = useState("Rent");
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [lightBills, setLightBills] = useState([]);
  const [staffExpenses, setStaffExpenses] = useState([]);
  const [otherExpenses, setOtherExpenses] = useState([]);
  const [canteenAttendance, setCanteenAttendance] = useState([]);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [rangeRows, setRangeRows] = useState(new Map());
  const [unitAccess, setUnitAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError(""); setLoading(true);
      const dashboard = await getSystemDashboard();
      const canteenAllowed = hasCanteenFeature(dashboard);
      const [tenantData, unitData, reportData, lightData, staffData, expenseData, canteenData] = await Promise.all([getTenants(), getRooms(), getRentRangeSummary(startDate, endDate), getLightBills(), getStaffExpenses(), getExpenses(), canteenAllowed ? getCanteenAttendanceRange({ start: startDate, end: endDate }) : Promise.resolve({ rows: [] })]);
      setTenants(Array.isArray(tenantData) ? tenantData : []);
      setUnits(Array.isArray(unitData) ? unitData : []);
      setLightBills(Array.isArray(lightData) ? lightData : []);
      setStaffExpenses(Array.isArray(staffData) ? staffData : []);
      setOtherExpenses(Array.isArray(expenseData) ? expenseData : []);
      setCanteenAttendance(Array.isArray(canteenData?.rows) ? canteenData.rows : []);
      setCanteenEnabled(canteenAllowed);
      setRangeRows(new Map((reportData.rows || []).map((row) => [String(row.tenantId), row])));
      setUnitAccess(dashboard?.units || dashboard);
      if (allowedUnitTypes(dashboard?.units || dashboard).length === 1) setReportConfig("separated");
      if (!isTypeAllowed(activeType, dashboard?.units || dashboard)) setActiveType(firstAllowedType(dashboard?.units || dashboard));
    } catch (err) { setError(err.response?.data?.message || "Unable to load custom report."); }
    finally { setLoading(false); }
  }, [activeType, endDate, startDate]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const propertyTypes = useMemo(() => allowedUnitTypes(unitAccess).map((item) => ({ ...item, label: PROPERTY_TYPE_LABELS[item.value] || item.label })), [unitAccess]);
  const allowedTypeValues = useMemo(() => new Set(propertyTypes.map((item) => item.value)), [propertyTypes]);
  const allowedTenants = useMemo(() => tenants.filter((tenant) => allowedTypeValues.has(propertyTypeFromTenant(tenant))), [allowedTypeValues, tenants]);
  const allowedUnits = useMemo(() => units.filter((unit) => allowedTypeValues.has(safeType(unit.propertyType))), [allowedTypeValues, units]);

  const rows = useMemo(() => allowedTenants.map((tenant) => ({ tenant, type: propertyTypeFromTenant(tenant), ...(rangeRows.get(String(tenant._id)) || {}) })).filter((row) => Number(row.expected || 0) > 0 || Number(row.collected || 0) > 0), [allowedTenants, rangeRows]);
  const visibleRows = useMemo(() => reportConfig === "combined" ? rows : rows.filter((row) => row.type === activeType), [activeType, reportConfig, rows]);
  const totals = useMemo(() => visibleRows.reduce((sum, row) => ({ expected: sum.expected + Number(row.expected || 0), collected: sum.collected + Number(row.collected || 0), applied: sum.applied + Number(row.paidForCycles || 0), pending: sum.pending + Number(row.pending || 0) }), { expected: 0, collected: 0, applied: 0, pending: 0 }), [visibleRows]);
  const dueRows = visibleRows.filter((row) => Number(row.pending || 0) > 0);
  const occupancy = useMemo(() => occupancyData(allowedUnits, allowedTenants, endDate), [allowedTenants, allowedUnits, endDate]);
  const visibleOccupancy = useMemo(() => {
    if (reportConfig === "separated") return occupancy.filter((row) => row.label.toLowerCase().startsWith(activeType === "bed" ? "beds" : activeType));
    const total = occupancy.reduce((sum, row) => ({ label: "All units", total: sum.total + row.total, occupied: sum.occupied + row.occupied, vacant: sum.vacant + row.vacant }), { label: "All units", total: 0, occupied: 0, vacant: 0 });
    return [total];
  }, [activeType, occupancy, reportConfig]);
  const label = `${startDate}-to-${endDate}`;
  const reportConfigLabel = reportConfig === "combined" ? "Combined" : propertyTypes.find((item) => item.value === activeType)?.label || "Separated";
  const reportRange = useMemo(() => ({ start: new Date(`${startDate}T00:00:00`), end: new Date(`${endDate}T23:59:59`) }), [endDate, startDate]);
  const accountingRows = useMemo(() => {
    const lights = lightBills.filter((item) => {
      if ((item.type || "meter") !== "meter" || !inDateRange(item.date, reportRange.start, reportRange.end)) return false;
      if (item.billPayer === "owner" || item.isUnitLinked === false) return reportConfig === "combined";
      return reportConfig === "combined" ? allowedTypeValues.has(safeType(item.propertyType)) : safeType(item.propertyType) === activeType;
    });
    const staff = staffExpenses.filter((item) => inDateRange(item.date, reportRange.start, reportRange.end));
    const other = otherExpenses.filter((item) => inDateRange(item.date, reportRange.start, reportRange.end) && (reportConfig === "combined" ? allowedTypeValues.has(safeType(item.propertyType)) : safeType(item.propertyType) === activeType));
    const totalPaid = (rows) => rows.filter((item) => item.status === "paid").reduce((sum, item) => sum + billAmount(item), 0);
    const totalPending = (rows) => rows.filter((item) => item.status !== "paid").reduce((sum, item) => sum + billAmount(item), 0);
    return [
      { label: "Rent collected", paid: totals.collected, pending: totals.pending, total: totals.collected + totals.pending },
      { label: "Light bills", paid: totalPaid(lights), pending: totalPending(lights), total: lights.reduce((sum, item) => sum + billAmount(item), 0) },
      { label: "Staff expenses", paid: totalPaid(staff), pending: totalPending(staff), total: staff.reduce((sum, item) => sum + billAmount(item), 0) },
      { label: "Other expenses", paid: totalPaid(other), pending: totalPending(other), total: other.reduce((sum, item) => sum + billAmount(item), 0) },
    ];
  }, [activeType, allowedTypeValues, lightBills, otherExpenses, reportConfig, reportRange, staffExpenses, totals.collected, totals.pending]);
  const accountingTotals = useMemo(() => {
    const expensePaid = accountingRows.slice(1).reduce((sum, row) => sum + row.paid, 0);
    const expensePending = accountingRows.slice(1).reduce((sum, row) => sum + row.pending, 0);
    return { expensePaid, expensePending, net: totals.collected - expensePaid };
  }, [accountingRows, totals.collected]);
  const visibleCanteenAttendance = useMemo(() => {
    if (!allowedTypeValues.has("bed")) return [];
    if (reportConfig === "separated" && activeType !== "bed") return [];
    return canteenAttendance;
  }, [activeType, allowedTypeValues, canteenAttendance, reportConfig]);

  function buildCsv() {
    const rentCycleRows = visibleRows.flatMap((row) => {
      const cycles = Array.isArray(row.cycles) && row.cycles.length
        ? row.cycles
        : [{ month: `${startDate} to ${endDate}`, expected: row.expected, paid: row.paidForCycles, pending: row.pending }];
      return cycles.map((cycle) => [
        row.tenant.name,
        row.tenant.phoneNo,
        PROPERTY_TYPE_LABELS[row.type] || row.type,
        formatTenantUnit(row.tenant),
        cycle.month || `${startDate} to ${endDate}`,
        cycle.expected ?? row.expected ?? 0,
        cycle.paid ?? row.paidForCycles ?? 0,
        cycle.pending ?? row.pending ?? 0,
        Number(cycle.pending ?? row.pending ?? 0) <= 0 ? "Paid" : Number(cycle.paid ?? row.paidForCycles ?? 0) > 0 ? "Partial" : "Pending",
      ]);
    });
    const dueRows = dueRowsForExport().map(({ row, cycle }) => [
      row.tenant.name,
      row.tenant.phoneNo,
      PROPERTY_TYPE_LABELS[row.type] || row.type,
      formatTenantUnit(row.tenant),
      cycle.month || `${startDate} to ${endDate}`,
      cycle.expected ?? "",
      cycle.paid ?? "",
      cycle.pending ?? row.pending ?? 0,
      `${startDate} to ${endDate}`,
    ]);
    const canteenRows = canteenEnabled ? pivotCanteenAttendance(visibleCanteenAttendance).map((row) => [
      row.tenantName,
      row.phoneNo,
      row.unit,
      row.dateKey,
      row.breakfast,
      row.lunch,
      row.dinner,
    ]) : [];
    const canteenSection = canteenEnabled ? [[], ["Canteen attendance"], ["Tenant", "Phone", "Unit", "Date", "Breakfast", "Lunch", "Dinner"], ...canteenRows] : [];
    const lines = [["Custom Rent Report", startDate, endDate, reportConfigLabel], [], ["Accounting"], ["Section", "Paid/Collected", "Pending", "Total"], ...accountingRows.map((row) => [row.label, row.paid, row.pending, row.total]), ["Net after paid expenses", accountingTotals.net], [], ["Rent collection details"], ["Tenant", "Phone", "Type", "Unit", "Billing month", "Expected", "Received/applied", "Pending", "Status"], ...rentCycleRows, [], ["Dues by tenant / unit / date"], ["Tenant", "Phone", "Type", "Unit", "Due month", "Expected", "Paid", "Outstanding", "Date range"], ...dueRows, ...canteenSection, [], ["Occupancy as of", endDate], ["Type", "Total", "Occupied", "Vacant"], ...visibleOccupancy.map((row) => [row.label, row.total, row.occupied, row.vacant])];
    return lines.map((line) => line.map(csvCell).join(",")).join("\n");
  }

  function dueRowsForExport() {
    return dueRows.flatMap((row) => {
      const cycles = (row.cycles || []).filter((cycle) => Number(cycle.pending || 0) > 0);
      const visibleCycles = cycles.length ? cycles : [{ month: `${startDate} to ${endDate}`, pending: row.pending }];
      return visibleCycles.map((cycle) => ({ row, cycle }));
    });
  }

  function buildHtml() {
    const rowHtml = visibleRows.flatMap((row) => {
      const cycles = Array.isArray(row.cycles) && row.cycles.length
        ? row.cycles
        : [{ month: `${startDate} to ${endDate}`, expected: row.expected, paid: row.paidForCycles, pending: row.pending }];
      return cycles.map((cycle) => `<tr><td>${escapeHtml(row.tenant.name)}</td><td>${escapeHtml(formatTenantUnit(row.tenant))}</td><td>${escapeHtml(cycle.month || "")}</td><td>${cycle.expected ?? row.expected ?? 0}</td><td>${cycle.paid ?? row.paidForCycles ?? 0}</td><td>${cycle.pending ?? row.pending ?? 0}</td></tr>`);
    }).join("");
    const dueHtml = dueRowsForExport().map(({ row, cycle }) => `<tr><td>${escapeHtml(row.tenant.name)}</td><td>${escapeHtml(formatTenantUnit(row.tenant))}</td><td>${escapeHtml(cycle.month || "")}</td><td>${cycle.expected ?? ""}</td><td>${cycle.paid ?? ""}</td><td>${cycle.pending ?? row.pending ?? 0}</td></tr>`).join("");
    const canteenHtml = canteenEnabled ? pivotCanteenAttendance(visibleCanteenAttendance).map((row) => `<tr><td>${escapeHtml(row.tenantName)}</td><td>${escapeHtml(row.unit)}</td><td>${escapeHtml(row.dateKey)}</td><td>${escapeHtml(row.breakfast)}</td><td>${escapeHtml(row.lunch)}</td><td>${escapeHtml(row.dinner)}</td></tr>`).join("") : "";
    const canteenSectionHtml = canteenEnabled ? `<h2>Canteen attendance</h2><table><tr><th>Tenant</th><th>Unit</th><th>Date</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>${canteenHtml || "<tr><td colspan=\"6\">No records</td></tr>"}</table>` : "";
    const occupancyHtml = visibleOccupancy.map((row) => `<tr><td>${row.label}</td><td>${row.total}</td><td>${row.occupied}</td><td>${row.vacant}</td></tr>`).join("");
    const accountingHtml = accountingRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.paid}</td><td>${row.pending}</td><td>${row.total}</td></tr>`).join("");
    return `<!doctype html><html><head><style>body{font-family:Arial;color:#17202a;padding:28px}h1{font-size:23px}h2{font-size:17px;margin-top:26px;color:#2563eb}.summary{padding:13px;background:#f5f7fa}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#eef1f5}</style></head><body><h1>Custom Rent Report</h1><p>${startDate} to ${endDate} | ${escapeHtml(reportConfigLabel)}</p><div class="summary">Expected: ${totals.expected} | Received: ${totals.collected} | Applied: ${totals.applied} | Pending: ${totals.pending} | Net: ${accountingTotals.net}</div><h2>Accounting</h2><table><tr><th>Section</th><th>Paid/Collected</th><th>Pending</th><th>Total</th></tr>${accountingHtml}</table><h2>Rent collection details</h2><table><tr><th>Tenant</th><th>Unit</th><th>Billing month</th><th>Expected</th><th>Received/applied</th><th>Pending</th></tr>${rowHtml}</table><h2>Dues by tenant / unit / date</h2><table><tr><th>Tenant</th><th>Unit</th><th>Due month</th><th>Expected</th><th>Paid</th><th>Outstanding</th></tr>${dueHtml}</table>${canteenSectionHtml}<h2>Occupancy as of ${endDate}</h2><table><tr><th>Type</th><th>Total</th><th>Occupied</th><th>Vacant</th></tr>${occupancyHtml}</table></body></html>`;
  }

  async function exportCsv() {
    try {
      setExporting(true); const csv = buildCsv();
      if (Platform.OS === "web") { const anchor = globalThis.document.createElement("a"); anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; anchor.download = `custom-rent-report-${label}.csv`; anchor.click(); return; }
      const uri = `${FileSystem.cacheDirectory}custom-rent-report-${label}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Custom rent report" });
    } catch (err) { Alert.alert("Export failed", err.message); }
    finally { setExporting(false); }
  }

  async function exportPdf() {
    try {
      setExporting(true); const html = buildHtml();
      if (Platform.OS === "web") return await Print.printAsync({ html });
      await shareHtmlAsPdf(html, { fileName: `custom-rent-report-${label}.pdf`, dialogTitle: "Custom rent report" });
    } catch (err) { Alert.alert("Export failed", err.message); }
    finally { setExporting(false); }
  }

  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Custom report</Text><Text style={styles.subtitle}>Accounting by selected dates</Text></View></View><ScrollView contentContainerStyle={styles.body}><View style={styles.dateRange}><View style={styles.dateField}><FormDateField label="Start date" value={startDate} onChange={setStartDate} maximumDate={new Date(endDate)} /></View><View style={styles.dateField}><FormDateField label="End date" value={endDate} onChange={setEndDate} minimumDate={new Date(startDate)} maximumDate={new Date()} /></View></View>{propertyTypes.length > 1 ? <View style={styles.configTabs}>{REPORT_CONFIGS.map((item) => <Pressable key={item.value} onPress={() => setReportConfig(item.value)} style={[styles.configTab, reportConfig === item.value && styles.configTabActive]}><Text style={[styles.configTabText, reportConfig === item.value && styles.configTabTextActive]}>{item.label}</Text></Pressable>)}</View> : null}{reportConfig === "separated" ? <View style={styles.typeTabs}>{propertyTypes.map((item) => <Pressable key={item.value} onPress={() => setActiveType(item.value)} style={[styles.typeTab, activeType === item.value && styles.typeTabActive]}><Text style={[styles.typeTabText, activeType === item.value && styles.typeTabTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text></Pressable>)}</View> : null}<View style={styles.exportRow}><Pressable onPress={exportCsv} disabled={loading || exporting} style={styles.exportButton}><FileDown size={18} color={colors.primary} /><Text style={styles.exportText}>CSV</Text></Pressable><Pressable onPress={exportPdf} disabled={loading || exporting} style={styles.exportButton}><FileText size={18} color={colors.primary} /><Text style={styles.exportText}>PDF</Text></Pressable></View><View style={styles.tabs}>{TABS.map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{value}</Text></Pressable>)}</View>{loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : error ? <Text style={styles.error}>{error}</Text> : <View style={styles.list}>{tab === "Rent" ? <><View style={styles.summary}><View><Text style={styles.summaryLabel}>Expected</Text><Text style={styles.summaryValue}>{money(totals.expected)}</Text></View><View><Text style={styles.summaryLabel}>Received</Text><Text style={[styles.summaryValue, styles.green]}>{money(totals.collected)}</Text></View><View><Text style={styles.summaryLabel}>Pending</Text><Text style={[styles.summaryValue, styles.orange]}>{money(totals.pending)}</Text></View></View><Text style={styles.accountingHint}>Received uses payment dates. Pending uses billing cycles completed in this range.</Text>{visibleRows.map((row) => <View key={row.tenant._id} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.tenant.name}</Text><Text style={styles.rowMeta}>{(row.cycles || []).map((cycle) => cycle.month).join(", ") || "Payment received for another cycle"}</Text></View><View style={styles.rowAmounts}><Text style={styles.rowValue}>Received {money(row.collected)}</Text><Text style={styles.rowPending}>Pending {money(row.pending)}</Text></View></View>)}</> : tab === "Accounting" ? <><View style={styles.summary}><View><Text style={styles.summaryLabel}>Expense paid</Text><Text style={[styles.summaryValue, styles.orange]}>{money(accountingTotals.expensePaid)}</Text></View><View><Text style={styles.summaryLabel}>Expense pending</Text><Text style={[styles.summaryValue, styles.orange]}>{money(accountingTotals.expensePending)}</Text></View><View><Text style={styles.summaryLabel}>Net</Text><Text style={[styles.summaryValue, accountingTotals.net >= 0 ? styles.green : styles.orange]}>{money(accountingTotals.net)}</Text></View></View>{accountingRows.map((row) => <View key={row.label} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.label}</Text><Text style={styles.rowMeta}>Total {money(row.total)}</Text></View><View style={styles.rowAmounts}><Text style={styles.rowValue}>Paid {money(row.paid)}</Text><Text style={styles.rowPending}>Pending {money(row.pending)}</Text></View></View>)}</> : tab === "Dues" ? <><View style={styles.dueTotal}><Text style={styles.dueLabel}>Selected-cycle dues</Text><Text style={styles.dueValue}>{money(totals.pending)}</Text></View>{dueRows.map((row) => <View key={row.tenant._id} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.tenant.name}</Text><Text style={styles.rowMeta}>{(row.cycles || []).filter((cycle) => cycle.pending > 0).map((cycle) => cycle.month).join(", ")}</Text></View><Text style={styles.dueRowValue}>{money(row.pending)}</Text></View>)}</> : <>{visibleOccupancy.map((row) => <View key={row.label} style={styles.occupancy}><Text style={styles.rowTitle}>{stackedPropertyLabel(row.label)}</Text><View style={styles.occupancyStats}><Text style={styles.occupancyValue}>{row.occupied}<Text style={styles.occupancyLabel}> occupied</Text></Text><Text style={styles.occupancyValue}>{row.vacant}<Text style={styles.occupancyLabel}> vacant</Text></Text><Text style={styles.occupancyValue}>{row.total}<Text style={styles.occupancyLabel}> total</Text></Text></View></View>)}</>}</View>}</ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, header: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }, iconButton: { width: 44, height: 44, marginRight: 5, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 23, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 }, body: { flex: 1, width: "100%", maxWidth: 780, alignSelf: "center", padding: 16 },
  dateRange: { flexDirection: "row", gap: 10 }, dateField: { flex: 1 }, configTabs: { height: 44, marginTop: 10, padding: 4, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border }, configTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 }, configTabActive: { backgroundColor: colors.surface }, configTabText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, configTabTextActive: { color: colors.primary }, typeTabs: { minHeight: 68, marginTop: 8, padding: 4, flexDirection: "row", gap: 4, borderRadius: 7, backgroundColor: colors.border }, typeTab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 }, typeTabActive: { backgroundColor: colors.surface }, typeTabText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" }, typeTabTextActive: { color: colors.primary }, exportRow: { marginTop: 8, flexDirection: "row", justifyContent: "flex-end", gap: 8 }, exportButton: { height: 38, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface }, exportText: { color: colors.primary, fontSize: 12, fontWeight: "700" }, tabs: { height: 48, marginTop: 10, padding: 3, flexDirection: "row", gap: 3, borderRadius: 7, backgroundColor: colors.border }, tab: { flex: 1, minWidth: 0, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", borderRadius: 5 }, tabActive: { backgroundColor: colors.surface }, tabText: { width: "100%", color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center" }, tabTextActive: { color: colors.primary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" }, error: { marginTop: 20, color: colors.danger, textAlign: "center" }, list: { paddingTop: 10, paddingBottom: 35, gap: 8 }, summary: { minHeight: 72, padding: 12, flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, summaryLabel: { color: colors.muted, fontSize: 11 }, summaryValue: { marginTop: 5, color: colors.text, fontSize: 14, fontWeight: "700" }, green: { color: colors.success }, orange: { color: colors.warning }, accountingHint: { paddingHorizontal: 4, color: colors.muted, fontSize: 11 }, row: { minHeight: 68, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, rowMain: { flex: 1 }, rowTitle: { color: colors.text, fontWeight: "700" }, rowMeta: { marginTop: 4, color: colors.muted, fontSize: 11 }, rowAmounts: { alignItems: "flex-end" }, rowValue: { color: colors.success, fontSize: 11, fontWeight: "700" }, rowPending: { marginTop: 4, color: colors.warning, fontSize: 11, fontWeight: "700" }, dueTotal: { minHeight: 68, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 7, backgroundColor: colors.dangerSoft }, dueLabel: { color: colors.danger, fontWeight: "700" }, dueValue: { color: colors.danger, fontSize: 19, fontWeight: "700" }, dueRowValue: { color: colors.danger, fontWeight: "700" }, occupancy: { minHeight: 78, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, occupancyStats: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" }, occupancyValue: { color: colors.text, fontSize: 16, fontWeight: "700" }, occupancyLabel: { color: colors.muted, fontSize: 10, fontWeight: "400" },
});

