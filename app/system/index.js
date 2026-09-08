import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  AlertTriangle, ArrowRight, BarChart3, Bell, Building2, ChevronRight,
  CalendarRange, ChevronLeft, CirclePlus, DatabaseBackup, DoorOpen, Lightbulb,
  MoreHorizontal, ReceiptText, Store, UserCircle, Users, Utensils,
  WalletCards, X,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getSystemDashboard } from "../../src/api/saasApi";
import { getLightBills } from "../../src/api/lightBillApi";
import { getRooms } from "../../src/api/roomApi";
import { getRentSummary, getTenants } from "../../src/api/tenantApi";
import { getUnreadNotificationCount } from "../../src/api/notificationApi";
import { colors } from "../../src/theme/colors";
import { normalizePropertyType, propertyTypeFromTenant } from "../../src/utils/unitLabels";
import { allowedUnitTypes, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { useResponsive } from "../../src/utils/responsive";

const UI = {
  screen: "#F6F8F7", card: "#FFFFFF", primary: "#4F7FA6",
  primaryDark: "#244F70", text: "#111B2A", muted: "#63738A",
  border: "#D9E1E7", mint: "#E7F1F8", red: "#FFE8E6",
  danger: "#EF574F", warning: "#DC9800",
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function monthKey(date) {
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function monthRange(date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function tenantIncludedInMonth(tenant, month) {
  const { start, end } = monthRange(month);
  const joined = tenant?.joiningDate ? new Date(tenant.joiningDate) : null;
  const left = tenant?.leaveDate ? new Date(tenant.leaveDate) : null;
  return (!joined || Number.isNaN(joined.getTime()) || joined <= end)
    && (!left || Number.isNaN(left.getTime()) || left >= start);
}

function billIsInMonth(bill, month, key) {
  if (bill?.billingMonth) return bill.billingMonth === key;
  const { start, end } = monthRange(month);
  return inRange(bill?.date, start, end);
}

function unitSlots(unit) {
  const type = normalizePropertyType(unit?.propertyType);
  if (type !== "bed") return 1;
  return Array.isArray(unit?.beds) ? unit.beds.length : Number(unit?.bedCount || 0);
}

function inRange(value, start, end) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function initials(name) {
  return String(name || "T").trim().split(/\s+/).slice(0, 2)
    .map((word) => word[0]).join("").toUpperCase();
}

function tenantName(row) {
  return row?.name || row?.tenantName || row?.tenant?.name || "Tenant";
}

function unitMeta(row) {
  const room = row?.tenant?.roomNo || row?.roomNo;
  const bed = row?.tenant?.bedNo || row?.bedNo;
  const type = row?.tenant?.propertyType || row?.propertyType;
  if (type === "shop") return room ? `Shop ${room}` : "Commercial shop";
  if (room && bed) return `Room ${room} · Bed ${bed}`;
  return room ? `Room ${room}` : row?.month || "Rent payment";
}

function CollectionRing({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={styles.ringWrap}>
      <Svg width={88} height={88} viewBox="0 0 88 88">
        <Circle cx="44" cy="44" r={radius} stroke="#E4EAF0" strokeWidth="9" fill="none" />
        <Circle
          cx="44" cy="44" r={radius} stroke={UI.primary} strokeWidth="9"
          fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - safe / 100)}
          transform="rotate(-90 44 44)"
        />
      </Svg>
      <Text style={styles.ringValue}>{safe}%</Text>
    </View>
  );
}

function FilterTabs({ active, onChange, access }) {
  const tabs = [
    { key: "all", label: "All" }, { key: "bed", label: "Hostel" },
    { key: "room", label: "Rooms" }, { key: "shop", label: "Shops" },
  ].filter((tab) => tab.key === "all" || isTypeAllowed(tab.key, access));
  return (
    <View style={styles.filters}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key} onPress={() => onChange(tab.key)}
          style={[styles.filterButton, active === tab.key && styles.filterButtonActive]}
        >
          <Text style={[styles.filterText, active === tab.key && styles.filterTextActive]}>
            {tab.label}
          </Text>
          {active === tab.key ? <View style={styles.filterIndicator} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

function MetricCard({ Icon, value, label, accent, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.metricCard, pressed && styles.pressed]}>
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Icon size={25} color="#40566D" strokeWidth={1.8} />
      <View style={styles.metricCopy}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

function QuickAction({ Icon, title, subtitle, primary, tint = UI.mint, iconColor = UI.primary, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, primary && styles.quickCardPrimary, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, { backgroundColor: tint }, primary && styles.quickIconPrimary]}>
        <Icon size={22} color={iconColor} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={[styles.quickTitle, primary && styles.onPrimary]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.quickSubtitle, primary && styles.onPrimaryMuted]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <ArrowRight size={19} color="#30485E" />
    </Pressable>
  );
}

function TodayRow({ Icon, bg, color, title, subtitle, onPress, last }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.todayRow, !last && styles.rowBorder, pressed && styles.pressed]}>
      <View style={[styles.todayIcon, { backgroundColor: bg }]}><Icon size={21} color={color} /></View>
      <View style={styles.todayCopy}>
        <Text style={styles.todayTitle}>{title}</Text>
        <Text style={styles.todaySubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={21} color="#667085" />
    </Pressable>
  );
}

