import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import {
  BadgeIndianRupee,
  Bell,
  Building2,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Funnel,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  Shield,
  SlidersHorizontal,
  BedDouble,
  DoorOpen,
  Store,
  Tags,
  UserCircle,
  Users,
  WalletCards,
  X,
} from "lucide-react-native";

import {
  getBillingTransactions,
  getOrganizations,
  getSuperAdminDashboard,
  renewOrganizationSubscription,
  updateOrganizationStatus,
} from "../../src/api/saasApi";
import { getUnreadNotificationCount } from "../../src/api/notificationApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { colors } from "../../src/theme/colors";
import { useResponsive } from "../../src/utils/responsive";

const COLORS = {
  bg: "#FFF8F1",
  card: "#FFFDF9",
  soft: "#F8EFE6",
  text: colors.text,
  muted: colors.muted,
  subtle: colors.subtle,
  border: "#EFE0D3",
  blue: "#7A365D",
  blueDark: "#4A2138",
  blueSoft: "#F5E6EE",
  green: "#496E3F",
  greenSoft: "#EEF3E8",
  orange: "#D9742F",
  orangeSoft: "#FFF0E4",
  red: colors.danger,
  redSoft: colors.dangerSoft,
  purple: "#7A365D",
  purpleSoft: "#F5E6EE",
  teal: "#7A365D",
  tealSoft: "#F5E6EE",
};

const FILTERS = [
  { value: "all", label: "All", Icon: LayoutGrid, color: COLORS.blue, bg: COLORS.blueSoft },
  { value: "active", label: "Active", Icon: Users, color: COLORS.green, bg: COLORS.greenSoft },
  { value: "pending_payment", label: "Pending", Icon: Clock3, color: COLORS.orange, bg: COLORS.orangeSoft },
  { value: "suspended", label: "Suspended", Icon: Shield, color: COLORS.muted, bg: COLORS.soft },
];

