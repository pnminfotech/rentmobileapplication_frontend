import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ArrowLeft, ChevronLeft, ChevronRight, FileDown, FileText } from "lucide-react-native";

import { toDateValue } from "../../src/components/FormDateField";
import { getRooms } from "../../src/api/roomApi";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getRentDues, getRentRangeSummary, getRentSummary, getTenants } from "../../src/api/tenantApi";
import { getLightBills } from "../../src/api/lightBillApi";
import { getStaffExpenses } from "../../src/api/staffExpenseApi";
import { getExpenses } from "../../src/api/expenseApi";
import { getCanteenAttendanceRange } from "../../src/api/canteenApi";
import { formatTenantUnit, propertyTypeFromTenant, stackedPropertyLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

const TABS = ["Rent", "Accounting", "Dues", "Occupancy"];
const REPORT_CONFIGS = [{ value: "combined", label: "Combined" }, { value: "separated", label: "Separated" }];
const PROPERTY_TYPE_LABELS = { bed: "Hostel Beds", room: "Residential Rooms", shop: "Commercial Shop" };

function monthKey(date) { return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`; }
function money(value) { return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`; }
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }
function dateRangeForMonth(date) { return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999) }; }
function dateKeyFromDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function inDateRange(value, start, end) { const date = new Date(value); return !Number.isNaN(date.getTime()) && date >= start && date <= end; }
function billAmount(value) { return Number(value?.amount ?? value?.salary ?? value?.mainAmount ?? 0); }
function typeMatch(value, activeType) { return reportConfigSafeType(value) === activeType; }
function reportConfigSafeType(value) { if (value === "room" || value === "shop") return value; return "bed"; }
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

function includedInMonth(tenant, month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  const joined = tenant.joiningDate ? new Date(tenant.joiningDate) : null;
  const left = tenant.leaveDate ? new Date(tenant.leaveDate) : null;
  return (!joined || joined <= end) && (!left || left >= start);
}

function isActive(tenant, asOf = new Date()) {
  const joined = tenant.joiningDate ? new Date(tenant.joiningDate) : null;
  if (joined && joined > asOf) return false;
  if (!tenant.leaveDate) return true;
  const date = new Date(tenant.leaveDate);
  return Number.isNaN(date.getTime()) || date > asOf;
}

