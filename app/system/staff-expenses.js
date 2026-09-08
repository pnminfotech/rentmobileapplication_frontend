import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Pencil, Plus, Search, SlidersHorizontal, Trash2, Users } from "lucide-react-native";

import { deleteStaffExpense, getStaffExpenses } from "../../src/api/staffExpenseApi";
import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { systemColors as colors } from "../../src/theme/systemTheme";

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
];
const RANGE_FILTERS = [
  { label: "Till date", value: "tillDate" },
  { label: "List month", value: "month" },
  { label: "Custom", value: "custom" },
];

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function monthLabel(date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
}

function auditMeta(item) {
  const changedAt = item.updatedAt || item.createdAt;
  if (!changedAt) return "";
  const name = item.updatedByName || item.createdByName || "Admin";
  return `Last change ${formatDate(changedAt)} by ${name}`;
}

export default function StaffExpensesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const initialRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const [items, setItems] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [status, setStatus] = useState(() => STATUS_FILTERS.some((item) => item.value === initialStatus) ? initialStatus : "all");
  const [rangeMode, setRangeMode] = useState(() => RANGE_FILTERS.some((item) => item.value === initialRange) ? initialRange : "month");
  const [showRangeFilter, setShowRangeFilter] = useState(false);
  const [rangeStart, setRangeStart] = useState(toDateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [rangeEnd, setRangeEnd] = useState(toDateValue());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getStaffExpenses();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load staff expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadItems(); }, [loadItems]));

  const range = useMemo(() => {
    if (rangeMode === "tillDate") return { label: "Till date", start: null, end: endOfDay(new Date()) };
    if (rangeMode === "custom") {
      const start = startOfDay(rangeStart);
      const end = endOfDay(rangeEnd);
      return { label: `${shortDate(start)} to ${shortDate(end)}`, start, end };
    }
    return {
      label: monthLabel(selectedMonth),
      start: startOfDay(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)),
      end: endOfDay(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)),
    };
  }, [rangeEnd, rangeMode, rangeStart, selectedMonth]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return false;
      if (range.start && date < range.start) return false;
      if (range.end && date > range.end) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!term) return true;
      return [item.name, item.type, item.notes].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [items, range, search, status]);

  const total = useMemo(() => visibleItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), [visibleItems]);
  const pending = useMemo(() => visibleItems.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0), [visibleItems]);

  function confirmDelete(item) {
    Alert.alert("Delete staff expense?", `${item.name || "This expense"} will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingId(String(item._id));
            await deleteStaffExpense(item._id);
            await loadItems();
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
          <Pressable onPress={() => router.replace("/system/more")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
          <View style={styles.headerText}><Text style={styles.title}>Staff expenses</Text><Text style={styles.subtitle}>{monthLabel(selectedMonth)} | {visibleItems.length} entries</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.monthBar}>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, -1))} style={styles.monthButton}><ChevronLeft size={20} color={colors.primary} /></Pressable>
            <Text style={styles.monthText}>{monthLabel(selectedMonth)}</Text>
            <Pressable onPress={() => setSelectedMonth((current) => shiftMonth(current, 1))} style={styles.monthButton}><ChevronRight size={20} color={colors.primary} /></Pressable>
          </View>

          <View style={styles.segmented}>
            {STATUS_FILTERS.map((item) => <Pressable key={item.value} onPress={() => setStatus(item.value)} style={[styles.segment, status === item.value && styles.segmentActive]}><Text style={[styles.segmentText, status === item.value && styles.segmentTextActive]}>{item.label}</Text></Pressable>)}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Total | {range.label}</Text><Text style={styles.summaryValue}>{money(total)}</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Pending</Text><Text style={[styles.summaryValue, pending > 0 && styles.pending]}>{money(pending)}</Text></View>
            <Pressable onPress={() => setShowRangeFilter((value) => !value)} style={styles.summaryFilterButton}><SlidersHorizontal size={19} color={colors.primary} /></Pressable>
          </View>

          {showRangeFilter ? (
            <View style={styles.filterPanel}>
              <View style={styles.filterTabs}>
                {RANGE_FILTERS.map((item) => <Pressable key={item.value} onPress={() => { setRangeMode(item.value); if (item.value !== "custom") setShowRangeFilter(false); }} style={[styles.filterTab, rangeMode === item.value && styles.filterTabActive]}><Text style={[styles.filterTabText, rangeMode === item.value && styles.filterTabTextActive]}>{item.label}</Text></Pressable>)}
              </View>
              {rangeMode === "custom" ? <View style={styles.dateRow}><View style={styles.dateField}><FormDateField label="Start" value={rangeStart} onChange={setRangeStart} maximumDate={new Date()} /></View><View style={styles.dateField}><FormDateField label="End" value={rangeEnd} onChange={setRangeEnd} maximumDate={new Date()} /></View></View> : null}
            </View>
          ) : null}

          <View style={styles.searchBox}>
            <Search size={18} color={colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search staff, type or notes" style={styles.searchInput} />
          </View>

          {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && !visibleItems.length ? <View style={styles.empty}><Users size={34} color={colors.subtle} /><Text style={styles.emptyTitle}>No staff expenses</Text><Text style={styles.emptyText}>Change filters or add a staff payment.</Text></View> : null}

          {visibleItems.map((item) => (
            <View key={item._id} style={styles.row}>
              <View style={styles.rowMain}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{item.type || "Staff"}{item.notes ? ` | ${item.notes}` : ""}</Text>{auditMeta(item) ? <Text style={styles.auditMeta}>{auditMeta(item)}</Text> : null}</View>
              <View style={styles.amountBox}><Text style={styles.amount}>{money(item.amount)}</Text><Text style={[styles.status, item.status === "paid" && styles.paid]}>{item.status || "pending"}</Text></View>
              <View style={styles.actionStack}>
                <Pressable onPress={() => router.push({ pathname: "/system/staff-expense-form", params: { id: item._id } })} style={styles.actionButton}><Pencil size={17} color={colors.primary} /></Pressable>
                <Pressable onPress={() => router.push({ pathname: "/system/audit-history", params: { entityType: "staffExpense", entityId: item._id, title: item.name, returnTo: "/system/staff-expenses" } })} style={styles.actionButton}><History size={17} color={colors.primary} /></Pressable>
                <Pressable disabled={deletingId === String(item._id)} onPress={() => confirmDelete(item)} style={styles.actionButton}>{deletingId === String(item._id) ? <ActivityIndicator size="small" color={colors.danger} /> : <Trash2 size={17} color={colors.danger} />}</Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
        <Pressable onPress={() => router.push("/system/staff-expense-form")} style={styles.fab}><Plus size={24} color={colors.surface} /></Pressable>
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
  segmented: { flexDirection: "row", padding: 4, borderRadius: 7, backgroundColor: colors.border },
  segment: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
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
  searchBox: { minHeight: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: colors.text },
  pending: { color: colors.warning },
  loading: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  row: { minHeight: 78, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  rowMain: { flex: 1, minWidth: 0, padding: 12 },
  rowTitle: { color: colors.text, fontWeight: "800" },
  rowMeta: { marginTop: 4, color: colors.muted, fontSize: 11 },
  auditMeta: { marginTop: 4, color: colors.primary, fontSize: 10, fontWeight: "700" },
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
