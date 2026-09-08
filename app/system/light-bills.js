import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Clock3, History, MoreHorizontal, Pencil, Plus, Settings, Trash2, Users, Zap } from "lucide-react-native";

import { deleteLightBill, getLightBillSettings, getLightBills } from "../../src/api/lightBillApi";
import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

const SUMMARY_FILTERS = [
  { label: "List month", value: "month" },
  { label: "Till date", value: "tillDate" },
  { label: "Custom", value: "custom" },
];
const PROPERTY_FILTERS = [
  { label: "All", value: "all" },
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];
const FIXED_SETTING_LABELS = {
  fixed_per_tenant: "Same fixed amount for every tenant",
  fixed_monthly: "Fixed amount every month",
};

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
}

function monthParams(date) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

function monthLabel(date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function billingMonthDate(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]);
  return new Date(2000 + Number(match[2]), month, 1);
}

function monthFromBillingMonth(value) {
  const date = billingMonthDate(value);
  return date || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}

function startOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function shortDate(value) {
  return value ? value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "...";
}

function billAmount(bill) {
  return Number(bill.amount ?? bill.salary ?? 0);
}

function isRecoverableBill(bill) {
  return !["owner_only", "fixed_monthly", "fixed_per_tenant"].includes(bill.billingMode)
    && !(bill.billPayer === "owner" && bill.billingMode !== "common_meter_split");
}

function includedUnitsForBill(bill, settings) {
  if (Number.isFinite(Number(bill.includedUnits))) return Number(bill.includedUnits);
  return Number(settings?.[propertyType(bill.propertyType)]?.includedUnits || 0);
}

function isWithinIncludedLimit(bill, settings) {
  if (!["room_meter_split", "room_meter_rate", "room_meter_actual_bill"].includes(bill.billingMode)) return false;
  const consumed = Number(bill.consumedUnits);
  const included = includedUnitsForBill(bill, settings);
  return Number.isFinite(consumed) && included > 0 && consumed <= included;
}

function meterUsageLabel(bill, settings) {
  const consumed = Number(bill.consumedUnits);
  if (!Number.isFinite(consumed)) return "";
  const included = includedUnitsForBill(bill, settings);
  if (!["room_meter_split", "room_meter_rate", "room_meter_actual_bill"].includes(bill.billingMode) || included <= 0) return `${consumed} units used`;
  return `${consumed} used | ${Math.max(consumed - included, 0)} extra`;
}

function propertyType(value) {
  if (value === "room" || value === "shop") return value;
  return "bed";
}

function propertySectionLabel(value) {
  if (value === "room") return "Residential Rooms";
  if (value === "shop") return "Commercial Shop";
  return "Hostel Beds";
}

function compactPropertyFilterLabel(value) {
  if (value === "bed") return "Hostel";
  if (value === "room") return "Residential";
  if (value === "shop") return "Commercial";
  return "All types";
}

function fixedSettingSummary(type, settings = {}) {
  if (!settings.enabled || !["fixed_per_tenant", "fixed_monthly"].includes(settings.mode)) return null;
  const amount = Number(settings.fixedAmount || 0);
  if (amount <= 0 || !settings.addToRentCollection) return null;
  return {
    type,
    title: propertySectionLabel(type),
    mode: settings.mode,
    label: FIXED_SETTING_LABELS[settings.mode],
    amount,
    notes: settings.notes || "",
  };
}

function unitLabel(bill) {
  if (bill.isUnitLinked === false) {
    return bill.name || bill.customLabel || "Owner paid bill";
  }
  const roomNo = bill.roomNo || "-";
  const type = propertyType(bill.propertyType);
  const base = type === "room" ? `Room ${roomNo}` : type === "shop" ? `Shop ${roomNo}` : `Hostel room ${roomNo}`;
  const location = [bill.category, bill.wingName ? `Wing ${bill.wingName}` : ""].filter(Boolean).join(" | ");
  return location ? `${base} (${location})` : base;
}

function billTitle(bill) {
  if (bill.isUnitLinked === false) return bill.name || bill.customLabel || "Owner bill";
  return unitLabel(bill);
}