function money(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function statusLabel(value) {
  const label = String(value || "unknown").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function statusTone(value) {
  if (value === "active" || value === "success") return "active";
  if (value === "suspended" || value === "failed") return "suspended";
  if (value === "expired") return "expired";
  return "pending";
}

function getWalletPricing(transaction) {
  const pricing = transaction?.pricing || {};
  const walletCoinsUsed = Number(pricing.walletCoinsUsed || pricing.walletDiscountAmount || 0);
  const subtotal = Number(pricing.subtotal || pricing.originalAmount || transaction?.requestPayload?.originalAmount || 0);
  const payableAmount = Number(pricing.payableAmount ?? transaction?.amount ?? 0);
  return {
    hasWalletDiscount: walletCoinsUsed > 0,
    subtotal,
    payableAmount,
    walletCoinsUsed,
  };
}

function IconBox({ Icon, color = COLORS.blue, bg = COLORS.blueSoft, size = 54 }) {
  return (
    <View style={[styles.iconBox, { width: size, height: size, backgroundColor: bg }]}>
      <Icon size={size > 50 ? 27 : 22} color={color} strokeWidth={2.2} />
    </View>
  );
}

function RevenueIllustration() {
  return (
    <Svg width="100%" height="88" viewBox="0 0 320 88">
      <Defs>
        <LinearGradient id="cardGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.surface} stopOpacity="0.34" />
          <Stop offset="1" stopColor={colors.surface} stopOpacity="0.08" />
        </LinearGradient>
      </Defs>
      <Circle cx="48" cy="48" r="34" fill={colors.surface} opacity="0.12" />
      <Circle cx="276" cy="28" r="42" fill={colors.surface} opacity="0.1" />
      <Rect x="104" y="16" width="108" height="62" rx="15" fill="url(#cardGlow)" />
      <Rect x="122" y="29" width="72" height="9" rx="4.5" fill={colors.surface} opacity="0.9" />
      <Rect x="122" y="46" width="45" height="8" rx="4" fill={colors.surface} opacity="0.62" />
      <Path d="M214 35h44c10 0 18 8 18 18v0c0 10-8 18-18 18h-44z" fill={colors.surface} opacity="0.18" />
      <Circle cx="244" cy="53" r="11" fill={colors.surface} opacity="0.92" />
      <Path d="M239 53h10M244 48v10" stroke={COLORS.blue} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="68" cy="30" r="9" fill={colors.surface} opacity="0.9" />
      <Circle cx="80" cy="49" r="9" fill={colors.surface} opacity="0.7" />
      <Circle cx="56" cy="61" r="9" fill={colors.surface} opacity="0.55" />
      <Path d="M22 78h276" stroke={colors.surface} strokeWidth="2" strokeLinecap="round" opacity="0.38" />
    </Svg>
  );
}

function RevenueBars() {
  const bars = [30, 42, 52, 66, 54, 78];
  return (
    <View style={styles.revenueBars}>
      {bars.map((height, index) => (
        <View key={index} style={[styles.revenueBar, { height }]} />
      ))}
    </View>
  );
}

function PropertyScene() {
  return (
    <Svg width="100%" height="116" viewBox="0 0 330 116">
      <Defs>
        <LinearGradient id="homeGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F7D8CF" stopOpacity="0.92" />
          <Stop offset="1" stopColor="#D2A39E" stopOpacity="0.62" />
        </LinearGradient>
      </Defs>
      <Circle cx="236" cy="46" r="25" fill="#D58570" opacity="0.58" />
      <Path d="M270 40l9 5 9-5M292 54l7 4 7-4" stroke="#CBA8A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.48" />
      <Path d="M40 96h252" stroke="#E9CFC6" strokeWidth="2" strokeLinecap="round" opacity="0.32" />
      <Path d="M65 92c2-17 17-17 19 0M75 92V70" stroke="#B18283" strokeWidth="4" strokeLinecap="round" opacity="0.42" />
      <Path d="M279 93c0-13-8-18-15-13 1-20-18-28-27-12-8-4-16 3-15 19" fill="#A98492" opacity="0.44" />
      <Rect x="84" y="80" width="52" height="13" rx="2" fill="#8A6170" opacity="0.52" />
      <Rect x="92" y="66" width="42" height="25" rx="2" fill="#B98F8A" opacity="0.58" />
      <Path d="M87 67h52l-12-12h-29z" fill="#6C4055" opacity="0.62" />
      <Rect x="103" y="74" width="8" height="9" rx="1.5" fill="#F1D8CF" opacity="0.85" />
      <Rect x="120" y="74" width="8" height="9" rx="1.5" fill="#F1D8CF" opacity="0.85" />
      <Path d="M127 93V50l41-34 42 34v43z" fill="url(#homeGlow)" />
      <Path d="M119 52l49-41 51 41" stroke="#E7C0B4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="144" y="54" width="13" height="15" rx="2" fill="#6B3D54" opacity="0.88" />
      <Rect x="181" y="54" width="13" height="15" rx="2" fill="#6B3D54" opacity="0.88" />
      <Rect x="160" y="74" width="19" height="19" rx="2" fill="#5B2E48" opacity="0.9" />
      <Path d="M210 93V58h63v35z" fill="#B68789" opacity="0.78" />
      <Path d="M207 59h72l-15-17h-43z" fill="#704257" opacity="0.8" />
      <Rect x="225" y="68" width="17" height="12" rx="2" fill="#5D334B" opacity="0.78" />
      <Rect x="249" y="68" width="17" height="12" rx="2" fill="#5D334B" opacity="0.78" />
      <Path d="M118 94h166" stroke="#F1D8D0" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
    </Svg>
  );
}

function TrackIllustration() {
  return (
    <Image
      source={require("../../assets/images/track-illustration.png")}
      style={styles.trackImage}
      resizeMode="contain"
    />
  );
}

function TrackChartIcon() {
  return (
    <View style={styles.trackIcon}>
      <Svg width="28" height="28" viewBox="0 0 34 34">
        <Path d="M5 26h24" stroke={colors.surface} strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
        <Rect x="7" y="18" width="4" height="8" rx="1.5" fill={colors.surface} />
        <Rect x="15" y="13" width="4" height="13" rx="1.5" fill={colors.surface} />
        <Rect x="23" y="8" width="4" height="18" rx="1.5" fill={colors.surface} />
        <Path d="M7 13l6-5 5 4 8-8" stroke={colors.surface} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function TrackCard() {
  return (
    <View style={styles.trackCard}>
      <TrackIllustration />
      <View style={styles.trackCopy}>
        <Text style={styles.trackTitle}>Everything on track!</Text>
        <Text style={styles.trackText}>All your properties and collection are running smoothly.</Text>
      </View>
      <TrackChartIcon />
    </View>
  );
}

function AttentionTile({ Icon, label, value, color, bg }) {
  return (
    <View style={styles.attentionTile}>
      <View style={[styles.attentionIcon, { backgroundColor: bg }]}>
        <Icon size={18} color={color} />
      </View>
      <Text style={styles.attentionValue}>{value}</Text>
      <Text style={styles.attentionLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function ActivityMiniRow({ transaction }) {
  const success = transaction.status === "success";
  const tone = success ? COLORS.green : COLORS.orange;
  const bg = success ? COLORS.greenSoft : COLORS.orangeSoft;
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: bg }]}>
        <BadgeIndianRupee size={17} color={tone} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityTitle} numberOfLines={1}>{transaction.organizationId?.name || "Organization"}</Text>
        <Text style={styles.activityMeta} numberOfLines={1}>{formatDate(transaction.createdAt)} • {statusLabel(transaction.status)}</Text>
      </View>
      <Text style={[styles.activityAmount, success && { color: COLORS.green }]}>{money(transaction.amount)}</Text>
    </View>
  );
}

function StatusBadge({ status }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.statusBadge, styles[`status_${tone}`]]}>
      <Text style={[styles.statusText, styles[`statusText_${tone}`]]}>{statusLabel(status)}</Text>
    </View>
  );
}

function KpiTile({ Icon, label, value, color, bg, style }) {
  return (
    <View style={[styles.kpiTile, style]}>
      <IconBox Icon={Icon} color={color} bg={bg} size={42} />
      <View style={styles.kpiCopy}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
      {label === "Organizations" ? <ChevronRight size={18} color={COLORS.muted} /> : null}
    </View>
  );
}

function QuickAction({ Icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <IconBox Icon={Icon} color={COLORS.blue} bg={COLORS.blueSoft} size={42} />
      <Text style={styles.quickActionText} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function SidebarItem({ Icon, label, active, danger, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sidebarItem, active && styles.sidebarItemActive, pressed && styles.pressed]}>
      <Icon size={20} color={danger ? COLORS.red : active ? COLORS.blue : COLORS.muted} />
      <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive, danger && styles.sidebarItemTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterTile({ item, count, selected, onPress, style }) {
  const Icon = item.Icon || LayoutGrid;
  const displayLabel = item.value === "suspended" ? "Susp." : item.label;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterTile, selected && styles.filterTileSelected, style]}
    >
      <View style={[styles.filterIcon, { backgroundColor: item.bg }]}>
        <Icon size={22} color={item.color} />
      </View>
      <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{displayLabel}</Text>
      <Text style={[styles.filterCount, { color: item.color }]}>{count}</Text>
    </Pressable>
  );
}