function TransactionRow({ row, onPress, last }) {
  const expected = Number(row?.expected || 0);
  const paid = Number(row?.paid || 0);
  const balance = Math.max(expected - paid, 0);
  const isPaid = expected > 0 && paid >= expected;
  const amount = isPaid ? paid : balance || paid || expected;
  const name = tenantName(row);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.transactionRow, !last && styles.rowBorder, pressed && styles.pressed]}>
      <View style={[styles.avatar, { backgroundColor: isPaid ? "#E2EEF7" : "#FFF0D7" }]}>
        <Text style={[styles.avatarText, { color: isPaid ? UI.primary : "#6E5218" }]}>{initials(name)}</Text>
      </View>
      <View style={styles.transactionCopy}>
        <Text style={styles.transactionName} numberOfLines={1}>{name}</Text>
        <Text style={styles.transactionMeta} numberOfLines={1}>{unitMeta(row)}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, !isPaid && styles.amountDue]} numberOfLines={1}>
          {isPaid ? `+${money(amount)}` : `${money(amount)} due`}
        </Text>
        <View style={[styles.statusPill, isPaid ? styles.statusPaid : styles.statusPending]}>
          <Text style={[styles.statusText, isPaid ? styles.statusPaidText : styles.statusPendingText]}>
            {isPaid ? "Paid" : "Pending"}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color="#667085" />
    </Pressable>
  );
}

function DrawerItem({ Icon, title, subtitle, onPress, last = false, tone = "blue" }) {
  const toneStyle = tone === "amber"
    ? { backgroundColor: "#FFF1D8", color: "#B26B00" }
    : tone === "indigo"
      ? { backgroundColor: "#ECECFF", color: "#4653A3" }
      : tone === "slate"
        ? { backgroundColor: "#EEF2F6", color: "#53627A" }
        : { backgroundColor: UI.mint, color: UI.primaryDark };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.drawerItem, !last && styles.drawerItemBorder, pressed && styles.pressed]}>
      <View style={[styles.drawerItemIcon, { backgroundColor: toneStyle.backgroundColor }]}>
        <Icon size={19} color={toneStyle.color} strokeWidth={2} />
      </View>
      <View style={styles.drawerItemCopy}>
        <Text style={styles.drawerItemTitle}>{title}</Text>
        <Text style={styles.drawerItemSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={UI.muted} />
    </Pressable>
  );
}