function compactBillTitle(bill) {
  if (bill.isUnitLinked === false) return billTitle(bill);
  const type = propertyType(bill.propertyType);
  const unit = type === "shop" ? `Shop ${bill.roomNo || "-"}` : `Room ${bill.roomNo || "-"}`;
  const wing = String(bill.wingName || "").trim();
  return [bill.category || propertySectionLabel(type), wing ? `Wing ${wing}` : "", unit].filter(Boolean).join(" \u00B7 ");
}

function rentChargeLabel(bill, settings) {
  if (isWithinIncludedLimit(bill, settings)) return "No rent charge";
  return isRecoverableBill(bill) ? "Added to rent" : "Not added to rent";
}

function providerStatusLabel(bill) {
  return bill.status === "paid" ? "Paid" : "Pending";
}

function tenantCollectionLabel(bill) {
  const collection = bill.tenantCollection;
  if (!collection?.applicable) return "No tenant collection";
  return `Tenant collection: ${money(collection.collected)} of ${money(collection.expected)}`;
}

export default function LightBillsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { unitTypes, firstUnitType, isUnitTypeAllowed } = useSystemAccess();
  const propertyFilters = useMemo(() => {
    const allowed = PROPERTY_FILTERS.filter((item) => item.value !== "all" && isUnitTypeAllowed(item.value));
    return allowed.length > 1 ? [PROPERTY_FILTERS[0], ...allowed] : allowed;
  }, [isUnitTypeAllowed]);
  const initialStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const initialRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const initialBillingMonth = Array.isArray(params.billingMonth) ? params.billingMonth[0] : params.billingMonth;
  const [bills, setBills] = useState([]);
  const [allBills, setAllBills] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => monthFromBillingMonth(initialBillingMonth));
  const [summaryMode, setSummaryMode] = useState(() => SUMMARY_FILTERS.some((item) => item.value === initialRange) ? initialRange : "month");
  const [statusFilter] = useState(() => ["pending", "paid"].includes(initialStatus) ? initialStatus : "all");
  const [summaryStart, setSummaryStart] = useState(toDateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [summaryEnd, setSummaryEnd] = useState(toDateValue());
  const [propertyFilter, setPropertyFilter] = useState(() => unitTypes.length > 1 ? "all" : firstUnitType);
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [wingFilter, setWingFilter] = useState("all");
  const [showWingFilter, setShowWingFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [openActionsId, setOpenActionsId] = useState("");
  const [error, setError] = useState("");

  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [monthData, allData, settingsData] = await Promise.all([
        getLightBills(monthParams(selectedMonth)),
        getLightBills(),
        getLightBillSettings(),
      ]);
      setBills(Array.isArray(monthData) ? monthData : []);
      setAllBills(Array.isArray(allData) ? allData : []);
      setSettings(settingsData || null);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load light bills.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useFocusEffect(useCallback(() => { loadBills(); }, [loadBills]));

  useEffect(() => {
    if (propertyFilter !== "all" && !isUnitTypeAllowed(propertyFilter)) {
      setPropertyFilter(unitTypes.length > 1 ? "all" : firstUnitType);
      setCategoryFilter("all");
      setWingFilter("all");
    }
  }, [firstUnitType, isUnitTypeAllowed, propertyFilter, unitTypes.length]);

  const monthBills = useMemo(
    () => bills.filter((bill) => (bill.type || "meter") === "meter"),
    [bills]
  );
  const summaryRange = useMemo(() => {
    if (summaryMode === "tillDate") {
      return { label: "Till date", start: null, end: endOfDay(new Date()) };
    }
    if (summaryMode === "custom") {
      const start = startOfDay(summaryStart);
      const end = endOfDay(summaryEnd);
      return { label: `${shortDate(start)} to ${shortDate(end)}`, start, end };
    }
    return {
      label: monthLabel(selectedMonth),
      start: startOfDay(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)),
      end: endOfDay(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)),
    };
  }, [selectedMonth, summaryEnd, summaryMode, summaryStart]);
  const visibleBills = useMemo(() => {
    const source = summaryMode === "month" ? monthBills : allBills.filter((bill) => (bill.type || "meter") === "meter");
    return source.filter((bill) => {
      // The billing month decides which Light bills month contains this entry.
      // The bill date is only a reference date and may be from another month.
      const date = billingMonthDate(bill.billingMonth) || new Date(bill.date);
      if (Number.isNaN(date.getTime())) return false;
      if (summaryRange.start && date < summaryRange.start) return false;
      if (summaryRange.end && date > summaryRange.end) return false;
      const billType = propertyType(bill.propertyType);
      if (!isUnitTypeAllowed(billType)) return false;
      if (propertyFilter !== "all" && billType !== propertyFilter) return false;
      if (categoryFilter !== "all" && String(bill.category || "").trim() !== categoryFilter) return false;
      if (wingFilter !== "all" && String(bill.wingName || "").trim() !== wingFilter) return false;
      if (statusFilter !== "all" && (statusFilter === "paid" ? bill.status !== "paid" : bill.status === "paid")) return false;
      return true;
    });
  }, [allBills, categoryFilter, isUnitTypeAllowed, monthBills, propertyFilter, statusFilter, summaryMode, summaryRange, wingFilter]);
  const categoryOptions = useMemo(() => {
    const names = [...new Set(
      [...monthBills, ...allBills]
        .filter((bill) => isUnitTypeAllowed(propertyType(bill.propertyType)))
        .filter((bill) => propertyFilter === "all" || propertyType(bill.propertyType) === propertyFilter)
        .map((bill) => String(bill.category || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [{ label: "All buildings", value: "all" }, ...names.map((name) => ({ label: name, value: name }))];
  }, [allBills, isUnitTypeAllowed, monthBills, propertyFilter]);
  const wingOptions = useMemo(() => {
    const names = [...new Set(
      [...monthBills, ...allBills]
        .filter((bill) => isUnitTypeAllowed(propertyType(bill.propertyType)))
        .filter((bill) => propertyFilter === "all" || propertyType(bill.propertyType) === propertyFilter)
        .filter((bill) => categoryFilter === "all" || String(bill.category || "").trim() === categoryFilter)
        .map((bill) => String(bill.wingName || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [{ label: "All wings", value: "all" }, ...names.map((name) => ({ label: `Wing ${name}`, value: name }))];
  }, [allBills, categoryFilter, isUnitTypeAllowed, monthBills, propertyFilter]);
  const total = useMemo(() => visibleBills.reduce((sum, bill) => sum + billAmount(bill), 0), [visibleBills]);
  const pending = useMemo(() => visibleBills.filter((bill) => bill.status !== "paid").reduce((sum, bill) => sum + billAmount(bill), 0), [visibleBills]);
  const automaticCharges = useMemo(() => {
    return unitTypes.map((item) => item.value)
      .map((type) => fixedSettingSummary(type, settings?.[type]))
      .filter(Boolean)
      .filter((item) => propertyFilter === "all" || item.type === propertyFilter);
  }, [propertyFilter, settings, unitTypes]);
  const sortedVisibleBills = useMemo(
    () => [...visibleBills].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [visibleBills]
  );

  function confirmDelete(bill) {
    Alert.alert("Delete light bill?", `${bill.name || "This entry"} will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingId(String(bill._id));
            await deleteLightBill(bill._id);
            await loadBills();
          } catch (err) {
            Alert.alert("Unable to delete", err.response?.data?.message || "Please try again.");
          } finally {
            setDeletingId("");
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Light Bills</Text>
            <Text style={styles.subtitle}>{monthLabel(selectedMonth)} · {visibleBills.length} entries</Text>
          </View>
          <Pressable onPress={() => router.push("/system/light-bill-settings")} style={styles.iconButton} accessibilityLabel="Light bill settings">
            <Settings size={22} color={stylesVars.text} />
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/system/light-bill-form", params: { billingMonth: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][selectedMonth.getMonth()]}-${String(selectedMonth.getFullYear()).slice(-2)}` } })} style={styles.headerAddButton} accessibilityLabel="Add light bill">
            <Plus size={16} color={colors.surface} /><Text style={styles.headerAddButtonText}>Add Bill</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.monthBar}>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, -1))} style={styles.monthButton}>
              <ChevronLeft size={22} color={stylesVars.text} />
            </Pressable>
            <Text style={styles.monthText}>{monthLabel(selectedMonth)}</Text>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, 1))} style={styles.monthButton}>
              <ChevronRight size={22} color={stylesVars.text} />
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <View style={[styles.summaryIcon, styles.summaryIconBlue]}><Zap size={20} color="#1675D1" fill="#1675D1" /></View>
              <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>Total bills</Text><Text style={styles.summaryValue}>{money(total)}</Text></View>
            </View>
            <View style={styles.summaryCard}>
              <View style={[styles.summaryIcon, styles.summaryIconAmber]}><Clock3 size={20} color="#D38B00" /></View>
              <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>Bills pending</Text><Text style={[styles.summaryValue, pending > 0 && styles.pending]}>{money(pending)}</Text></View>
            </View>
          </View>

          <View style={styles.filterPanel}>
              <View style={styles.filterTabs}>
                {SUMMARY_FILTERS.map((item) => (
                  <Pressable key={item.value} onPress={() => setSummaryMode(item.value)} style={[styles.filterTab, summaryMode === item.value && styles.filterTabActive]}>
                    <Text style={[styles.filterTabText, summaryMode === item.value && styles.filterTabTextActive]}>{item.value === "month" ? "This month" : item.label}</Text>
                  </Pressable>
                ))}
              </View>
              {summaryMode === "custom" ? (
                <View style={styles.dateRow}>
                  <View style={styles.dateField}><FormDateField label="Start" value={summaryStart} onChange={setSummaryStart} maximumDate={new Date()} /></View>
                  <View style={styles.dateField}><FormDateField label="End" value={summaryEnd} onChange={setSummaryEnd} maximumDate={new Date()} /></View>
                </View>
              ) : null}
          </View>

          <View style={styles.selectorRow}>
          <View style={[styles.propertyFilterWrap, styles.selectorFlex, showPropertyFilter && styles.selectorOpen]}>
            <Pressable onPress={() => { setShowPropertyFilter((value) => !value); setShowCategoryFilter(false); setShowWingFilter(false); }} style={styles.propertySelect}>
              <Building2 size={12} color={stylesVars.muted} />
              <Text style={styles.propertySelectValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{compactPropertyFilterLabel(propertyFilter)}</Text>
              <ChevronDown size={12} color={stylesVars.muted} />
            </Pressable>
            {showPropertyFilter ? (
              <View style={styles.propertyOptions}>
                {propertyFilters.map((item) => (
                  <Pressable key={item.value} onPress={() => { setPropertyFilter(item.value); setCategoryFilter("all"); setWingFilter("all"); setShowPropertyFilter(false); }} style={[styles.propertyOption, propertyFilter === item.value && styles.propertyOptionActive]}>
                    <Text style={[styles.propertyOptionText, propertyFilter === item.value && styles.propertyOptionTextActive]}>{item.value === "all" ? item.label : stackedPropertyLabel(item.label)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.propertyFilterWrap, styles.selectorWide, showCategoryFilter && styles.selectorOpen]}>
            <Pressable onPress={() => { setShowCategoryFilter((value) => !value); setShowPropertyFilter(false); setShowWingFilter(false); }} style={styles.propertySelect}>
              <Building2 size={12} color={stylesVars.muted} />
              <Text style={styles.propertySelectValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{categoryOptions.find((item) => item.value === categoryFilter)?.label || "All buildings"}</Text>
              <ChevronDown size={12} color={stylesVars.muted} />
            </Pressable>
            {showCategoryFilter ? (
              <View style={styles.propertyOptions}>
                {categoryOptions.map((item) => (
                  <Pressable key={item.value} onPress={() => { setCategoryFilter(item.value); setWingFilter("all"); setShowCategoryFilter(false); }} style={[styles.propertyOption, categoryFilter === item.value && styles.propertyOptionActive]}>
                    <Text style={[styles.propertyOptionText, categoryFilter === item.value && styles.propertyOptionTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.propertyFilterWrap, styles.selectorFlex, showWingFilter && styles.selectorOpen]}>
            <Pressable onPress={() => { setShowWingFilter((value) => !value); setShowPropertyFilter(false); setShowCategoryFilter(false); }} style={styles.propertySelect}>
              <Users size={12} color={stylesVars.muted} />
              <Text style={styles.propertySelectValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{wingOptions.find((item) => item.value === wingFilter)?.label || "All wings"}</Text>
              <ChevronDown size={12} color={stylesVars.muted} />
            </Pressable>
            {showWingFilter ? (
              <View style={styles.propertyOptions}>
                {wingOptions.map((item) => (
                  <Pressable key={item.value} onPress={() => { setWingFilter(item.value); setShowWingFilter(false); }} style={[styles.propertyOption, wingFilter === item.value && styles.propertyOptionActive]}>
                    <Text style={[styles.propertyOptionText, wingFilter === item.value && styles.propertyOptionTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          </View>

          {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && !visibleBills.length && !automaticCharges.length ? (
            <View style={styles.empty}>
              <Zap size={34} color={colors.subtle} />
              <Text style={styles.emptyTitle}>No entries for this filter</Text>
              <Text style={styles.emptyText}>Change the filter, month, or add a new bill.</Text>
            </View>
          ) : null}

          {automaticCharges.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Automatic rent charges</Text>
              {automaticCharges.map((item) => (
                <View key={`${item.type}-${item.mode}`} style={styles.autoChargeCard}>
                  <View style={styles.autoChargeIcon}>
                    <Building2 size={20} color={colors.primary} />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{item.label} | {monthLabel(selectedMonth)}</Text>
                    <Text style={styles.recoverMeta}>Shown automatically in Add Rent for each applicable tenant</Text>
                    {item.notes ? <Text style={styles.rowMeta}>{item.notes}</Text> : null}
                  </View>
                  <View style={styles.amountBox}>
                    <Text style={styles.amount}>{money(item.amount)}</Text>
                    <Text style={[styles.status, styles.paid]}>auto</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {sortedVisibleBills.length ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{summaryMode === "month" ? `${monthLabel(selectedMonth).split(" ")[0]} bills` : "Light bills"}</Text>
                <Text style={styles.sectionCount}>{sortedVisibleBills.length} entries</Text>
              </View>
              {sortedVisibleBills.map((bill, index) => (
                <View key={bill._id} style={styles.billCard}>
                  <View style={styles.billTopRow}>
                    <View style={[styles.billIcon, index % 3 === 1 && styles.billIconGreen, index % 3 === 2 && styles.billIconAmber]}>
                      <Building2 size={22} color={index % 3 === 1 ? "#315F82" : index % 3 === 2 ? "#B97700" : stylesVars.primary} />
                    </View>
                    <View style={styles.billDetails}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{compactBillTitle(bill)}</Text>
                      <Text style={styles.rowMeta}>{formatDate(bill.date)}</Text>
                      {bill.meterNo || bill.totalReading !== undefined ? <Text style={styles.rowMeta}>Meter {bill.meterNo || "-"} {"\u00B7"} Reading {bill.totalReading ?? 0}</Text> : null}
                      {meterUsageLabel(bill, settings) ? <Text style={styles.rowMeta}>{meterUsageLabel(bill, settings).replace(" | ", " \u00B7 ")}</Text> : null}
                    </View>
                    <Pressable onPress={() => setOpenActionsId((current) => current === String(bill._id) ? "" : String(bill._id))} style={styles.moreButton} accessibilityLabel="Bill actions">
                      <MoreHorizontal size={22} color={stylesVars.muted} />
                    </Pressable>
                    {openActionsId === String(bill._id) ? (
                      <View style={styles.actionMenu}>
                        <Pressable onPress={() => { setOpenActionsId(""); router.push({ pathname: "/system/light-bill-form", params: { id: bill._id } }); }} style={styles.actionButton}>
                          <Pencil size={17} color={stylesVars.primary} /><Text style={styles.actionText}>Edit</Text>
                        </Pressable>
                        <Pressable onPress={() => { setOpenActionsId(""); router.push({ pathname: "/system/audit-history", params: { entityType: "lightBill", entityId: bill._id, title: billTitle(bill), returnTo: "/system/light-bills" } }); }} style={styles.actionButton}>
                          <History size={17} color={stylesVars.primary} /><Text style={styles.actionText}>History</Text>
                        </Pressable>
                        <Pressable disabled={deletingId === String(bill._id)} onPress={() => { setOpenActionsId(""); confirmDelete(bill); }} style={styles.actionButton}>
                          {deletingId === String(bill._id) ? <ActivityIndicator size="small" color={colors.danger} /> : <Trash2 size={17} color={colors.danger} />}<Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.billDivider} />
                  <View style={styles.billBottomRow}>
                    <Text style={styles.amount}>{money(billAmount(bill))}</Text>
                    <Text style={[styles.status, bill.status === "paid" && styles.paid, !isRecoverableBill(bill) && styles.ownerPaid]}>{providerStatusLabel(bill)}</Text>
                    <View style={styles.collectionBox}>
                      <Text style={[styles.collectionMeta, bill.tenantCollection?.balance > 0 ? styles.collectionDue : styles.collectionComplete]}>{tenantCollectionLabel(bill)}</Text>
                      <Text style={[styles.payerMeta, isRecoverableBill(bill) ? styles.recoverMeta : styles.ownerMeta]}>{rentChargeLabel(bill, settings)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
        {/* <Pressable onPress={() => router.push({ pathname: "/system/light-bill-form", params: { billingMonth: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][selectedMonth.getMonth()]}-${String(selectedMonth.getFullYear()).slice(-2)}` } })} style={styles.fab}>
          <Plus size={22} color={colors.surface} /><Text style={styles.fabText}>Add Bill</Text>
        </Pressable> */}
      </View>
    </View>
  );
}

const stylesVars = {
  background: "#F6F8F7",
  surface: "#FFFFFF",
  text: "#111B2A",
  muted: "#63738A",
  border: "#D9E1E7",
  primary: "#4F7FA6",
  primarySoft: "#E7F1F8",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: stylesVars.background },
  content: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 18 },
  header: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  headerAvatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: stylesVars.primarySoft },
  headerAvatarText: { color: stylesVars.primary, fontSize: 17, fontWeight: "900" },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: stylesVars.text, fontSize: 30, lineHeight: 34, fontWeight: "900" },
  subtitle: { marginTop: 2, color: stylesVars.muted, fontSize: 14, fontWeight: "600" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerAddButton: { height: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, backgroundColor: stylesVars.primary },
  headerAddButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  fab: { position: "absolute", right: 18, bottom: 18, minWidth: 112, height: 44, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 22, backgroundColor: stylesVars.primary, shadowColor: stylesVars.text, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  fabText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  scrollContent: { paddingBottom: 92, gap: 10 },
  monthBar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface },
  monthButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  monthText: { flex: 1, color: stylesVars.text, fontSize: 16, fontWeight: "900", textAlign: "center" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, minHeight: 62, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface },
  summaryIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  summaryIconBlue: { backgroundColor: "#E3F2FF" },
  summaryIconAmber: { backgroundColor: "#FFF2DC" },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: { color: stylesVars.muted, fontSize: 11, fontWeight: "700" },
  summaryValue: { marginTop: 4, color: stylesVars.text, fontSize: 16, fontWeight: "900" },
  pending: { color: "#D48A00" },
  filterPanel: { borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: "#EEF2F4", overflow: "hidden" },
  filterTabs: { height: 40, flexDirection: "row" },
  filterTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: stylesVars.border },
  filterTabActive: { margin: 2, borderRadius: 7, borderRightWidth: 0, backgroundColor: stylesVars.primary },
  filterTabText: { color: stylesVars.muted, fontSize: 12, fontWeight: "700" },
  filterTabTextActive: { color: "#FFFFFF", fontWeight: "900" },
  dateRow: { padding: 10, flexDirection: "row", gap: 10, backgroundColor: "#FFFFFF" },
  dateField: { flex: 1, minWidth: 0 },
  selectorRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, zIndex: 4 },
  selectorFlex: { flex: 1 },
  selectorWide: { flex: 1.25 },
  selectorOpen: { zIndex: 10 },
  propertyFilterWrap: { position: "relative", zIndex: 3 },
  propertySelect: { minHeight: 40, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface },
  propertySelectValue: { flex: 1, color: stylesVars.text, fontSize: 14, fontWeight: "800" },
  propertyOptions: { position: "absolute", top: 44, left: 0, right: 0, overflow: "hidden", borderWidth: 1, borderColor: "#E1E6EA", borderRadius: 8, backgroundColor: "#FFFFFF", elevation: 8 },
  propertyOption: { minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "#EEF1F3" },
  propertyOptionActive: { backgroundColor: stylesVars.primarySoft },
  propertyOptionText: { color: "#657184", fontSize: 13, fontWeight: "700" },
  propertyOptionTextActive: { color: stylesVars.primary, fontWeight: "900" },
  selectorFilterButton: { width: 52, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface },
  filterBadge: { position: "absolute", top: -6, right: -5, minWidth: 22, height: 22, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#F05252" },
  filterBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  activeFilterNote: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, backgroundColor: stylesVars.primarySoft },
  activeFilterText: { color: stylesVars.muted, fontSize: 11, fontWeight: "700" },
  loading: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  section: { gap: 8 },
  sectionHeader: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: stylesVars.text, fontSize: 17, fontWeight: "900" },
  sectionCount: { color: stylesVars.muted, fontSize: 12, fontWeight: "700" },
  unitGroup: { gap: 9 },
  autoChargeCard: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingRight: 9, borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface },
  autoChargeIcon: { width: 42, height: 42, marginLeft: 10, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: stylesVars.primarySoft },
  row: { minHeight: 132, position: "relative", flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E1E6EA", borderRadius: 18, backgroundColor: "#FFFFFF", overflow: "visible" },
  rowMain: { flex: 1, minWidth: 0, padding: 10 },
  rowTitle: { color: stylesVars.text, fontSize: 14, fontWeight: "900" },
  rowMeta: { marginTop: 3, color: stylesVars.muted, fontSize: 12, fontWeight: "600" },
  payerMeta: { marginTop: 6, fontSize: 10, fontWeight: "900" },
  collectionMeta: { marginTop: 4, fontSize: 10, fontWeight: "800" },
  collectionDue: { color: "#E34F46" },
  collectionComplete: { color: "#315F82" },
  recoverMeta: { color: "#315F82" },
  ownerMeta: { color: "#2878C8" },
  amountBox: { width: 86, alignItems: "flex-end", paddingVertical: 10, paddingRight: 11 },
  amount: { color: stylesVars.text, fontSize: 16, fontWeight: "900" },
  status: { marginTop: 7, paddingHorizontal: 9, paddingVertical: 4, overflow: "hidden", borderRadius: 999, backgroundColor: "#FFF0ED", color: "#E14F45", fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  paid: { color: "#315F82", backgroundColor: "#E7F1F8" },
  ownerPaid: { color: "#1675D1", backgroundColor: "#E8F2FF" },
  billCard: { position: "relative", borderWidth: 1, borderColor: stylesVars.border, borderRadius: 8, backgroundColor: stylesVars.surface, overflow: "visible" },
  billTopRow: { minHeight: 90, padding: 10, paddingRight: 40, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  billIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#E3F2FF" },
  billIconGreen: { backgroundColor: "#EDF4F9" },
  billIconAmber: { backgroundColor: "#FFF1DB" },
  billDetails: { flex: 1, minWidth: 0 },
  billDivider: { height: 1, marginHorizontal: 12, backgroundColor: "#E6EBEF" },
  billBottomRow: { minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 9 },
  collectionBox: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  moreButton: { position: "absolute", top: 7, right: 6, width: 36, height: 36, alignItems: "center", justifyContent: "center", zIndex: 11 },
  actionMenu: { position: "absolute", top: 38, right: 8, zIndex: 12, width: 116, overflow: "hidden", borderWidth: 1, borderColor: stylesVars.border, borderRadius: 10, backgroundColor: stylesVars.surface, elevation: 10 },
  actionButton: { minHeight: 40, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#EEF1F3" },
  actionText: { color: stylesVars.text, fontSize: 11, fontWeight: "700" },
  actionDanger: { color: "#D94841" },
  empty: { minHeight: 240, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 10, color: stylesVars.text, fontSize: 17, fontWeight: "800" },
  emptyText: { marginTop: 5, color: stylesVars.muted, textAlign: "center" },
  error: { paddingVertical: 18, color: "#D94841", textAlign: "center" },
});
