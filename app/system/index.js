import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  Clock3,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
  Utensils,
  Users,
  WalletCards,
} from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { getSystemDashboard } from "../../src/api/saasApi";
import { getExpenses } from "../../src/api/expenseApi";
import { getLightBills } from "../../src/api/lightBillApi";
import { getStaffExpenses } from "../../src/api/staffExpenseApi";
import { getRentDues, getRentSummary, getTenants } from "../../src/api/tenantApi";
import { getUnreadNotificationCount } from "../../src/api/notificationApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { colors } from "../../src/theme/colors";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";
import { allowedUnitTypes, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { useResponsive } from "../../src/utils/responsive";

const GREEN = systemColors;

function monthKey(date) {
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${year}`;
}

function money(value) {
  return "Rs. " + Number(value || 0).toLocaleString("en-IN");
}

function isPast(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(23, 59, 59, 999);
  return date < new Date();
}

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function inRange(value, start, end) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function amountOf(item) {
  return Number(item?.amount ?? item?.mainAmount ?? item?.salary ?? 0);
}

function splitPaidPending(items) {
  return items.reduce(
    (sum, item) => {
      const amount = amountOf(item);
      if (item?.status === "paid") return { ...sum, paid: sum.paid + amount };
      return { ...sum, pending: sum.pending + amount };
    },
    { paid: 0, pending: 0 }
  );
}

function statusFromRow(row) {
  const expected = Number(row?.expected || 0);
  const paid = Number(row?.paid || 0);
  if (expected > 0 && paid >= expected) return "Success";
  if (paid > 0) return "Partial";
  return "Pending";
}

function rowAmount(row) {
  const expected = Number(row?.expected || 0);
  const paid = Number(row?.paid || 0);
  return Math.max(expected - paid, 0) || paid || expected;
}

function tenantName(row) {
  return row?.name || row?.tenantName || row?.tenant?.name || row?.roomNo || "Tenant";
}

function IconTile({ Icon, color = GREEN.deep, bg = GREEN.soft, size = 44 }) {
  return (
    <View style={[styles.iconTile, { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: bg }]}>
      <Icon size={Math.round(size * 0.48)} color={color} strokeWidth={2.2} />
    </View>
  );
}

function CityIllustration() {
  return (
    <Svg width="190" height="96" viewBox="0 0 260 130" style={styles.citySvg}>
      <Defs>
        <LinearGradient id="buildingGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#DDEBCD" stopOpacity="0.88" />
          <Stop offset="1" stopColor="#86A578" stopOpacity="0.58" />
        </LinearGradient>
      </Defs>
      <Circle cx="147" cy="54" r="26" fill="#D8C96E" opacity="0.32" />
      <Path d="M205 53l7 4 7-4M225 68l6 3 6-3" stroke="#AEC39A" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <Path d="M20 112h218" stroke="#BFD4B2" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <Path d="M42 112c-3-24 15-28 24-13 4-21 30-23 34 13" fill="#6F8F5E" opacity="0.42" />
      <Path d="M190 112c0-19 11-26 23-19 2-23 30-23 34 19" fill="#5B7C4E" opacity="0.38" />
      <Rect x="90" y="80" width="48" height="32" rx="3" fill="#9DB58B" opacity="0.74" />
      <Path d="M86 81h57l-13-16h-31z" fill="#304F35" opacity="0.7" />
      <Rect x="100" y="91" width="9" height="10" rx="1.5" fill="#F7F0E3" opacity="0.72" />
      <Rect x="119" y="91" width="9" height="10" rx="1.5" fill="#F7F0E3" opacity="0.72" />
      <Rect x="137" y="42" width="55" height="70" rx="3" fill="url(#buildingGlow)" />
      <Path d="M132 44h65l-16-17h-33z" fill="#25472F" opacity="0.78" />
      <Rect x="150" y="55" width="10" height="11" rx="1.5" fill="#F7F0E3" opacity="0.8" />
      <Rect x="170" y="55" width="10" height="11" rx="1.5" fill="#F7F0E3" opacity="0.8" />
      <Rect x="150" y="77" width="10" height="11" rx="1.5" fill="#F7F0E3" opacity="0.66" />
      <Rect x="170" y="77" width="10" height="11" rx="1.5" fill="#F7F0E3" opacity="0.66" />
      <Rect x="205" y="70" width="32" height="42" rx="3" fill="#789767" opacity="0.46" />
      <Rect x="214" y="80" width="6" height="7" rx="1" fill="#E9F0DF" opacity="0.55" />
      <Rect x="226" y="80" width="6" height="7" rx="1" fill="#E9F0DF" opacity="0.55" />
      <Path d="M82 113h154" stroke="#E4EED9" strokeWidth="5" strokeLinecap="round" opacity="0.52" />
    </Svg>
  );
}

function EmptyTransactions() {
  return (
    <View style={styles.emptyTransactionWrap}>
      <Svg width="150" height="98" viewBox="0 0 180 120">
        <Path d="M42 89h96" stroke="#DDE3DE" strokeWidth="4" strokeLinecap="round" />
        <Path d="M48 42h62c10 0 18 8 18 18v32H48z" fill="#E9EEF0" />
        <Path d="M59 31h49l23 20v8H59z" fill="#F5F8F8" />
        <Path d="M108 31v19h22" fill="none" stroke="#D7DEE0" strokeWidth="4" strokeLinejoin="round" />
        <Rect x="68" y="58" width="40" height="5" rx="2.5" fill="#C8D0D3" />
        <Rect x="68" y="72" width="28" height="5" rx="2.5" fill="#D3DADD" />
        <Path d="M38 61h27l8 16h58l11-16h16l-18 39H51z" fill="#CBD4D8" />
        <Path d="M51 100h89" stroke="#B7C2C8" strokeWidth="4" strokeLinecap="round" />
      </Svg>
      <Text style={styles.emptyTitle}>No rent transactions</Text>
      <Text style={styles.emptySubText}>for this month yet.</Text>
    </View>
  );
}

function Donut({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)));
  return (
    <View style={styles.donutWrap}>
      <View style={[styles.donutRing, safe >= 55 ? styles.donutGood : styles.donutWarning]} />
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{safe}%</Text>
        <Text style={styles.donutText}>Total</Text>
      </View>
    </View>
  );
}

function RevenueCard({ collected, expected, pending, collectionRate, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.revenueCard, pressed && styles.pressed]}>
      <View style={styles.revenueTop}>
        <View style={styles.revenueChart}>
          <Donut percent={collectionRate} />
        </View>
        <View style={styles.revenueCopy}>
          <Text style={styles.revenueLabel}>Total Revenue</Text>
          <Text style={styles.revenueValue}>{money(expected || collected)}</Text>
          <View style={styles.growthPill}>
            <TrendingUp size={12} color="#E8F7D9" />
            <Text style={styles.growthText}>{collectionRate}% collected this month</Text>
          </View>
        </View>
      </View>
      <View style={styles.revenueBreakdown}>
        <RevenueMini label="Success" value={collected} percent={collectionRate} color={GREEN.mid} Icon={CheckCircle2} />
        <RevenueMini label="Pending" value={pending} percent={Math.max(0, 100 - collectionRate)} color={GREEN.orange} Icon={Clock3} />
        <RevenueMini label="Refunded" value={0} percent={0} color={GREEN.muted} Icon={RefreshCw} />
      </View>
    </Pressable>
  );
}

function RevenueMini({ label, value, percent, color, Icon }) {
  return (
    <View style={styles.revenueMini}>
      <View style={styles.revenueMiniTop}>
        <View style={[styles.revenueMiniIcon, { backgroundColor: `${color}18` }]}>
          <Icon size={16} color={color} />
        </View>
        <Text style={styles.revenueMiniLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.revenueMiniBottom}>
        <Text style={styles.revenueMiniValue} numberOfLines={1}>{money(value)}</Text>
        <Text style={styles.revenueMiniPercent}>{percent}%</Text>
      </View>
    </View>
  );
}

function HeroCard({ organizationName, totalDue, pendingCount, onPress, onWalletPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}>
      <View style={styles.heroContent}>
        <Text style={styles.heroLabel}>Total Revenue</Text>
        <Text style={styles.heroAmount}>{money(totalDue)}</Text>
        <View style={styles.heroPill}>
          <Text style={styles.heroPillText}>• {pendingCount} pending rents</Text>
        </View>
      </View>
      <Pressable onPress={onWalletPress} style={styles.walletBubble}>
        <WalletCards size={26} color={colors.surface} />
      </Pressable>
      <CityIllustration />
      <Text style={styles.heroOrg} numberOfLines={1}>{organizationName}</Text>
    </Pressable>
  );
}

function KpiCard({ Icon, label, value, color, bg, onPress, width }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpiCard, { width }, pressed && styles.pressed]}>
      <IconTile Icon={Icon} color={color} bg={bg} size={42} />
      <View style={styles.kpiCopy}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
      </View>
      {onPress ? <ChevronRight size={17} color={GREEN.muted} /> : null}
    </Pressable>
  );
}

function TransactionRow({ row, onPress }) {
  const status = statusFromRow(row);
  const success = status === "Success";
  const partial = status === "Partial";
  const tone = success ? GREEN.mid : partial ? GREEN.orange : GREEN.orange;
  const bg = success ? GREEN.soft : GREEN.peach;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.transactionRow, pressed && styles.pressed]}>
      <IconTile Icon={Building2} color={GREEN.deep} bg={GREEN.soft} size={38} />
      <View style={styles.transactionCopy}>
        <Text style={styles.transactionTitle} numberOfLines={1}>{tenantName(row)}</Text>
        <Text style={styles.transactionMeta} numberOfLines={1}>{row?.month || monthKey(new Date())}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text style={styles.transactionAmount}>{money(rowAmount(row))}</Text>
        <View style={[styles.statusPill, { backgroundColor: bg }]}>
          <Text style={[styles.statusText, { color: tone }]}>{status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TrackCard({ onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.trackCard, pressed && styles.pressed]}>
      <Image source={require("../../assets/images/track-illustration.png")} style={styles.trackImage} resizeMode="contain" />
      <View style={styles.trackCopy}>
        <Text style={styles.trackTitle}>Everything on track!</Text>
        <Text style={styles.trackText}>Your tenants, rents and expenses are ready to manage.</Text>
      </View>
      <View style={styles.trackIcon}>
        <TrendingUp size={25} color={colors.surface} />
      </View>
    </Pressable>
  );
}

function ReferralCard({ referral }) {
  if (!referral?.code) return null;
  return (
    <View style={styles.referralCard}>
      <IconTile Icon={WalletCards} color={GREEN.deep} bg={GREEN.soft} size={42} />
      <View style={styles.referralCopy}>
        <Text style={styles.referralTitle}>Your referral code</Text>
        <Text style={styles.referralCode}>{referral.code}</Text>
        <Text style={styles.referralMeta}>Friend joins with this code. You earn {Number(referral.rewardCoins || 100)} coins after their payment.</Text>
      </View>
    </View>
  );
}

export default function SystemAdminScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const [dashboard, setDashboard] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [accounting, setAccounting] = useState(null);
  const [recentRows, setRecentRows] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setRefreshing(true);
      setError("");
      const month = monthKey(new Date());
      const range = currentMonthRange();
      const [dashboardData, dueData, rentData, tenantData, lightData, staffData, expenseData] = await Promise.all([
        getSystemDashboard(),
        getRentDues(),
        getRentSummary(month),
        getTenants(),
        getLightBills(),
        getStaffExpenses(),
        getExpenses(),
      ]);

      const tenants = Array.isArray(tenantData) ? tenantData : [];
      const tenantMap = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
      const dueMap = new Map((dueData?.tenants || []).map((tenant) => [String(tenant.tenantId), tenant]));
      const rentRows = (Array.isArray(rentData?.rows) ? rentData.rows : []).map((row) => {
        const tenant = tenantMap.get(String(row.tenantId));
        const due = dueMap.get(String(row.tenantId));
        return {
          ...row,
          tenant,
          name: tenant?.name || row.name,
          roomNo: tenant?.roomNo,
          bedNo: tenant?.bedNo,
          propertyType: tenant?.propertyType,
          month,
          overdue: Number(due?.totalDue || 0),
          dueMonths: due?.dueMonths || [],
        };
      });
      const rentTotals = rentRows.reduce(
        (sum, row) => ({
          expected: sum.expected + Number(row.expected || 0),
          paid: sum.paid + Number(row.paid || 0),
          pending: sum.pending + Math.max(Number(row.expected || 0) - Number(row.paid || 0), 0),
        }),
        { expected: 0, paid: 0, pending: 0 }
      );

      const thisMonthLights = (Array.isArray(lightData) ? lightData : []).filter((item) => (item.type || "meter") === "meter" && inRange(item.date, range.start, range.end));
      const thisMonthStaff = (Array.isArray(staffData) ? staffData : []).filter((item) => inRange(item.date, range.start, range.end));
      const thisMonthExpenses = (Array.isArray(expenseData) ? expenseData : []).filter((item) => inRange(item.date, range.start, range.end));
      const light = splitPaidPending(thisMonthLights);
      const staff = splitPaidPending(thisMonthStaff);
      const other = splitPaidPending(thisMonthExpenses);

      setDashboard(dashboardData);
      setRecentRows(
        rentRows
          .filter((row) => Number(row.expected || 0) > 0 || Number(row.paid || 0) > 0 || Number(row.overdue || 0) > 0)
          .sort((a, b) => Number(b.overdue || b.balance || 0) - Number(a.overdue || a.balance || 0))
          .slice(0, 6)
      );
      setAccounting({
        monthLabel: new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }),
        rentExpected: rentTotals.expected,
        rentCollected: rentTotals.paid,
        rentPending: rentTotals.pending,
        totalRentDue: Number(dueData?.totalDue || 0),
        dueTenantCount: Number(dueData?.tenantCount || 0),
        currentPendingCount: rentRows.filter((row) => Math.max(Number(row.expected || 0) - Number(row.paid || 0), 0) > 0).length,
        currentPaidCount: rentRows.filter((row) => Number(row.expected || 0) > 0 && Number(row.paid || 0) >= Number(row.expected || 0)).length,
        expensePaid: light.paid + staff.paid + other.paid,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load dashboard.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadDashboard();
  }, [loadDashboard]));

  const loadUnreadNotifications = useCallback(async () => {
    try {
      const data = await getUnreadNotificationCount();
      setUnreadNotifications(Number(data?.count || 0));
    } catch (_err) {
      setUnreadNotifications(0);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadUnreadNotifications();
  }, [loadUnreadNotifications]));

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  const totals = dashboard?.totals || {};
  const unitAccess = dashboard?.units || dashboard;
  const availableUnitTypes = useMemo(() => allowedUnitTypes(unitAccess), [unitAccess]);
  const subscription = dashboard?.subscription || {};
  const subscriptionStatus = String(subscription.status || "").toLowerCase();
  const subscriptionExpired = subscriptionStatus === "expired" || isPast(subscription.endDate);
  const subscriptionNeedsPayment = subscriptionExpired || subscriptionStatus === "pending_payment" || (subscriptionStatus && subscriptionStatus !== "active");
  const collectionRate = accounting?.rentExpected > 0 ? Math.round((accounting.rentCollected / accounting.rentExpected) * 100) : 0;
  const kpiWidth = responsive.isTiny ? "100%" : "48.4%";
  const totalUnits = Number(totals.beds || 0) + Number(totals.rentalRooms || 0) + Number(totals.shops || 0);
  const pendingRentCount = accounting?.dueTenantCount ?? 0;
  const confirmedRentCount = accounting?.currentPaidCount ?? totals.confirmedPaymentCount ?? 0;
  const canteenEnabled = hasCanteenFeature(dashboard);

  const unitCards = [
    { label: "Hostel Beds", type: "bed", value: totals.beds ?? 0, Icon: BedDouble },
    { label: "Residential Rooms", type: "room", value: totals.rentalRooms ?? 0, Icon: Building2 },
    { label: "Commercial Shop", type: "shop", value: totals.shops ?? 0, Icon: Store },
  ].filter((item) => isTypeAllowed(item.type, unitAccess));

  if (!dashboard && !error) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={GREEN.deep} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/system/more")} style={styles.menuButton}>
          <Menu size={24} color={GREEN.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.eyebrow}>SYSTEM CONTROL CENTER</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/system/notifications")} style={styles.headerIcon}>
            <Bell size={21} color={GREEN.text} />
            {unreadNotifications > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={logout} style={styles.headerIcon}>
            <LogOut size={21} color={GREEN.orange} />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dashboard ? (
        <>
          <HeroCard
            organizationName={dashboard.organization?.name || "Property Overview"}
            totalDue={accounting?.rentExpected || accounting?.rentCollected || accounting?.totalRentDue}
            pendingCount={pendingRentCount}
            onPress={() => router.push({ pathname: "/system/payments", params: { filter: pendingRentCount ? "Overdue" : "All" } })}
            onWalletPress={() => router.push("/system/wallet")}
          />

          <View style={styles.kpiGrid}>
            <KpiCard width={kpiWidth} Icon={Building2} label="Units" value={totalUnits} color={GREEN.orange} bg={GREEN.peach} onPress={() => router.push("/system/units")} />
            <KpiCard width={kpiWidth} Icon={Users} label="Active Tenants" value={totals.activeTenants ?? 0} color={GREEN.mid} bg={GREEN.soft} onPress={() => router.push("/system/tenants")} />
            <KpiCard width={kpiWidth} Icon={FileClock} label="Pending Payments" value={pendingRentCount} color={GREEN.orange} bg={GREEN.peach} onPress={() => router.push({ pathname: "/system/payments", params: { filter: "Overdue" } })} />
            <KpiCard width={kpiWidth} Icon={ShieldCheck} label="Confirmed" value={confirmedRentCount} color={GREEN.deep} bg={GREEN.soft} onPress={() => router.push({ pathname: "/system/payments", params: { filter: "Paid" } })} />
          </View>

          <View style={styles.unitStrip}>
            {unitCards.map((item) => (
              <Pressable key={item.type} onPress={() => router.push({ pathname: "/system/units", params: { type: item.type } })} style={({ pressed }) => [styles.unitItem, pressed && styles.pressed]}>
                <item.Icon size={17} color={GREEN.deep} />
                <Text style={styles.unitValue}>{item.value}</Text>
                <Text style={styles.unitLabel} numberOfLines={2}>{stackedPropertyLabel(item.label)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.quickSectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            <Pressable onPress={() => router.push("/system/payments")} style={styles.quickCard}>
              <IconTile Icon={CirclePlus} color={GREEN.deep} bg={GREEN.soft} size={38} />
              <Text style={styles.quickText}>Add Rent</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/system/reports")} style={styles.quickCard}>
              <IconTile Icon={FileText} color={GREEN.deep} bg={GREEN.soft} size={38} />
              <Text style={styles.quickText}>Reports</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/system/expenses")} style={styles.quickCard}>
              <IconTile Icon={ReceiptText} color={GREEN.deep} bg={GREEN.soft} size={38} />
              <Text style={styles.quickText}>Expenses</Text>
            </Pressable>
            {canteenEnabled ? (
              <Pressable onPress={() => router.push("/system/canteen-attendance")} style={styles.quickCard}>
                <IconTile Icon={Utensils} color={GREEN.deep} bg={GREEN.soft} size={38} />
                <Text style={styles.quickText}>Canteen</Text>
              </Pressable>
            ) : null}
          </View>

          <RevenueCard
            collected={accounting?.rentCollected}
            expected={accounting?.rentExpected}
            pending={accounting?.rentPending}
            collectionRate={collectionRate}
            onPress={() => router.push("/system/reports")}
          />

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable onPress={() => router.push("/system/payments")} style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View All</Text>
              <ChevronRight size={15} color={GREEN.deep} />
            </Pressable>
          </View>

          <View style={styles.transactionPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelSubTitle}>{accounting?.monthLabel || "This Month"}</Text>
              <Pressable onPress={loadDashboard} style={styles.refreshButton}>
                {refreshing ? <ActivityIndicator size="small" color={GREEN.deep} /> : <RefreshCw size={18} color={GREEN.deep} />}
              </Pressable>
            </View>
            {!recentRows.length ? <EmptyTransactions /> : null}
            {recentRows.map((row, index) => (
              <TransactionRow
                key={`${row?._id || row?.tenantId || row?.name || "row"}-${index}`}
                row={row}
                onPress={() => {
                  if (row?.tenant?._id || row?.tenantId) {
                    router.push({ pathname: "/system/tenant-details", params: { id: row.tenant?._id || row.tenantId, returnTo: "/system" } });
                  }
                }}
              />
            ))}
          </View>
          

          <TrackCard onPress={() => router.push("/system/reports")} />

          <ReferralCard referral={dashboard.referralCode} />

          <View style={styles.subscriptionCard}>
            <IconTile Icon={LayoutDashboard} color={subscriptionNeedsPayment ? GREEN.orange : GREEN.deep} bg={subscriptionNeedsPayment ? GREEN.peach : GREEN.soft} size={42} />
            <View style={styles.subscriptionCopy}>
              <Text style={styles.subscriptionTitle}>Subscription</Text>
              <Text style={styles.subscriptionMeta}>
                {subscription.status || "Not available"}
                {subscription.endDate ? ` • Ends ${new Date(subscription.endDate).toLocaleDateString("en-IN")}` : ""}
              </Text>
              <Text style={styles.subscriptionMeta}>Available: {availableUnitTypes.map((type) => type.label).join(", ")}</Text>
            </View>
            {subscriptionNeedsPayment ? (
              <Pressable onPress={() => router.push("/subscription-expired")} style={styles.renewButton}>
                <RefreshCw size={15} color={GREEN.deep} />
                <Text style={styles.renewText}>Renew</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const shadow = systemShadow;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GREEN.screen },
  content: { paddingTop: 8, paddingBottom: 104 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: GREEN.screen },
  header: { marginBottom: 12, flexDirection: "row", alignItems: "center" },
  menuButton: { width: 36, height: 42, alignItems: "flex-start", justifyContent: "center" },
  headerTitleWrap: { flex: 1 },
  eyebrow: { color: GREEN.deep, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 2, color: GREEN.text, fontSize: 28, lineHeight: 32, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFF7EC" },
  badge: { position: "absolute", top: -4, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.danger },
  badgeText: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  revenueCard: { marginTop: 14, padding: 12, borderRadius: 18, backgroundColor: GREEN.deep, ...shadow },
  revenueTop: { flexDirection: "row", alignItems: "center", minHeight: 126 },
  revenueChart: { width: 118, alignItems: "center" },
  donutWrap: { width: 108, height: 108, alignItems: "center", justifyContent: "center" },
  donutRing: { position: "absolute", width: 104, height: 104, borderRadius: 52, borderWidth: 18, transform: [{ rotate: "25deg" }] },
  donutGood: { borderColor: "#BBD8A8", borderTopColor: "#F5DB7E", borderRightColor: "#F5DB7E" },
  donutWarning: { borderColor: "#F5DB7E", borderBottomColor: "#BBD8A8", borderLeftColor: "#BBD8A8" },
  donutCenter: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: "#315E37" },
  donutValue: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  donutText: { marginTop: 1, color: "#DCE8D1", fontSize: 10, fontWeight: "800" },
  revenueCopy: { flex: 1, paddingLeft: 8 },
  revenueLabel: { color: "#D9E6CF", fontSize: 14, fontWeight: "800" },
  revenueValue: { marginTop: 8, color: colors.surface, fontSize: 27, fontWeight: "900" },
  growthPill: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)" },
  growthText: { color: "#E8F7D9", fontSize: 11, fontWeight: "800" },
  revenueBreakdown: { marginTop: 10, flexDirection: "row", gap: 7 },
  revenueMini: { flex: 1, minHeight: 70, padding: 8, borderRadius: 11, backgroundColor: "#FFF8EA" },
  revenueMiniTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  revenueMiniIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  revenueMiniLabel: { flex: 1, color: GREEN.text, fontSize: 10, fontWeight: "900" },
  revenueMiniBottom: { marginTop: 9, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 3 },
  revenueMiniValue: { flex: 1, color: GREEN.text, fontSize: 12, fontWeight: "900" },
  revenueMiniPercent: { color: GREEN.muted, fontSize: 9, fontWeight: "800" },
  sectionRow: { marginTop: 16, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: GREEN.text, fontSize: 18, fontWeight: "900" },
  viewAllButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { color: GREEN.deep, fontSize: 12, fontWeight: "900" },
  transactionPanel: { minHeight: 190, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: GREEN.border, backgroundColor: GREEN.card, ...shadow },
  panelHeader: { marginBottom: 3, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelSubTitle: { color: GREEN.muted, fontSize: 12, fontWeight: "800" },
  refreshButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#F6EEE8" },
  transactionRow: { minHeight: 58, paddingVertical: 8, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EFE4D8" },
  transactionCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  transactionTitle: { color: GREEN.text, fontSize: 13, fontWeight: "900" },
  transactionMeta: { marginTop: 3, color: GREEN.muted, fontSize: 11, fontWeight: "700" },
  transactionRight: { alignItems: "flex-end", marginLeft: 8 },
  transactionAmount: { color: GREEN.text, fontSize: 13, fontWeight: "900" },
  statusPill: { marginTop: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 13 },
  statusText: { fontSize: 10, fontWeight: "900" },
  heroCard: { marginTop: 14, minHeight: 166, overflow: "hidden", borderRadius: 15, backgroundColor: GREEN.deep, padding: 16, ...shadow },
  heroContent: { zIndex: 3 },
  heroLabel: { color: "#DDEBD3", fontSize: 13, fontWeight: "800" },
  heroAmount: { marginTop: 8, color: colors.surface, fontSize: 30, fontWeight: "900" },
  heroPill: { alignSelf: "flex-start", marginTop: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)" },
  heroPillText: { color: "#E8F7D9", fontSize: 11, fontWeight: "900" },
  walletBubble: { position: "absolute", top: 18, right: 18, zIndex: 4, width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "rgba(255,255,255,0.16)" },
  citySvg: { position: "absolute", right: -2, bottom: -1, opacity: 0.94 },
  heroOrg: { position: "absolute", left: 16, bottom: 14, maxWidth: "52%", color: "#DBE8D3", fontSize: 11, fontWeight: "800" },
  kpiGrid: { marginTop: 13, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpiCard: { minHeight: 86, marginBottom: 10, padding: 13, flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: GREEN.border, backgroundColor: GREEN.card, ...shadow },
  iconTile: { alignItems: "center", justifyContent: "center" },
  kpiCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  kpiValue: { color: GREEN.text, fontSize: 22, fontWeight: "900" },
  kpiLabel: { marginTop: 2, color: GREEN.muted, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  unitStrip: { marginTop: 2, padding: 10, flexDirection: "row", borderRadius: 15, borderWidth: 1, borderColor: GREEN.border, backgroundColor: "#FFF7EC" },
  unitItem: { flex: 1, alignItems: "center", paddingHorizontal: 3, borderRightWidth: 1, borderRightColor: GREEN.border },
  unitValue: { marginTop: 4, color: GREEN.deep, fontSize: 18, fontWeight: "900" },
  unitLabel: { marginTop: 2, color: GREEN.muted, fontSize: 10, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  quickSectionTitle: { marginTop: 16, color: GREEN.text, fontSize: 18, fontWeight: "900" },
  quickGrid: { marginTop: 10, flexDirection: "row", gap: 8 },
  quickCard: { flex: 1, minHeight: 78, padding: 9, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: GREEN.border, backgroundColor: GREEN.card, ...shadow },
  quickText: { marginTop: 7, color: GREEN.text, fontSize: 11, fontWeight: "900", textAlign: "center" },
  trackCard: { marginTop: 14, minHeight: 88, padding: 11, flexDirection: "row", alignItems: "center", borderRadius: 13, backgroundColor: "#FFEBD5", ...shadow },
  trackImage: { width: 92, height: 64, marginRight: 8 },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: GREEN.text, fontSize: 13, fontWeight: "900" },
  trackText: { marginTop: 4, color: GREEN.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  trackIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: GREEN.deep },
  referralCard: { marginTop: 14, padding: 12, flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: GREEN.border, backgroundColor: GREEN.card, ...shadow },
  referralCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  referralTitle: { color: GREEN.text, fontSize: 13, fontWeight: "900" },
  referralCode: { marginTop: 4, color: GREEN.deep, fontSize: 18, fontWeight: "900" },
  referralMeta: { marginTop: 4, color: GREEN.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  subscriptionCard: { marginTop: 14, padding: 12, flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: GREEN.border, backgroundColor: GREEN.card, ...shadow },
  subscriptionCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  subscriptionTitle: { color: GREEN.text, fontSize: 14, fontWeight: "900" },
  subscriptionMeta: { marginTop: 3, color: GREEN.muted, fontSize: 11, fontWeight: "700" },
  renewButton: { minHeight: 36, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, backgroundColor: GREEN.soft },
  renewText: { color: GREEN.deep, fontSize: 11, fontWeight: "900" },
  emptyText: { paddingVertical: 16, color: GREEN.muted, textAlign: "center", fontWeight: "800" },
  emptyTransactionWrap: { minHeight: 150, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  emptyTitle: { marginTop: 4, color: GREEN.text, fontSize: 14, fontWeight: "900" },
  emptySubText: { marginTop: 3, color: GREEN.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  error: { marginBottom: 12, padding: 12, borderRadius: 12, color: colors.danger, backgroundColor: colors.dangerSoft, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
});

