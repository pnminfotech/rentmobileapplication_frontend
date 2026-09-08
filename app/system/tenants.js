import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, Download, Plus, Search, Share2, ShieldCheck, SlidersHorizontal, Upload, UserRound, X } from "lucide-react-native";
import * as XLSX from "xlsx";

import { getSystemDashboard } from "../../src/api/saasApi";
import { getRooms } from "../../src/api/roomApi";
import { createTenantInviteForForm, getRentDues, getRentSummary, getTenants, importTenantsFromSheet } from "../../src/api/tenantApi";
import { filterVacanciesByType, formatTenantUnit, formatVacancyMeta, groupVacanciesByProperty, propertyTypeFromTenant, unitTypeLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType } from "../../src/utils/subscriptionAccess";
import { documentStatusForTenant } from "../../src/utils/tenantDocuments";
import { useResponsive } from "../../src/utils/responsive";
import { colors } from "../../src/theme/colors";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;
const UI = {
  blue: "#4F7FA6",
  blueDark: "#244F70",
  blueSoft: "#E7F1F8",
  navy: "#111B2A",
  muted: "#63738A",
  border: "#D9E1E7",
  screen: "#F6F8F7",
};

const FILTERS = ["All", "Needs payment", "Paid"];
const INITIAL_TENANT_RENDER_COUNT = 40;
const INITIAL_VACANCY_RENDER_COUNT = 60;

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function monthKeyDate(value) {
  const match = /^([A-Za-z]{3})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const month = new Date(`${match[1]} 1, 2000`).getMonth();
  if (Number.isNaN(month)) return null;
  return new Date(2000 + Number(match[2]), month, 1);
}

function displayMonthKey(value) {
  const date = monthKeyDate(value);
  return date ? date.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : String(value || "Month");
}

function formatCycleDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function cycleStartForMonth(tenant, date) {
  const joined = new Date(tenant.joiningDate || tenant.createdAt || date);
  const cycleDay = Number.isNaN(joined.getTime()) ? 1 : joined.getDate();
  const day = Math.min(cycleDay, daysInMonth(date.getFullYear(), date.getMonth()));
  return new Date(date.getFullYear(), date.getMonth(), day);
}

function isMonthBeforeJoining(tenant, date) {
  const joined = new Date(tenant.joiningDate || tenant.createdAt || date);
  if (Number.isNaN(joined.getTime())) return false;
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return monthEnd < joined;
}

function formatDayMonth(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;
}