function TransactionRow({ transaction }) {
  const success = transaction.status === "success";
  const pending = transaction.status === "pending" || transaction.status === "created";
  const created = transaction.status === "created";
  const failed = transaction.status === "failed" || transaction.status === "cancelled";
  const statusColor = success ? COLORS.green : failed ? COLORS.red : created ? COLORS.blue : COLORS.orange;
  const statusBg = success ? COLORS.greenSoft : failed ? COLORS.redSoft : created ? COLORS.blueSoft : COLORS.orangeSoft;
  const wallet = getWalletPricing(transaction);
  const customer = transaction.organizationId?.ownerName || transaction.organizationId?.name || "Organization";
  const txnId = transaction.providerTransactionId || transaction.merchantTransactionId || transaction._id || "-";

  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionMainRow}>
        <IconBox
          Icon={Building2}
          color={COLORS.blue}
          bg={COLORS.blueSoft}
          size={48}
        />
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionTitle} numberOfLines={1}>
            {transaction.organizationId?.name || "Organization"}
          </Text>
          <Text style={styles.transactionMeta} numberOfLines={1}>
            {formatDate(transaction.createdAt)}
          </Text>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, success && styles.amountSuccess, failed && styles.amountFailed, pending && styles.amountPending]} numberOfLines={1}>
            {money(transaction.amount)}
          </Text>
          {wallet.hasWalletDiscount ? (
            <Text style={styles.transactionWalletText} numberOfLines={1}>
              Wallet -{money(wallet.walletCoinsUsed)}
            </Text>
          ) : null}
          <View style={[styles.transactionStatusPill, { backgroundColor: statusBg }]}>
            <Text style={[styles.transactionStatusText, { color: statusColor }]} numberOfLines={1}>{statusLabel(transaction.status)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.transactionDetailsCard}>
        <View style={styles.transactionDetailRow}>
          <Text style={styles.transactionDetailLabel}>Status</Text>
          <Text style={[styles.transactionDetailValue, failed && styles.detailDanger, success && styles.detailSuccess]}>{statusLabel(transaction.status)}</Text>
        </View>
        <View style={styles.transactionDetailRow}>
          <Text style={styles.transactionDetailLabel}>From</Text>
          <Text style={styles.transactionDetailValue} numberOfLines={1}>{customer}</Text>
        </View>
        <View style={styles.transactionDetailRow}>
          <Text style={styles.transactionDetailLabel}>Amount</Text>
          <Text style={styles.transactionDetailValue}>{money(transaction.amount)}</Text>
        </View>
        <View style={styles.transactionDetailRow}>
          <Text style={styles.transactionDetailLabel}>Time</Text>
          <Text style={styles.transactionDetailValue}>{formatDateTime(transaction.paidAt || transaction.createdAt)}</Text>
        </View>
        <View style={styles.transactionDetailRow}>
          <Text style={styles.transactionDetailLabel}>Txn ID</Text>
          <Text style={styles.transactionDetailValue} numberOfLines={1}>{String(txnId)}</Text>
        </View>
      </View>
    </View>
  );
}

