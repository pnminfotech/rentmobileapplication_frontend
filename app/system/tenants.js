import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Archive, ChevronRight, Phone, Plus, Search, Share2, UserRound } from "lucide-react-native";

import { getSystemDashboard } from "../../src/api/saasApi";
import { createTenantInviteForForm, getRentDues, getRentSummary, getTenants } from "../../src/api/tenantApi";
import { formatTenantUnit, propertyTypeFromTenant, stackedPropertyLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType } from "../../src/utils/subscriptionAccess";
import { documentStatusForTenant } from "../../src/utils/tenantDocuments";
import { useResponsive } from "../../src/utils/responsive";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { colors } from "../../src/theme/colors";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

const FILTERS = ["All", "Needs payment", "Paid"];
function currentMonthKey() {
  const date = new Date();
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
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

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function compactMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
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

function paymentCycleLabel(tenant) {
  return tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid" : "Normal cycle";
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
  const status = beforeJoining
    ? "-"
    : totalExpected <= 0 && paid <= 0
    ? "Upcoming"
    : paid >= totalExpected && totalExpected > 0
      ? "Paid"
      : paid > 0
        ? "Pending"
        : month.offset > 0
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

export default function TenantsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const params = useLocalSearchParams();
  const initialType = Array.isArray(params.type) ? params.type[0] : params.type;
  const [tenants, setTenants] = useState([]);
  const [dues, setDues] = useState({ totalDue: 0, tenants: [] });
  const [unitAccess, setUnitAccess] = useState(null);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [activeType, setActiveType] = useState(["bed", "room", "shop"].includes(initialType) ? initialType : "bed");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharingTenantId, setSharingTenantId] = useState("");
  const [rentSummary, setRentSummary] = useState(new Map());
  const [rentSummaryByMonth, setRentSummaryByMonth] = useState(new Map());
  const todayMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const rentMonths = useMemo(() => [
    { label: "Previous", key: monthKey(shiftMonth(todayMonth, -1)), date: shiftMonth(todayMonth, -1), offset: -1 },
    { label: "Current", key: monthKey(todayMonth), date: todayMonth, offset: 0 },
    { label: "Next", key: monthKey(shiftMonth(todayMonth, 1)), date: shiftMonth(todayMonth, 1), offset: 1 },
  ], [todayMonth]);
  const key = currentMonthKey();

  const loadTenants = useCallback(async () => {
    try {
      setError("");
      const [data, dueData, summaryResponses, dashboardData] = await Promise.all([
        getTenants(),
        getRentDues(),
        Promise.all(rentMonths.map((month) => getRentSummary(month.key).then((summary) => [month.key, summary]))),
        getSystemDashboard(),
      ]);
      setTenants(Array.isArray(data) ? data : []);
      setDues(dueData);
      const summaryByMonth = new Map(summaryResponses.map(([month, summary]) => [month, new Map((summary.rows || []).map((row) => [String(row.tenantId), row]))]));
      setRentSummaryByMonth(summaryByMonth);
      setRentSummary(summaryByMonth.get(key) || new Map());
      setUnitAccess(dashboardData?.units || dashboardData);
      setCanteenEnabled(hasCanteenFeature(dashboardData));
      setActiveType((current) => {
        const requested = ["bed", "room", "shop"].includes(initialType) ? initialType : current;
        return allowedUnitTypes(dashboardData?.units || dashboardData).some((type) => type.value === requested) ? requested : firstAllowedType(dashboardData?.units || dashboardData);
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load tenants.");
    } finally {
      setLoading(false);
    }
  }, [initialType, key, rentMonths]);

  useFocusEffect(useCallback(() => { loadTenants(); }, [loadTenants]));

  const tenantRows = useMemo(() => {
    const dueMap = new Map((dues.tenants || []).map((item) => [String(item.tenantId), item]));
    return tenants.filter(isActiveTenant).map((tenant) => {
      const awaitingForm = tenant.intakeStatus === "pending_tenant";
      const monthSummary = rentSummary.get(String(tenant._id));
      const rentEntry = (tenant.rents || []).find((rent) => rent.month === key);
      const expected = awaitingForm ? 0 : Number(monthSummary?.totalExpected ?? monthSummary?.expected ?? tenant.baseRent ?? 0);
      const paid = Number(monthSummary?.totalPaid ?? monthSummary?.paid ?? rentEntry?.totalAmount ?? rentEntry?.rentAmount ?? 0);
      const balance = Math.max(expected - paid, 0);
      const dueInfo = dueMap.get(String(tenant._id));
      const overdue = Number(dueInfo?.totalDue || 0);
      const totalDue = balance + overdue;
      const dueMonths = Array.isArray(dueInfo?.dueMonths) ? dueInfo.dueMonths : [];
      const docStatus = documentStatusForTenant(tenant);
      return { tenant, expected, paid, balance, overdue, totalDue, dueMonths, awaitingForm, docStatus, needsPayment: !awaitingForm && totalDue > 0 };
    });
  }, [dues.tenants, key, rentSummary, tenants]);

  const tenantTypes = useMemo(() => allowedUnitTypes(unitAccess).map((type) => ({
    ...type,
  })), [unitAccess]);
  const typeRows = useMemo(() => tenantRows.filter(({ tenant }) => propertyTypeFromTenant(tenant) === activeType), [activeType, tenantRows]);

  const typeCounts = useMemo(() => {
    return tenantTypes.reduce((counts, item) => {
      counts[item.value] = tenantRows.filter(({ tenant }) => propertyTypeFromTenant(tenant) === item.value).length;
      return counts;
    }, {});
  }, [tenantRows, tenantTypes]);

  const visibleTenants = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return typeRows
      .filter((row) => filter === "All" || (filter === "Needs payment" ? row.needsPayment : !row.needsPayment))
      .filter(({ tenant }) => !needle || [tenant.name, tenant.phoneNo, tenant.roomNo, tenant.bedNo]
        .some((value) => String(value || "").toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.needsPayment) - Number(a.needsPayment) || String(a.tenant.name || "").localeCompare(String(b.tenant.name || "")));
  }, [filter, query, typeRows]);

  const thisMonthPending = typeRows.reduce((sum, row) => sum + row.totalDue, 0);
  const typeOverdue = typeRows.reduce((sum, row) => sum + row.overdue, 0);
  const activeTypeLabel = tenantTypes.find((item) => item.value === activeType)?.label || "Tenants";

  async function reshareTenantForm(tenant) {
    try {
      setSharingTenantId(String(tenant._id));
      const result = await createTenantInviteForForm(tenant._id);
      if (!result?.url) throw new Error("Server did not return a share link.");
      await Share.share({
        title: "Tenant registration form",
        message: `Please update your tenant registration form using this secure link:\n${result.url}`,
        url: result.url,
      });
    } catch (err) {
      Alert.alert("Unable to share form", err.response?.data?.message || err.message || "Please try again.");
    } finally {
      setSharingTenantId("");
    }
  }

  return (
    <View style={styles.screen} >
      <View style={[styles.content, { padding: responsive.pagePadding }]}>
        <View style={[styles.header, responsive.isTiny && styles.headerTiny]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tenants</Text>
            <Text style={styles.subtitle}>{typeRows.length} active {activeTypeLabel.toLowerCase()} tenants</Text>
          </View>
          <Pressable onPress={() => router.push("/system/former-tenants")} style={styles.historyButton} accessibilityLabel="Former tenants">
            <Archive size={20} color={S.deep} />
          </Pressable>
          <Pressable onPress={() => router.push("/system/tenant-invite")} style={styles.historyButton} accessibilityLabel="Share tenant form">
            <Share2 size={20} color={S.deep} />
          </Pressable>
          <Pressable onPress={() => router.push("/system/tenant-admission")} style={[styles.addButton, responsive.isTiny && styles.addButtonTiny]}>
            <Plus size={20} color={colors.surface} />
            <Text style={styles.addButtonText} numberOfLines={1}>Add tenant</Text>
          </Pressable>
        </View>

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

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.searchBox}>
            <Search size={19} color={S.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder={`Search ${activeTypeLabel.toLowerCase()} tenants`} style={styles.searchInput} />
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Rent pending</Text><Text style={styles.summaryValue}>{money(thisMonthPending)}</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Previous overdue</Text><Text style={[styles.summaryValue, typeOverdue > 0 && styles.overdueValue]}>{money(typeOverdue)}</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((value) => {
              const count = value === "All" ? typeRows.length : value === "Needs payment" ? typeRows.filter((row) => row.needsPayment).length : typeRows.filter((row) => !row.needsPayment).length;
              return <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value} ({count})</Text></Pressable>;
            })}
          </ScrollView>

          {loading ? (
            <View style={styles.loading}><ActivityIndicator size="large" color={S.deep} /></View>
          ) : error ? (
            <View style={styles.empty}>
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={loadTenants}><Text style={styles.retry}>Try again</Text></Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {!visibleTenants.length ? (
                <View style={styles.empty}>
                  <UserRound size={34} color={colors.subtle} />
                  <Text style={styles.emptyTitle}>{query ? "No tenant found" : `No ${activeTypeLabel.toLowerCase()} tenants yet`}</Text>
                  <Text style={styles.emptyText}>{query ? "Try another search." : "Add your first tenant to a vacant unit."}</Text>
                </View>
              ) : null}
              {visibleTenants.map(({ tenant, expected, paid, balance, overdue, totalDue, dueMonths, awaitingForm, docStatus, needsPayment }) => {
                const photoUrl = tenantPhotoUrl(tenant);
                return (
                <View key={tenant._id} style={[styles.tenantRow, responsive.isTiny && styles.tenantRowTiny, overdue > 0 && styles.tenantOverdue]}>
                  <View style={styles.tenantTopRow}>
                    {!awaitingForm ? (
                      <View style={styles.cardDueTopRight}>
                        <Text style={styles.cardDueLabel}>Due</Text>
                        <Text style={styles.cardDueAmount}>{money(totalDue)}</Text>
                      </View>
                    ) : null}
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
                        <View style={styles.badgeRow}>
                          <Text style={styles.cycleBadge} numberOfLines={1}>{paymentCycleLabel(tenant)}</Text>
                        </View>
                        <Text style={styles.unitPill} numberOfLines={1}>{formatTenantUnit(tenant)}</Text>
                        <View style={styles.depositPhoneRow}>
                          <Text style={styles.depositPhoneText} numberOfLines={1}>Deposit: {money(tenant.depositAmount)}</Text>
                          {tenant.phoneNo ? (
                            <>
                              <Text style={styles.depositPhoneDivider}>|</Text>
                              <Phone size={12} color={S.muted} />
                              <Text style={styles.depositPhoneText} numberOfLines={1}>{tenant.phoneNo}</Text>
                            </>
                          ) : null}
                        </View>
                        {/* <View style={styles.inlineFinance}>
                          <Text style={styles.tenantMeta} numberOfLines={1}>Paid {money(paid)} / {money(expected)}</Text>
                        </View> */}
                        {/* {!awaitingForm && balance > 0 ? <Text style={styles.currentPending} numberOfLines={1}>Current pending: {money(balance)}</Text> : null} */}
                        {propertyTypeFromTenant(tenant) === "bed" && canteenEnabled ? (
                          <View style={[styles.canteenBadge, tenant.hasCanteen ? styles.canteenTaken : styles.canteenNotTaken]}>
                            <Text style={[styles.canteenText, tenant.hasCanteen ? styles.canteenTakenText : styles.canteenNotTakenText]}>
                              Canteen: {tenant.hasCanteen ? "Taken" : "Not taken"}
                            </Text>
                          </View>
                        ) : null}
                        {!awaitingForm && !docStatus.complete ? <Text style={styles.docsMissing} numberOfLines={1}>Docs missing: {docStatus.missing.map((item) => item.label).join(", ")}</Text> : null}
                        <View style={styles.statusRow}>
                          <Text style={[styles.paymentStatus, !needsPayment && styles.paymentPaid, overdue > 0 && styles.paymentOverdue]}>
                            {awaitingForm ? "Waiting for tenant form" : totalDue > 0 ? `Total due ${money(totalDue)}` : paid > 0 ? "Paid till now" : "No due"}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    <Pressable disabled={sharingTenantId === String(tenant._id)} onPress={() => reshareTenantForm(tenant)} style={[styles.rentButton, responsive.isTiny && styles.rentButtonTiny, sharingTenantId === String(tenant._id) && styles.disabledButton]}>
                      {sharingTenantId === String(tenant._id) ? <ActivityIndicator size="small" color={colors.primary} /> : <Share2 size={18} color={colors.primary} />}
                      <Text style={styles.rentButtonText}>Share</Text>
                    </Pressable>
                  </View>
                  {!awaitingForm ? (
                    <View style={styles.monthStrip}>
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
                            style={[styles.monthBox, paidMonth && styles.monthBoxPaid, dueMonth && styles.monthBoxDue, item.status === "Upcoming" && styles.monthBoxUpcoming, inactiveMonth && styles.monthBoxInactive]}
                          >
                            <Text style={styles.monthName} numberOfLines={1}>{item.monthLabel}</Text>
                            <View style={[styles.monthStatusPill, paidMonth && styles.monthPaidPill, dueMonth && styles.monthDuePill, item.status === "Upcoming" && styles.monthUpcomingPill, inactiveMonth && styles.monthInactivePill]}>
                              <Text style={[styles.monthStatusText, paidMonth && styles.monthPaidText, dueMonth && styles.monthDueText, item.status === "Upcoming" && styles.monthUpcomingText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                                {inactiveMonth ? "-" : `${item.status} ${item.statusDate}`}
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
                    </View>
                  ) : null}
                </View>
              );})}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: S.screen },
  content: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 18 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 18, backgroundColor: S.screen, gap: 7 },
  headerTiny: { alignItems: "flex-start" },
  scroller: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingBottom: 34 },
  headerText: { flex: 1, minWidth: 160 },
  title: { fontSize: 28, fontWeight: "900", color: S.text },
  subtitle: { marginTop: 3, color: S.muted, fontSize: 13, fontWeight: "700" },
  addButton: { height: 44, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 14, backgroundColor: S.deep, ...systemShadow },
  addButtonTiny: { flexGrow: 1, justifyContent: "center" },
  historyButton: { width: 42, height: 42, marginRight: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: S.border, borderRadius: 13, backgroundColor: S.card, ...systemShadow },
  addButtonText: { color: colors.surface, fontSize: 13, fontWeight: "700" },
  typeTabs: { marginBottom: 12, flexDirection: "row", gap: 6, padding: 5, borderRadius: 14, backgroundColor: "#F2E8DA" },
  typeTab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  typeTabActive: { backgroundColor: S.card, ...systemShadow },
  typeTabText: { width: "100%", color: S.muted, fontSize: 11, lineHeight: 14, fontWeight: "800", textAlign: "center" },
  typeTabTextActive: { color: S.deep },
  typeTabCount: { width: "100%", marginTop: 2, color: S.subtle, fontSize: 11, fontWeight: "800", textAlign: "center" },
  searchBox: { height: 50, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  searchInput: { flex: 1, height: "100%", marginLeft: 9, fontSize: 15 },
  summary: { minHeight: 78, marginTop: 12, padding: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 18, backgroundColor: S.card, ...systemShadow },
  summaryItem: { flex: 1 },
  summaryDivider: { width: 1, height: 38, marginHorizontal: 12, backgroundColor: S.border },
  summaryLabel: { color: S.muted, fontSize: 11, fontWeight: "800" },
  summaryValue: { marginTop: 6, color: S.orange, fontSize: 16, fontWeight: "900" },
  overdueValue: { color: S.red },
  filters: { marginTop: 10, flexDirection: "row", gap: 7 },
  filter: { minWidth: 108, height: 40, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card },
  filterActive: { borderColor: S.deep, backgroundColor: S.soft },
  filterText: { color: S.muted, fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: S.deep },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingTop: 14, paddingBottom: 34, gap: 12 },
  tenantRow: { minHeight: 82, overflow: "hidden", borderWidth: 1, borderLeftWidth: 4, borderColor: S.border, borderLeftColor: S.deep, borderRadius: 22, backgroundColor: S.card, ...systemShadow, position: "relative" },
  tenantRowTiny: { alignItems: "stretch" },
  tenantOverdue: { borderColor: "#F1D3CB" },
  tenantTopRow: { width: "100%", flexDirection: "row", alignItems: "center" },
  tenantMain: { flex: 1, minWidth: 0, minHeight: 96, padding: 10, flexDirection: "row", alignItems: "center" },
  photoFrame: { width: 66, height: 66, borderRadius: 20, overflow: "hidden", backgroundColor: S.soft },
  tenantPhoto: { width: "100%", height: "100%" },
  photoFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: S.soft },
  photoFallbackText: { color: S.deep, fontSize: 24, fontWeight: "900" },
  avatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: S.soft },
  avatarText: { color: S.deep, fontSize: 17, fontWeight: "900" },
  tenantInfo: { flex: 1, minWidth: 0, marginLeft: 11 },
  tenantName: { color: S.text, fontSize: 15, fontWeight: "900", lineHeight: 19, flexShrink: 1 },
  badgeRow: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 6 },
  cycleBadge: { maxWidth: 128, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden", backgroundColor: "#DDF3F8", color: S.mid, fontSize: 10, fontWeight: "900" },
  unitPill: { alignSelf: "flex-start", maxWidth: "100%", marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: "hidden", backgroundColor: "#F3A6B7", color: colors.surface, fontSize: 11, fontWeight: "900" },
  depositPhoneRow: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 5 },
  depositPhoneText: { maxWidth: 120, color: S.muted, fontSize: 10, fontWeight: "800" },
  depositPhoneDivider: { color: S.subtle, fontSize: 10, fontWeight: "900" },
  inlineFinance: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tenantMeta: { color: S.muted, fontSize: 10, fontWeight: "700", flexShrink: 1 },
  currentPending: { marginTop: 4, color: S.orange, fontSize: 11, fontWeight: "800" },
  statusRow: { marginTop: 5, flexDirection: "row", alignItems: "center" },
  cardDueTopRight: { position: "absolute", top: 5, right: 19, alignItems: "flex-end", zIndex: 2 },
  cardDueLabel: { color: S.muted, fontSize: 10, fontWeight: "800" },
  cardDueAmount: { marginTop: 2, color: S.red, fontSize: 12, fontWeight: "900" },
  monthStrip: { width: "100%", paddingHorizontal: 0, paddingBottom: 0, flexDirection: "row", alignItems: "stretch", gap: 0, borderTopWidth: 1, borderTopColor: S.border },
  monthBox: { flex: 1, minWidth: 0, height: 130, paddingHorizontal: 5, paddingTop: 10, paddingBottom: 9, alignItems: "center", justifyContent: "flex-start", borderWidth: 1, borderColor: "#DADDF7", backgroundColor: "#F7F8FF" },
  monthBoxPaid: { borderColor: "#BEECCF", backgroundColor: "#F0FFF5" },
  monthBoxDue: { borderColor: "#F2CACA", backgroundColor: "#FFF5F4" },
  monthBoxUpcoming: { borderColor: "#D5DDF8", backgroundColor: "#F4F6FF" },
  monthBoxInactive: { borderColor: S.border, backgroundColor: S.pale, opacity: 0.75 },
  monthName: { width: "100%", height: 15, color: S.text, fontSize: 10, lineHeight: 13, fontWeight: "900", textAlign: "center" },
  monthStatusPill: { width: "100%", height: 27, marginTop: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 999 },
  monthPaidPill: { borderColor: "#8FE7B1", backgroundColor: "#E7FFF0" },
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
  canteenBadge: { alignSelf: "flex-start", marginTop: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  canteenTaken: { backgroundColor: S.soft },
  canteenNotTaken: { backgroundColor: S.pale },
  canteenText: { fontSize: 10, fontWeight: "800" },
  canteenTakenText: { color: S.mid },
  canteenNotTakenText: { color: S.muted },
  docsMissing: { marginTop: 5, color: S.red, fontSize: 10, fontWeight: "800" },
  paymentStatus: { marginTop: 5, color: S.orange, fontSize: 11, fontWeight: "800" },
  paymentPaid: { color: S.mid },
  paymentOverdue: { color: S.red },
  rentButton: { width: 64, height: 58, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: S.border },
  rentButtonTiny: { width: 50 },
  rentButtonText: { marginTop: 3, color: S.deep, fontSize: 11, fontWeight: "800" },
  disabledButton: { opacity: 0.35 },
  empty: { flex: 1, minHeight: 250, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 10, color: S.text, fontSize: 17, fontWeight: "900" },
  emptyText: { marginTop: 5, color: S.muted, textAlign: "center" },
  error: { color: S.red, textAlign: "center" },
  retry: { marginTop: 12, color: S.deep, fontWeight: "800" },
});
