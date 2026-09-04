import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Pencil, Plus, SlidersHorizontal, Trash2, Zap } from "lucide-react-native";

import { deleteLightBill, getLightBillSettings, getLightBills } from "../../src/api/lightBillApi";
import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

const SUMMARY_FILTERS = [
  { label: "Till date", value: "tillDate" },
  { label: "List month", value: "month" },
  { label: "Custom", value: "custom" },
];
const PROPERTY_FILTERS = [
  { label: "All", value: "all" },
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];
const PROPERTY_ORDER = ["room", "bed", "shop"];
const FIXED_SETTING_LABELS = {
  fixed_per_tenant: "Same fixed amount for every tenant",
  fixed_monthly: "Fixed amount every month",
};

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
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

function rentChargeLabel(bill, settings) {
  if (isWithinIncludedLimit(bill, settings)) return "No rent charge";
  return isRecoverableBill(bill) ? "Added to rent" : "Not added to rent";
}

function providerStatusLabel(bill) {
  return bill.status === "paid" ? "Bill paid" : "Bill pending";
}

function tenantCollectionLabel(bill) {
  const collection = bill.tenantCollection;
  if (!collection?.applicable) return "No tenant collection";
  return `Tenant collection: ${money(collection.collected)} of ${money(collection.expected)}`;
}

