import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react-native";

import { getSystemDashboard } from "../../src/api/saasApi";
import { getRentDues, getRentSummary, getTenants } from "../../src/api/tenantApi";
import { formatTenantUnit, propertyTypeFromTenant, stackedPropertyLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType } from "../../src/utils/subscriptionAccess";
import { useResponsive } from "../../src/utils/responsive";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

const FILTERS = ["All", "Overdue", "Paid", "Partial", "Pending"];

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function includedInMonth(tenant, month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  const joined = tenant.joiningDate ? new Date(tenant.joiningDate) : null;
  const left = tenant.leaveDate ? new Date(tenant.leaveDate) : null;
  return (!joined || joined <= end) && (!left || left >= start);
}

export default function PaymentsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const params = useLocalSearchParams();
  const initialFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const initialType = Array.isArray(params.type) ? params.type[0] : params.type;
  const [tenants, setTenants] = useState([]);
  const [dues, setDues] = useState({ totalDue: 0, tenantCount: 0, tenants: [] });
  const [unitAccess, setUnitAccess] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [activeType, setActiveType] = useState(["bed", "room", "shop"].includes(initialType) ? initialType : "bed");
  const [filter, setFilter] = useState(() => FILTERS.includes(initialFilter) ? initialFilter : "All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rentSummary, setRentSummary] = useState(new Map());
  const key = monthKey(selectedMonth);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [tenantData, dueData, summaryData, dashboardData] = await Promise.all([getTenants(), getRentDues(), getRentSummary(key), getSystemDashboard()]);
      setTenants(Array.isArray(tenantData) ? tenantData : []);
      setDues(dueData);
      setRentSummary(new Map((summaryData.rows || []).map((row) => [String(row.tenantId), row])));
      setUnitAccess(dashboardData?.units || dashboardData);
      setActiveType((current) => {
        const requested = ["bed", "room", "shop"].includes(initialType) ? initialType : current;
        return allowedUnitTypes(dashboardData?.units || dashboardData).some((type) => type.value === requested) ? requested : firstAllowedType(dashboardData?.units || dashboardData);
      });
    }
    catch (err) { setError(err.response?.data?.message || "Unable to load payments."); }
    finally { setLoading(false); }
  }, [initialType, key]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const dueMap = useMemo(() => new Map((dues.tenants || []).map((tenant) => [String(tenant.tenantId), tenant])), [dues.tenants]);
  const tenantTypes = useMemo(() => allowedUnitTypes(unitAccess).map((type) => ({
    ...type,
  })), [unitAccess]);
  const allRows = useMemo(() => tenants.map((tenant) => {
    if (tenant.intakeStatus === "pending_tenant") {
      return { tenant, included: false, expected: 0, paid: 0, balance: 0, totalDue: 0, status: "Pending", overdue: 0, dueMonths: [] };
    }
    const included = includedInMonth(tenant, selectedMonth);
    const monthSummary = rentSummary.get(String(tenant._id));
    const rentEntry = (tenant.rents || []).find((entry) => entry.month === key);
    const expected = included ? Number(monthSummary?.totalExpected ?? monthSummary?.expected ?? tenant.baseRent ?? 0) : 0;
    const paid = Number(monthSummary?.totalPaid ?? monthSummary?.paid ?? rentEntry?.totalAmount ?? rentEntry?.rentAmount ?? 0);
    const balance = Math.max(expected - paid, 0);
    const overdue = dueMap.get(String(tenant._id));
    const overdueAmount = Number(overdue?.totalDue || 0);
    const totalDue = balance + overdueAmount;
    const status = totalDue <= 0 ? "Paid" : paid > 0 ? "Partial" : "Pending";
    return { tenant, included, expected, paid, balance, totalDue, status, overdue: overdueAmount, dueMonths: overdue?.dueMonths || [] };
  }), [dueMap, key, rentSummary, selectedMonth, tenants]);
  const typeAllRows = useMemo(() => allRows.filter((row) => propertyTypeFromTenant(row.tenant) === activeType), [activeType, allRows]);
  const rows = useMemo(() => typeAllRows.filter((row) => row.included), [typeAllRows]);
  const typeCounts = useMemo(() => {
    return tenantTypes.reduce((counts, item) => {
      counts[item.value] = allRows.filter((row) => propertyTypeFromTenant(row.tenant) === item.value).length;
      return counts;
    }, {});
  }, [allRows, tenantTypes]);

  const summary = useMemo(() => rows.reduce((result, row) => ({ expected: result.expected + row.expected, paid: result.paid + row.paid, balance: result.balance + row.totalDue }), { expected: 0, paid: 0, balance: 0 }), [rows]);
  const typeDue = useMemo(() => typeAllRows.reduce((result, row) => ({ totalDue: result.totalDue + row.overdue, tenantCount: result.tenantCount + (row.overdue > 0 ? 1 : 0) }), { totalDue: 0, tenantCount: 0 }), [typeAllRows]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = filter === "Overdue" ? typeAllRows : rows;
    return source.filter((row) => (filter === "All" || (filter === "Overdue" ? row.overdue > 0 : row.status === filter)) && (!needle || [row.tenant.name, row.tenant.roomNo, row.tenant.bedNo, row.tenant.phoneNo].some((value) => String(value || "").toLowerCase().includes(needle))));
  }, [filter, query, rows, typeAllRows]);
  const activeTypeLabel = tenantTypes.find((item) => item.value === activeType)?.label || "Tenants";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { padding: responsive.pagePadding }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
        <View style={styles.stickyHeader}>
          <View style={styles.header}><View><Text style={styles.title}>Payments</Text><Text style={styles.subtitle}>Monthly rent collection</Text></View></View>

          <View style={styles.typeTabs}>
            {tenantTypes.map((item) => {
              const active = item.value === activeType;
              const count = typeCounts[item.value] || 0;
              return (
                <Pressable key={item.value} onPress={() => { setActiveType(item.value); setFilter("All"); }} style={[styles.typeTab, active && styles.typeTabActive]}>
                  <Text style={[styles.typeTabText, active && styles.typeTabTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text>
                  <Text style={[styles.typeTabCount, active && styles.typeTabTextActive]} numberOfLines={1}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.monthPicker}>
          <Pressable onPress={() => setSelectedMonth((month) => shiftMonth(month, -1))} style={styles.monthButton}><ChevronLeft size={21} color={S.deep} /></Pressable>
          <Text style={styles.monthText}>{selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</Text>
          <Pressable onPress={() => setSelectedMonth((month) => shiftMonth(month, 1))} style={styles.monthButton}><ChevronRight size={21} color={S.deep} /></Pressable>
        </View>

        <View style={[styles.summary, responsive.isTiny && styles.summaryTiny]}>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Expected</Text><Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{money(summary.expected)}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Collected</Text><Text style={[styles.summaryValue, styles.collected]} numberOfLines={1} adjustsFontSizeToFit>{money(summary.paid)}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Pending</Text><Text style={[styles.summaryValue, styles.pending]} numberOfLines={1} adjustsFontSizeToFit>{money(summary.balance)}</Text></View>
        </View>

        <Pressable onPress={() => setFilter("Overdue")} style={[styles.overdueBanner, !typeDue.totalDue && styles.overdueClear]}>
          <View style={styles.overdueTextBlock}>
            <Text style={[styles.overdueTitle, !typeDue.totalDue && styles.overdueClearText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {typeDue.totalDue ? "Previous rent overdue" : "Previous rent is clear"}
            </Text>
            <Text style={styles.overdueHint} numberOfLines={2}>
              {typeDue.totalDue ? `${typeDue.tenantCount} ${activeTypeLabel.toLowerCase()} tenant${typeDue.tenantCount === 1 ? "" : "s"} with completed cycles pending` : `No completed ${activeTypeLabel.toLowerCase()} billing cycle is pending`}
            </Text>
          </View>
          <Text style={[styles.overdueAmount, !typeDue.totalDue && styles.overdueClearText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {typeDue.totalDue ? money(typeDue.totalDue) : "Clear"}
          </Text>
        </Pressable>

        <View style={styles.search}><Search size={18} color={S.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={`Search ${activeTypeLabel.toLowerCase()} tenant or room`} style={styles.searchInput} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map((value) => { const count = value === "All" ? rows.length : value === "Overdue" ? typeAllRows.filter((row) => row.overdue > 0).length : rows.filter((row) => row.status === value).length; return <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value} ({count})</Text></Pressable>; })}</ScrollView>

        {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={S.deep} /></View> : error ? <View style={styles.loading}><Text style={styles.error}>{error}</Text></View> : (
          <View style={styles.list}>
            {!visibleRows.length ? <Text style={styles.empty}>No payments match this view.</Text> : null}
            {visibleRows.map((row) => (
              <View key={row.tenant._id} style={styles.paymentRow}>
                <Pressable onPress={() => router.push({ pathname: "/system/tenant-details", params: { id: row.tenant._id, returnTo: "/system/payments" } })} style={[styles.rowMain, responsive.isTiny && styles.rowMainTiny]}>
                  <View style={styles.rowInfo}><Text style={styles.name} numberOfLines={1}>{row.tenant.name}</Text><Text style={styles.meta} numberOfLines={1}>{formatTenantUnit(row.tenant)}</Text>{row.overdue ? <Text style={styles.rowOverdue} numberOfLines={1}>Previous due: {money(row.overdue)}</Text> : null}</View>
                  <View style={[styles.amountInfo, responsive.isTiny && styles.amountInfoTiny]}>
                    <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{!row.included && row.overdue ? money(row.overdue) : `Paid ${money(row.paid)}`}</Text>
                    {row.included ? <Text style={[styles.pendingAmount, row.totalDue <= 0 && styles.paidAmount]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Pending {money(row.totalDue)}</Text> : null}
                    <Text style={[styles.status, row.status === "Paid" && styles.statusPaid, row.status === "Partial" && styles.statusPartial]}>{!row.included && row.overdue ? "Overdue" : row.status}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: "/system/rent-form", params: { id: row.tenant._id, returnTo: "/system/payments" } })} style={styles.addPayment} accessibilityLabel={`Add rent for ${row.tenant.name}`}><Plus size={20} color={S.deep} /></Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: S.screen },
  content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 18, paddingBottom: 40 },
  stickyHeader: { backgroundColor: S.screen },
  header: { marginBottom: 14, backgroundColor: S.screen },
  title: { fontSize: 28, fontWeight: "900", color: S.text },
  subtitle: { marginTop: 3, color: S.muted, fontSize: 13, fontWeight: "700" },
  typeTabs: { marginBottom: 12, flexDirection: "row", gap: 6, padding: 5, borderRadius: 14, backgroundColor: "#F2E8DA" },
  typeTab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  typeTabActive: { backgroundColor: S.card, ...systemShadow },
  typeTabText: { width: "100%", color: S.muted, fontSize: 11, lineHeight: 14, fontWeight: "800", textAlign: "center" },
  typeTabTextActive: { color: S.deep },
  typeTabCount: { width: "100%", marginTop: 2, color: S.subtle, fontSize: 11, fontWeight: "800", textAlign: "center" },
  monthPicker: { height: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  monthButton: { width: 48, height: 46, alignItems: "center", justifyContent: "center" },
  monthText: { flex: 1, textAlign: "center", color: S.text, fontWeight: "900" },
  summary: { minHeight: 72, marginTop: 10, padding: 12, flexDirection: "row", borderRadius: 14, backgroundColor: S.card, borderWidth: 1, borderColor: S.border, ...systemShadow },
  summaryTiny: { flexWrap: "wrap", rowGap: 10 },
  summaryItem: { flex: 1, minWidth: 92 },
  summaryLabel: { color: S.muted, fontSize: 11, fontWeight: "800" },
  summaryValue: { marginTop: 6, color: S.text, fontSize: 14, fontWeight: "900" },
  collected: { color: S.mid },
  pending: { color: S.orange },
  overdueBanner: { minHeight: 66, marginTop: 10, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, overflow: "hidden", borderWidth: 1, borderColor: S.redSoft, borderRadius: 14, backgroundColor: S.redSoft },
  overdueTextBlock: { flex: 1, minWidth: 0 },
  overdueClear: { borderColor: S.soft, backgroundColor: S.soft },
  overdueTitle: { color: S.red, fontSize: 14, fontWeight: "900" },
  overdueHint: { marginTop: 4, color: S.muted, fontSize: 10, fontWeight: "700" },
  overdueAmount: { flexShrink: 1, maxWidth: 116, color: S.red, fontSize: 16, fontWeight: "900", textAlign: "right" },
  overdueClearText: { color: S.mid },
  search: { height: 48, marginTop: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  searchInput: { flex: 1, height: "100%", marginLeft: 8 },
  filters: { paddingVertical: 10, gap: 7 },
  filter: { height: 34, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: S.border, borderRadius: 11, backgroundColor: S.card },
  filterActive: { borderColor: S.deep, backgroundColor: S.soft },
  filterText: { color: S.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: S.deep },
  loading: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  list: { paddingBottom: 32, gap: 8 },
  paymentRow: { minHeight: 70, flexDirection: "row", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: S.border, borderRadius: 15, backgroundColor: S.card, ...systemShadow },
  rowMain: { flex: 1, minWidth: 0, minHeight: 68, padding: 12, flexDirection: "row", alignItems: "center" },
  rowMainTiny: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  rowInfo: { flex: 1, minWidth: 0 },
  name: { color: S.text, fontWeight: "900" },
  meta: { marginTop: 4, color: S.muted, fontSize: 12, fontWeight: "700" },
  rowOverdue: { marginTop: 4, color: S.red, fontSize: 11, fontWeight: "800" },
  amountInfo: { width: 128, flexShrink: 0, alignItems: "flex-end", marginLeft: 8 },
  amountInfoTiny: { width: 104, marginLeft: 6 },
  amount: { width: "100%", color: S.muted, fontSize: 12, fontWeight: "800", textAlign: "right" },
  pendingAmount: { width: "100%", marginTop: 3, color: S.orange, fontSize: 11, fontWeight: "900", textAlign: "right" },
  paidAmount: { color: S.mid },
  status: { marginTop: 5, color: S.orange, fontSize: 11, fontWeight: "900" },
  statusPaid: { color: S.mid },
  statusPartial: { color: S.orange },
  addPayment: { width: 44, height: 48, flexShrink: 0, marginRight: 3, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: S.border },
  empty: { paddingVertical: 30, color: S.muted, textAlign: "center", fontWeight: "800" },
  error: { color: S.red, textAlign: "center" },
});
