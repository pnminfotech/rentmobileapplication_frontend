import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Archive, ArrowLeft, Check, ChevronDown, FileDown, FileText, RotateCcw, Search } from "lucide-react-native";

import { getRooms } from "../../src/api/roomApi";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getArchivedTenants, getTenants, restoreTenant } from "../../src/api/tenantApi";
import { formatTenantUnit, formatVacancyMeta, formatVacancyTitle, normalizePropertyType, propertyTypeFromTenant, stackedPropertyLabel, unitTypeLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

const TENANT_TYPE_LABELS = { bed: "Hostel Beds", room: "Residential Rooms", shop: "Commercial Shop" };

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeFileName(value) {
  return String(value || "tenant").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function activeTenant(tenant) {
  if (!tenant.leaveDate) return true;
  const date = new Date(tenant.leaveDate);
  return Number.isNaN(date.getTime()) || date > new Date();
}

function undoDeadline(tenant) {
  if (!tenant?.leaveDate) return null;
  const date = new Date(tenant.leaveDate);
  if (Number.isNaN(date.getTime())) return null;
  const deadline = new Date(date);
  deadline.setMonth(deadline.getMonth() + 1);
  deadline.setHours(23, 59, 59, 999);
  return deadline;
}

function canUndoTenant(tenant) {
  const deadline = undoDeadline(tenant);
  if (!deadline) return true;
  return deadline.getTime() >= Date.now();
}

function isSameSlot(tenant, unit, bed) {
  const sameUnitById = tenant.roomId && String(tenant.roomId) === String(unit._id);
  const sameUnitByNumber = String(tenant.category || "") === String(unit.category || "") && String(tenant.roomNo || "") === String(unit.roomNo || "");
  const sameUnit = sameUnitById || sameUnitByNumber;
  return sameUnit && (normalizePropertyType(unit.propertyType) !== "bed" || String(tenant.bedNo || "") === String(bed.bedNo || ""));
}

function buildVacancies(units, tenants, propertyType = "bed") {
  const active = tenants.filter(activeTenant);
  const targetType = normalizePropertyType(propertyType);
  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    const type = normalizePropertyType(unit.propertyType);
    if (type !== targetType) return [];
    if (type !== "bed") {
      return beds[0] && !active.some((tenant) => isSameSlot(tenant, unit, beds[0])) ? [{ unit, bed: beds[0] }] : [];
    }
    return beds.filter((bed) => !active.some((tenant) => isSameSlot(tenant, unit, bed))).map((bed) => ({ unit, bed }));
  });
}

function allocationFromVacancy(vacancy) {
  if (!vacancy) return null;
  return {
    roomId: vacancy.unit._id,
    propertyType: normalizePropertyType(vacancy.unit.propertyType),
    category: vacancy.unit.category,
    floorNo: vacancy.unit.floorNo,
    roomNo: vacancy.unit.roomNo,
    bedNo: vacancy.bed?.bedNo || vacancy.unit.roomNo,
    baseRent: Number(vacancy.bed?.price || 0),
    rentAmount: Number(vacancy.bed?.price || 0),
  };
}

function rentHistoryEntries(tenant) {
  const rents = Array.isArray(tenant?.rents) ? tenant.rents : [];
  return rents.flatMap((rent) => {
    const payments = Array.isArray(rent.payments) && rent.payments.length
      ? rent.payments
      : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
    return payments.map((payment, index) => ({
      key: `${rent.month || "month"}-${index}-${payment.date || ""}`,
      month: rent.month || "-",
      date: formatDate(payment.date),
      amount: money(payment.amount),
      mode: payment.paymentMode || rent.paymentMode || "-",
      utr: payment.utr || "-",
      note: payment.note || "-",
    }));
  });
}