export default function LightBillsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const initialRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const initialBillingMonth = Array.isArray(params.billingMonth) ? params.billingMonth[0] : params.billingMonth;
  const [bills, setBills] = useState([]);
  const [allBills, setAllBills] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => monthFromBillingMonth(initialBillingMonth));
  const [summaryMode, setSummaryMode] = useState(() => SUMMARY_FILTERS.some((item) => item.value === initialRange) ? initialRange : "month");
  const [statusFilter] = useState(() => ["pending", "paid"].includes(initialStatus) ? initialStatus : "all");
  const [showSummaryFilter, setShowSummaryFilter] = useState(false);
  const [summaryStart, setSummaryStart] = useState(toDateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [summaryEnd, setSummaryEnd] = useState(toDateValue());
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [wingFilter, setWingFilter] = useState("all");
  const [showWingFilter, setShowWingFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
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
      if (propertyFilter !== "all" && propertyType(bill.propertyType) !== propertyFilter) return false;
      if (wingFilter !== "all" && String(bill.wingName || "").trim() !== wingFilter) return false;
      if (statusFilter !== "all" && (statusFilter === "paid" ? bill.status !== "paid" : bill.status === "paid")) return false;
      return true;
    });
  }, [allBills, monthBills, propertyFilter, statusFilter, summaryMode, summaryRange, wingFilter]);
  const propertyFilterLabel = PROPERTY_FILTERS.find((item) => item.value === propertyFilter)?.label || "All";
  const wingOptions = useMemo(() => {
    const names = [...new Set(
      [...monthBills, ...allBills]
        .filter((bill) => propertyFilter === "all" || propertyType(bill.propertyType) === propertyFilter)
        .map((bill) => String(bill.wingName || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [{ label: "All wings", value: "all" }, ...names.map((name) => ({ label: `Wing ${name}`, value: name }))];
  }, [allBills, monthBills, propertyFilter]);
  const total = useMemo(() => visibleBills.reduce((sum, bill) => sum + billAmount(bill), 0), [visibleBills]);
  const pending = useMemo(() => visibleBills.filter((bill) => bill.status !== "paid").reduce((sum, bill) => sum + billAmount(bill), 0), [visibleBills]);
  const automaticCharges = useMemo(() => {
    return ["bed", "room", "shop"]
      .map((type) => fixedSettingSummary(type, settings?.[type]))
      .filter(Boolean)
      .filter((item) => propertyFilter === "all" || item.type === propertyFilter);
  }, [propertyFilter, settings]);
  const groupedBills = useMemo(() => {
    const sections = PROPERTY_ORDER.map((type) => ({
      type,
      title: propertySectionLabel(type),
      units: [],
    }));

    const ownerSection = { type: "owner", title: "Owner paid bills", units: [] };

    visibleBills.forEach((bill) => {
      if (bill.isUnitLinked === false) {
        ownerSection.units.push({ label: billTitle(bill), bills: [bill] });
        return;
      }
      const type = propertyType(bill.propertyType);
      const section = sections.find((item) => item.type === type);
      const label = unitLabel(bill);
      let unit = section.units.find((item) => item.label === label);
      if (!unit) {
        unit = { label, bills: [] };
        section.units.push(unit);
      }
      unit.bills.push(bill);
    });

    sections.forEach((section) => {
      section.units.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
      section.units.forEach((unit) => {
        unit.bills.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      });
    });

    ownerSection.units.sort((a, b) => new Date(b.bills[0]?.date || 0).getTime() - new Date(a.bills[0]?.date || 0).getTime());

    return [...sections.filter((section) => section.units.length), ...(ownerSection.units.length ? [ownerSection] : [])];
  }, [visibleBills]);

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
          <Pressable onPress={() => router.replace("/system/more")} style={styles.iconButton}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Light bills</Text>
            <Text style={styles.subtitle}>{monthLabel(selectedMonth)} | {visibleBills.length} entries</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.monthBar}>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, -1))} style={styles.monthButton}>
              <ChevronLeft size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthText}>{monthLabel(selectedMonth)}</Text>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, 1))} style={styles.monthButton}>
              <ChevronRight size={20} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Total | {summaryRange.label}</Text><Text style={styles.summaryValue}>{money(total)}</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Bills pending</Text><Text style={[styles.summaryValue, pending > 0 && styles.pending]}>{money(pending)}</Text></View>
            <Pressable onPress={() => setShowSummaryFilter((value) => !value)} style={styles.summaryFilterButton}>
              <SlidersHorizontal size={19} color={colors.primary} />
            </Pressable>
          </View>

          {showSummaryFilter ? (
            <View style={styles.filterPanel}>
              <View style={styles.filterTabs}>
                {SUMMARY_FILTERS.map((item) => (
                  <Pressable key={item.value} onPress={() => { setSummaryMode(item.value); if (item.value !== "custom") setShowSummaryFilter(false); }} style={[styles.filterTab, summaryMode === item.value && styles.filterTabActive]}>
                    <Text style={[styles.filterTabText, summaryMode === item.value && styles.filterTabTextActive]}>{item.label}</Text>
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
          ) : null}

          <View style={styles.propertyFilterWrap}>
            <Pressable onPress={() => setShowPropertyFilter((value) => !value)} style={styles.propertySelect}>
              <Text style={styles.propertySelectLabel}>Property</Text>
              <Text style={styles.propertySelectValue}>{propertyFilter === "all" ? propertyFilterLabel : stackedPropertyLabel(propertyFilterLabel)}</Text>
              <ChevronRight size={18} color={colors.muted} style={showPropertyFilter && styles.chevronOpen} />
            </Pressable>
            {showPropertyFilter ? (
              <View style={styles.propertyOptions}>
                {PROPERTY_FILTERS.map((item) => (
                  <Pressable key={item.value} onPress={() => { setPropertyFilter(item.value); setWingFilter("all"); setShowPropertyFilter(false); }} style={[styles.propertyOption, propertyFilter === item.value && styles.propertyOptionActive]}>
                    <Text style={[styles.propertyOptionText, propertyFilter === item.value && styles.propertyOptionTextActive]}>{item.value === "all" ? item.label : stackedPropertyLabel(item.label)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.propertyFilterWrap}>
            <Pressable onPress={() => setShowWingFilter((value) => !value)} style={styles.propertySelect}>
              <Text style={styles.propertySelectLabel}>Wing</Text>
              <Text style={styles.propertySelectValue}>{wingOptions.find((item) => item.value === wingFilter)?.label || "All wings"}</Text>
              <ChevronRight size={18} color={colors.muted} style={showWingFilter && styles.chevronOpen} />
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
                    <Zap size={18} color={colors.primary} />
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

          {groupedBills.map((section) => (
            <View key={section.type} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.units.map((unit) => (
                <View key={unit.label} style={styles.unitGroup}>
                  {unit.bills.map((bill) => (
                    <View key={bill._id} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>{billTitle(bill)}</Text>
                        <Text style={styles.rowMeta}>{formatDate(bill.date)}</Text>
                        {bill.meterNo || bill.totalReading !== undefined ? <Text style={styles.rowMeta}>Meter {bill.meterNo || "-"} | Reading {bill.totalReading ?? 0}</Text> : null}
                        {meterUsageLabel(bill, settings) ? <Text style={styles.rowMeta}>{meterUsageLabel(bill, settings)}</Text> : null}
                        <Text style={[styles.payerMeta, isRecoverableBill(bill) ? styles.recoverMeta : styles.ownerMeta]}>{rentChargeLabel(bill, settings)}</Text>
                        <Text style={[styles.collectionMeta, bill.tenantCollection?.balance > 0 ? styles.collectionDue : styles.collectionComplete]}>{tenantCollectionLabel(bill)}</Text>
                      </View>
                      <View style={styles.amountBox}>
                        <Text style={styles.amount}>{money(billAmount(bill))}</Text>
                        <Text style={[styles.status, bill.status === "paid" && styles.paid]}>{providerStatusLabel(bill)}</Text>
                      </View>
                      <View style={styles.actionStack}>
                        <Pressable onPress={() => router.push({ pathname: "/system/light-bill-form", params: { id: bill._id } })} style={styles.actionButton}>
                          <Pencil size={17} color={colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => router.push({ pathname: "/system/audit-history", params: { entityType: "lightBill", entityId: bill._id, title: billTitle(bill), returnTo: "/system/light-bills" } })} style={styles.actionButton}>
                          <History size={17} color={colors.primary} />
                        </Pressable>
                        <Pressable disabled={deletingId === String(bill._id)} onPress={() => confirmDelete(bill)} style={styles.actionButton}>
                          {deletingId === String(bill._id) ? <ActivityIndicator size="small" color={colors.danger} /> : <Trash2 size={17} color={colors.danger} />}
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
        <Pressable onPress={() => router.push({ pathname: "/system/light-bill-form", params: { billingMonth: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][selectedMonth.getMonth()]}-${String(selectedMonth.getFullYear()).slice(-2)}` } })} style={styles.fab}>
          <Plus size={24} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 18 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14, backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, marginLeft: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  fab: { position: "absolute", right: 18, bottom: 22, width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: colors.primary, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  scrollContent: { paddingBottom: 36, gap: 8 },
  monthBar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  monthButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  monthText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  summary: { minHeight: 68, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  summaryItem: { flex: 1 },
  summaryDivider: { width: 1, height: 38, marginHorizontal: 12, backgroundColor: colors.border },
  summaryLabel: { color: colors.muted, fontSize: 11 },
  summaryValue: { marginTop: 5, color: colors.text, fontSize: 16, fontWeight: "800" },
  summaryFilterButton: { width: 42, height: 42, marginLeft: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft },
  filterPanel: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  filterTabs: { flexDirection: "row", padding: 4, borderRadius: 7, backgroundColor: colors.border },
  filterTab: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  filterTabActive: { backgroundColor: colors.surface },
  filterTabText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  filterTabTextActive: { color: colors.primary },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, minWidth: 0 },
  propertyFilterWrap: { position: "relative", zIndex: 2 },
  propertySelect: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  propertySelectLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  propertySelectValue: { flex: 1, marginLeft: 8, color: colors.text, fontSize: 14, fontWeight: "800" },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  propertyOptions: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  propertyOption: { minHeight: 42, paddingHorizontal: 12, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  propertyOptionActive: { backgroundColor: colors.primarySoft },
  propertyOptionText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  propertyOptionTextActive: { color: colors.primary },
  pending: { color: colors.warning },
  loading: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  section: { gap: 8 },
  sectionTitle: { marginTop: 8, color: colors.text, fontSize: 16, fontWeight: "800" },
  unitGroup: { gap: 6 },
  autoChargeCard: { minHeight: 76, flexDirection: "row", alignItems: "center", paddingRight: 8, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: 7, backgroundColor: colors.surface },
  autoChargeIcon: { width: 42, height: 42, marginLeft: 10, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  rowMain: { flex: 1, minWidth: 0, padding: 12 },
  rowTitle: { color: colors.text, fontWeight: "800" },
  rowMeta: { marginTop: 4, color: colors.muted, fontSize: 11 },
  payerMeta: { marginTop: 4, color: colors.primary, fontSize: 11, fontWeight: "800" },
  collectionMeta: { marginTop: 3, fontSize: 10, fontWeight: "700" },
  collectionDue: { color: colors.warning },
  collectionComplete: { color: colors.success },
  recoverMeta: { color: colors.success },
  ownerMeta: { color: colors.warning },
  amountBox: { width: 78, alignItems: "flex-end", paddingVertical: 10, paddingRight: 8 },
  amount: { color: colors.text, fontSize: 12, fontWeight: "800", textAlign: "right" },
  status: { marginTop: 4, color: colors.warning, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  paid: { color: colors.success },
  actionStack: { width: 44, alignSelf: "stretch", borderLeftWidth: 1, borderLeftColor: colors.border },
  actionButton: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.surfaceSoft },
  empty: { minHeight: 240, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 10, color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: { marginTop: 5, color: colors.muted, textAlign: "center" },
  error: { paddingVertical: 18, color: colors.danger, textAlign: "center" },
});