function occupancyData(units, tenants, asOf) {
  const active = tenants.filter((tenant) => isActive(tenant, asOf));
  const types = { bed: { label: "Hostel Beds", total: 0, occupied: 0 }, room: { label: "Residential Rooms", total: 0, occupied: 0 }, shop: { label: "Commercial Shop", total: 0, occupied: 0 } };
  units.forEach((unit) => {
    const type = unit.propertyType || "bed";
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
  return Object.values(types).map((item) => ({ ...item, vacant: Math.max(item.total - item.occupied, 0) }));
}

export default function ReportsScreen() {
  const baseRouter = useRouter();
  const params = useLocalSearchParams();
  const initialTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const router = { back: () => baseRouter.replace("/system/more") };
  const [reportMode] = useState("Monthly");
  const [reportConfig, setReportConfig] = useState("combined");
  const [activeType, setActiveType] = useState("bed");
  const [selectedMonth, setSelectedMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [startDate] = useState(toDateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate] = useState(toDateValue());
  const [tab, setTab] = useState(() => TABS.includes(initialTab) ? initialTab : "Rent");
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [lightBills, setLightBills] = useState([]);
  const [staffExpenses, setStaffExpenses] = useState([]);
  const [otherExpenses, setOtherExpenses] = useState([]);
  const [canteenAttendance, setCanteenAttendance] = useState([]);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [dues, setDues] = useState({ totalDue: 0, tenants: [] });
  const [monthly, setMonthly] = useState(new Map());
  const [unitAccess, setUnitAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const key = monthKey(selectedMonth);
  const reportLabel = reportMode === "Monthly" ? key : `${startDate}-to-${endDate}`;

  const load = useCallback(async () => {
    try {
      setError("");
      const reportRequest = reportMode === "Monthly" ? getRentSummary(key) : getRentRangeSummary(startDate, endDate);
      const range = reportMode === "Custom"
        ? { start: startDate, end: endDate }
        : { start: dateKeyFromDate(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)), end: dateKeyFromDate(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)) };
      const dashboard = await getSystemDashboard();
      const canteenAllowed = hasCanteenFeature(dashboard);
      const [tenantData, unitData, dueData, monthData, lightData, staffData, expenseData, canteenData] = await Promise.all([getTenants(), getRooms(), getRentDues(), reportRequest, getLightBills(), getStaffExpenses(), getExpenses(), canteenAllowed ? getCanteenAttendanceRange(range) : Promise.resolve({ rows: [] })]);
      setTenants(Array.isArray(tenantData) ? tenantData : []);
      setUnits(Array.isArray(unitData) ? unitData : []);
      setLightBills(Array.isArray(lightData) ? lightData : []);
      setStaffExpenses(Array.isArray(staffData) ? staffData : []);
      setOtherExpenses(Array.isArray(expenseData) ? expenseData : []);
      setCanteenAttendance(Array.isArray(canteenData?.rows) ? canteenData.rows : []);
      setCanteenEnabled(canteenAllowed);
      setDues(dueData);
      setMonthly(new Map((monthData.rows || []).map((row) => [String(row.tenantId), row])));
      setUnitAccess(dashboard?.units || dashboard);
      if (allowedUnitTypes(dashboard?.units || dashboard).length === 1) setReportConfig("separated");
      if (!isTypeAllowed(activeType, dashboard?.units || dashboard)) setActiveType(firstAllowedType(dashboard?.units || dashboard));
    } catch (err) { setError(err.response?.data?.message || "Unable to load reports."); }
    finally { setLoading(false); }
  }, [activeType, endDate, key, reportMode, selectedMonth, startDate]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const propertyTypes = useMemo(() => allowedUnitTypes(unitAccess).map((item) => ({ ...item, label: PROPERTY_TYPE_LABELS[item.value] || item.label })), [unitAccess]);
  const allowedTypeValues = useMemo(() => new Set(propertyTypes.map((item) => item.value)), [propertyTypes]);
  const allowedTenants = useMemo(() => tenants.filter((tenant) => allowedTypeValues.has(propertyTypeFromTenant(tenant))), [allowedTypeValues, tenants]);
  const allowedUnits = useMemo(() => units.filter((unit) => allowedTypeValues.has(reportConfigSafeType(unit.propertyType))), [allowedTypeValues, units]);

  const rentRows = useMemo(() => allowedTenants.filter((tenant) => reportMode === "Custom" || includedInMonth(tenant, selectedMonth)).map((tenant) => {
    const row = monthly.get(String(tenant._id)) || {};
    const expected = Number(row.expected || 0);
    const paid = Number(reportMode === "Custom" ? row.collected : row.paid || 0);
    const paidForCycles = Number(reportMode === "Custom" ? row.paidForCycles : paid);
    const balance = Number(reportMode === "Custom" ? row.pending : Math.max(expected - paid, 0));
    return { tenant, type: propertyTypeFromTenant(tenant), expected, paid, paidForCycles, balance, cycles: row.cycles || [], status: balance <= 0 && expected > 0 ? "Paid" : paidForCycles > 0 ? "Partial" : "Pending" };
  }).filter((row) => row.expected > 0 || row.paid > 0), [allowedTenants, monthly, reportMode, selectedMonth]);
  const visibleRentRows = useMemo(() => reportConfig === "combined" ? rentRows : rentRows.filter((row) => row.type === activeType), [activeType, rentRows, reportConfig]);
  const totals = useMemo(() => visibleRentRows.reduce((sum, row) => ({ expected: sum.expected + row.expected, paid: sum.paid + row.paid, balance: sum.balance + row.balance }), { expected: 0, paid: 0, balance: 0 }), [visibleRentRows]);
  const occupancyAsOf = useMemo(() => reportMode === "Custom" ? new Date(`${endDate}T23:59:59`) : new Date(), [endDate, reportMode]);
  const occupancy = useMemo(() => occupancyData(allowedUnits, allowedTenants, occupancyAsOf), [allowedTenants, allowedUnits, occupancyAsOf]);
  const visibleOccupancy = useMemo(() => {
    if (reportConfig === "separated") return occupancy.filter((row) => row.label.toLowerCase().startsWith(activeType === "bed" ? "beds" : activeType));
    const total = occupancy.reduce((sum, row) => ({ label: "All units", total: sum.total + row.total, occupied: sum.occupied + row.occupied, vacant: sum.vacant + row.vacant }), { label: "All units", total: 0, occupied: 0, vacant: 0 });
    return [total];
  }, [activeType, occupancy, reportConfig]);
  const reportDues = reportMode === "Custom"
    ? { totalDue: totals.balance, tenants: rentRows.filter((row) => row.balance > 0).map((row) => ({ tenantId: row.tenant._id, name: row.tenant.name, phoneNo: row.tenant.phoneNo, totalDue: row.balance, dueMonths: row.cycles.filter((cycle) => cycle.pending > 0) })) }
    : dues;
  const visibleDues = useMemo(() => {
    const rows = reportDues.tenants || [];
    if (reportConfig === "combined") return rows.filter((row) => {
      const tenant = tenants.find((item) => String(item._id) === String(row.tenantId));
      return tenant && allowedTypeValues.has(propertyTypeFromTenant(tenant));
    });
    return rows.filter((row) => {
      const tenant = tenants.find((item) => String(item._id) === String(row.tenantId));
      return tenant && propertyTypeFromTenant(tenant) === activeType;
    });
  }, [activeType, allowedTypeValues, reportConfig, reportDues.tenants, tenants]);
  const visibleDueTotal = visibleDues.reduce((sum, row) => sum + Number(row.totalDue || 0), 0);
  const reportConfigLabel = reportConfig === "combined" ? "Combined" : propertyTypes.find((item) => item.value === activeType)?.label || "Separated";
  const reportRange = useMemo(() => reportMode === "Custom" ? { start: new Date(`${startDate}T00:00:00`), end: new Date(`${endDate}T23:59:59`) } : dateRangeForMonth(selectedMonth), [endDate, reportMode, selectedMonth, startDate]);
  const accountingRows = useMemo(() => {
    const lights = lightBills.filter((item) => {
      if ((item.type || "meter") !== "meter" || !inDateRange(item.date, reportRange.start, reportRange.end)) return false;
      if (item.billPayer === "owner" || item.isUnitLinked === false) return reportConfig === "combined";
      return reportConfig === "combined" ? allowedTypeValues.has(reportConfigSafeType(item.propertyType)) : typeMatch(item.propertyType, activeType);
    });
    const staff = staffExpenses.filter((item) => inDateRange(item.date, reportRange.start, reportRange.end));
    const other = otherExpenses.filter((item) => inDateRange(item.date, reportRange.start, reportRange.end) && (reportConfig === "combined" ? allowedTypeValues.has(reportConfigSafeType(item.propertyType)) : typeMatch(item.propertyType, activeType)));
    const totalPaid = (rows) => rows.filter((item) => item.status === "paid").reduce((sum, item) => sum + billAmount(item), 0);
    const totalPending = (rows) => rows.filter((item) => item.status !== "paid").reduce((sum, item) => sum + billAmount(item), 0);
    return [
      { label: "Rent collected", paid: totals.paid, pending: totals.balance, total: totals.paid + totals.balance },
      { label: "Light bills", paid: totalPaid(lights), pending: totalPending(lights), total: lights.reduce((sum, item) => sum + billAmount(item), 0) },
      { label: "Staff expenses", paid: totalPaid(staff), pending: totalPending(staff), total: staff.reduce((sum, item) => sum + billAmount(item), 0) },
      { label: "Other expenses", paid: totalPaid(other), pending: totalPending(other), total: other.reduce((sum, item) => sum + billAmount(item), 0) },
    ];
  }, [activeType, allowedTypeValues, lightBills, otherExpenses, reportConfig, reportRange, staffExpenses, totals.balance, totals.paid]);
  const accountingTotals = useMemo(() => {
    const expensePaid = accountingRows.slice(1).reduce((sum, row) => sum + row.paid, 0);
    const expensePending = accountingRows.slice(1).reduce((sum, row) => sum + row.pending, 0);
    return { expensePaid, expensePending, net: totals.paid - expensePaid };
  }, [accountingRows, totals.paid]);
  const visibleCanteenAttendance = useMemo(() => {
    if (!allowedTypeValues.has("bed")) return [];
    if (reportConfig === "separated" && activeType !== "bed") return [];
    return canteenAttendance;
  }, [activeType, allowedTypeValues, canteenAttendance, reportConfig]);

  function tenantForDue(row) {
    return tenants.find((item) => String(item._id) === String(row.tenantId)) || {};
  }

  function dueDetailRows() {
    return visibleDues.flatMap((row) => {
      const tenant = tenantForDue(row);
      const months = Array.isArray(row.dueMonths) && row.dueMonths.length ? row.dueMonths : [{ month: reportLabel, outstanding: row.totalDue }];
      return months.map((month) => ({
        tenant,
        row,
        month,
        outstanding: Number(month.outstanding ?? month.pending ?? row.totalDue ?? 0),
      }));
    });
  }

  function buildCsv() {
    const rentCycleRows = visibleRentRows.flatMap((row) => {
      const cycles = Array.isArray(row.cycles) && row.cycles.length ? row.cycles : [{ month: reportLabel, expected: row.expected, paid: row.paidForCycles, pending: row.balance }];
      return cycles.map((cycle) => [
        row.tenant.name,
        row.tenant.phoneNo,
        PROPERTY_TYPE_LABELS[row.type] || row.type,
        formatTenantUnit(row.tenant),
        cycle.month || reportLabel,
        cycle.expected ?? row.expected,
        cycle.paid ?? row.paidForCycles,
        cycle.pending ?? row.balance,
        Number(cycle.pending ?? row.balance) <= 0 ? "Paid" : Number(cycle.paid ?? row.paidForCycles) > 0 ? "Partial" : "Pending",
      ]);
    });
    const dueRows = dueDetailRows().map(({ tenant, row, month, outstanding }) => [
      row.name || tenant.name,
      row.phoneNo || tenant.phoneNo,
      PROPERTY_TYPE_LABELS[propertyTypeFromTenant(tenant)] || propertyTypeFromTenant(tenant),
      formatTenantUnit(tenant),
      month.month || reportLabel,
      month.expected ?? "",
      month.paid ?? "",
      outstanding,
      reportMode === "Custom" ? `${startDate} to ${endDate}` : `As of ${toDateValue(new Date())}`,
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
    const lines = [[`${reportMode} Rent Report`, reportLabel, reportConfigLabel], [], ["Accounting"], ["Section", "Paid/Collected", "Pending", "Total"], ...accountingRows.map((row) => [row.label, row.paid, row.pending, row.total]), ["Net after paid expenses", accountingTotals.net], [], ["Rent collection details"], ["Tenant", "Phone", "Type", "Unit", "Billing month", "Expected", "Paid/applied", "Pending", "Status"], ...rentCycleRows, [], ["Dues by tenant / unit / date"], ["Tenant", "Phone", "Type", "Unit", "Due month", "Expected", "Paid", "Outstanding", "Date basis"], ...dueRows, ...canteenSection, [], [`Occupancy as of ${reportMode === "Custom" ? endDate : "today"}`], ["Type", "Total", "Occupied", "Vacant"], ...visibleOccupancy.map((row) => [row.label, row.total, row.occupied, row.vacant])];
    return lines.map((line) => line.map(csvCell).join(",")).join("\n");
  }

  function buildHtml() {
    const rentHtml = visibleRentRows.flatMap((row) => {
      const cycles = Array.isArray(row.cycles) && row.cycles.length ? row.cycles : [{ month: reportLabel, expected: row.expected, paid: row.paidForCycles, pending: row.balance }];
      return cycles.map((cycle) => `<tr><td>${escapeHtml(row.tenant.name)}</td><td>${escapeHtml(formatTenantUnit(row.tenant))}</td><td>${escapeHtml(cycle.month || reportLabel)}</td><td>${cycle.expected ?? row.expected}</td><td>${cycle.paid ?? row.paidForCycles}</td><td>${cycle.pending ?? row.balance}</td></tr>`);
    }).join("");
    const dueHtml = dueDetailRows().map(({ tenant, row, month, outstanding }) => `<tr><td>${escapeHtml(row.name || tenant.name)}</td><td>${escapeHtml(formatTenantUnit(tenant))}</td><td>${escapeHtml(month.month || reportLabel)}</td><td>${month.expected ?? ""}</td><td>${month.paid ?? ""}</td><td>${outstanding}</td></tr>`).join("");
    const canteenHtml = canteenEnabled ? pivotCanteenAttendance(visibleCanteenAttendance).map((row) => `<tr><td>${escapeHtml(row.tenantName)}</td><td>${escapeHtml(row.unit)}</td><td>${escapeHtml(row.dateKey)}</td><td>${escapeHtml(row.breakfast)}</td><td>${escapeHtml(row.lunch)}</td><td>${escapeHtml(row.dinner)}</td></tr>`).join("") : "";
    const canteenSectionHtml = canteenEnabled ? `<h2>Canteen attendance</h2><table><tr><th>Tenant</th><th>Unit</th><th>Date</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>${canteenHtml || "<tr><td colspan=\"6\">No records</td></tr>"}</table>` : "";
    const occupancyHtml = visibleOccupancy.map((row) => `<tr><td>${row.label}</td><td>${row.total}</td><td>${row.occupied}</td><td>${row.vacant}</td></tr>`).join("");
    const accountingHtml = accountingRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.paid}</td><td>${row.pending}</td><td>${row.total}</td></tr>`).join("");
    return `<!doctype html><html><head><style>body{font-family:Arial;color:#17202a;padding:28px}h1{font-size:24px}h2{font-size:17px;margin-top:28px;color:#2563eb}.summary{display:flex;gap:25px;padding:14px;background:#f5f7fa}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#eef1f5}</style></head><body><h1>Rent Management Report</h1><p>${escapeHtml(reportMode === "Monthly" ? selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" }) : `${startDate} to ${endDate}`)} | ${escapeHtml(reportConfigLabel)}</p><div class="summary"><b>Expected: ${totals.expected}</b><b>${reportMode === "Custom" ? "Received in range" : "Collected"}: ${totals.paid}</b><b>Pending: ${totals.balance}</b><b>Net: ${accountingTotals.net}</b></div><h2>Accounting</h2><table><tr><th>Section</th><th>Paid/Collected</th><th>Pending</th><th>Total</th></tr>${accountingHtml}</table><h2>Rent collection details</h2><table><tr><th>Tenant</th><th>Unit</th><th>Billing month</th><th>Expected</th><th>${reportMode === "Custom" ? "Received" : "Paid"}</th><th>Pending</th></tr>${rentHtml}</table><h2>Dues by tenant / unit / date</h2><table><tr><th>Tenant</th><th>Unit</th><th>Due month</th><th>Expected</th><th>Paid</th><th>Outstanding</th></tr>${dueHtml}</table>${canteenSectionHtml}<h2>Occupancy</h2><table><tr><th>Type</th><th>Total</th><th>Occupied</th><th>Vacant</th></tr>${occupancyHtml}</table></body></html>`;
  }

  async function exportCsv() {
    try {
      setExporting(true); const csv = buildCsv();
      if (Platform.OS === "web") {
        const anchor = globalThis.document.createElement("a"); anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; anchor.download = `rent-report-${reportLabel}.csv`; anchor.click(); return;
      }
      const uri = `${FileSystem.cacheDirectory}rent-report-${reportLabel}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: `Rent report ${reportLabel}` });
    } catch (err) { Alert.alert("Export failed", err.message); }
    finally { setExporting(false); }
  }

  async function exportPdf() {
    try {
      setExporting(true); const html = buildHtml();
      if (Platform.OS === "web") return await Print.printAsync({ html });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Rent report ${reportLabel}`, UTI: "com.adobe.pdf" });
    } catch (err) { Alert.alert("Export failed", err.message); }
    finally { setExporting(false); }
  }

  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View style={styles.headerText}><Text style={styles.title}>Reports</Text><Text style={styles.subtitle}>Rent, dues and occupancy</Text></View></View><ScrollView contentContainerStyle={styles.body}><View style={styles.monthPicker}><Pressable onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))} style={styles.monthButton}><ChevronLeft size={21} color={colors.primary} /></Pressable><Text style={styles.monthText}>{selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</Text><Pressable onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))} style={styles.monthButton}><ChevronRight size={21} color={colors.primary} /></Pressable></View>{propertyTypes.length > 1 ? <View style={styles.configTabs}>{REPORT_CONFIGS.map((item) => <Pressable key={item.value} onPress={() => setReportConfig(item.value)} style={[styles.configTab, reportConfig === item.value && styles.configTabActive]}><Text style={[styles.configTabText, reportConfig === item.value && styles.configTabTextActive]}>{item.label}</Text></Pressable>)}</View> : null}{reportConfig === "separated" ? <View style={styles.typeTabs}>{propertyTypes.map((item) => <Pressable key={item.value} onPress={() => setActiveType(item.value)} style={[styles.typeTab, activeType === item.value && styles.typeTabActive]}><Text style={[styles.typeTabText, activeType === item.value && styles.typeTabTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text></Pressable>)}</View> : null}<View style={styles.exportRow}><Pressable onPress={exportCsv} disabled={exporting || loading} style={styles.exportButton}><FileDown size={18} color={colors.primary} /><Text style={styles.exportText}>CSV</Text></Pressable><Pressable onPress={exportPdf} disabled={exporting || loading} style={styles.exportButton}><FileText size={18} color={colors.primary} /><Text style={styles.exportText}>PDF</Text></Pressable></View><View style={styles.tabs}>{TABS.map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{value}</Text></Pressable>)}</View>{loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : error ? <Text style={styles.error}>{error}</Text> : <View style={styles.list}>{tab === "Rent" ? <><View style={styles.summary}><View><Text style={styles.summaryLabel}>Expected</Text><Text style={styles.summaryValue}>{money(totals.expected)}</Text></View><View><Text style={styles.summaryLabel}>Collected</Text><Text style={[styles.summaryValue, styles.green]}>{money(totals.paid)}</Text></View><View><Text style={styles.summaryLabel}>Pending</Text><Text style={[styles.summaryValue, styles.orange]}>{money(totals.balance)}</Text></View></View>{visibleRentRows.map((row) => <View key={row.tenant._id} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.tenant.name}</Text><Text style={styles.rowMeta}>{formatTenantUnit(row.tenant)}</Text></View><View style={styles.rowAmounts}><Text style={styles.rowValue}>{money(row.paid)} / {money(row.expected)}</Text><Text style={[styles.status, row.status === "Paid" && styles.green, row.status === "Partial" && styles.orange]}>{row.status}</Text></View></View>)}</> : tab === "Accounting" ? <><View style={styles.summary}><View><Text style={styles.summaryLabel}>Expense paid</Text><Text style={[styles.summaryValue, styles.orange]}>{money(accountingTotals.expensePaid)}</Text></View><View><Text style={styles.summaryLabel}>Expense pending</Text><Text style={[styles.summaryValue, styles.orange]}>{money(accountingTotals.expensePending)}</Text></View><View><Text style={styles.summaryLabel}>Net</Text><Text style={[styles.summaryValue, accountingTotals.net >= 0 ? styles.green : styles.orange]}>{money(accountingTotals.net)}</Text></View></View>{accountingRows.map((row) => <View key={row.label} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.label}</Text><Text style={styles.rowMeta}>Total {money(row.total)}</Text></View><View style={styles.rowAmounts}><Text style={styles.rowValue}>Paid {money(row.paid)}</Text><Text style={styles.rowPending}>Pending {money(row.pending)}</Text></View></View>)}</> : tab === "Dues" ? <><View style={styles.dueTotal}><Text style={styles.dueLabel}>Total outstanding</Text><Text style={styles.dueValue}>{money(visibleDueTotal)}</Text></View>{visibleDues.map((row) => <View key={row.tenantId} style={styles.row}><View style={styles.rowMain}><Text style={styles.rowTitle}>{row.name}</Text><Text style={styles.rowMeta}>{(row.dueMonths || []).map((month) => month.month).join(", ")}</Text></View><Text style={styles.dueRowValue}>{money(row.totalDue)}</Text></View>)}</> : <>{visibleOccupancy.map((row) => <View key={row.label} style={styles.occupancy}><Text style={styles.rowTitle}>{stackedPropertyLabel(row.label)}</Text><View style={styles.occupancyStats}><Text style={styles.occupancyValue}>{row.occupied}<Text style={styles.occupancyLabel}> occupied</Text></Text><Text style={styles.occupancyValue}>{row.vacant}<Text style={styles.occupancyLabel}> vacant</Text></Text><Text style={styles.occupancyValue}>{row.total}<Text style={styles.occupancyLabel}> total</Text></Text></View></View>)}</>}</View>}</ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, header: { width: "100%", maxWidth: 780, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }, iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, headerText: { marginLeft: 4 }, title: { color: colors.text, fontSize: 23, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 }, body: { flex: 1, width: "100%", maxWidth: 780, alignSelf: "center", padding: 16 },
  monthPicker: { height: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, monthButton: { width: 48, height: 46, alignItems: "center", justifyContent: "center" }, monthText: { flex: 1, color: colors.text, fontWeight: "700", textAlign: "center" }, configTabs: { height: 44, marginTop: 10, padding: 4, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border }, configTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 }, configTabActive: { backgroundColor: colors.surface }, configTabText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, configTabTextActive: { color: colors.primary }, typeTabs: { minHeight: 68, marginTop: 8, padding: 4, flexDirection: "row", gap: 4, borderRadius: 7, backgroundColor: colors.border }, typeTab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 }, typeTabActive: { backgroundColor: colors.surface }, typeTabText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" }, typeTabTextActive: { color: colors.primary }, exportRow: { marginTop: 9, flexDirection: "row", justifyContent: "flex-end", gap: 8 }, exportButton: { height: 38, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface }, exportText: { color: colors.primary, fontSize: 12, fontWeight: "700" }, tabs: { height: 48, marginTop: 10, padding: 3, flexDirection: "row", gap: 3, borderRadius: 7, backgroundColor: colors.border }, tab: { flex: 1, minWidth: 0, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", borderRadius: 5 }, tabActive: { backgroundColor: colors.surface }, tabText: { width: "100%", color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center" }, tabTextActive: { color: colors.primary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" }, error: { marginTop: 20, color: colors.danger, textAlign: "center" }, list: { paddingTop: 11, paddingBottom: 35, gap: 8 }, summary: { minHeight: 72, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, summaryLabel: { color: colors.muted, fontSize: 11 }, summaryValue: { marginTop: 5, color: colors.text, fontSize: 14, fontWeight: "700" }, green: { color: colors.success }, orange: { color: colors.warning }, row: { minHeight: 68, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, rowMain: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontWeight: "700" }, rowMeta: { marginTop: 4, color: colors.muted, fontSize: 11 }, rowAmounts: { alignItems: "flex-end", marginLeft: 8 }, rowValue: { color: colors.muted, fontSize: 11, fontWeight: "600" }, rowPending: { marginTop: 4, color: colors.warning, fontSize: 11, fontWeight: "700" }, status: { marginTop: 5, color: colors.danger, fontSize: 11, fontWeight: "700" }, dueTotal: { minHeight: 68, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 7, backgroundColor: colors.dangerSoft }, dueLabel: { color: colors.danger, fontWeight: "700" }, dueValue: { color: colors.danger, fontSize: 19, fontWeight: "700" }, dueRowValue: { color: colors.danger, fontWeight: "700" }, occupancy: { minHeight: 78, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, occupancyStats: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" }, occupancyValue: { color: colors.text, fontSize: 16, fontWeight: "700" }, occupancyLabel: { color: colors.muted, fontSize: 10, fontWeight: "400" },
});