export default function FormerTenantsScreen() {
  const router = useRouter();
  const [tenants, setTenants] = useState([]);
  const [activeType, setActiveType] = useState("all");
  const [unitAccess, setUnitAccess] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [reportingId, setReportingId] = useState("");
  const [sheetingId, setSheetingId] = useState("");
  const [detailsTenant, setDetailsTenant] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreModal, setRestoreModal] = useState({ visible: false, tenant: null, vacancies: [], selectedIndex: 0, oldOccupied: false, showOptions: false });

  const loadData = useCallback(async () => {
    try {
      const [archived, dashboard] = await Promise.all([getArchivedTenants(), getSystemDashboard()]);
      setTenants(Array.isArray(archived) ? archived : []);
      setUnitAccess(dashboard?.units || dashboard);
      if (activeType !== "all" && !isTypeAllowed(activeType, dashboard?.units || dashboard)) {
        const allowedTypes = allowedUnitTypes(dashboard?.units || dashboard);
        setActiveType(allowedTypes.length > 1 ? "all" : firstAllowedType(dashboard?.units || dashboard));
      }
      setError("");
    }
    catch (err) { setError(err.response?.data?.message || "Unable to load former tenants."); }
    finally { setLoading(false); }
  }, [activeType]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const tenantTypes = useMemo(() => {
    const allowed = allowedUnitTypes(unitAccess).map((item) => ({
      ...item,
      label: TENANT_TYPE_LABELS[item.value] || item.label,
    }));
    return allowed.length > 1 ? [{ value: "all", label: "All" }, ...allowed] : allowed;
  }, [unitAccess]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tenants
      .filter((tenant) => activeType === "all" || propertyTypeFromTenant(tenant) === activeType)
      .filter((tenant) => !needle || [tenant.name, tenant.phoneNo, tenant.roomNo, tenant.bedNo, tenant.shopName].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [activeType, query, tenants]);

  const typeCounts = useMemo(() => {
    return tenantTypes.reduce((counts, item) => {
      counts[item.value] = item.value === "all"
        ? tenants.length
        : tenants.filter((tenant) => propertyTypeFromTenant(tenant) === item.value).length;
      return counts;
    }, {});
  }, [tenantTypes, tenants]);

  const summary = useMemo(() => ({
    total: tenants.length,
    visible: visible.length,
  }), [tenants.length, visible]);

  const activeTypeLabel = tenantTypes.find((item) => item.value === activeType)?.label || "Tenants";

  async function restoreNow(tenant, allocation) {
    try {
      if (!canUndoTenant(tenant)) {
        Alert.alert("Undo expired", "Undo is only available until one month after the leave date.");
        return;
      }
      const tenantType = propertyTypeFromTenant(tenant);
      if (!isTypeAllowed(tenantType, unitAccess)) {
        Alert.alert("Not included", `Your current subscription does not include ${unitTypeLabel({ propertyType: tenantType }).toLowerCase()}.`);
        return;
      }
      setRestoringId(String(tenant._id));
      await restoreTenant(tenant._id, allocation);
      setRestoreModal({ visible: false, tenant: null, vacancies: [], selectedIndex: 0, oldOccupied: false, showOptions: false });
      await loadData();
      Alert.alert("Tenant restored", `${tenant.name} is back in main tenants.`);
    } catch (err) {
      if (err.response?.status === 409) {
        await openRestoreFlow(tenant, true);
        return;
      }
      Alert.alert("Unable to restore", err.response?.data?.message || "Please try again.");
    } finally {
      setRestoringId("");
    }
  }

  async function openRestoreFlow(tenant, forcePick = false) {
    try {
      if (!canUndoTenant(tenant)) {
        Alert.alert("Undo expired", "Undo is only available until one month after the leave date.");
        return;
      }
      setRestoringId(String(tenant._id));
      const tenantType = propertyTypeFromTenant(tenant);
      if (!isTypeAllowed(tenantType, unitAccess)) {
        Alert.alert("Not included", `Your current subscription does not include ${unitTypeLabel({ propertyType: tenantType }).toLowerCase()}.`);
        return;
      }
      const [units, activeTenants] = await Promise.all([getRooms(), getTenants()]);
      const vacancies = buildVacancies(Array.isArray(units) ? units : [], Array.isArray(activeTenants) ? activeTenants : [], tenantType);
      const oldVacancy = vacancies.find(({ unit, bed }) => isSameSlot(tenant, unit, bed));

      if (oldVacancy && !forcePick) {
        Alert.alert(
          "Restore tenant?",
          `Previous unit is available: ${formatTenantUnit(tenant)}.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Restore", onPress: () => restoreNow(tenant) },
          ]
        );
        return;
      }

      if (!vacancies.length) {
        Alert.alert("No vacant unit", `There is no vacant ${unitTypeLabel({ propertyType: tenantType }).toLowerCase()} available to restore this tenant.`);
        return;
      }

      setRestoreModal({ visible: true, tenant, vacancies, selectedIndex: 0, oldOccupied: true, showOptions: false });
    } catch (err) {
      Alert.alert("Unable to check beds", err.response?.data?.message || "Please try again.");
    } finally {
      setRestoringId("");
    }
  }

  function buildTenantReportHtml(tenant) {
    const settlement = tenant.leaveSettlement || {};
    const documents = Array.isArray(tenant.documents) ? tenant.documents : [];
    const rents = Array.isArray(tenant.rents) ? tenant.rents : [];
    const rentRows = rents.flatMap((rent) => {
      const payments = Array.isArray(rent.payments) && rent.payments.length
        ? rent.payments
        : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
      return payments.map((payment, index) => `
        <tr>
          <td>${escapeHtml(rent.month || "-")}</td>
          <td>${escapeHtml(formatDate(payment.date))}</td>
          <td>${escapeHtml(money(payment.amount))}</td>
          <td>${escapeHtml(payment.paymentMode || rent.paymentMode || "-")}</td>
          <td>${escapeHtml(payment.utr || "-")}</td>
          <td>${escapeHtml(payment.note || "-")}</td>
          <td>${index + 1}</td>
        </tr>
      `);
    }).join("");
    const documentRows = documents.map((document) => `
      <tr>
        <td>${escapeHtml(document.relation || "Document")}</td>
        <td>${escapeHtml(document.fileName || document.filename || document.storedName || "-")}</td>
        <td>${document.url ? `<a href="${escapeHtml(document.url)}">${escapeHtml(document.url)}</a>` : "-"}</td>
      </tr>
    `).join("");
    const documentImages = documents.filter((document) => document.url).map((document) => `
      <div class="doc-card">
        <div class="doc-title">${escapeHtml(document.relation || "Document")}</div>
        <img src="${escapeHtml(document.url)}" />
      </div>
    `).join("");
    const historyRows = (tenant.rentHistory || []).map((entry) => `
      <tr>
        <td>${escapeHtml(formatDate(entry.effectiveFrom))}</td>
        <td>${escapeHtml(entry.previousRoomNo || "-")}${entry.previousBedNo ? ` / ${escapeHtml(entry.previousBedNo)}` : ""}</td>
        <td>${escapeHtml(entry.roomNo || "-")}${entry.bedNo ? ` / ${escapeHtml(entry.bedNo)}` : ""}</td>
        <td>${escapeHtml(money(entry.baseRent || entry.rentAmount || 0))}</td>
        <td>${escapeHtml(entry.source || "-")}</td>
      </tr>
    `).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#17202a;padding:28px}
      h1{font-size:24px;margin:0} h2{font-size:16px;margin-top:24px;color:#2563eb}
      .muted{color:#6b7280;font-size:12px}.summary{margin-top:16px;padding:14px;background:#f5f7fa;border-radius:8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.item{border-bottom:1px solid #e5e7eb;padding:7px 0}.label{color:#6b7280;font-size:11px}.value{font-weight:700;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#eef1f5}
      .doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.doc-card{border:1px solid #ddd;border-radius:8px;padding:8px;break-inside:avoid}.doc-title{font-weight:700;margin-bottom:6px}.doc-card img{max-width:100%;max-height:220px;object-fit:contain}
      a{color:#2563eb;word-break:break-all}.footer{margin-top:28px;color:#6b7280;font-size:11px;text-align:center}
    </style></head><body>
      <h1>Former Tenant Full Report</h1>
      <div class="muted">Generated on ${escapeHtml(new Date().toLocaleString("en-IN"))}</div>
      <div class="summary"><b>${escapeHtml(tenant.name || "-")}</b> | Admission #${escapeHtml(tenant.srNo || "-")} | Phone ${escapeHtml(tenant.phoneNo || "-")}</div>
      <h2>Personal and stay details</h2>
      <div class="grid">
        <div class="item"><div class="label">Name</div><div class="value">${escapeHtml(tenant.name)}</div></div>
        <div class="item"><div class="label">Phone</div><div class="value">${escapeHtml(tenant.phoneNo)}</div></div>
        <div class="item"><div class="label">Date of birth</div><div class="value">${escapeHtml(formatDate(tenant.dob))}</div></div>
        <div class="item"><div class="label">Tenant joining date</div><div class="value">${escapeHtml(formatDate(tenant.joiningDate))}</div></div>
        <div class="item"><div class="label">Leave date</div><div class="value">${escapeHtml(formatDate(tenant.leaveDate))}</div></div>
        <div class="item"><div class="label">Payment cycle</div><div class="value">${tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid - Pay at Joining" : "Normal cycle - Pay at Month End"}</div></div>
        <div class="item"><div class="label">Unit</div><div class="value">${escapeHtml(tenant.category || "-")} | Floor ${escapeHtml(tenant.floorNo || "-")} | ${escapeHtml(formatTenantUnit(tenant))}</div></div>
        <div class="item"><div class="label">Monthly rent / Deposit</div><div class="value">${escapeHtml(money(tenant.baseRent || tenant.rentAmount))} / ${escapeHtml(money(tenant.depositAmount))}</div></div>
      </div>
      <h2>Address</h2>
      <div class="grid">
        <div class="item"><div class="label">Address</div><div class="value">${escapeHtml([tenant.houseNo, tenant.address, tenant.nearbyPlace].filter(Boolean).join(", ") || "-")}</div></div>
        <div class="item"><div class="label">City/state/pincode</div><div class="value">${escapeHtml([tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ") || "-")}</div></div>
      </div>
      <h2>Emergency contacts</h2>
      <table><tr><th>Relation</th><th>Name</th><th>Phone</th></tr>
        <tr><td>${escapeHtml(tenant.relative1Relation || "-")}</td><td>${escapeHtml(tenant.relative1Name || "-")}</td><td>${escapeHtml(tenant.relative1Phone || "-")}</td></tr>
        <tr><td>${escapeHtml(tenant.relative2Relation || "-")}</td><td>${escapeHtml(tenant.relative2Name || "-")}</td><td>${escapeHtml(tenant.relative2Phone || "-")}</td></tr>
      </table>
      <h2>Work or education</h2>
      <div class="grid">
        <div class="item"><div class="label">Company/college</div><div class="value">${escapeHtml(tenant.companyAddress || "-")}</div></div>
        <div class="item"><div class="label">Joining date</div><div class="value">${escapeHtml(formatDate(tenant.dateOfJoiningCollege))}</div></div>
      </div>
      <h2>Leave settlement</h2>
      <div class="grid">
        <div class="item"><div class="label">Gross deposit</div><div class="value">${escapeHtml(money(settlement.grossDeposit || tenant.depositAmount))}</div></div>
        <div class="item"><div class="label">Total deduction</div><div class="value">${escapeHtml(money(settlement.totalDeduction))}</div></div>
        <div class="item"><div class="label">Refundable deposit</div><div class="value">${escapeHtml(money(settlement.refundableDeposit))}</div></div>
        <div class="item"><div class="label">Amount due from tenant</div><div class="value">${escapeHtml(money(settlement.amountDueFromTenant))}</div></div>
        <div class="item"><div class="label">Note</div><div class="value">${escapeHtml(settlement.note || "-")}</div></div>
      </div>
      <h2>Rent/payment history</h2>
      <table><tr><th>Month</th><th>Date</th><th>Amount</th><th>Mode</th><th>UTR</th><th>Note</th><th>Txn #</th></tr>${rentRows || `<tr><td colspan="7">No rent history</td></tr>`}</table>
      <h2>Room/rent movement history</h2>
      <table><tr><th>Effective from</th><th>Previous</th><th>New</th><th>Rent</th><th>Source</th></tr>${historyRows || `<tr><td colspan="5">No movement history</td></tr>`}</table>
      <h2>Documents</h2>
      <table><tr><th>Relation</th><th>File</th><th>URL</th></tr>${documentRows || `<tr><td colspan="3">No documents</td></tr>`}</table>
      ${documentImages ? `<h2>Document preview</h2><div class="doc-grid">${documentImages}</div>` : ""}
      <div class="footer">Computer-generated former tenant report.</div>
    </body></html>`;
  }

  async function downloadTenantReport(tenant) {
    try {
      setReportingId(String(tenant._id));
      const html = buildTenantReportHtml(tenant);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) return Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${tenant.name || "Tenant"} full report`, UTI: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Unable to generate report", err.message || "Please try again.");
    } finally {
      setReportingId("");
    }
  }

  function buildTenantReportCsv(tenant) {
    const settlement = tenant.leaveSettlement || {};
    const documents = Array.isArray(tenant.documents) ? tenant.documents : [];
    const rents = Array.isArray(tenant.rents) ? tenant.rents : [];
    const rows = [
      ["Section", "Field", "Value", "Extra 1", "Extra 2", "Extra 3", "Document URL"],
      ["Personal", "Name", tenant.name],
      ["Personal", "Admission No", tenant.srNo],
      ["Personal", "Phone", tenant.phoneNo],
      ["Personal", "Date of birth", formatDate(tenant.dob)],
      ["Stay", "Tenant joining date", formatDate(tenant.joiningDate)],
      ["Stay", "Leave date", formatDate(tenant.leaveDate)],
      ["Stay", "Payment cycle", tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid - Pay at Joining" : "Normal cycle - Pay at Month End"],
      ["Unit", "Category", tenant.category, "Floor", tenant.floorNo],
      ["Unit", "Assignment", formatTenantUnit(tenant), "Internal slot", tenant.bedNo],
      ["Financial", "Monthly rent", tenant.baseRent || tenant.rentAmount],
      ["Financial", "Deposit", tenant.depositAmount],
      ["Address", "Full address", [tenant.houseNo, tenant.address, tenant.nearbyPlace, tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ")],
      ["Contact 1", tenant.relative1Relation, tenant.relative1Name, tenant.relative1Phone],
      ["Contact 2", tenant.relative2Relation, tenant.relative2Name, tenant.relative2Phone],
      ["Work/Education", "Company/college", tenant.companyAddress],
      ["Work/Education", "Joining date", formatDate(tenant.dateOfJoiningCollege)],
      ["Settlement", "Gross deposit", settlement.grossDeposit || tenant.depositAmount],
      ["Settlement", "Total deduction", settlement.totalDeduction],
      ["Settlement", "Refundable deposit", settlement.refundableDeposit],
      ["Settlement", "Amount due from tenant", settlement.amountDueFromTenant],
      ["Settlement", "Note", settlement.note],
      [],
      ["Rent History", "Month", "Date", "Amount", "Mode", "UTR", "Note"],
    ];

    rents.forEach((rent) => {
      const payments = Array.isArray(rent.payments) && rent.payments.length
        ? rent.payments
        : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
      payments.forEach((payment) => rows.push([
        "Rent History",
        rent.month,
        formatDate(payment.date),
        payment.amount,
        payment.paymentMode || rent.paymentMode,
        payment.utr,
        payment.note,
      ]));
    });

    rows.push([]);
    rows.push(["Room/Rent Movement", "Effective from", "Previous", "New", "Rent", "Source"]);
    (tenant.rentHistory || []).forEach((entry) => rows.push([
      "Room/Rent Movement",
      formatDate(entry.effectiveFrom),
      `${entry.previousRoomNo || "-"}${entry.previousBedNo ? ` / ${entry.previousBedNo}` : ""}`,
      `${entry.roomNo || "-"}${entry.bedNo ? ` / ${entry.bedNo}` : ""}`,
      entry.baseRent || entry.rentAmount || 0,
      entry.source,
    ]));

    rows.push([]);
    rows.push(["Documents", "Relation", "File", "File ID", "File path", "Content type", "Document URL"]);
    documents.forEach((document) => rows.push([
      "Documents",
      document.relation || "Document",
      document.fileName || document.filename || document.storedName || "",
      document.fileId || "",
      document.filePath || "",
      document.contentType || "",
      document.url || "",
    ]));

    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  }

  async function downloadTenantSheet(tenant) {
    try {
      setSheetingId(String(tenant._id));
      const csv = buildTenantReportCsv(tenant);
      const filename = `former-tenant-${safeFileName(tenant.name)}-${safeFileName(tenant.srNo)}.csv`;
      if (Platform.OS === "web") {
        const anchor = globalThis.document.createElement("a");
        anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        anchor.download = filename;
        anchor.click();
        return;
      }
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) return Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: `${tenant.name || "Tenant"} sheet report`, UTI: "public.comma-separated-values-text" });
    } catch (err) {
      Alert.alert("Unable to generate sheet", err.message || "Please try again.");
    } finally {
      setSheetingId("");
    }
  }

  function DetailRow({ label, value }) {
    if (!String(value ?? "").trim()) return null;
    return (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || "-"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}><Pressable onPress={() => router.replace("/system/tenants")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Former tenants</Text><Text style={styles.subtitle}>{summary.total} archived records</Text></View></View>
        <View style={styles.typeTabs}>
          {tenantTypes.map((item) => {
            const active = item.value === activeType;
            const count = typeCounts[item.value] || 0;
            return (
              <Pressable key={item.value} onPress={() => setActiveType(item.value)} style={[styles.typeTab, active && styles.typeTabActive]}>
                <Text style={[styles.typeTabText, active && styles.typeTabTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text>
                <Text style={[styles.typeTabCount, active && styles.typeTabTextActive]} numberOfLines={1}>{count}</Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.counterTitle}>Archive summary</Text>
          <View style={styles.counterBar}>
            <View style={styles.counterItem}><Text style={styles.counterValue}>{summary.total}</Text><Text style={styles.counterLabel}>Archived</Text></View>
            <View style={styles.counterDivider} />
            <View style={styles.counterItem}><Text style={styles.counterValue}>{summary.visible}</Text><Text style={styles.counterLabel}>Showing</Text></View>
          </View>
          <View style={styles.search}><Search size={18} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={`Search former ${activeTypeLabel.toLowerCase()}`} style={styles.searchInput} /></View>
          {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : error ? <View style={styles.loading}><Text style={styles.error}>{error}</Text></View> : (
            <View style={styles.list}>
              {!visible.length ? <View style={styles.empty}><Archive size={32} color={colors.subtle} /><Text style={styles.emptyTitle}>No former tenants</Text></View> : null}
              {visible.map((tenant) => {
                const settlement = tenant.leaveSettlement || {};
                const undoAllowed = canUndoTenant(tenant);
                const deadline = undoDeadline(tenant);
                return <View key={tenant._id} style={styles.row}><Pressable onPress={() => { setDetailsTenant(tenant); setHistoryOpen(false); }} style={styles.rowMain}><View style={styles.rowTop}><View style={styles.info}><Text style={styles.name}>{tenant.name}</Text><Text style={styles.meta}>{formatTenantUnit(tenant)}</Text></View><Text style={styles.leaveDate}>Left {formatDate(tenant.leaveDate)}</Text></View><View style={styles.settlement}><View style={styles.settlementInfo}><Text style={styles.settlementText}>Deposit refund: Rs. {Number(settlement.refundableDeposit || 0).toLocaleString("en-IN")}</Text>{deadline ? <Text style={[styles.undoWindowText, !undoAllowed && styles.undoExpiredText]}>{undoAllowed ? `Undo till ${formatDate(deadline)}` : `Undo expired on ${formatDate(deadline)}`}</Text> : null}</View></View></Pressable><View style={styles.rowActions}><Pressable disabled={reportingId === String(tenant._id)} onPress={() => downloadTenantReport(tenant)} style={[styles.reportButton, reportingId === String(tenant._id) && styles.disabled]}>{reportingId === String(tenant._id) ? <ActivityIndicator size="small" color={colors.primary} /> : <FileText size={16} color={colors.primary} />}<Text style={styles.undoText}>PDF</Text></Pressable><Pressable disabled={sheetingId === String(tenant._id)} onPress={() => downloadTenantSheet(tenant)} style={[styles.reportButton, sheetingId === String(tenant._id) && styles.disabled]}>{sheetingId === String(tenant._id) ? <ActivityIndicator size="small" color={colors.primary} /> : <FileDown size={16} color={colors.primary} />}<Text style={styles.undoText}>Sheet</Text></Pressable><Pressable disabled={!undoAllowed || restoringId === String(tenant._id)} onPress={() => openRestoreFlow(tenant)} style={[styles.undoButton, (!undoAllowed || restoringId === String(tenant._id)) && styles.disabled]}>{restoringId === String(tenant._id) ? <ActivityIndicator size="small" color={colors.primary} /> : <RotateCcw size={16} color={colors.primary} />}<Text style={styles.undoText}>Undo</Text></Pressable></View></View>;
              })}
            </View>
          )}
        </ScrollView>
      </View>
      <Modal transparent visible={Boolean(detailsTenant)} animationType="fade" onRequestClose={() => setDetailsTenant(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModalCard}>
            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderText}>
                <Text style={styles.modalTitle}>{detailsTenant?.name || "Former tenant"}</Text>
                <Text style={styles.detailSubtitle}>{detailsTenant ? `${formatTenantUnit(detailsTenant)} | Left ${formatDate(detailsTenant.leaveDate)}` : ""}</Text>
              </View>
            </View>
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              {detailsTenant && ["bed", "room", "shop"].includes(propertyTypeFromTenant(detailsTenant)) ? (
                <>
                  {!historyOpen ? <Pressable onPress={() => setHistoryOpen(true)} style={styles.historyButton}><Text style={styles.historyButtonText}>View full rent history</Text></Pressable> : null}
                  <DetailRow label="Phone" value={detailsTenant.phoneNo ? String(detailsTenant.phoneNo) : ""} />
                  <DetailRow label="Payment cycle" value={detailsTenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid" : "Normal cycle"} />
                  <DetailRow label="Deposit" value={money(detailsTenant.depositAmount)} />
                  <DetailRow label="Monthly rent" value={money(detailsTenant.baseRent || detailsTenant.rentAmount)} />
                  <DetailRow label="Joining date" value={formatDate(detailsTenant.joiningDate)} />
                  <DetailRow label="Leave date" value={formatDate(detailsTenant.leaveDate)} />
                  <DetailRow label="Date of birth" value={formatDate(detailsTenant.dob)} />
                  <DetailRow label="Address" value={[detailsTenant.houseNo, detailsTenant.address, detailsTenant.nearbyPlace].filter(Boolean).join(", ")} />
                  <DetailRow label="City / State / PIN" value={[detailsTenant.city, detailsTenant.state, detailsTenant.pincode].filter(Boolean).join(", ")} />
                  {propertyTypeFromTenant(detailsTenant) === "bed" ? (
                    <>
                      <DetailRow label="Contact 1" value={[detailsTenant.relative1Relation, detailsTenant.relative1Name, detailsTenant.relative1Phone].filter(Boolean).join(" | ")} />
                      <DetailRow label="Contact 2" value={[detailsTenant.relative2Relation, detailsTenant.relative2Name, detailsTenant.relative2Phone].filter(Boolean).join(" | ")} />
                      <DetailRow label="Company / College" value={detailsTenant.companyAddress} />
                      <DetailRow label="Joining date at company/college" value={formatDate(detailsTenant.dateOfJoiningCollege)} />
                    </>
                  ) : null}
                  {propertyTypeFromTenant(detailsTenant) === "room" ? (
                    <>
                      <DetailRow label="Family members" value={detailsTenant.familyMembers != null ? String(detailsTenant.familyMembers) : ""} />
                      <DetailRow label="Partner / Contact" value={[detailsTenant.relative1Relation, detailsTenant.relative1Name, detailsTenant.relative1Phone].filter(Boolean).join(" | ")} />
                      <DetailRow label="Partner / Contact 2" value={[detailsTenant.relative2Relation, detailsTenant.relative2Name, detailsTenant.relative2Phone].filter(Boolean).join(" | ")} />
                      <DetailRow label="Company / College" value={detailsTenant.companyAddress} />
                    </>
                  ) : null}
                  {propertyTypeFromTenant(detailsTenant) === "shop" ? (
                    <>
                      <DetailRow label="Shop name" value={detailsTenant.shopName} />
                      <DetailRow label="Shop business" value={detailsTenant.shopBusiness} />
                    </>
                  ) : null}
                  <DetailRow label="Deposit refund" value={money(detailsTenant.leaveSettlement?.refundableDeposit)} />
                  <DetailRow label="Total deduction" value={money(detailsTenant.leaveSettlement?.totalDeduction)} />
                  <DetailRow label="Amount due from tenant" value={money(detailsTenant.leaveSettlement?.amountDueFromTenant)} />
                  <DetailRow label="Settlement note" value={detailsTenant.leaveSettlement?.note} />
                  {historyOpen ? (
                    <View style={styles.historySection}>
                      <Text style={styles.historyTitle}>Rent history</Text>
                      {rentHistoryEntries(detailsTenant).length ? (
                        rentHistoryEntries(detailsTenant).map((entry) => (
                          <View key={entry.key} style={styles.historyCard}>
                            <Text style={styles.historyMonth}>{entry.month}</Text>
                            <Text style={styles.historyMeta}>Date: {entry.date}</Text>
                            <Text style={styles.historyMeta}>Amount: {entry.amount}</Text>
                            <Text style={styles.historyMeta}>Mode: {entry.mode}</Text>
                            <Text style={styles.historyMeta}>UTR: {entry.utr}</Text>
                            <Text style={styles.historyMeta}>Note: {entry.note}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.historyEmpty}>No rent history found.</Text>
                      )}
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              {historyOpen ? <Pressable onPress={() => setHistoryOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Hide history</Text></Pressable> : null}
              <Pressable onPress={() => { setDetailsTenant(null); setHistoryOpen(false); }} style={styles.cancelButton}><Text style={styles.cancelText}>Close</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={restoreModal.visible} animationType="fade" onRequestClose={() => setRestoreModal((current) => ({ ...current, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose vacant unit</Text>
            <Text style={styles.modalText}>Previous unit is occupied. Select a vacant bed, room, or shop to restore {restoreModal.tenant?.name || "tenant"}.</Text>
            <Pressable onPress={() => setRestoreModal((current) => ({ ...current, showOptions: !current.showOptions }))} style={styles.select}>
              <Text style={styles.selectValue}>{restoreModal.vacancies[restoreModal.selectedIndex] ? `${formatVacancyTitle(restoreModal.vacancies[restoreModal.selectedIndex].unit)} | ${formatVacancyMeta(restoreModal.vacancies[restoreModal.selectedIndex].unit, restoreModal.vacancies[restoreModal.selectedIndex].bed)}` : "No vacant unit"}</Text>
              <ChevronDown size={18} color={colors.muted} />
            </Pressable>
            {restoreModal.showOptions ? <View style={styles.options}>{restoreModal.vacancies.map((vacancy, index) => <Pressable key={`${vacancy.unit._id}-${vacancy.bed?.bedNo || index}`} onPress={() => setRestoreModal((current) => ({ ...current, selectedIndex: index, showOptions: false }))} style={[styles.option, index === restoreModal.selectedIndex && styles.optionSelected]}><View style={styles.optionText}><Text style={styles.optionTitle}>{unitTypeLabel(vacancy.unit)} | {vacancy.unit.category}</Text><Text style={styles.optionMeta}>{formatVacancyMeta(vacancy.unit, vacancy.bed)}</Text></View>{index === restoreModal.selectedIndex ? <Check size={18} color={colors.primary} /> : null}</Pressable>)}</View> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRestoreModal({ visible: false, tenant: null, vacancies: [], selectedIndex: 0, oldOccupied: false, showOptions: false })} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable disabled={!restoreModal.vacancies[restoreModal.selectedIndex] || Boolean(restoringId)} onPress={() => restoreNow(restoreModal.tenant, allocationFromVacancy(restoreModal.vacancies[restoreModal.selectedIndex]))} style={[styles.restoreButton, (!restoreModal.vacancies[restoreModal.selectedIndex] || Boolean(restoringId)) && styles.disabled]}>{restoringId ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.restoreText}>Restore</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", padding: 18 }, header: { flexDirection: "row", alignItems: "center", marginBottom: 14, backgroundColor: colors.background }, scrollContent: { paddingBottom: 36 }, iconButton: { width: 44, height: 44, marginRight: 7, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 24, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  search: { height: 48, marginTop: 10, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, searchInput: { flex: 1, height: "100%", marginLeft: 8 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, list: { paddingTop: 12, paddingBottom: 36, gap: 8 },
  typeTabs: { marginBottom: 12, flexDirection: "row", padding: 4, borderRadius: 7, backgroundColor: colors.border },
  typeTab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  typeTabActive: { backgroundColor: colors.surface },
  typeTabText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  typeTabTextActive: { color: colors.primary },
  typeTabCount: { width: "100%", marginTop: 2, color: colors.subtle, fontSize: 11, fontWeight: "700", textAlign: "center" },
  counterTitle: { marginBottom: 7, color: colors.muted, fontSize: 13, fontWeight: "800" }, counterBar: { minHeight: 70, padding: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.primarySoft }, counterItem: { flex: 1, alignItems: "center" }, counterValue: { color: colors.text, fontSize: 14, fontWeight: "800" }, counterLabel: { marginTop: 4, color: colors.muted, fontSize: 10, fontWeight: "600" }, counterDivider: { width: 1, height: 36, backgroundColor: colors.border }, green: { color: colors.success }, red: { color: colors.danger },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, rowMain: { padding: 13 }, rowTop: { flexDirection: "row", alignItems: "center" }, info: { flex: 1, minWidth: 0, paddingRight: 8 }, name: { color: colors.text, fontWeight: "700" }, meta: { marginTop: 4, color: colors.muted, fontSize: 11 }, leaveDate: { color: colors.muted, fontSize: 11 }, settlement: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.surfaceSoft }, settlementInfo: { flex: 1 }, settlementText: { color: colors.success, fontSize: 11, fontWeight: "600" }, undoWindowText: { marginTop: 5, color: colors.muted, fontSize: 10, fontWeight: "600" }, undoExpiredText: { color: colors.danger }, due: { marginTop: 3, color: colors.danger, fontSize: 11, fontWeight: "700" },
  rowActions: { marginTop: 11, flexDirection: "row", alignItems: "center", gap: 8 }, reportButton: { flex: 1, minHeight: 40, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, undoButton: { flex: 1, minHeight: 40, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft }, undoText: { color: colors.primary, fontSize: 12, fontWeight: "700" }, disabled: { opacity: 0.55 },
  modalBackdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.45)" }, modalCard: { width: "100%", maxWidth: 460, padding: 18, borderRadius: 10, backgroundColor: colors.surface }, detailModalCard: { width: "100%", maxWidth: 520, maxHeight: "85%", padding: 18, borderRadius: 10, backgroundColor: colors.surface }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700" }, modalText: { marginTop: 8, marginBottom: 14, color: colors.muted, lineHeight: 20 },
  detailHeader: { marginBottom: 10 }, detailHeaderText: { minWidth: 0 }, detailSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12 }, detailScroll: { maxHeight: 520 }, detailContent: { paddingBottom: 8 }, detailRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, detailLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" }, detailValue: { marginTop: 4, color: colors.text, fontSize: 14, fontWeight: "600" },
  historyButton: { minHeight: 42, marginBottom: 10, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primarySoft }, historyButtonText: { color: colors.primary, fontWeight: "700" }, historySection: { marginTop: 14 }, historyTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 10 }, historyCard: { padding: 11, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, historyMonth: { color: colors.text, fontSize: 14, fontWeight: "700" }, historyMeta: { marginTop: 3, color: colors.muted, fontSize: 12 }, historyEmpty: { color: colors.muted, fontSize: 13 },
  select: { minHeight: 50, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, selectValue: { flex: 1, paddingRight: 8, color: colors.text, fontWeight: "600" }, options: { maxHeight: 260, marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, option: { minHeight: 56, padding: 11, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, optionSelected: { backgroundColor: colors.primarySoft }, optionText: { flex: 1 }, optionTitle: { color: colors.text, fontWeight: "700" }, optionMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  modalActions: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end", gap: 10 }, cancelButton: { height: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, cancelText: { color: colors.muted, fontWeight: "700" }, restoreButton: { height: 44, minWidth: 112, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, restoreText: { color: colors.surface, fontWeight: "700" },
  empty: { minHeight: 240, alignItems: "center", justifyContent: "center" }, emptyTitle: { marginTop: 9, color: colors.muted, fontWeight: "600" }, error: { color: colors.danger },
});