function formatMonthYear(date) {
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getFullYear()}`;
}

function formatJoinedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isLeavingTenant(tenant) {
  if (!tenant?.leaveDate) return false;
  const leaveDate = new Date(tenant.leaveDate);
  return !Number.isNaN(leaveDate.getTime()) && leaveDate > new Date();
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function compactMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function monthStatusLabel(item) {
  if (item.status === "-") return "-";
  if (item.status === "Pending") return `Pending ${compactMoney(item.balance)}`;
  return `${item.status} ${item.statusDate}`;
}

function latestPaymentDate(rentEntry) {
  const payments = Array.isArray(rentEntry?.payments) ? rentEntry.payments : [];
  const dates = [
    ...payments.map((payment) => payment.date || payment.createdAt),
    rentEntry?.date,
    rentEntry?.createdAt,
  ].filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function tenantPhotoUrl(tenant) {
  const documents = Array.isArray(tenant?.documents) ? tenant.documents : [];
  const photo = documents.find((document) => {
    const label = `${document?.relation || ""} ${document?.fileName || ""} ${document?.storedName || ""}`.toLowerCase();
    return document?.url && (label.includes("photo") || label.includes("selfie") || label.includes("photograph"));
  });
  return photo?.url || "";
}

function tenantUnitBadgeLabel(tenant) {
  const type = propertyTypeFromTenant(tenant);
  const unitNo = tenant?.roomNo || "-";
  if (type === "shop") return `Shop ${unitNo}`;
  if (type === "room") return `Rental room ${unitNo}`;
  return `Room ${unitNo}${tenant?.bedNo ? ` | Bed ${tenant.bedNo}` : ""}`;
}

function toDisplayName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function rentMonthStatus(summary, tenant, month) {
  const rentEntry = (tenant.rents || []).find((rent) => rent.month === month.key);
  const beforeJoining = isMonthBeforeJoining(tenant, month.date);
  const rentExpected = Number(summary?.expected ?? tenant.baseRent ?? 0);
  const totalExpected = Number(summary?.totalExpected ?? rentExpected);
  const paid = Number(summary?.totalPaid ?? summary?.paid ?? rentEntry?.totalAmount ?? rentEntry?.rentAmount ?? 0);
  const balance = Math.max(totalExpected - paid, 0);
  const startDate = cycleStartForMonth(tenant, month.date);
  const endDate = cycleStartForMonth(tenant, shiftMonth(month.date, 1));
  const paymentDate = latestPaymentDate(rentEntry);
  const now = new Date();
  const cycleStarted = startDate <= now;

  // For normal cycles, rent is only due after the cycle completes (endDate passes)
  const isAdvancePaid = String(tenant.firstRentStatus || "").trim() === "ADVANCE_PAID";
  const cycleCompleted = endDate <= now;
  
  const status = beforeJoining
    ? "-"
    : totalExpected <= 0 && paid <= 0
    ? "Upcoming"
    : paid >= totalExpected && totalExpected > 0
      ? "Paid"
      : paid > 0
        ? "Pending"
        : month.offset > 0 || !cycleStarted
          ? "Upcoming"
          : !isAdvancePaid && !cycleCompleted
            ? "Upcoming"
            : "Due";
  const statusDate = status === "-" ? "" : status === "Paid" && paymentDate ? formatDayMonth(paymentDate) : formatDayMonth(startDate);
  return {
    expected: rentExpected,
    totalExpected,
    paid,
    balance,
    status,
    statusDate,
    monthLabel: formatMonthYear(month.date),
    rangeText: status === "-" ? "-" : `${formatDayMonth(startDate)} - ${formatDayMonth(endDate)}`,
  };
}

function isActiveTenant(tenant) {
  if (!tenant.leaveDate) return true;
  const leaveDate = new Date(tenant.leaveDate);
  return Number.isNaN(leaveDate.getTime()) || leaveDate > new Date();
}

function isTenantInYear(tenant, year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  const joiningDate = tenant?.joiningDate ? new Date(tenant.joiningDate) : tenant?.createdAt ? new Date(tenant.createdAt) : null;
  const leaveDate = tenant?.leaveDate ? new Date(tenant.leaveDate) : null;

  if (joiningDate && !Number.isNaN(joiningDate.getTime()) && joiningDate > end) return false;
  if (leaveDate && !Number.isNaN(leaveDate.getTime()) && leaveDate < start) return false;
  return true;
}

function buildVacancies(units, tenants) {
  const activeTenants = tenants.filter(isActiveTenant);
  const isOccupied = (unit, bed) => activeTenants.some((tenant) => {
    const sameUnit = tenant.roomId
      ? String(tenant.roomId) === String(unit._id)
      : String(tenant.category || "") === String(unit.category || "") &&
        String(tenant.wingName || "") === String(unit.wingName || "") &&
        String(tenant.roomNo || "") === String(unit.roomNo || "");
    if (!sameUnit) return false;
    return unit.propertyType === "bed" ? String(tenant.bedNo || "") === String(bed.bedNo || "") : true;
  });

  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    if (unit.propertyType === "bed") {
      return beds.filter((bed) => !isOccupied(unit, bed)).map((bed) => ({ unit, bed }));
    }
    const primaryBed = beds[0];
    return primaryBed && !isOccupied(unit, primaryBed) ? [{ unit, bed: primaryBed }] : [];
  });
}

function importColumnRows(type) {
  const row = {
    name: type === "shop" ? "Tenant name" : "Full Name",
    phoneNo: "10 digit mobile",
    joiningDate: "YYYY-MM-DD",
    depositAmount: "Number",
    firstRentStatus: "Advance paid / Normal cycle",
    category: "Property/Building name",
    wingName: "Optional wing/block",
    floorNo: "Floor",
    [type === "shop" ? "shopNumber" : "roomNo"]: type === "shop" ? "Shop number" : "Room number",
    baseRent: "Leave blank to use current unit rent",
    address: "Optional",
    pincode: "Optional",
    city: "Optional",
    state: "Optional",
    nearbyPlace: "Optional",
    relative1Name: "Optional",
    relative1Phone: "Optional",
    relative2Name: "Optional",
    relative2Phone: "Optional",
  };

  if (type === "bed") {
    row.bedNo = "Bed number";
    row.hasCanteen = "Yes/No";
  } else if (type === "room") {
    row.flatType = "Required if your residential room uses a flat type";
    row.familyMembers = "Optional";
  } else {
    row.shopName = "Shop name";
    row.shopBusiness = "Shop business";
    row.companyAddress = "Company / business address";
  }

  return [row];
}

function importSampleRows(type) {
  if (type === "room") {
    return [{
      name: "Amit Patil",
      phoneNo: "9876543210",
      joiningDate: "2026-08-25",
      depositAmount: 15000,
      firstRentStatus: "Normal cycle",
      category: "Sai Residency",
      wingName: "A",
      floorNo: "1",
      flatType: "1 BHK",
      roomNo: "101",
      baseRent: 9500,
      address: "Nigdi, Pune",
      pincode: "411044",
      city: "Pune",
      state: "Maharashtra",
      nearbyPlace: "Nigdi",
      familyMembers: 3,
      relative1Name: "Priya Patil",
      relative1Phone: "9988776655",
    }];
  }

  if (type === "shop") {
    return [{
      name: "Neha Traders",
      phoneNo: "9123456780",
      joiningDate: "2026-08-25",
      depositAmount: 30000,
      firstRentStatus: "Advance paid",
      category: "Market Plaza",
      wingName: "A",
      floorNo: "Ground",
      shopNumber: "S-12",
      baseRent: 18000,
      address: "Chakan, Pune",
      pincode: "410501",
      city: "Pune",
      state: "Maharashtra",
      nearbyPlace: "Chakan",
      shopName: "Neha Traders",
      shopBusiness: "Grocery",
      companyAddress: "Market Plaza, Chakan",
    }];
  }

  return [{
    name: "Rahul Sharma",
    phoneNo: "9876543210",
    joiningDate: "2026-08-25",
    depositAmount: 10000,
    firstRentStatus: "Normal cycle",
    category: "Boys Hostel A",
    wingName: "A",
    floorNo: "2",
    roomNo: "205",
    bedNo: "B2",
    baseRent: 5500,
    address: "Pimpri, Pune",
    pincode: "411018",
    city: "Pune",
    state: "Maharashtra",
    nearbyPlace: "Pimpri",
    hasCanteen: "Yes",
    relative1Name: "Suresh Sharma",
    relative1Phone: "9988776655",
  }];
}

  function importInstructions(type) {
    const lines = [
      { step: "1", instruction: `Use this sheet only for ${type === "bed" ? "hostel beds" : type === "room" ? "residential rooms" : "commercial shops"}.` },
      { step: "2", instruction: "Do not change the column names in the first row." },
      { step: "3", instruction: "Phone number should be exactly 10 digits." },
      { step: "4", instruction: "Joining date format should be YYYY-MM-DD." },
      { step: "5", instruction: "Payment cycle should be Advance paid or Normal cycle." },
      { step: "6", instruction: "If you use wings or blocks, fill the same wing name from the saved unit." },
    ];
    if (type === "room") {
      lines.push({ step: "7", instruction: "For residential rooms, keep the same flat type as the saved unit." });
      lines.push({ step: "8", instruction: "The room/bed/shop must already exist in your system before import." });
      return lines;
    }
    lines.push({ step: "7", instruction: "The room/bed/shop must already exist in your system before import." });
    return lines;
  }

function importFileName(type) {
  if (type === "room") return "tenant-import-template-residential-rooms.xlsx";
  if (type === "shop") return "tenant-import-template-commercial-shops.xlsx";
  return "tenant-import-template-hostel-beds.xlsx";
}

function typeDisplayName(type) {
  if (type === "room") return "Residential rooms";
  if (type === "shop") return "Commercial shops";
  return "Hostel beds";
}

function availableYearOptions(currentYear, selectedYear) {
  const years = new Set([currentYear - 1, currentYear, currentYear + 1, selectedYear]);
  return Array.from(years).sort((a, b) => a - b);
}

export default function TenantsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams();
  const initialType = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialView = Array.isArray(params.view) ? params.view[0] : params.view;
  const [tenants, setTenants] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [dues, setDues] = useState({ totalDue: 0, tenants: [] });
  const [unitAccess, setUnitAccess] = useState(null);
  const [activeType, setActiveType] = useState(["bed", "room", "shop"].includes(initialType) ? initialType : "bed");
  const [activeTab, setActiveTab] = useState(initialView === "vacant" ? "vacant" : "tenants");
  const [tenantStatus, setTenantStatus] = useState("active");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDueRow, setSelectedDueRow] = useState(null);
  const [sharingTenantId, setSharingTenantId] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [importingType, setImportingType] = useState("");
  const [visibleTenantCount, setVisibleTenantCount] = useState(INITIAL_TENANT_RENDER_COUNT);
  const [visibleVacancyCount, setVisibleVacancyCount] = useState(INITIAL_VACANCY_RENDER_COUNT);
  const [rentSummary, setRentSummary] = useState(new Map());
  const [rentSummaryByMonth, setRentSummaryByMonth] = useState(new Map());
  const todayMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const currentYear = todayMonth.getFullYear();
  const currentMonthIndex = todayMonth.getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const rentMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const date = new Date(selectedYear, index, 1);
        return {
          label: selectedYear === currentYear && index === currentMonthIndex ? "Current" : "",
          key: monthKey(date),
          date,
          offset: index - currentMonthIndex,
        };
      }),
    [currentMonthIndex, currentYear, selectedYear]
  );
  const key = monthKey(new Date(selectedYear, currentMonthIndex, 1));
  const monthCardWidth = useMemo(() => {
    const horizontalPadding = 32;
    const availableWidth = Math.min(windowWidth - horizontalPadding, 760 - horizontalPadding);
    return Math.max(Math.floor(availableWidth / 3), 96);
  }, [windowWidth]);
  const monthScrollOffset = selectedYear === currentYear ? monthCardWidth * Math.max(currentMonthIndex - 1, 0) : 0;
  const yearOptions = useMemo(() => availableYearOptions(currentYear, selectedYear), [currentYear, selectedYear]);

  function openYearFilter() {
    Alert.alert(
      "Select year",
      "Choose which year's rent months you want to see.",
      [
        ...yearOptions.map((year) => ({
          text: year === selectedYear ? `${year} (Selected)` : String(year),
          onPress: () => setSelectedYear(year),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  const loadTenants = useCallback(async () => {
    try {
      setError("");
      const [data, units, dueData, summaryResponses, dashboardData] = await Promise.all([
        getTenants(),
        getRooms(),
        getRentDues(),
        Promise.all(rentMonths.map((month) => getRentSummary(month.key).then((summary) => [month.key, summary]))),
        getSystemDashboard(),
      ]);
      const tenantList = Array.isArray(data) ? data : [];
      const unitList = Array.isArray(units) ? units : [];
      setTenants(tenantList);
      setVacancies(buildVacancies(unitList, tenantList));
      setDues(dueData);
      const summaryByMonth = new Map(summaryResponses.map(([month, summary]) => [month, new Map((summary.rows || []).map((row) => [String(row.tenantId), row]))]));
      setRentSummaryByMonth(summaryByMonth);
      setRentSummary(summaryByMonth.get(key) || new Map());
      setUnitAccess(dashboardData?.units || dashboardData);
      setActiveTab(initialView === "vacant" ? "vacant" : "tenants");
      setActiveType((current) => {
        const requested = ["bed", "room", "shop"].includes(initialType) ? initialType : current;
        return allowedUnitTypes(dashboardData?.units || dashboardData).some((type) => type.value === requested) ? requested : firstAllowedType(dashboardData?.units || dashboardData);
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load tenants.");
    } finally {
      setLoading(false);
    }
  }, [initialType, initialView, key, rentMonths]);

  useFocusEffect(useCallback(() => { loadTenants(); }, [loadTenants]));

  const tenantRows = useMemo(() => {
    const dueMap = new Map((dues.tenants || []).map((item) => [String(item.tenantId), item]));
    return tenants.filter(isActiveTenant).map((tenant) => {
      const awaitingForm = false;
      const monthSummary = rentSummary.get(String(tenant._id));
      const rentEntry = (tenant.rents || []).find((rent) => rent.month === key);
      const expected = awaitingForm ? 0 : Number(monthSummary?.totalExpected ?? monthSummary?.expected ?? tenant.baseRent ?? 0);
      const paid = Number(monthSummary?.totalPaid ?? monthSummary?.paid ?? rentEntry?.totalAmount ?? rentEntry?.rentAmount ?? 0);
      const balance = Math.max(expected - paid, 0);
      const dueInfo = dueMap.get(String(tenant._id));
      const overdue = Number(dueInfo?.totalDue || 0);
      
      // Only include current month's balance if its rent cycle has started
      const cycleStartDate = cycleStartForMonth(tenant, new Date());
      const cycleHasStarted = cycleStartDate <= new Date();
      const dueMonths = Array.isArray(dueInfo?.dueMonths) ? dueInfo.dueMonths : [];
      const currentDue = cycleHasStarted ? balance : 0;
      const currentAlreadyIncluded = dueMonths.some((month) => month.month === key);
      const totalDue = overdue + (currentAlreadyIncluded ? 0 : currentDue);
      const docStatus = documentStatusForTenant(tenant);
      return {
        tenant,
        expected,
        paid,
        balance,
        overdue,
        currentDue,
        totalDue,
        dueMonths,
        awaitingForm,
        docStatus,
        needsPayment: !awaitingForm && totalDue > 0,
      };
    });
  }, [dues.tenants, key, rentSummary, tenants]);

  const tenantTypes = useMemo(() => allowedUnitTypes(unitAccess).map((type) => ({ ...type })), [unitAccess]);
  const typeRows = useMemo(() => {
    const rows = tenantRows.filter(({ tenant }) => propertyTypeFromTenant(tenant) === activeType);
    return rows.filter(({ tenant }) => tenantStatus === "leaving" ? isLeavingTenant(tenant) : !isLeavingTenant(tenant));
  }, [activeType, tenantRows, tenantStatus]);
  const vacantRows = useMemo(() => filterVacanciesByType(vacancies, activeType), [activeType, vacancies]);

  const visibleTenants = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return typeRows
      .filter(({ tenant }) => isTenantInYear(tenant, selectedYear))
      .filter((row) => filter === "All" || (filter === "Needs payment" ? row.needsPayment : !row.needsPayment))
      .filter(({ tenant }) => {
        if (!needle) return true;
        const haystack = [
          tenant.name,
          tenant.phoneNo,
          tenant.roomNo,
          tenant.bedNo,
          tenant.category,
          tenant.floorNo,
          tenant.address,
          tenant.city,
          tenant.state,
          tenant.nearbyPlace,
          tenant.shopName,
          tenant.shopBusiness,
          tenant.companyAddress,
          tenant.relative1Name,
          tenant.relative1Phone,
          tenant.relative2Name,
          tenant.relative2Phone,
          formatTenantUnit(tenant),
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const leftSrNo = Number(a?.tenant?.srNo || 0);
        const rightSrNo = Number(b?.tenant?.srNo || 0);
        if (leftSrNo !== rightSrNo) return leftSrNo - rightSrNo;
        return String(a?.tenant?.name || "").localeCompare(String(b?.tenant?.name || ""), undefined, { numeric: true });
      });
  }, [filter, query, selectedYear, typeRows]);
  const pagedVisibleTenants = useMemo(() => visibleTenants.slice(0, visibleTenantCount), [visibleTenantCount, visibleTenants]);
  const groupedVisibleTenants = useMemo(() => {
    const groups = new Map();
    pagedVisibleTenants.forEach((row) => {
      const groupName = String(row?.tenant?.category || "Unassigned property").trim() || "Unassigned property";
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(row);
    });
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .map(([title, rows]) => {
        const wingGroups = new Map();
        rows.forEach((row) => {
          const wingName = String(row?.tenant?.wingName || "").trim();
          const key = wingName || "__no_wing__";
          if (!wingGroups.has(key)) wingGroups.set(key, []);
          wingGroups.get(key).push(row);
        });
        return {
          title,
          wingGroups: Array.from(wingGroups.entries()).map(([wingKey, wingRows]) => ({
            wingKey,
            wingLabel: wingKey === "__no_wing__" ? "" : `Wing ${wingKey}`,
            rows: wingRows,
          })),
        };
      });
  }, [pagedVisibleTenants]);
  const pagedVacantRows = useMemo(() => vacantRows.slice(0, visibleVacancyCount), [vacantRows, visibleVacancyCount]);
  const groupedPagedVacantRows = useMemo(() => groupVacanciesByProperty(pagedVacantRows), [pagedVacantRows]);

  const thisMonthPending = typeRows.reduce((sum, row) => sum + row.totalDue, 0);
  const typeOverdue = typeRows.reduce((sum, row) => sum + row.overdue, 0);
  const activeTypeLabel = tenantTypes.find((item) => item.value === activeType)?.label || "Tenants";
  const selectedDueItems = useMemo(() => {
    if (!selectedDueRow) return [];
    const items = (selectedDueRow.dueMonths || []).map((month) => ({
      month: month.month,
      expected: Number(month.expected || 0),
      paid: Number(month.paid || 0),
      outstanding: Number(month.outstanding || 0),
      cycleStart: month.cycleStart,
      cycleEnd: month.cycleEnd,
    }));
    if (selectedDueRow.currentDue > 0 && !items.some((month) => month.month === key)) {
      const cycleStart = cycleStartForMonth(selectedDueRow.tenant, new Date(selectedYear, currentMonthIndex, 1));
      items.push({
        month: key,
        expected: Number(selectedDueRow.expected || 0),
        paid: Number(selectedDueRow.paid || 0),
        outstanding: Number(selectedDueRow.currentDue || 0),
        cycleStart,
        cycleEnd: cycleStartForMonth(selectedDueRow.tenant, shiftMonth(new Date(selectedYear, currentMonthIndex, 1), 1)),
      });
    }
    return items.sort((left, right) => (monthKeyDate(left.month)?.getTime() || 0) - (monthKeyDate(right.month)?.getTime() || 0));
  }, [currentMonthIndex, key, selectedDueRow, selectedYear]);
  const selectedDueTotal = selectedDueItems.reduce((sum, item) => sum + item.outstanding, 0);

  function openAdmissionForVacancy(vacancy) {
    router.push({
      pathname: "/system/tenant-admission",
      params: {
        type: activeType,
        roomId: String(vacancy?.unit?._id || ""),
        roomNo: String(vacancy?.unit?.roomNo || ""),
        bedNo: String(vacancy?.bed?.bedNo || ""),
      },
    });
  }

  async function reshareTenantForm(tenant) {
    try {
      setSharingTenantId(String(tenant._id));
      const result = await createTenantInviteForForm(tenant._id);
      if (!result?.url) throw new Error("Server did not return a share link.");
      await Share.share({
        title: "Tenant registration form",
        message: `Please update your tenant registration form using this secure link:\n${result.url}`,
        url: result.url,
      }, {
        dialogTitle: "Share tenant registration link",
      });
    } catch (err) {
      Alert.alert("Unable to share form", err.response?.data?.message || err.message || "Please try again.");
    } finally {
      setSharingTenantId("");
    }
  }

  async function downloadImportTemplate(type) {
    try {
      setTemplateType(type);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importSampleRows(type)), "Tenants");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importColumnRows(type)), "Columns");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importInstructions(type)), "Instructions");

      const fileName = importFileName(type);
      if (Platform.OS === "web") {
        const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
        const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const anchor = globalThis.document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `${typeDisplayName(type)} import template`,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } catch (err) {
      Alert.alert("Unable to create template", err.message || "Please try again.");
    } finally {
      setTemplateType("");
    }
  }

  async function readImportedSheet(asset) {
    if (Platform.OS === "web") {
      if (asset.file?.arrayBuffer) {
        const workbook = XLSX.read(await asset.file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return {
          rows: XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }),
          workbook,
        };
      }

      const response = await fetch(asset.uri);
      const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return {
        rows: XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }),
        workbook,
      };
    }

    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const workbook = XLSX.read(base64, { type: "base64" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return {
      rows: XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }),
      workbook,
    };
  }

  function detectImportedSheetType(rows = []) {
    const firstRow = Array.isArray(rows) ? rows.find((row) => row && typeof row === "object") : null;
    if (!firstRow) return "";

    const normalizedHeaders = Object.keys(firstRow).map((key) =>
      String(key || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
    );

    const hasAny = (aliases = []) =>
      aliases.some((alias) =>
        normalizedHeaders.includes(String(alias || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""))
      );

    if (hasAny(["bedNo", "bed_no", "bed", "bed number", "hasCanteen", "has_canteen", "canteen"])) {
      return "bed";
    }
    if (hasAny(["shopName", "shop_name", "shop name", "shopBusiness", "shop_business", "shop business", "shopNumber", "shop_number", "shop number", "companyAddress", "company_address", "company address"])) {
      return "shop";
    }
    if (hasAny(["flatType", "flat_type", "flat type", "roomType", "room_type", "room type", "familyMembers", "family_members", "family members"])) {
      return "room";
    }
    return "";
  }

  function importTypeLabel(type) {
    if (type === "room") return "residential room";
    if (type === "shop") return "commercial shop";
    return "hostel bed";
  }

  function buildImportSummary(result, type) {
    const lines = [`${result.createdCount || 0} ${typeDisplayName(type).toLowerCase()} tenants imported.`];
    if (result.duplicateCount) lines.push(`${result.duplicateCount} duplicate row(s) skipped.`);
    if (result.invalidCount) lines.push(`${result.invalidCount} invalid row(s) skipped.`);

    const details = [
      ...(result.duplicates || []).map((item) => `Row ${item.rowNumber}: ${item.reason}`),
      ...(result.invalidRows || []).map((item) => `Row ${item.rowNumber}: ${item.reason}`),
    ];
    if (details.length) lines.push("", "Why some rows were skipped:", details.join("\n"));
    return lines.join("\n");
  }

  async function importTenantSheet(type) {
    try {
      setImportingType(type);
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const { rows } = await readImportedSheet(asset);
      if (!rows.length) {
        Alert.alert("Empty sheet", "This file does not contain any tenant rows.");
        return;
      }

      const detectedSheetType = detectImportedSheetType(rows);
      if (detectedSheetType && detectedSheetType !== type) {
        Alert.alert(
          "Wrong sheet selected",
          `This looks like a ${importTypeLabel(detectedSheetType)} sheet, but you are importing inside ${importTypeLabel(type)}. Please upload the matching template for this section.`
        );
        return;
      }

      const response = await importTenantsFromSheet(type, rows);
      await loadTenants();
      Alert.alert("Import finished", buildImportSummary(response, type));
    } catch (err) {
      const backendMessage = err.response?.data?.message || "";
      const backendError = err.response?.data?.error || "";
      const combined = [backendMessage, backendError].filter(Boolean).join("\n");
      Alert.alert("Unable to import sheet", combined || err.message || "Please try again.");
    } finally {
      setImportingType("");
    }
  }

  const actionType = activeType;

  return (
    <View style={styles.screen} >
      <View style={[styles.content, { padding: responsive.pagePadding }]}>
        <View style={[styles.header, responsive.isTiny && styles.headerTiny]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tenants</Text>
            <Text style={styles.subtitle}>{typeRows.length} {tenantStatus === "leaving" ? "leaving" : "active"} tenants</Text>
          </View>
          {/* <Pressable onPress={() => searchInputRef.current?.focus()} style={styles.headerIconButton} accessibilityLabel="Search tenants">
            <Search size={23} color={UI.blueDark} />
          </Pressable> */}
          <Pressable onPress={() => router.push({ pathname: "/system/tenant-admission", params: { type: actionType } })} style={styles.addButton}>
            <Plus size={18} color="#FFFFFF" /><Text style={styles.addButtonText}>Add tenant</Text>
          </Pressable>
        </View>

        <View style={styles.statusTabs}>
          <Pressable onPress={() => { setTenantStatus("active"); setActiveTab("tenants"); }} style={[styles.statusTab, tenantStatus === "active" && activeTab === "tenants" && styles.statusTabActive]}>
            <Text style={[styles.statusTabText, tenantStatus === "active" && activeTab === "tenants" && styles.statusTabTextActive]}>Active</Text>
          </Pressable>
          <Pressable onPress={() => { setTenantStatus("leaving"); setActiveTab("tenants"); }} style={[styles.statusTab, tenantStatus === "leaving" && activeTab === "tenants" && styles.statusTabActive]}>
            <Text style={[styles.statusTabText, tenantStatus === "leaving" && activeTab === "tenants" && styles.statusTabTextActive]}>Leaving</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/system/former-tenants")} style={styles.statusTab}>
            <Text style={styles.statusTabText}>Former</Text>
          </Pressable>
        </View>

        <View style={styles.actionBar}>
          <Pressable onPress={() => importTenantSheet(actionType)} disabled={importingType === actionType} style={styles.actionButton}>
            {importingType === actionType ? <ActivityIndicator size="small" color={UI.blueDark} /> : <Upload size={15} color={UI.blueDark} />}
            <Text style={styles.actionButtonText}>Import</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/system/tenant-invite")} style={styles.actionButton}>
            <Share2 size={15} color={UI.blueDark} /><Text style={styles.actionButtonText}>Share</Text>
          </Pressable>
          <Pressable onPress={() => downloadImportTemplate(actionType)} disabled={templateType === actionType} style={styles.actionButton}>
            {templateType === actionType ? <ActivityIndicator size="small" color={UI.blueDark} /> : <Download size={15} color={UI.blueDark} />}
            <Text style={styles.actionButtonText}>Download</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab((current) => current === "vacant" ? "tenants" : "vacant")} style={[styles.actionButton, activeTab === "vacant" && styles.actionButtonActive]}>
            <UserRound size={15} color={activeTab === "vacant" ? "#FFFFFF" : UI.blueDark} />
            <Text style={[styles.actionButtonText, activeTab === "vacant" && styles.actionButtonTextActive]}>{activeTab === "vacant" ? "Tenants" : "Vacant"}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === "tenants" ? (
            <View style={styles.searchRow} >
              <View style={styles.searchBox} >
                <Search size={21} color={UI.muted} />
                <TextInput ref={searchInputRef} value={query} onChangeText={(value) => { setQuery(value); setVisibleTenantCount(INITIAL_TENANT_RENDER_COUNT); }} placeholder="Search tenant, room or phone" placeholderTextColor={UI.muted} style={styles.searchInput} />
              </View>
              <Pressable onPress={openYearFilter} style={styles.searchFilterButton} accessibilityLabel="Filter by year">
                <SlidersHorizontal size={19} color={UI.blueDark} />
                <Text style={styles.searchFilterText}>{String(selectedYear).slice(-2)}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.typeTabs}>
            {tenantTypes.map((item) => {
              const active = item.value === activeType;
              return (
                <Pressable key={item.value} onPress={() => { setActiveType(item.value); setFilter("All"); setVisibleTenantCount(INITIAL_TENANT_RENDER_COUNT); setVisibleVacancyCount(INITIAL_VACANCY_RENDER_COUNT); }} style={[styles.typeTab, active && styles.typeTabActive]}>
                  <Text style={[styles.typeTabText, active && styles.typeTabTextActive]} numberOfLines={1}>{item.value === "bed" ? "Hostel" : item.value === "room" ? "Residential" : "Commercial"}</Text>
                  {active ? <View style={styles.typeTabActiveLine} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, styles.summaryIconPending]}><CalendarDays size={20} color="#E77A12" /></View>
              <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>Rent pending</Text><Text style={styles.summaryValue}>{money(thisMonthPending)}</Text></View>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, styles.summaryIconOverdue]}><ShieldCheck size={20} color="#E24A4A" /></View>
              <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>{activeTab === "vacant" ? "Vacant units" : "Previous overdue"}</Text><Text style={[styles.summaryValue, activeTab === "tenants" && typeOverdue > 0 && styles.overdueValue]}>{activeTab === "vacant" ? String(vacantRows.length) : money(typeOverdue)}</Text></View>
            </View>
          </View>

          {activeTab === "tenants" ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((value) => {
              const count = value === "All" ? typeRows.length : value === "Needs payment" ? typeRows.filter((row) => row.needsPayment).length : typeRows.filter((row) => !row.needsPayment).length;
              return <Pressable key={value} onPress={() => { setFilter(value); setVisibleTenantCount(INITIAL_TENANT_RENDER_COUNT); }} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value} ({count})</Text></Pressable>;
            })}
          </ScrollView> : null}

          {loading ? (
            <View style={styles.loading}><ActivityIndicator size="large" color={S.deep} /></View>
          ) : error ? (
            <View style={styles.empty}>
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={loadTenants}><Text style={styles.retry}>Try again</Text></Pressable>
            </View>
          ) : activeTab === "vacant" ? (
            <View style={styles.list}>
              {!groupedPagedVacantRows.length ? (
                <View style={styles.empty}>
                  <UserRound size={34} color={colors.subtle} />
                  <Text style={styles.emptyTitle}>No vacant {activeTypeLabel.toLowerCase()} right now</Text>
                  <Text style={styles.emptyText}>Vacant units will appear here with a direct add-tenant button.</Text>
                </View>
              ) : null}
              {groupedPagedVacantRows.map((group) => (
                <View key={group.propertyName} style={styles.propertyGroup}>
                  <View style={styles.propertyHeading}>
                    <View style={styles.propertyHeadingLine} />
                    <View style={styles.propertyHeadingPill}>
                      <Text style={styles.propertyHeadingText}>{group.propertyName}</Text>
                    </View>
                    <View style={styles.propertyHeadingLine} />
                  </View>
                  {group.vacancies.map((vacancy) => (
                    <View key={`${vacancy.unit._id}-${vacancy.bed?.bedNo || "slot"}`} style={styles.vacancyCard}>
                      <View style={styles.vacancyCopy}>
                        <Text style={styles.vacancyTitle}>{unitTypeLabel(vacancy.unit)}</Text>
                        <Text style={styles.vacancyMeta}>{formatVacancyMeta(vacancy.unit, vacancy.bed)}</Text>
                      </View>
                      <Pressable onPress={() => openAdmissionForVacancy(vacancy)} style={styles.vacancyButton}>
                        <Plus size={16} color={colors.surface} />
                        <Text style={styles.vacancyButtonText}>Add tenant</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
              {vacantRows.length > visibleVacancyCount ? (
                <Pressable onPress={() => setVisibleVacancyCount((current) => current + INITIAL_VACANCY_RENDER_COUNT)} style={styles.loadMoreButton}>
                  <Text style={styles.loadMoreButtonText}>Load more vacant units</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.list}>
              {!pagedVisibleTenants.length ? (
                <View style={styles.empty}>
                  <UserRound size={34} color={colors.subtle} />
                  <Text style={styles.emptyTitle}>{query ? "No tenant found" : `No ${activeTypeLabel.toLowerCase()} tenants yet`}</Text>
                  <Text style={styles.emptyText}>{query ? "Try another search." : "Add your first tenant to a vacant unit."}</Text>
                </View>
              ) : null}
              {groupedVisibleTenants.map((group) => (
                <View key={group.title} style={styles.propertyGroup}>
                  <View style={styles.propertyHeading}>
                    <View style={styles.propertyHeadingLine} />
                    <View style={styles.propertyHeadingPill}>
                      <Text style={styles.propertyHeadingText}>{group.title}</Text>
                    </View>
                    <View style={styles.propertyHeadingLine} />
                  </View>
                  {group.wingGroups.map((wingGroup) => (
                    <View key={`${group.title}-${wingGroup.wingKey}`} style={styles.wingTenantGroup}>
                      {wingGroup.wingLabel ? (
                        <View style={styles.wingHeading}>
                          <Text style={styles.wingHeadingText}>{wingGroup.wingLabel}</Text>
                        </View>
                      ) : null}
                      {wingGroup.rows.map((row) => {
                    const { tenant, totalDue, awaitingForm } = row;
                    const photoUrl = tenantPhotoUrl(tenant);
                    return (
                <View key={tenant._id} style={[styles.tenantRow, responsive.isTiny && styles.tenantRowTiny, totalDue > 0 && styles.tenantAlert]}>
                  <View style={styles.tenantTopRow}>
                    <Pressable onPress={() => router.push({ pathname: "/system/tenant-details", params: { id: tenant._id, returnTo: "/system/tenants" } })} style={styles.tenantMain}>
                      <View style={styles.photoFrame}>
                        {photoUrl ? (
                          <Image source={{ uri: photoUrl }} style={styles.tenantPhoto} contentFit="cover" />
                        ) : (
                          <View style={styles.photoFallback}><Text style={styles.photoFallbackText}>{String(tenant.name || "T").trim().charAt(0).toUpperCase()}</Text></View>
                        )}
                      </View>
                      <View style={styles.tenantInfo}>
                        <Text style={styles.tenantName}>{toDisplayName(tenant.name)}</Text>
                        {!awaitingForm ? (
                          <Text style={[
                            styles.cycleBadge,
                            tenant.firstRentStatus === "ADVANCE_PAID" && styles.cycleBadgeAdvance,
                          ]}>
                            {tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid" : "Normal cycle"}
                          </Text>
                        ) : null}
                        {tenant.phoneNo ? <Text style={styles.tenantPhone}>+91 {tenant.phoneNo}</Text> : null}
                        <Text style={styles.tenantLocation} numberOfLines={1}>{tenant.category || "Property"} · {tenantUnitBadgeLabel(tenant)}</Text>
                       
                        {awaitingForm ? (
                          <View style={styles.statusRow}>
                            <Text style={styles.paymentStatus}>Waiting for tenant form</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                    <Pressable disabled={sharingTenantId === String(tenant._id)} onPress={() => reshareTenantForm(tenant)} style={[styles.rentButton, responsive.isTiny && styles.rentButtonTiny, sharingTenantId === String(tenant._id) && styles.disabledButton]}>
                      {sharingTenantId === String(tenant._id) ? <ActivityIndicator size="small" color={colors.primary} /> : <Share2 size={18} color={colors.primary} />}
                      <Text style={styles.rentButtonText}>Share</Text>
                    </Pressable>
                  </View>
                  {!awaitingForm ? (
                    <>
                      <View style={styles.tenantMetaRow}>
                        <View style={styles.tenantMetaItem}><CalendarDays size={15} color={UI.muted} /><Text style={styles.tenantMetaText}>Joined {formatJoinedDate(tenant.joiningDate || tenant.createdAt)}</Text></View>
                        <View style={styles.tenantMetaDivider} />
                        <View style={styles.tenantMetaItem}><ShieldCheck size={15} color={UI.muted} /><Text style={styles.tenantMetaText}>Deposit {money(tenant.depositAmount)}</Text></View>
                      </View>
                      <View style={styles.rentStatusHeader}>
                        <Text style={styles.rentStatusTitle}>Rent status · {selectedYear}</Text>
                      
                        {totalDue > 0 ? (
                          <Pressable onPress={() => setSelectedDueRow(row)} style={styles.dueDetailsButton} accessibilityLabel={`View all dues for ${tenant.name}`}>
                            <Text style={styles.dueDetailsButtonText}>Due {money(totalDue)}</Text>
                          </Pressable>
                        ) : <Text style={styles.tenantPaidAmount}>No payment due</Text>}
                             </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.monthStrip}
                        style={styles.monthScroll}
                        snapToInterval={monthCardWidth}
                        decelerationRate="fast"
                        contentOffset={{ x: monthScrollOffset, y: 0 }}
                      >
                      {rentMonths.map((month) => {
                        const monthSummary = rentSummaryByMonth.get(month.key)?.get(String(tenant._id));
                        const item = rentMonthStatus(monthSummary, tenant, month);
                        const paidMonth = item.status === "Paid";
                        const dueMonth = item.status === "Due" || item.status === "Pending";
                        const inactiveMonth = item.status === "-";
                        return (
                          <Pressable
                            key={month.key}
                            disabled={inactiveMonth}
                            onPress={() => router.push({ pathname: "/system/rent-form", params: { id: tenant._id, month: month.key, returnTo: "/system/tenants" } })}
                            style={[
                              styles.monthBox,
                              { width: monthCardWidth },
                              paidMonth && styles.monthBoxPaid,
                              dueMonth && styles.monthBoxDue,
                              item.status === "Upcoming" && styles.monthBoxUpcoming,
                              inactiveMonth && styles.monthBoxInactive,
                            ]}
                          >
                            <Text style={styles.monthName} numberOfLines={1}>{item.monthLabel}</Text>
                            <View style={[styles.monthStatusPill, paidMonth && styles.monthPaidPill, dueMonth && styles.monthDuePill, item.status === "Upcoming" && styles.monthUpcomingPill, inactiveMonth && styles.monthInactivePill]}>
                              <Text style={[styles.monthStatusText, paidMonth && styles.monthPaidText, dueMonth && styles.monthDueText, item.status === "Upcoming" && styles.monthUpcomingText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                                {monthStatusLabel(item)}
                              </Text>
                            </View>
                            <Text style={[styles.monthRange, inactiveMonth && styles.monthPlaceholderText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                              {inactiveMonth ? "-" : item.rangeText}
                            </Text>
                            <Text style={[styles.monthRent, inactiveMonth && styles.monthPlaceholderText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                              {inactiveMonth ? "-" : `Rent: ${compactMoney(item.expected)}`}
                            </Text>
                            <Text style={[styles.monthTotal, inactiveMonth && styles.monthPlaceholderText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                              {inactiveMonth ? "-" : `Total: ${compactMoney(item.totalExpected)}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                      </ScrollView>
                    </>
                  ) : null}
                </View>
              );})}
                    </View>
                  ))}
                </View>
              ))}
              {visibleTenants.length > visibleTenantCount ? (
                <Pressable onPress={() => setVisibleTenantCount((current) => current + INITIAL_TENANT_RENDER_COUNT)} style={styles.loadMoreButton}>
                  <Text style={styles.loadMoreButtonText}>Load more tenants</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
      <Modal visible={Boolean(selectedDueRow)} transparent animationType="fade" onRequestClose={() => setSelectedDueRow(null)}>
        <View style={styles.dueModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedDueRow(null)} accessibilityLabel="Close dues" />
          <View style={styles.dueModal}>
            <View style={styles.dueModalHeader}>
              <View style={styles.dueModalHeaderCopy}>
                <Text style={styles.dueModalTitle}>Payment dues</Text>
                <Text style={styles.dueModalTenant} numberOfLines={1}>{toDisplayName(selectedDueRow?.tenant?.name)}</Text>
                <Text style={styles.dueModalUnit} numberOfLines={1}>{selectedDueRow ? formatTenantUnit(selectedDueRow.tenant) : ""}</Text>
              </View>
              <Pressable onPress={() => setSelectedDueRow(null)} style={styles.dueModalClose} accessibilityLabel="Close dues">
                <X size={20} color={UI.blueDark} />
              </Pressable>
            </View>

            <View style={styles.dueModalSummary}>
              <View><Text style={styles.dueModalSummaryLabel}>Total outstanding</Text><Text style={styles.dueModalSummaryAmount}>{money(selectedDueTotal)}</Text></View>
              <View style={styles.dueModalCount}><Text style={styles.dueModalCountValue}>{selectedDueItems.length}</Text><Text style={styles.dueModalCountLabel}>due months</Text></View>
            </View>

            <ScrollView style={styles.dueModalList} contentContainerStyle={styles.dueModalListContent} showsVerticalScrollIndicator={false}>
              {selectedDueItems.map((item) => (
                <View key={item.month} style={styles.dueMonthCard}>
                  <View style={styles.dueMonthTop}>
                    <View style={styles.dueMonthIcon}><CalendarDays size={18} color={UI.blueDark} /></View>
                    <View style={styles.dueMonthCopy}>
                      <Text style={styles.dueMonthTitle}>{displayMonthKey(item.month)}</Text>
                      <Text style={styles.dueMonthCycle}>{formatCycleDate(item.cycleStart)} - {formatCycleDate(item.cycleEnd)}</Text>
                    </View>
                    <Text style={styles.dueMonthAmount}>{money(item.outstanding)}</Text>
                  </View>
                  <View style={styles.dueMonthBreakdown}>
                    <View style={styles.dueBreakdownItem}><Text style={styles.dueBreakdownLabel}>Rent</Text><Text style={styles.dueBreakdownValue}>{money(item.expected)}</Text></View>
                    <View style={styles.dueBreakdownItem}><Text style={styles.dueBreakdownLabel}>Paid</Text><Text style={styles.dueBreakdownValue}>{money(item.paid)}</Text></View>
                    <View style={styles.dueBreakdownItem}><Text style={styles.dueBreakdownLabel}>Balance</Text><Text style={styles.dueBreakdownDue}>{money(item.outstanding)}</Text></View>
                  </View>
                  <Pressable
                    onPress={() => {
                      const tenantId = selectedDueRow?.tenant?._id;
                      setSelectedDueRow(null);
                      router.push({ pathname: "/system/rent-form", params: { id: tenantId, month: item.month, returnTo: "/system/tenants" } });
                    }}
                    style={styles.dueMonthPayButton}
                  >
                    <Plus size={16} color="#FFFFFF" />
                    <Text style={styles.dueMonthPayButtonText}>Add rent for {displayMonthKey(item.month)}</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 18 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  headerTiny: { alignItems: "flex-start" },
  scroller: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingBottom: 92 },
  headerText: { flex: 1, minWidth: 160 },
  title: { fontSize: 30, fontWeight: "900", color: UI.navy },
  subtitle: { marginTop: 2, color: UI.muted, fontSize: 14, fontWeight: "600" },
  headerIconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 22, backgroundColor: S.card, ...systemShadow },
  statusTabs: { height: 48, marginBottom: 10, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: UI.border },
  statusTab: { flex: 1, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  statusTabActive: { borderBottomColor: UI.blueDark },
  statusTabText: { color: UI.muted, fontSize: 14, fontWeight: "700" },
  statusTabTextActive: { color: UI.blueDark, fontWeight: "900" },
  actionBar: { height: 42, marginBottom: 5, flexDirection: "row", gap: 6 },
  actionButton: { flex: 1, minWidth: 0, height: 36, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card, ...systemShadow },
  actionButtonActive: { borderColor: UI.blueDark, backgroundColor: UI.blueDark },
  actionButtonText: { flexShrink: 1, color: UI.blueDark, fontSize: 10, fontWeight: "800" },
  actionButtonTextActive: { color: "#FFFFFF" },
  addButton: { height: 42, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, backgroundColor: UI.blueDark, ...systemShadow },
  addButtonTiny: { flexGrow: 1, justifyContent: "center" },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  typeTabs: { height: 34, marginTop: 10, marginBottom: 10, padding: 2, flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: S.card },
  typeTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  typeTabActive: { borderWidth: 1, borderColor: UI.blueDark, backgroundColor: S.card },
  typeTabText: { color: UI.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  typeTabTextActive: { color: UI.navy, fontWeight: "900" },
  typeTabActiveLine: { position: "absolute", bottom: -3, width: 42, height: 2, borderRadius: 1, backgroundColor: UI.blue },
  searchRow: { marginTop: 0, flexDirection: "row", alignItems: "center", gap: 8 , },
  searchBox: { flex: 1, height: 40, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card, ...systemShadow },
  searchInput: { flex: 1, height: "100%", marginLeft: 9, color: UI.navy, fontSize: 14 },
  searchFilterButton: { width: 52, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card, ...systemShadow },
  searchFilterText: { marginTop: 1, color: UI.blueDark, fontSize: 9, fontWeight: "900" },
  summary: { marginTop: 2, flexDirection: "row", alignItems: "stretch", gap: 8 },
  summaryItem: { flex: 1, minHeight: 62, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card, ...systemShadow },
  summaryIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  summaryIconPending: { backgroundColor: "#FFF1DF" },
  summaryIconOverdue: { backgroundColor: "#FFE8E8" },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  summaryValue: { marginTop: 4, color: "#E77A12", fontSize: 16, fontWeight: "900" },
  overdueValue: { color: S.red },
  filters: { marginTop: 10, flexDirection: "row", gap: 7 },
  filter: { minWidth: 108, height: 38, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card },
  filterActive: { borderColor: UI.blueDark, backgroundColor: UI.blueSoft },
  filterText: { color: UI.muted, fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: UI.blueDark },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingTop: 14, paddingBottom: 34, gap: 14 },
  propertyGroup: { gap: 9 },
  propertyHeading: { minHeight: 30, paddingHorizontal: 2, flexDirection: "row", alignItems: "center", gap: 10 },
  propertyHeadingLine: { flex: 1, height: 1, backgroundColor: UI.border },
  propertyHeadingPill: { maxWidth: "72%", minHeight: 28, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  propertyHeadingText: { color: UI.navy, fontSize: 14, fontWeight: "900", textAlign: "center" },
  wingTenantGroup: { gap: 8 },
  wingHeading: { paddingHorizontal: 8, marginTop: 2 },
  wingHeadingText: { color: UI.muted, fontSize: 12, fontWeight: "800" },
  vacancyCard: { minHeight: 72, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card, ...systemShadow },
  vacancyCopy: { flex: 1, minWidth: 0 },
  vacancyTitle: { color: S.text, fontSize: 14, fontWeight: "900" },
  vacancyMeta: { marginTop: 4, color: S.muted, fontSize: 12, fontWeight: "700" },
  vacancyButton: { minHeight: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, backgroundColor: S.deep },
  vacancyButtonText: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  loadMoreButton: { minHeight: 44, marginTop: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  loadMoreButtonText: { color: S.deep, fontSize: 13, fontWeight: "900" },
  tenantRow: { minHeight: 82, overflow: "hidden", borderWidth: 1, borderLeftWidth: 4, borderColor: UI.border, borderLeftColor: "#7C98F9", borderRadius: 8, backgroundColor: S.card, ...systemShadow, position: "relative" },
  tenantRowTiny: { alignItems: "stretch" },
  tenantAlert: { borderColor: "#F1D3CB", borderLeftColor: S.red },
  tenantTopRow: { width: "100%", flexDirection: "row", alignItems: "center" },
  tenantMain: { flex: 1, minWidth: 0, minHeight: 86, padding: 5, flexDirection: "row", alignItems: "center" },
  photoFrame: { width: 58, height: 58, borderRadius: 29, overflow: "hidden", backgroundColor: UI.blueSoft },
  tenantPhoto: { width: "100%", height: "100%" },
  photoFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: UI.blueSoft },
  photoFallbackText: { color: UI.blueDark, fontSize: 24, fontWeight: "900" },
  avatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: S.soft },
  avatarText: { color: S.deep, fontSize: 17, fontWeight: "900" },
  tenantInfo: { flex: 1, minWidth: 0, marginLeft: 12, paddingRight: 4 },
  tenantName: { color: UI.navy, fontSize: 16, fontWeight: "900", lineHeight: 21, flexShrink: 1 },
  tenantPhone: { marginTop: 2, color: UI.muted, fontSize: 12, fontWeight: "600" },
  tenantLocation: { marginTop: 3, color: UI.muted, fontSize: 11, fontWeight: "600" },
  tenantDueAmount: { marginTop: 4, color: S.red, fontSize: 11, fontWeight: "900" },
  tenantPaidAmount: { color: UI.blue },
  badgeRow: { marginTop: 8, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  cycleBadge: { alignSelf: "flex-start", maxWidth: 128, marginTop: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden", backgroundColor: UI.blueSoft, color: UI.blueDark, fontSize: 9, fontWeight: "900" },
  cycleBadgeAdvance: { backgroundColor: UI.blueSoft, color: UI.blueDark },
  unitPill: { alignSelf: "flex-start", maxWidth: "100%", marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: "hidden", backgroundColor: "#F3A6B7", color: colors.surface, fontSize: 11, fontWeight: "900" },
  depositPhoneRow: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 5 },
  depositPhoneText: { maxWidth: 120, color: S.muted, fontSize: 10, fontWeight: "800" },
  depositPhoneDivider: { color: S.subtle, fontSize: 10, fontWeight: "900" },
  inlineFinance: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tenantMeta: { color: S.muted, fontSize: 10, fontWeight: "700", flexShrink: 1 },
  currentPending: { marginTop: 4, color: S.orange, fontSize: 11, fontWeight: "800" },
  statusRow: { marginTop: 5, flexDirection: "row", alignItems: "center" },
  tenantMetaRow: { minHeight: 42, marginHorizontal: 12, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: UI.border, borderBottomWidth: 1, borderBottomColor: UI.border },
  tenantMetaItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  tenantMetaDivider: { width: 1, height: 20, marginHorizontal: 10, backgroundColor: UI.border },
  tenantMetaText: { flexShrink: 1, color: UI.muted, fontSize: 10, fontWeight: "600" },
  rentStatusHeader: { height: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rentStatusTitle: { color: UI.navy, fontSize: 12, fontWeight: "900" },
  dueDetailsButton: { minHeight: 28, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F2B7B2", borderRadius: 7, backgroundColor: "#FFF1F0" },
  dueDetailsButtonText: { color: S.red, fontSize: 10, fontWeight: "900" },
  monthScroll: { width: "100%" },
  monthStrip: { paddingHorizontal: 0, paddingBottom: 0, flexDirection: "row", alignItems: "stretch", gap: 0 },
  monthBox: { minWidth: 0, height: 126, paddingHorizontal: 6, paddingTop: 9, paddingBottom: 8, alignItems: "center", justifyContent: "flex-start", borderWidth: 1, borderColor: "#DADDF7", backgroundColor: "#F7F8FF" },
  monthBoxPaid: { borderColor: "#B9D0E1", backgroundColor: "#F0F6FA" },
  monthBoxDue: { borderColor: "#F2CACA", backgroundColor: "#FFF5F4" },
  monthBoxUpcoming: { borderColor: "#D5DDF8", backgroundColor: "#F4F6FF" },
  monthBoxInactive: { borderColor: S.border, backgroundColor: S.pale, opacity: 0.75 },
  monthName: { width: "100%", height: 17, color: S.text, fontSize: 10, lineHeight: 14, fontWeight: "900", textAlign: "center" },
  monthStatusPill: { width: "100%", height: 27, marginTop: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 999 },
  monthPaidPill: { borderColor: "#9FC0D8", backgroundColor: UI.blueSoft },
  monthDuePill: { borderColor: "#F0A0A0", backgroundColor: "#FFF0ED" },
  monthUpcomingPill: { borderColor: "#CAD3F5", backgroundColor: "#E9EEFF" },
  monthInactivePill: { borderColor: S.border, backgroundColor: S.card },
  monthStatusText: { width: "100%", textAlign: "center", fontSize: 9, lineHeight: 12, fontWeight: "900" },
  monthPaidText: { color: S.mid },
  monthDueText: { color: S.red },
  monthUpcomingText: { color: "#324AA0" },
  monthRange: { width: "100%", height: 14, marginTop: 8, color: S.text, fontSize: 9, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  monthRent: { width: "100%", height: 14, marginTop: 6, color: S.text, fontSize: 9, lineHeight: 12, fontWeight: "900", textAlign: "center" },
  monthTotal: { width: "100%", height: 14, marginTop: 5, color: "#1478D4", fontSize: 9, lineHeight: 12, fontWeight: "900", textAlign: "center" },
  monthPlaceholderText: { color: S.subtle },
  canteenBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  canteenTaken: { backgroundColor: UI.blueSoft },
  canteenNotTaken: { backgroundColor: S.pale },
  canteenText: { fontSize: 10, fontWeight: "900" },
  canteenTakenText: { color: S.mid },
  canteenNotTakenText: { color: S.muted },
  paymentStatus: { marginTop: 5, color: S.orange, fontSize: 11, fontWeight: "800" },
  paymentPaid: { color: S.mid },
  paymentOverdue: { color: S.red },
  rentButton: { width: 58, height: 54, alignItems: "center", justifyContent: "center" },
  rentButtonTiny: { width: 50 },
  rentButtonText: { marginTop: 3, color: UI.blueDark, fontSize: 10, fontWeight: "800" },
  disabledButton: { opacity: 0.35 },
  empty: { flex: 1, minHeight: 250, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 10, color: S.text, fontSize: 17, fontWeight: "900" },
  emptyText: { marginTop: 5, color: S.muted, textAlign: "center" },
  error: { color: S.red, textAlign: "center" },
  retry: { marginTop: 12, color: S.deep, fontWeight: "800" },
  dueModalOverlay: { flex: 1, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17, 27, 42, 0.56)" },
  dueModal: { width: "100%", maxWidth: 560, maxHeight: "84%", padding: 16, borderRadius: 8, backgroundColor: UI.screen, ...systemShadow },
  dueModalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dueModalHeaderCopy: { flex: 1, minWidth: 0 },
  dueModalTitle: { color: UI.navy, fontSize: 20, fontWeight: "900" },
  dueModalTenant: { marginTop: 5, color: UI.navy, fontSize: 15, fontWeight: "800" },
  dueModalUnit: { marginTop: 2, color: UI.muted, fontSize: 11, fontWeight: "600" },
  dueModalClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card },
  dueModalSummary: { minHeight: 72, marginTop: 14, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#F2B7B2", borderRadius: 8, backgroundColor: "#FFF1F0" },
  dueModalSummaryLabel: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  dueModalSummaryAmount: { marginTop: 4, color: S.red, fontSize: 20, fontWeight: "900" },
  dueModalCount: { alignItems: "flex-end" },
  dueModalCountValue: { color: UI.navy, fontSize: 18, fontWeight: "900" },
  dueModalCountLabel: { color: UI.muted, fontSize: 10, fontWeight: "700" },
  dueModalList: { marginTop: 12 },
  dueModalListContent: { gap: 10, paddingBottom: 2 },
  dueMonthCard: { padding: 12, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: S.card },
  dueMonthTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  dueMonthIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: UI.blueSoft },
  dueMonthCopy: { flex: 1, minWidth: 0 },
  dueMonthTitle: { color: UI.navy, fontSize: 14, fontWeight: "900" },
  dueMonthCycle: { marginTop: 2, color: UI.muted, fontSize: 9, fontWeight: "600" },
  dueMonthAmount: { color: S.red, fontSize: 14, fontWeight: "900" },
  dueMonthBreakdown: { marginTop: 10, paddingTop: 9, flexDirection: "row", borderTopWidth: 1, borderTopColor: UI.border },
  dueBreakdownItem: { flex: 1 },
  dueBreakdownLabel: { color: UI.muted, fontSize: 9, fontWeight: "700" },
  dueBreakdownValue: { marginTop: 3, color: UI.navy, fontSize: 11, fontWeight: "800" },
  dueBreakdownDue: { marginTop: 3, color: S.red, fontSize: 11, fontWeight: "900" },
  dueMonthPayButton: { minHeight: 38, marginTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 7, backgroundColor: UI.blueDark },
  dueMonthPayButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