function OrganizationCard({ org, actionId, onOpen, onRenew, onToggleStatus }) {
  const subscription = org.subscription || {};
  const units = subscription.units || org.unitAllocation || {};
  const isExpired = org.status === "expired" || subscription.status === "expired";
  const canRenew = org.status !== "suspended" && isExpired;
  const tone = org.status === "active" ? "active" : org.status === "suspended" ? "suspended" : isExpired ? "expired" : "pending";
  const color = tone === "suspended" ? COLORS.red : COLORS.blue;
  const bg = tone === "suspended" ? COLORS.redSoft : COLORS.blueSoft;

  return (
    <Pressable onPress={onOpen} style={styles.orgCard}>
      <View style={[styles.orgAccent, { backgroundColor: color }]} />
      <View style={styles.orgHeader}>
        <IconBox Icon={Building2} color={color} bg={bg} size={54} />
        <View style={styles.orgInfo}>
          <Text style={styles.orgName} numberOfLines={1}>{org.name}</Text>
          <Text style={styles.orgOwner} numberOfLines={1}>{org.ownerName || "Owner"}</Text>
          <Text style={styles.orgEmail} numberOfLines={1}>{org.email || "-"}</Text>
          <View style={styles.orgPhoneRow}>
            <Phone size={14} color={COLORS.muted} />
            <Text style={styles.orgPhone}>{org.phone || "-"}</Text>
          </View>
        </View>
        <View style={styles.orgRight}>
          <StatusBadge status={isExpired ? "expired" : org.status} />
          <MoreVertical size={18} color={COLORS.muted} />
        </View>
      </View>

      <View style={styles.unitStrip}>
        <View style={styles.unitCell}>
          <BedDouble size={19} color={COLORS.blue} />
          <Text style={styles.unitLabel}>Beds</Text>
          <Text style={styles.unitValue}>{units.beds || 0}</Text>
        </View>
        <View style={styles.unitDivider} />
        <View style={styles.unitCell}>
          <DoorOpen size={19} color={COLORS.blue} />
          <Text style={styles.unitLabel}>Rooms</Text>
          <Text style={styles.unitValue}>{units.rooms || 0}</Text>
        </View>
        <View style={styles.unitDivider} />
        <View style={styles.unitCell}>
          <Store size={19} color={COLORS.blue} />
          <Text style={styles.unitLabel}>Shops</Text>
          <Text style={styles.unitValue}>{units.shops || 0}</Text>
        </View>
      </View>

      <View style={styles.orgFooter}>
        <View style={styles.subscriptionBlock}>
          <Text style={styles.subscriptionText}>
            Subscription: <Text style={styles.subscriptionStatus}>{statusLabel(subscription.status)}</Text>
          </Text>
          <Text style={styles.subscriptionDate}>Ends {formatDate(subscription.endDate)}</Text>
        </View>

        {canRenew ? (
          <Pressable disabled={Boolean(actionId)} onPress={onRenew} style={styles.renewButton}>
            {actionId === `${org._id}-renew`
              ? <ActivityIndicator size="small" color={COLORS.blue} />
              : <Text style={styles.renewText}>Renew</Text>}
          </Pressable>
        ) : null}

      </View>

      {org.status === "active" || org.status === "suspended" ? (
        <Pressable onPress={onToggleStatus} disabled={Boolean(actionId)} style={[styles.inlineStatusAction, org.status === "suspended" && styles.inlineStatusReactivate]}>
          {org.status === "active" ? <ShieldOff size={15} color={COLORS.red} /> : <CheckCircle2 size={15} color={COLORS.green} />}
          <Text style={[styles.inlineStatusText, org.status === "suspended" && { color: COLORS.green }]}>
            {org.status === "active" ? "Suspend account" : "Reactivate account"}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function SuperAdminScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const [dashboard, setDashboard] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [dashboardData, orgData, transactionData] = await Promise.all([
        getSuperAdminDashboard(),
        getOrganizations(),
        getBillingTransactions({ limit: 12 }),
      ]);
      const notificationData = await getUnreadNotificationCount().catch(() => ({ count: 0 }));
      setDashboard(dashboardData);
      setOrganizations(Array.isArray(orgData) ? orgData : []);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setUnreadNotifications(Number(notificationData?.count || 0));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load superadmin dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  function openTab(tab) {
    setSidebarOpen(false);
    setActiveTab(tab);
  }

  function openRoute(pathname) {
    setSidebarOpen(false);
    router.push(pathname);
  }

  async function renewOrg(org) {
    const subscription = org.subscription || {};
    try {
      setActionId(`${org._id}-renew`);
      await renewOrganizationSubscription(org._id, {
        durationMonths: subscription.durationMonths || 12,
        units: subscription.units || org.unitAllocation || {},
      });
      await loadData();
    } catch (err) {
      Alert.alert("Unable to renew", err.response?.data?.message || "Please try again.");
    } finally {
      setActionId("");
    }
  }

  async function changeStatus(org) {
    const nextStatus = org.status === "suspended" ? "active" : "suspended";
    try {
      setActionId(`${org._id}-${nextStatus}`);
      await updateOrganizationStatus(org._id, nextStatus);
      await loadData();
    } catch (err) {
      Alert.alert("Unable to update status", err.response?.data?.message || "Please try again.");
    } finally {
      setActionId("");
    }
  }

  const filteredOrganizations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organizations
      .filter((org) => filter === "all" || org.status === filter)
      .filter((org) => !needle || [org.name, org.ownerName, org.email, org.phone, org.businessType]
        .some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [filter, organizations, query]);

  const counts = useMemo(() => FILTERS.reduce((acc, item) => {
    acc[item.value] = item.value === "all"
      ? organizations.length
      : organizations.filter((org) => org.status === item.value).length;
    return acc;
  }, {}), [organizations]);

  const successRevenue = Number(dashboard?.revenue?.successfulAmount || 0);
  const pendingRevenue = transactions
    .filter((item) => item.status === "created" || item.status === "pending")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalRevenue = successRevenue + pendingRevenue;
  const successPercent = totalRevenue ? Math.round((successRevenue / totalRevenue) * 100) : 0;
  const pendingPercent = totalRevenue ? Math.round((pendingRevenue / totalRevenue) * 100) : 0;

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.blue} /></View>;
  }

  const recentTransactions = transactions.slice(0, activeTab === "transactions" ? 12 : 6);
  const today = new Date();
  const expiringSoonCount = organizations.filter((org) => {
    const endDate = org.subscription?.endDate ? new Date(org.subscription.endDate) : null;
    if (!endDate || Number.isNaN(endDate.getTime())) return false;
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= 30 && org.status !== "suspended";
  }).length;
  const suspendedCount = dashboard?.organizations?.suspended || organizations.filter((org) => org.status === "suspended").length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding, paddingBottom: 188 + Math.max(insets.bottom, 12) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => setSidebarOpen(true)} style={styles.menuButton}>
            <Menu size={24} color={COLORS.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
            <Text style={styles.title}>{activeTab === "organizations" ? "Organizations" : activeTab === "transactions" ? "Transactions" : activeTab === "more" ? "More" : "Superadmin"}</Text>
          </View>
          {activeTab === "organizations" ? (
            <View style={styles.headerActions}>
              <Pressable style={styles.topIconButton}>
                <Search size={21} color={COLORS.text} />
              </Pressable>
              <Pressable onPress={() => router.push("/superadmin/plans")} style={styles.topAddButton}>
                <Plus size={23} color={colors.surface} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.headerActions}>
              <Pressable onPress={() => router.push("/superadmin/notifications")} style={styles.bellButton}>
                <Bell size={21} color={COLORS.text} />
                {unreadNotifications > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable onPress={logout} style={styles.bellButton}>
                <LogOut size={21} color={COLORS.red} />
              </Pressable>
            </View>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeTab === "dashboard" ? (
          <>
            <View style={styles.revenueCard}>
              <View style={styles.revenueOrbLarge} />
              <View style={styles.revenueOrbSmall} />
              <View style={styles.revenueTop}>
                <View>
                  <Text style={styles.revenueLabel}>Total Revenue</Text>
                  <Text style={styles.revenueValue}>{money(successRevenue)}</Text>
                </View>
                <View style={styles.walletBubble}>
                  <WalletCards size={31} color={colors.surface} />
                </View>
              </View>
              <View style={styles.growthPill}>
                <Text style={styles.growthText}>● {dashboard?.revenue?.pendingTransactions || 0} pending transactions</Text>
              </View>
              <View style={styles.revenueBottom}>
                <Image
                  source={require("../../assets/images/superadmin-revenue-home.png")}
                  style={styles.revenueImage}
                  resizeMode="cover"
                />
              </View>
            </View>

            <View style={styles.kpiGrid}>
              <KpiTile style={{ width: responsive.twoColumnWidth }} Icon={Building2} label="Organizations" value={dashboard?.organizations?.total || 0} color={COLORS.orange} bg={COLORS.orangeSoft} />
              <KpiTile style={{ width: responsive.twoColumnWidth }} Icon={Users} label="Active" value={dashboard?.organizations?.active || 0} color={COLORS.green} bg={COLORS.greenSoft} />
              <KpiTile style={{ width: responsive.twoColumnWidth }} Icon={Clock3} label="Pending" value={dashboard?.organizations?.pendingPayment || 0} color={COLORS.blue} bg={COLORS.blueSoft} />
              <KpiTile style={{ width: responsive.twoColumnWidth }} Icon={ShieldOff} label="Suspended" value={dashboard?.organizations?.suspended || 0} color={COLORS.orange} bg={COLORS.orangeSoft} />
            </View>

            <View style={styles.middlePanel}>
              <View style={styles.middleHeader}>
                <Text style={styles.middleTitle}>Needs attention</Text>
                <Pressable onPress={loadData} style={styles.middleRefresh}>
                  <RefreshCw size={15} color={COLORS.blue} />
                </Pressable>
              </View>
              <View style={styles.attentionGrid}>
                <AttentionTile Icon={BadgeIndianRupee} label="Pending payments" value={dashboard?.revenue?.pendingTransactions || 0} color={COLORS.orange} bg={COLORS.orangeSoft} />
                <AttentionTile Icon={Clock3} label="Expiring soon" value={expiringSoonCount} color={COLORS.blue} bg={COLORS.blueSoft} />
                <AttentionTile Icon={ShieldOff} label="Suspended" value={suspendedCount} color={COLORS.green} bg={COLORS.greenSoft} />
              </View>

              <View style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <Text style={styles.activityHeading}>Recent activity</Text>
                  <Pressable onPress={() => setActiveTab("transactions")}>
                    <Text style={styles.activityLink}>View all</Text>
                  </Pressable>
                </View>
                {!recentTransactions.length ? <Text style={styles.activityEmpty}>No recent activity yet.</Text> : null}
                {recentTransactions.slice(0, 3).map((transaction) => <ActivityMiniRow key={transaction._id} transaction={transaction} />)}
              </View>
            </View>
          </>
        ) : null}

        {activeTab === "organizations" ? (
          <>
            <ScrollView horizontal={responsive.isTiny} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterGrid}>
              {FILTERS.map((item) => (
                <FilterTile
                  key={item.value}
                  item={item}
                  count={counts[item.value] || 0}
                  selected={filter === item.value}
                  onPress={() => setFilter(item.value)}
                  style={responsive.isTiny ? styles.filterTileTiny : null}
                />
              ))}
            </ScrollView>
            <View style={styles.searchBox}>
              <Search size={18} color={COLORS.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search organization"
                placeholderTextColor={COLORS.subtle}
                style={styles.searchInput}
              />
              <Pressable onPress={loadData} style={styles.searchFilterButton}>
                <SlidersHorizontal size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <View style={styles.orgList}>
              {!filteredOrganizations.length ? <Text style={styles.empty}>No organizations found.</Text> : null}
              {filteredOrganizations.map((org) => (
                <OrganizationCard
                  key={org._id}
                  org={org}
                  actionId={actionId}
                  onOpen={() => router.push({ pathname: "/superadmin/organization-detail", params: { id: org._id } })}
                  onRenew={() => renewOrg(org)}
                  onToggleStatus={() => changeStatus(org)}
                />
              ))}
            </View>
          </>
        ) : null}

        {activeTab === "transactions" ? (
          <View style={styles.transactionPage}>
            <View style={styles.transactionSkyline}>
              <Building2 size={58} color="rgba(255,255,255,0.07)" />
              <Building2 size={78} color="rgba(255,255,255,0.08)" />
              <Building2 size={52} color="rgba(255,255,255,0.06)" />
            </View>
            <View style={styles.transactionPanel}>
              <View style={styles.transactionPanelHeader}>
                <Text style={styles.transactionPanelTitle}>Recent Transactions</Text>
                {/* <Pressable onPress={loadData} style={styles.transactionRefresh}>
                  <RefreshCw size={25} color={COLORS.blue} />
                </Pressable> */}
              </View>
              {!recentTransactions.length ? <Text style={styles.empty}>No transactions yet.</Text> : null}
              {recentTransactions.map((transaction) => <TransactionRow key={transaction._id} transaction={transaction} />)}
            </View>
          </View>
        ) : null}

        {activeTab === "more" ? (
          <View style={styles.morePanel}>
            <Text style={styles.sectionTitle}>More</Text>
            <Pressable onPress={() => router.push("/superadmin/plans")} style={styles.moreRow}>
              <View style={styles.moreIconBox}><Tags size={26} color={COLORS.blue} /></View>
              <View style={styles.moreCopy}>
                <Text style={styles.moreText}>Subscription Plans</Text>
                <Text style={styles.moreSubText}>View and manage plans</Text>
              </View>
              <ChevronRight size={25} color={COLORS.blue} />
            </Pressable>
            <Pressable onPress={() => router.push("/superadmin/referrals")} style={styles.moreRow}>
              <View style={styles.moreIconBox}><Tags size={26} color={COLORS.blue} /></View>
              <View style={styles.moreCopy}>
                <Text style={styles.moreText}>Referral Codes</Text>
                <Text style={styles.moreSubText}>Manage referral discounts</Text>
              </View>
              <ChevronRight size={25} color={COLORS.blue} />
            </Pressable>
            <Pressable onPress={loadData} style={styles.moreRow}>
              <View style={styles.moreIconBox}><RefreshCw size={28} color={COLORS.blue} /></View>
              <View style={styles.moreCopy}>
                <Text style={styles.moreText}>Refresh Dashboard</Text>
                <Text style={styles.moreSubText}>Get the latest data</Text>
              </View>
              <ChevronRight size={25} color={COLORS.blue} />
            </Pressable>
            <Pressable onPress={() => router.push("/superadmin/notifications")} style={styles.moreRow}>
              <View style={styles.moreIconBox}><Bell size={27} color={COLORS.blue} /></View>
              <View style={styles.moreCopy}>
                <Text style={styles.moreText}>Notifications</Text>
                <Text style={styles.moreSubText}>Manage your alerts</Text>
              </View>
              <ChevronRight size={25} color={COLORS.blue} />
            </Pressable>
            <Pressable onPress={() => router.push("/superadmin/profile")} style={styles.moreRow}>
              <View style={styles.moreIconBox}><UserCircle size={27} color={COLORS.blue} /></View>
              <View style={styles.moreCopy}>
                <Text style={styles.moreText}>Profile Settings</Text>
                <Text style={styles.moreSubText}>Manage your account</Text>
              </View>
              <ChevronRight size={25} color={COLORS.blue} />
            </Pressable>
            <Pressable onPress={logout} style={[styles.moreRow, styles.moreRowLast]}>
              <View style={[styles.moreIconBox, styles.moreIconDanger]}><LogOut size={28} color={COLORS.red} /></View>
              <View style={styles.moreCopy}>
                <Text style={[styles.moreText, { color: COLORS.red }]}>Logout</Text>
                <Text style={styles.moreSubText}>Sign out from your account</Text>
              </View>
              <ChevronRight size={25} color={COLORS.red} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {activeTab === "dashboard" ? (
        <View style={[styles.floatingTrackWrap, { left: responsive.pagePadding, right: responsive.pagePadding }]}>
          <TrackCard />
        </View>
      ) : null}

      <View style={[styles.bottomNav, { left: responsive.pagePadding, right: responsive.pagePadding, bottom: Math.max(insets.bottom, 8) }]}>
        <Pressable onPress={() => setActiveTab("dashboard")} style={styles.navItem}>
          <House size={21} color={activeTab === "dashboard" ? COLORS.blue : COLORS.muted} />
          <Text style={[styles.navText, activeTab === "dashboard" && styles.navActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>Dashboard</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("organizations")} style={styles.navItem}>
          <Building2 size={21} color={activeTab === "organizations" ? COLORS.blue : COLORS.muted} />
          <Text style={[styles.navText, activeTab === "organizations" && styles.navActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
            {responsive.isTiny ? "Orgs" : "Organizations"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push("/superadmin/plans")} style={styles.centerAdd}>
          <Plus size={27} color={colors.surface} />
        </Pressable>
        <Pressable onPress={() => setActiveTab("transactions")} style={styles.navItem}>
          <BadgeIndianRupee size={21} color={activeTab === "transactions" ? COLORS.blue : COLORS.muted} />
          <Text style={[styles.navText, activeTab === "transactions" && styles.navActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
            {responsive.isTiny ? "Txn" : "Transactions"}
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("more")} style={styles.navItem}>
          <MoreVertical size={21} color={activeTab === "more" ? COLORS.blue : COLORS.muted} />
          <Text style={[styles.navText, activeTab === "more" && styles.navActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>More</Text>
        </Pressable>
      </View>

      <Modal visible={sidebarOpen} transparent animationType="fade" onRequestClose={() => setSidebarOpen(false)}>
        <View style={styles.sidebarOverlay}>
          <View style={styles.sidebarPanel}>
            <View style={styles.sidebarTop}>
              <View style={styles.sidebarAvatar}>
                <Text style={styles.sidebarAvatarText}>SA</Text>
              </View>
              <View style={styles.sidebarProfile}>
                <Text style={styles.sidebarName}>Superadmin</Text>
                <Text style={styles.sidebarEmail}>SaaS Control Center</Text>
              </View>
              <Pressable onPress={() => setSidebarOpen(false)} style={styles.sidebarClose}>
                <X size={20} color={COLORS.text} />
              </Pressable>
            </View>

            <View style={styles.sidebarMenu}>
              <SidebarItem Icon={WalletCards} label="Dashboard" active={activeTab === "dashboard"} onPress={() => openTab("dashboard")} />
              <SidebarItem Icon={Building2} label="Organizations" active={activeTab === "organizations"} onPress={() => openTab("organizations")} />
              <SidebarItem Icon={BadgeIndianRupee} label="Transactions" active={activeTab === "transactions"} onPress={() => openTab("transactions")} />
              <SidebarItem Icon={Tags} label="Subscription Plans" onPress={() => openRoute("/superadmin/plans")} />
              <SidebarItem Icon={Tags} label="Referral Codes" onPress={() => openRoute("/superadmin/referrals")} />
              <SidebarItem Icon={Bell} label="Notifications" onPress={() => openRoute("/superadmin/notifications")} />
              <SidebarItem Icon={UserCircle} label="Profile Settings" onPress={() => openRoute("/superadmin/profile")} />
              <SidebarItem Icon={RefreshCw} label="Refresh Data" onPress={() => { setSidebarOpen(false); loadData(); }} />
            </View>

            <View style={styles.sidebarFooter}>
              <SidebarItem Icon={LogOut} label="Logout" danger onPress={logout} />
            </View>
          </View>
          <Pressable style={styles.sidebarScrim} onPress={() => setSidebarOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 188 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  menuButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  title: { marginTop: 2, color: COLORS.text, fontSize: 24, fontWeight: "900" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  bellButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  avatar: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: COLORS.blueSoft },
  avatarText: { color: COLORS.blue, fontSize: 13, fontWeight: "900" },
  topIconButton: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.card },
  topAddButton: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: COLORS.blue },
  badge: { position: "absolute", right: 1, top: 1, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: COLORS.red },
  badgeText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  error: { marginBottom: 12, padding: 12, color: COLORS.red, borderRadius: 12, backgroundColor: COLORS.redSoft },

  revenueCard: { minHeight: 218, padding: 18, borderRadius: 13, overflow: "hidden", backgroundColor: COLORS.blueDark, shadowColor: COLORS.blueDark, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  revenueOrbLarge: { position: "absolute", right: -52, bottom: -78, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.06)" },
  revenueOrbSmall: { position: "absolute", right: 72, bottom: 56, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(216,134,110,0.68)" },
  revenueTop: { zIndex: 1, flexDirection: "row", justifyContent: "space-between" },
  revenueLabel: { color: "#F6D7CF", fontSize: 13, fontWeight: "800" },
  revenueValue: { marginTop: 10, color: colors.surface, fontSize: 31, fontWeight: "900" },
  walletBubble: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)" },
  growthPill: { zIndex: 1, alignSelf: "flex-start", marginTop: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.13)" },
  growthText: { color: "#FBE2D8", fontSize: 12, fontWeight: "900" },
  revenueImageArea: { height: 86, marginTop: 10, justifyContent: "flex-end" },
  revenueBottom: { position: "absolute", right: 0, bottom: 0, width: "72%", height: 112, zIndex: 0, overflow: "hidden" },
  revenueImage: { width: "145%", height: 112, marginLeft: -64, opacity: 0.78 },
  pendingMiniCard: { width: 150, minHeight: 62, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)" },
  pendingCount: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  pendingLabel: { marginTop: 2, color: colors.primarySoft, fontSize: 9, lineHeight: 11, fontWeight: "800" },
  revenueBars: { flex: 1, height: 72, marginLeft: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 9 },
  revenueBar: { width: 13, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.68)" },

  kpiGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  kpiTile: { width: "48%", minHeight: 82, padding: 12, flexDirection: "row", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  kpiAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, opacity: 0.88 },
  iconBox: { alignItems: "center", justifyContent: "center", borderRadius: 12 },
  kpiCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  kpiValue: { color: COLORS.text, fontSize: 19, fontWeight: "900" },
  kpiLabel: { color: COLORS.muted, fontSize: 12.5, fontWeight: "800" },
  middlePanel: { marginTop: 14, gap: 10 },
  middleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  middleTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  middleRefresh: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.blueSoft },
  attentionGrid: { flexDirection: "row", gap: 8 },
  attentionTile: { flex: 1, minHeight: 78, padding: 9, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  attentionIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  attentionValue: { marginTop: 7, color: COLORS.text, fontSize: 16, fontWeight: "900" },
  attentionLabel: { marginTop: 2, color: COLORS.muted, fontSize: 9.5, lineHeight: 12, fontWeight: "800" },
  activityCard: { padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  activityHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  activityHeading: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  activityLink: { color: COLORS.blue, fontSize: 12, fontWeight: "900" },
  activityRow: { minHeight: 42, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.soft },
  activityIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  activityCopy: { flex: 1, minWidth: 0, paddingHorizontal: 9 },
  activityTitle: { color: COLORS.text, fontSize: 12.5, fontWeight: "900" },
  activityMeta: { marginTop: 2, color: COLORS.muted, fontSize: 10.5, fontWeight: "700" },
  activityAmount: { color: COLORS.text, fontSize: 12, fontWeight: "900" },
  activityEmpty: { paddingVertical: 10, color: COLORS.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  sectionHeading: { marginTop: 18, marginBottom: 8 },
  sectionSmallTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  quickGrid: { flexDirection: "row", gap: 10, marginBottom: 2 },
  quickAction: { flex: 1, minHeight: 82, padding: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  quickActionText: { marginTop: 8, color: COLORS.text, fontSize: 10, lineHeight: 13, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },

  floatingTrackWrap: { position: "absolute", bottom: 82, maxWidth: 410, alignSelf: "center" },
  trackCard: { minHeight: 78, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#FFE8D3", shadowColor: COLORS.text, shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  trackImage: { width: 96, height: 62 },
  trackCopy: { flex: 1.25, minWidth: 0, paddingHorizontal: 8 },
  trackTitle: { color: COLORS.text, fontSize: 12, lineHeight: 15, fontWeight: "900" },
  trackText: { marginTop: 4, color: COLORS.muted, fontSize: 10.4, lineHeight: 13.5, fontWeight: "700" },
  trackIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: COLORS.blue },

  sectionCard: { marginTop: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  monthButton: { minHeight: 32, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.card },
  monthText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  donutWrap: { alignItems: "center", paddingVertical: 2 },
  donut: { width: 126, height: 126, alignItems: "center", justifyContent: "center", borderWidth: 18, borderColor: COLORS.blue, borderTopColor: COLORS.orange, borderRadius: 63 },
  donutInner: { alignItems: "center" },
  donutAmount: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  donutText: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  legend: { marginTop: 12, gap: 11 },
  legendRow: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 13 },
  legendLabel: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "700" },
  legendValue: { color: COLORS.text, fontSize: 14, fontWeight: "800" },

  filterGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, gap: 6 },
  filterTile: { flex: 1, minWidth: 0, minHeight: 86, padding: 7, justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  filterTileSelected: { borderColor: COLORS.blue, backgroundColor: "#FFF8FB" },
  filterTileTiny: { flex: 0, width: 86 },
  filterIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  filterLabel: { width: "100%", color: COLORS.muted, fontSize: 10.5, fontWeight: "900" },
  filterLabelSelected: { color: COLORS.blue },
  filterCount: { fontSize: 15, fontWeight: "900" },
  searchBox: { height: 50, marginBottom: 12, paddingLeft: 13, paddingRight: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, height: "100%", marginLeft: 8, color: COLORS.text, fontSize: 13.5 },
  searchFilterButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.soft },
  orgList: { gap: 10 },
  orgCard: { padding: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  orgAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5, opacity: 1 },
  orgHeader: { flexDirection: "row", alignItems: "flex-start", paddingLeft: 7 },
  orgInfo: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  orgName: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  orgOwner: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  orgEmail: { marginTop: 4, color: COLORS.muted, fontSize: 11.5, fontWeight: "700" },
  orgPhoneRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  orgPhone: { color: COLORS.text, fontSize: 12, fontWeight: "900" },
  orgRight: { alignItems: "flex-end", gap: 9 },
  statusBadge: { minHeight: 27, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  status_active: { backgroundColor: COLORS.greenSoft },
  status_pending: { backgroundColor: COLORS.orangeSoft },
  status_suspended: { backgroundColor: COLORS.redSoft },
  status_expired: { backgroundColor: COLORS.orangeSoft },
  statusText: { fontSize: 11, fontWeight: "800" },
  statusText_active: { color: COLORS.green },
  statusText_pending: { color: COLORS.orange },
  statusText_suspended: { color: COLORS.red },
  statusText_expired: { color: COLORS.orange },
  unitStrip: { marginTop: 12, marginLeft: 7, paddingVertical: 9, flexDirection: "row", borderRadius: 13, backgroundColor: COLORS.blueSoft },
  unitCell: { flex: 1, alignItems: "center" },
  unitDivider: { width: 1, backgroundColor: COLORS.border },
  unitLabel: { color: COLORS.blue, fontSize: 10.5, fontWeight: "900" },
  unitValue: { marginTop: 4, color: COLORS.blue, fontSize: 15, fontWeight: "900" },
  orgFooter: { marginTop: 11, marginLeft: 7, flexDirection: "row", alignItems: "center" },
  subscriptionBlock: { flex: 1, minWidth: 0 },
  subscriptionText: { color: COLORS.muted, fontSize: 12.5, fontWeight: "800" },
  subscriptionStatus: { color: COLORS.green },
  subscriptionDate: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  renewButton: { minWidth: 102, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.blue, borderRadius: 8, backgroundColor: COLORS.card },
  renewText: { color: COLORS.blue, fontSize: 13, fontWeight: "800" },
  inlineStatusAction: { alignSelf: "flex-end", marginTop: -34, marginRight: 18, minHeight: 34, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 11, backgroundColor: COLORS.redSoft },
  inlineStatusReactivate: { backgroundColor: COLORS.greenSoft },
  inlineStatusText: { color: COLORS.red, fontSize: 11.5, fontWeight: "900" },

  transactionPage: { marginTop: 12, minHeight: 640 },
  transactionSkyline: { display: "none" },
  transactionPanel: { marginHorizontal: 0, paddingTop: 16, paddingBottom: 8, borderRadius: 20 },
  transactionPanelHeader: { minHeight: 42, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transactionPanelTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: "900" },
  transactionRefresh: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: COLORS.blueSoft },
  transactionRow: { marginBottom: 10, padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  transactionMainRow: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  transactionInfo: { flex: 1, minWidth: 0, paddingHorizontal: 9 },
  transactionTitle: { color: COLORS.text, fontSize: 13.5, fontWeight: "900" },
  transactionMeta: { marginTop: 4, color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  transactionRight: { width: 96, alignItems: "flex-end", justifyContent: "center" },
  transactionStatusPill: { minWidth: 66, maxWidth: 78, minHeight: 27, marginTop: 6, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  transactionStatusText: { fontSize: 10, fontWeight: "900" },
  transactionAmount: { width: "100%", color: COLORS.text, fontSize: 13.5, fontWeight: "900", textAlign: "right" },
  transactionWalletText: { marginTop: 3, width: "100%", color: COLORS.blue, fontSize: 9.5, fontWeight: "900", textAlign: "right" },
  amountSuccess: { color: COLORS.green },
  amountFailed: { color: COLORS.red },
  amountPending: { color: COLORS.text },
  transactionDetailsCard: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.soft },
  transactionDetailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  transactionDetailLabel: { flex: 1, minWidth: 0, color: COLORS.muted, fontSize: 10.5, fontWeight: "800" },
  transactionDetailValue: { flex: 1.4, minWidth: 0, color: COLORS.text, fontSize: 10.5, fontWeight: "800", textAlign: "right" },
  detailSuccess: { color: COLORS.green },
  detailDanger: { color: COLORS.red },
  viewAll: { color: COLORS.blue, fontSize: 13, fontWeight: "800" },
  morePanel: { marginTop: 8, gap: 10 },
  moreRow: { minHeight: 72, padding: 10, flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  moreRowLast: {},
  moreIconBox: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: COLORS.blueSoft },
  moreIconDanger: { backgroundColor: COLORS.redSoft },
  moreCopy: { flex: 1, minWidth: 0 },
  moreText: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  moreSubText: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  empty: { paddingVertical: 22, color: COLORS.muted, textAlign: "center", fontWeight: "700" },
  bottomNav: { position: "absolute", left: 10, right: 10, bottom: 8, maxWidth: 410, alignSelf: "center", minHeight: 64, paddingHorizontal: 4, paddingTop: 7, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  navItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 1 },
  navText: { width: "100%", color: COLORS.muted, fontSize: 9.5, fontWeight: "800", textAlign: "center" },
  navActive: { color: COLORS.blue },
  centerAdd: { width: 48, height: 48, marginHorizontal: 2, marginTop: -29, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: COLORS.blue },
  sidebarOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(16,24,40,0.30)" },
  sidebarScrim: { flex: 1 },
  sidebarPanel: { width: "82%", maxWidth: 330, height: "100%", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 18, backgroundColor: COLORS.card, shadowColor: COLORS.text, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 6, height: 0 }, elevation: 8 },
  sidebarTop: { minHeight: 82, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sidebarAvatar: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 26, backgroundColor: COLORS.blueSoft },
  sidebarAvatarText: { color: COLORS.blue, fontSize: 17, fontWeight: "900" },
  sidebarProfile: { flex: 1, minWidth: 0, marginLeft: 12 },
  sidebarName: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  sidebarEmail: { marginTop: 3, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  sidebarClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: COLORS.soft },
  sidebarMenu: { paddingTop: 14, gap: 8 },
  sidebarFooter: { marginTop: "auto", paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  sidebarItem: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12 },
  sidebarItemActive: { backgroundColor: COLORS.blueSoft },
  sidebarItemText: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  sidebarItemTextActive: { color: COLORS.blue },
  sidebarItemTextDanger: { color: COLORS.red },
});