export default function SystemAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const [dashboard, setDashboard] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [rentRows, setRentRows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [monthLightBills, setMonthLightBills] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [showMonthFilter, setShowMonthFilter] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setRefreshing(true);
      setError("");
      const month = monthKey(selectedMonth);
      const [dashboardData, rentData, tenantData, lightData, unitData] = await Promise.all([
        getSystemDashboard(), getRentSummary(month), getTenants(), getLightBills(), getRooms(),
      ]);
      const loadedTenants = Array.isArray(tenantData) ? tenantData : [];
      const tenantMap = new Map(loadedTenants.map((tenant) => [String(tenant._id), tenant]));
      const loadedRentRows = (Array.isArray(rentData?.rows) ? rentData.rows : []).map((row) => {
        const tenant = tenantMap.get(String(row.tenantId));
        const outstanding = Math.max(Number(row.expected || 0) - Number(row.paid || 0), 0);
        return {
          ...row, tenant, name: tenant?.name || row.name, roomNo: tenant?.roomNo,
          bedNo: tenant?.bedNo, propertyType: tenant?.propertyType, month,
          overdue: outstanding, dueMonths: [],
        };
      });
      const lights = (Array.isArray(lightData) ? lightData : []).filter(
        (item) => (item.type || "meter") === "meter" && billIsInMonth(item, selectedMonth, month)
      );
      setDashboard(dashboardData);
      setRentRows(loadedRentRows);
      setTenants(loadedTenants);
      setUnits(Array.isArray(unitData) ? unitData : []);
      setMonthLightBills(lights);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load dashboard.");
    } finally {
      setRefreshing(false);
    }
  }, [selectedMonth]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getUnreadNotificationCount();
      setUnreadNotifications(Number(data?.count || 0));
    } catch (_err) {
      setUnreadNotifications(0);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadDashboard();
    loadNotifications();
  }, [loadDashboard, loadNotifications]));

  const unitAccess = dashboard?.units || dashboard;
  const availableTypes = useMemo(() => allowedUnitTypes(unitAccess), [unitAccess]);
  const visibleTypes = useMemo(
    () => activeFilter === "all" ? availableTypes.map((item) => item.value) : [activeFilter],
    [activeFilter, availableTypes]
  );
  const visibleRentRows = useMemo(
    () => rentRows.filter((row) => visibleTypes.includes(propertyTypeFromTenant(row.tenant || row))),
    [rentRows, visibleTypes]
  );
  const visibleLightBills = useMemo(
    () => monthLightBills.filter((bill) => visibleTypes.includes(normalizePropertyType(bill.propertyType))),
    [monthLightBills, visibleTypes]
  );
  const accounting = useMemo(() => {
    const rent = visibleRentRows.reduce((sum, row) => ({
      expected: sum.expected + Number(row.expected || 0),
      collected: sum.collected + Number(row.paid || 0),
    }), { expected: 0, collected: 0 });
    const pendingRows = visibleRentRows.filter(
      (row) => Number(row.expected || 0) > Number(row.paid || 0)
    );
    const pendingLights = visibleLightBills.filter((item) => item.status !== "paid");
    return {
      monthLabel: selectedMonth.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      rentExpected: rent.expected,
      rentCollected: rent.collected,
      rentPending: Math.max(rent.expected - rent.collected, 0),
      dueTenantCount: pendingRows.length,
      currentPaidCount: visibleRentRows.filter(
        (row) => Number(row.expected || 0) > 0 && Number(row.paid || 0) >= Number(row.expected || 0)
      ).length,
      lightPendingCount: pendingLights.length,
      lightPending: pendingLights.reduce(
        (sum, item) => sum + Number(item.amount ?? item.mainAmount ?? 0), 0
      ),
    };
  }, [selectedMonth, visibleLightBills, visibleRentRows]);
  const recentRows = useMemo(
    () => visibleRentRows
      .filter((row) => Number(row.expected || 0) || Number(row.paid || 0) || Number(row.overdue || 0))
      .sort((a, b) => Number(b.paid || b.overdue || 0) - Number(a.paid || a.overdue || 0))
      .slice(0, 2),
    [visibleRentRows]
  );
  const rate = accounting?.rentExpected > 0
    ? Math.round((accounting.rentCollected / accounting.rentExpected) * 100) : 0;
  const visibleUnits = units.filter((unit) => visibleTypes.includes(normalizePropertyType(unit.propertyType)));
  const totalUnits = visibleUnits.reduce((sum, unit) => sum + unitSlots(unit), 0);
  const activeTenants = tenants.filter(
    (tenant) => tenant.intakeStatus !== "pending_tenant"
      && visibleTypes.includes(propertyTypeFromTenant(tenant))
      && tenantIncludedInMonth(tenant, selectedMonth)
  ).length;
  const vacant = Math.max(totalUnits - activeTenants, 0);
  const dueCount = Number(accounting?.dueTenantCount || 0);
  const organization = dashboard?.organization?.name || "Property Dashboard";
  const canteenEnabled = hasCanteenFeature(dashboard);
  const selectedLabel = activeFilter === "bed" ? "Hostel beds" : activeFilter === "room" ? "Rooms" : activeFilter === "shop" ? "Shops" : "Total units";
  const shopCount = units.filter((unit) => normalizePropertyType(unit.propertyType) === "shop")
    .reduce((sum, unit) => sum + unitSlots(unit), 0);
  const selectedTypeParams = activeFilter === "all" ? {} : { type: activeFilter };
  const openDrawerRoute = (pathname) => {
    setDrawerOpen(false);
    requestAnimationFrame(() => router.push(pathname));
  };
  const openVacancies = () => {
    if (activeFilter !== "all") {
      router.push({ pathname: "/system/tenants", params: { type: activeFilter, view: "vacant" } });
      return;
    }
    Alert.alert(
      "View vacant units",
      "Select a property type.",
      [
        ...availableTypes.map((item) => ({
          text: item.label,
          onPress: () => router.push({ pathname: "/system/tenants", params: { type: item.value, view: "vacant" } }),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };
  const metrics = [
    {
      label: selectedLabel, value: totalUnits, Icon: Building2, accent: "#9CCBE8",
      onPress: () => router.push({ pathname: "/system/units", params: selectedTypeParams }),
    },
    {
      label: "Occupied", value: activeTenants, Icon: Users, accent: "#A7BBF8",
      onPress: () => router.push({ pathname: "/system/tenants", params: selectedTypeParams }),
    },
    {
      label: "Vacant", value: vacant, Icon: DoorOpen, accent: "#FFD66B",
      onPress: openVacancies,
    },
    activeFilter === "all"
      ? {
        label: "Shops", value: shopCount, Icon: Store, accent: "#FFB0AD",
        onPress: () => router.push({ pathname: "/system/tenants", params: { type: "shop" } }),
      }
      : {
        label: "Pending", value: dueCount, Icon: ReceiptText, accent: "#FFB0AD",
        onPress: () => router.push({ pathname: "/system/payments", params: { type: activeFilter, filter: "Pending" } }),
      },
  ];

  if (!dashboard && !error) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={UI.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding }]}
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={loadDashboard}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => setDrawerOpen(true)}
          style={({ pressed }) => [styles.profileAvatar, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open account menu"
        >
          <Text style={styles.profileInitials}>{initials(organization)}</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>{organization}</Text>
          <Text style={styles.headerSubtitle}>
            {accounting?.monthLabel ? `${accounting.monthLabel.split(" ")[0]} overview` : "Monthly overview"}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowMonthFilter((visible) => !visible)}
          style={[styles.headerIcon, showMonthFilter && styles.headerIconActive]}
          accessibilityLabel="Filter dashboard by month"
        >
          <CalendarRange size={22} color={showMonthFilter ? "#FFFFFF" : UI.text} />
        </Pressable>
        <Pressable onPress={() => router.push("/system/notifications")} style={styles.headerIcon}>
          <Bell size={23} color={UI.text} />
          {unreadNotifications > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text></View>
          )}
        </Pressable>
      </View>

      <FilterTabs
        active={activeFilter} access={unitAccess}
        onChange={setActiveFilter}
      />
      {showMonthFilter ? (
        <View style={styles.monthPicker}>
          <Pressable
            onPress={() => setSelectedMonth((month) => shiftMonth(month, -1))}
            style={styles.monthButton}
            accessibilityLabel="Previous month"
          >
            <ChevronLeft size={20} color={UI.primary} />
          </Pressable>
          <View style={styles.monthCopy}>
            <Text style={styles.monthLabel}>Dashboard month</Text>
            <Text style={styles.monthValue}>{accounting.monthLabel}</Text>
          </View>
          <Pressable
            onPress={() => setSelectedMonth((month) => shiftMonth(month, 1))}
            style={styles.monthButton}
            accessibilityLabel="Next month"
          >
            <ChevronRight size={20} color={UI.primary} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dashboard && (
        <>
          <Pressable onPress={() => router.push("/system/reports")} style={({ pressed }) => [styles.collectionCard, pressed && styles.pressed]}>
            <View style={styles.moreButton}><MoreHorizontal size={23} color={UI.muted} /></View>
            <View style={styles.collectionTop}>
              <View style={styles.ringColumn}>
                <CollectionRing percent={rate} />
                <Text style={styles.ringLabel}>Rent collected</Text>
              </View>
              <View style={styles.collectionDivider} />
              <View style={styles.collectionCopy}>
                <Text style={styles.collectionAmount} adjustsFontSizeToFit numberOfLines={1}>{money(accounting?.rentCollected)}</Text>
                <Text style={styles.collectionExpected}>Expected {money(accounting?.rentExpected)}</Text>
              </View>
            </View>
            <View style={styles.collectionFooter}>
              <View style={styles.collectionStat}><View style={[styles.dot, { backgroundColor: UI.primary }]} /><Text style={styles.collectionStatText}>{accounting?.currentPaidCount || 0} paid</Text></View>
              <View style={styles.footerDivider} />
              <View style={styles.collectionStat}><View style={[styles.dot, { backgroundColor: UI.warning }]} /><Text style={styles.collectionStatText}>{dueCount} pending</Text></View>
            </View>
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsScroll}>
            {metrics.map((item) => <MetricCard key={item.label} {...item} />)}
          </ScrollView>

          <Text style={styles.sectionTitle}>Quick access</Text>
          <View style={styles.quickGrid}>
            <QuickAction Icon={WalletCards} title="Collect Rent" subtitle="Record tenant payments" primary tint="#E2EDF6" iconColor="#456F91" onPress={() => router.push("/system/payments")} />
            <QuickAction Icon={CirclePlus} title="Add Tenant" subtitle="Create a new tenant" tint="#ECECFF" iconColor="#5266B8" onPress={() => router.push("/system/tenant-form")} />
            <QuickAction Icon={ReceiptText} title="Record Expense" subtitle="Add maintenance costs" tint="#FFF2D7" iconColor="#CC8800" onPress={() => router.push("/system/expenses")} />
            <QuickAction Icon={BarChart3} title="Generate Report" subtitle="View financial summary" tint="#E1EFFA" iconColor="#376F9B" onPress={() => router.push("/system/reports")} />
          </View>

          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.panel}>
            <TodayRow Icon={WalletCards} bg={UI.primary} color="#FFF" title={`${accounting?.currentPaidCount || 0} rents received · ${money(accounting?.rentCollected)}`} subtitle="This month's recorded payments" onPress={() => router.push({ pathname: "/system/payments", params: { filter: "Paid" } })} />
            <TodayRow Icon={AlertTriangle} bg={UI.danger} color="#FFF" title={`${dueCount} payments overdue`} subtitle={`Across ${dueCount} tenant${dueCount === 1 ? "" : "s"}`} onPress={() => router.push({ pathname: "/system/payments", params: { filter: "Overdue" } })} />
            <TodayRow Icon={Lightbulb} bg={UI.warning} color="#FFF" title={`${accounting?.lightPendingCount || 0} light bills due`} subtitle={accounting?.lightPending ? `${money(accounting.lightPending)} pending` : "No pending amount"} onPress={() => router.push("/system/light-bills")} last />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleNoMargin}>Recent activity</Text>
            <Pressable onPress={() => router.push("/system/payments")}><Text style={styles.seeAllText}>See all</Text></Pressable>
          </View>
          <View style={styles.panel}>
            {recentRows.length ? recentRows.map((row, index) => (
              <TransactionRow
                key={`${row?._id || row?.tenantId || row?.name || "row"}-${index}`}
                row={row} last={index === recentRows.length - 1}
                onPress={() => {
                  const id = row?.tenant?._id || row?.tenantId;
                  if (id) router.push({ pathname: "/system/tenant-details", params: { id, returnTo: "/system" } });
                }}
              />
            )) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyText}>Payments recorded this month will appear here.</Text>
              </View>
            )}
          </View>

          {canteenEnabled && (
            <Pressable onPress={() => router.push("/system/canteen-attendance")} style={styles.canteenLink}>
              <Text style={styles.canteenText}>Open canteen attendance</Text><ChevronRight size={18} color={UI.primary} />
            </Pressable>
          )}
          <Text style={styles.accessNote}>Available: {availableTypes.map((type) => type.label).join(", ")}</Text>
        </>
      )}

      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDrawerOpen(false)}
            accessibilityLabel="Close account menu"
          />
          <View style={[styles.drawerPanel, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerAvatar}><Text style={styles.drawerAvatarText}>{initials(organization)}</Text></View>
              <View style={styles.drawerHeaderCopy}>
                <Text style={styles.drawerEyebrow}>SYSTEM CONTROL CENTER</Text>
                <Text style={styles.drawerOrganization} numberOfLines={1}>{organization}</Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.drawerClose} accessibilityLabel="Close account menu">
                <X size={21} color={UI.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.drawerSectionTitle}>Account</Text>
              <View style={styles.drawerSectionCard}>
                <DrawerItem Icon={UserCircle} title="Profile Settings" subtitle="Account and subscription" onPress={() => openDrawerRoute("/system/profile")} />
                <DrawerItem Icon={WalletCards} title="Wallet" subtitle="Coins and rewards" tone="amber" last onPress={() => openDrawerRoute("/system/wallet")} />
              </View>

              <Text style={styles.drawerSectionTitle}>Reports & Data</Text>
              <View style={styles.drawerSectionCard}>
                <DrawerItem Icon={BarChart3} title="Monthly reports" subtitle="Rent, dues and occupancy" onPress={() => openDrawerRoute("/system/reports")} />
                <DrawerItem Icon={CalendarRange} title="Custom date report" subtitle="Choose start and end date" tone="slate" onPress={() => openDrawerRoute("/system/custom-reports")} />
                <DrawerItem Icon={DatabaseBackup} title="Backup / export data" subtitle="Tenants, rent, bills and expenses" tone="indigo" last onPress={() => openDrawerRoute("/system/backup-export")} />
              </View>

              {canteenEnabled ? (
                <>
                  <Text style={styles.drawerSectionTitle}>Canteen</Text>
                  <View style={styles.drawerSectionCard}>
                    <DrawerItem Icon={Utensils} title="Canteen settings" subtitle="Plans and meal prices" tone="amber" onPress={() => openDrawerRoute("/system/canteen-settings")} />
                    <DrawerItem Icon={Users} title="Canteen attendance" subtitle="Mark hostel meals" tone="indigo" last onPress={() => openDrawerRoute("/system/canteen-attendance")} />
                  </View>
                </>
              ) : null}

              <Text style={styles.drawerSectionTitle}>Billing & Expenses</Text>
              <View style={styles.drawerSectionCard}>
                <DrawerItem Icon={Lightbulb} title="Light bill settings" subtitle="Electricity billing scenario" tone="amber" onPress={() => openDrawerRoute("/system/light-bill-settings")} />
                <DrawerItem Icon={WalletCards} title="Payments" subtitle="Rent collection status" onPress={() => openDrawerRoute("/system/payments")} />
                <DrawerItem Icon={Users} title="Staff expenses" subtitle="Salary and staff payments" tone="indigo" onPress={() => openDrawerRoute("/system/staff-expenses")} />
                <DrawerItem Icon={ReceiptText} title="Other expenses" subtitle="Repairs, supplies and general" tone="amber" last onPress={() => openDrawerRoute("/system/expenses")} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { paddingTop: 4, paddingBottom: 92 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: UI.screen },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  profileAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#DFEBF4" },
  profileInitials: { color: UI.primaryDark, fontSize: 13, fontWeight: "800" },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  headerTitle: { color: UI.text, fontSize: 17, fontWeight: "900" },
  headerSubtitle: { marginTop: 1, color: UI.muted, fontSize: 11, fontWeight: "600" },
  headerIcon: { width: 36, height: 36, marginLeft: 2, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  headerIconActive: { backgroundColor: UI.primary },
  badge: { position: "absolute", top: 1, right: 0, minWidth: 19, height: 19, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: UI.danger },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  filters: { height: 34, padding: 2, flexDirection: "row", borderRadius: 8, backgroundColor: "#E8EBE9", marginBottom: 9 },
  filterButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  filterButtonActive: { borderWidth: 1, borderColor: UI.primaryDark, backgroundColor: UI.card },
  filterText: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  filterTextActive: { color: UI.text },
  filterIndicator: { position: "absolute", bottom: -2, width: 28, height: 2, borderRadius: 1, backgroundColor: UI.primary },
  monthPicker: { height: 50, marginBottom: 9, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  monthButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  monthCopy: { flex: 1, alignItems: "center", justifyContent: "center" },
  monthLabel: { color: UI.muted, fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  monthValue: { marginTop: 2, color: UI.text, fontSize: 13, fontWeight: "900" },
  collectionCard: { overflow: "hidden", height: 160, paddingHorizontal: 13, paddingTop: 9, borderRadius: 10, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  moreButton: { position: "absolute", top: 3, right: 5, zIndex: 2, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  collectionTop: { height: 116, flexDirection: "row", alignItems: "center" },
  ringColumn: { width: 116, alignItems: "center" },
  ringWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  ringValue: { position: "absolute", color: UI.text, fontSize: 20, fontWeight: "900" },
  ringLabel: { marginTop: 2, color: UI.muted, fontSize: 11, fontWeight: "700" },
  collectionDivider: { width: 1, height: 86, marginHorizontal: 10, backgroundColor: UI.border },
  collectionCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  collectionAmount: { color: UI.text, fontSize: 27, fontWeight: "900" },
  collectionExpected: { marginTop: 5, color: UI.muted, fontSize: 12, fontWeight: "600" },
  collectionFooter: { height: 35, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: UI.border },
  collectionStat: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  collectionStatText: { color: UI.text, fontSize: 12, fontWeight: "800" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  footerDivider: { width: 1, height: 21, backgroundColor: UI.border },
  metricsScroll: { paddingVertical: 10, gap: 8 },
  metricCard: { width: 118, height: 60, overflow: "hidden", paddingHorizontal: 10, paddingTop: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  metricAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  metricCopy: { marginLeft: 8 },
  metricValue: { color: UI.text, fontSize: 16, fontWeight: "900" },
  metricLabel: { marginTop: 1, color: UI.muted, fontSize: 10, fontWeight: "600" },
  sectionTitle: { marginTop: 4, marginBottom: 7, color: UI.text, fontSize: 16, fontWeight: "900" },
  sectionTitleNoMargin: { color: UI.text, fontSize: 16, fontWeight: "900" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  quickCard: { width: "49%", height: 56, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  quickCardPrimary: { borderColor: UI.border, backgroundColor: UI.card },
  quickIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: UI.mint },
  quickIconPrimary: { backgroundColor: UI.mint },
  quickCopy: { flex: 1, minWidth: 0, marginHorizontal: 7 },
  quickTitle: { color: UI.text, fontSize: 11, fontWeight: "900" },
  quickSubtitle: { marginTop: 2, color: UI.muted, fontSize: 8, fontWeight: "600" },
  onPrimary: { color: UI.text },
  onPrimaryMuted: { color: UI.muted },
  panel: { overflow: "hidden", borderRadius: 9, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  todayRow: { height: 49, paddingHorizontal: 11, flexDirection: "row", alignItems: "center" },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: UI.border },
  todayIcon: { width: 31, height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  todayCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  todayTitle: { color: UI.text, fontSize: 11, fontWeight: "900" },
  todaySubtitle: { marginTop: 2, color: UI.muted, fontSize: 9, fontWeight: "600" },
  sectionHeader: { marginTop: 13, marginBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAllText: { color: UI.primary, fontSize: 11, fontWeight: "900", paddingVertical: 5 },
  transactionRow: { height: 54, paddingHorizontal: 11, flexDirection: "row", alignItems: "center" },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 11, fontWeight: "900" },
  transactionCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
  transactionName: { color: UI.text, fontSize: 11, fontWeight: "900" },
  transactionMeta: { marginTop: 2, color: UI.muted, fontSize: 9, fontWeight: "600" },
  transactionRight: { alignItems: "flex-end", marginHorizontal: 7 },
  transactionAmount: { color: UI.primary, fontSize: 10, fontWeight: "900" },
  amountDue: { color: UI.danger },
  statusPill: { marginTop: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPaid: { backgroundColor: "#E4F0F8" },
  statusPending: { backgroundColor: UI.red },
  statusText: { fontSize: 8, fontWeight: "900" },
  statusPaidText: { color: UI.primary },
  statusPendingText: { color: UI.danger },
  emptyState: { minHeight: 120, alignItems: "center", justifyContent: "center", padding: 20 },
  emptyTitle: { color: UI.text, fontSize: 14, fontWeight: "900" },
  emptyText: { marginTop: 5, color: UI.muted, fontSize: 11, textAlign: "center" },
  canteenLink: { marginTop: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 15, backgroundColor: UI.mint },
  canteenText: { color: UI.primary, fontSize: 13, fontWeight: "800" },
  accessNote: { marginTop: 14, color: UI.muted, fontSize: 10, textAlign: "center" },
  error: { marginBottom: 12, padding: 12, borderRadius: 12, color: colors.danger, backgroundColor: colors.dangerSoft, fontSize: 13, fontWeight: "800" },
  drawerOverlay: { flex: 1, alignItems: "flex-end", backgroundColor: "rgba(17, 27, 42, 0.48)" },
  drawerPanel: { width: "86%", maxWidth: 360, height: "100%", paddingHorizontal: 14, backgroundColor: UI.screen, elevation: 18, shadowColor: "#111827", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: -5, height: 0 } },
  drawerHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: UI.border },
  drawerAvatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: UI.mint },
  drawerAvatarText: { color: UI.primaryDark, fontSize: 14, fontWeight: "900" },
  drawerHeaderCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  drawerEyebrow: { color: UI.muted, fontSize: 8, fontWeight: "900" },
  drawerOrganization: { marginTop: 3, color: UI.text, fontSize: 16, fontWeight: "900" },
  drawerClose: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  drawerScroll: { flex: 1 },
  drawerContent: { paddingBottom: 10 },
  drawerSectionTitle: { marginTop: 15, marginBottom: 6, paddingHorizontal: 2, color: UI.text, fontSize: 13, fontWeight: "900" },
  drawerSectionCard: { overflow: "hidden", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card },
  drawerItem: { minHeight: 58, marginHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center" },
  drawerItemBorder: { borderBottomWidth: 1, borderBottomColor: UI.border },
  drawerItemIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  drawerItemCopy: { flex: 1, minWidth: 0, marginLeft: 10, paddingRight: 6 },
  drawerItemTitle: { color: UI.text, fontSize: 12, fontWeight: "900" },
  drawerItemSubtitle: { marginTop: 2, color: UI.muted, fontSize: 9, fontWeight: "600" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
