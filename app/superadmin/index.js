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
import AssistantChat from "../../src/components/AssistantChat";

const COLORS = {
  // Base — matching System Admin
  bg: "#F6F8F8",
  card: "#FFFFFF",
  soft: "#F0F3F4",

  text: "#101828",
  muted: "#667085",
  subtle: "#98A2B3",
  border: "#D9E1E5",

  // Super Admin identity
  blue: "#147D76",
  blueDark: "#0D625D",
  blueSoft: "#E4F3F1",

  // Status
  green: "#27845C",
  greenSoft: "#E7F5ED",

  orange: "#C98216",
  orangeSoft: "#FFF3DE",

  red: "#D14343",
  redSoft: "#FDEAEA",

  purple: "#6857C7",
  purpleSoft: "#EFEDFF",

  teal: "#147D76",
  tealSoft: "#E4F3F1",
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

function isTrialOrganization(org = {}) {
  const subscription = org.subscription || {};
  return (
    Number(subscription.amount || 0) === 0 &&
    !subscription.planId
  );
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

function IconBox({
  Icon,
  color = COLORS.blue,
  bg = COLORS.blueSoft,
  size = 44,
}) {
  const iconSize =
    size >= 52 ? 23 :
    size >= 44 ? 21 :
    size >= 38 ? 19 : 18;

  return (
    <View
      style={[
        styles.iconBox,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: bg,
        },
      ]}
    >
      <Icon
        size={iconSize}
        color={color}
        strokeWidth={2.1}
      />
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
     <Icon size={15} color={color} />
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

function KpiTile({
  Icon,
  label,
  value,
  color,
  bg,
  style,
}) {
  return (
    <View style={[styles.kpiTile, style]}>
      <IconBox
        Icon={Icon}
        color={color}
        bg={bg}
        size={34}
      />

      <View style={styles.kpiCopy}>
        <Text style={styles.kpiValue}>
          {value}
        </Text>

        <Text style={styles.kpiLabel}>
          {label}
        </Text>
      </View>

      {label === "Organizations" ? (
        <ChevronRight
          size={18}
          color={COLORS.muted}
        />
      ) : null}
    </View>
  );
}
function QuickAction({
  Icon,
  label,
  onPress,
  tone = "teal",
}) {
  const toneMap = {
    teal: {
      color: COLORS.blue,
      bg: COLORS.blueSoft,
    },
    purple: {
      color: COLORS.purple,
      bg: COLORS.purpleSoft,
    },
    green: {
      color: COLORS.green,
      bg: COLORS.greenSoft,
    },
    neutral: {
      color: "#526779",
      bg: "#EDF2F5",
    },
  };

  const selected =
    toneMap[tone] || toneMap.teal;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && {
          opacity: 0.78,
        },
      ]}
    >
      <View
        style={[
          styles.quickActionIconWrap,
          {
            backgroundColor: selected.bg,
          },
        ]}
      >
        <Icon
          size={21}
          color={selected.color}
          strokeWidth={2.1}
        />
      </View>

      <Text
        style={styles.quickActionText}
        numberOfLines={1}
      >
        {label}
      </Text>

      <ChevronRight
        size={17}
        color={COLORS.muted}
      />
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
  const isTrial = isTrialOrganization(org);

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
          <View style={[styles.planTypeBadge, isTrial ? styles.planTypeTrial : styles.planTypePaid]}>
            <Text style={[styles.planTypeText, isTrial ? styles.planTypeTrialText : styles.planTypePaidText]}>
              {isTrial ? "Trial" : "Paid"}
            </Text>
          </View>
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
  const [organizationView, setOrganizationView] = useState("trial");
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

  const organizationTypeCounts = useMemo(() => organizations.reduce((acc, org) => {
    const key = isTrialOrganization(org) ? "trial" : "paid";
    acc[key] += 1;
    return acc;
  }, { trial: 0, paid: 0 }), [organizations]);

  const visibleOrganizations = useMemo(() => (
    filteredOrganizations.filter((org) => (
      organizationView === "trial"
        ? isTrialOrganization(org)
        : !isTrialOrganization(org)
    ))
  ), [filteredOrganizations, organizationView]);

  const organizationViewMeta = organizationView === "trial"
    ? {
        title: "Trial accounts",
        subtitle: "Free trial users who have not purchased a plan yet",
        empty: "No trial organizations found.",
      }
    : {
        title: "Paid accounts",
        subtitle: "Organizations with an active paid plan or payment history",
        empty: "No paid organizations found.",
      };

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
    <ScrollView
  contentContainerStyle={[
    styles.content,
    {
      paddingHorizontal: responsive.pagePadding,

      paddingBottom:
        88 +
        Math.max(insets.bottom, 8),
    },
  ]}
  showsVerticalScrollIndicator={false}
>
    {activeTab !== "dashboard" ? (
  <View style={styles.header}>
    <Pressable
      onPress={() => setSidebarOpen(true)}
      style={styles.menuButton}
    >
      <Menu size={24} color={COLORS.text} />
    </Pressable>

    <View style={styles.headerText}>
      <Text style={styles.eyebrow}>
        SAAS CONTROL CENTER
      </Text>

      <Text style={styles.title}>
        {activeTab === "organizations"
          ? "Organizations"
          : activeTab === "transactions"
            ? "Transactions"
            : activeTab === "more"
              ? "More"
              : "Superadmin"}
      </Text>
    </View>

    {activeTab === "organizations" ? (
      <View style={styles.headerActions}>
        <Pressable style={styles.topIconButton}>
          <Search size={21} color={COLORS.text} />
        </Pressable>

        <Pressable
          onPress={() => router.push("/superadmin/plans")}
          style={styles.topAddButton}
        >
          <Plus size={23} color={colors.surface} />
        </Pressable>
      </View>
    ) : (
      <View style={styles.headerActions}>
        <Pressable
          onPress={() =>
            router.push("/superadmin/notifications")
          }
          style={styles.bellButton}
        >
          <Bell size={21} color={COLORS.text} />

          {unreadNotifications > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadNotifications > 99
                  ? "99+"
                  : unreadNotifications}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={logout}
          style={styles.bellButton}
        >
          <LogOut size={21} color={COLORS.red} />
        </Pressable>
      </View>
    )}
  </View>
) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

       {activeTab === "dashboard" ? (
  <>
    {/* ===========================
        DASHBOARD HEADER
    ============================ */}

    <View style={styles.dashboardHeader}>
      <View style={styles.dashboardHeaderCopy}>
        <Text style={styles.dashboardEyebrow}>
          SUPER ADMIN
        </Text>

        <Text style={styles.dashboardTitle}>
          Dashboard
        </Text>

        <Text style={styles.dashboardSubtitle}>
          Overview of all organizations and revenue
        </Text>
      </View>

      <View style={styles.dashboardHeaderActions}>
        <Pressable
          onPress={() =>
            router.push("/superadmin/notifications")
          }
          style={styles.dashboardHeaderButton}
        >
          <Bell
            size={21}
            color={COLORS.text}
          />

          {unreadNotifications > 0 ? (
            <View
              style={styles.dashboardNotificationDot}
            />
          ) : null}
        </Pressable>

        <View style={styles.dashboardAvatar}>
          <Text style={styles.dashboardAvatarText}>
            SA
          </Text>
        </View>
      </View>
    </View>


    {/* ===========================
        HERO
    ============================ */}

    <View style={styles.dashboardHero}>
      <View style={styles.dashboardHeroContent}>
        <Text style={styles.dashboardHeroTitle}>
          Your platform{"\n"}is growing! 🚀
        </Text>

        <Text style={styles.dashboardHeroDescription}>
          More organizations, higher revenue,
          stronger communities.
        </Text>

        <Pressable
          onPress={() =>
            setActiveTab("transactions")
          }
          style={styles.dashboardHeroButton}
        >
          <Text style={styles.dashboardHeroButtonText}>
            View Insights
          </Text>

          <ChevronRight
            size={16}
            color={COLORS.blue}
          />
        </Pressable>
      </View>

      <View style={styles.dashboardHeroRevenue}>
        <View style={styles.dashboardHeroRevenueIcon}>
          <BadgeIndianRupee
            size={19}
            color="#FFFFFF"
          />
        </View>

        <View>
          <Text style={styles.dashboardHeroRevenueValue}>
            {money(successRevenue)}
          </Text>

          <Text style={styles.dashboardHeroRevenueLabel}>
            Total Revenue
          </Text>
        </View>
      </View>

      <View style={styles.dashboardHeroScene}>
        <PropertyScene />
      </View>
    </View>


    {/* ===========================
        KPI
    ============================ */}

  <View style={styles.kpiGrid}>
  <KpiTile
    Icon={Building2}
    label="Organizations"
    value={dashboard?.organizations?.total || 0}
    color="#34789A"
    bg="#E7F3F8"
  />

  <KpiTile
    Icon={Users}
    label="Active"
    value={dashboard?.organizations?.active || 0}
    color={COLORS.green}
    bg={COLORS.greenSoft}
  />

  <KpiTile
    Icon={Clock3}
    label="Pending"
    value={
      dashboard?.organizations?.pendingPayment || 0
    }
    color={COLORS.orange}
    bg={COLORS.orangeSoft}
  />

  <KpiTile
    Icon={ShieldOff}
    label="Suspended"
    value={
      dashboard?.organizations?.suspended || 0
    }
    color={COLORS.red}
    bg={COLORS.redSoft}
  />
</View>

    {/* ===========================
        REVENUE TREND
    ============================ */}

    <View style={styles.revenueTrendCard}>
      <View style={styles.revenueTrendHeader}>
        <View>
          <Text style={styles.revenueTrendTitle}>
            Revenue Trend
          </Text>

          <Text style={styles.revenueTrendSubtitle}>
            Monthly revenue from all organizations
          </Text>
        </View>

        <View style={styles.revenuePeriodButton}>
          <Text style={styles.revenuePeriodText}>
            Last 6 Months
          </Text>

          <ChevronRight
            size={14}
            color={COLORS.blue}
          />
        </View>
      </View>

   <View style={styles.revenueChartWrap}>
  <View style={styles.revenueChartGrid}>
    <View style={styles.revenueGridLine} />
    <View style={styles.revenueGridLine} />
    <View style={styles.revenueGridLine} />
    <View style={styles.revenueGridLine} />

    <View style={styles.revenueBarsArea}>
      {[34, 44, 53, 65, 77, 90].map(
        (height, index) => (
          <View
            key={index}
            style={styles.revenueChartColumn}
          >
            <View
              style={[
                styles.revenueChartBar,
                {
                  height: `${height}%`,
                },
              ]}
            />
          </View>
        )
      )}
    </View>
  </View>

  <View style={styles.revenueMonthsRow}>
    {["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map(
      (month) => (
        <Text
          key={month}
          style={styles.revenueChartMonth}
        >
          {month}
        </Text>
      )
    )}
  </View>
</View>
      <View style={styles.revenueGrowthBox}>
        <View style={styles.revenueGrowthIcon}>
          <BadgeIndianRupee
            size={17}
         color={COLORS.blue}
          />
        </View>

        <View style={styles.revenueGrowthCopy}>
          <Text style={styles.revenueGrowthTitle}>
            +18% Revenue Growth
          </Text>

          <Text style={styles.revenueGrowthText}>
            Your platform revenue has increased compared
            to last month.
          </Text>
        </View>

        <ChevronRight
          size={18}
    color={COLORS.blue}
        />
      </View>
    </View>


    {/* ===========================
        NEEDS ATTENTION
    ============================ */}

    <View style={styles.dashboardSectionHeader}>
      <Text style={styles.dashboardSectionTitle}>
        Needs Attention
      </Text>

      <Pressable
        onPress={loadData}
        style={styles.middleRefresh}
      >
        <RefreshCw
          size={15}
          color={COLORS.blue}
        />
      </Pressable>
    </View>

    <View style={styles.attentionGrid}>
      <AttentionTile
        Icon={BadgeIndianRupee}
        label="Pending payments"
        value={
          dashboard?.revenue?.pendingTransactions || 0
        }
        color={COLORS.orange}
        bg={COLORS.orangeSoft}
      />

      <AttentionTile
        Icon={ShieldOff}
        label="Suspended"
        value={suspendedCount}
        color={COLORS.green}
        bg={COLORS.greenSoft}
      />
    </View>


    {/* ===========================
        RECENT ACTIVITY
    ============================ */}

    <View style={styles.dashboardSectionHeader}>
      <Text style={styles.dashboardSectionTitle}>
        Recent Activity
      </Text>

      <Pressable
        onPress={() =>
          setActiveTab("transactions")
        }
      >
        <Text style={styles.dashboardViewAll}>
          View all
        </Text>
      </Pressable>
    </View>

    <View style={styles.activityCard}>
      {!recentTransactions.length ? (
        <Text style={styles.activityEmpty}>
          No recent activity yet.
        </Text>
      ) : null}

      {recentTransactions
        .slice(0, 3)
        .map((transaction) => (
          <ActivityMiniRow
            key={transaction._id}
            transaction={transaction}
          />
        ))}
    </View>


    {/* ===========================
        QUICK ACTIONS
    ============================ */}

    <View style={styles.dashboardSectionHeader}>
      <Text style={styles.dashboardSectionTitle}>
        Quick Actions
      </Text>
    </View>

 <View style={styles.dashboardSectionHeader}>
  <Text style={styles.dashboardSectionTitle}>
    Quick Actions
  </Text>

  <Pressable>
    <Text style={styles.dashboardViewAll}>
      View all
    </Text>
  </Pressable>
</View>

<View style={styles.dashboardQuickGrid}>
  <QuickAction
    Icon={Building2}
    label="Organizations"
    tone="teal"
    onPress={() =>
      setActiveTab("organizations")
    }
  />

  <QuickAction
    Icon={Tags}
    label="Plans"
    tone="purple"
    onPress={() =>
      router.push("/superadmin/plans")
    }
  />

  <QuickAction
    Icon={BadgeIndianRupee}
    label="Transactions"
    tone="green"
    onPress={() =>
      setActiveTab("transactions")
    }
  />

  <QuickAction
    Icon={SlidersHorizontal}
    label="Settings"
    tone="neutral"
    onPress={() =>
      setActiveTab("more")
    }
  />
</View>
    {/* ===========================
        TRACK
    ============================ */}

    <View style={styles.dashboardTrackWrap}>
      <TrackCard />
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
            <View style={styles.orgTypeTabs}>
              <Pressable
                onPress={() => setOrganizationView("trial")}
                style={[styles.orgTypeTab, organizationView === "trial" && styles.orgTypeTabActive]}
              >
                <Clock3 size={16} color={organizationView === "trial" ? COLORS.blue : COLORS.muted} />
                <Text style={[styles.orgTypeTabText, organizationView === "trial" && styles.orgTypeTabTextActive]}>
                  Trial
                </Text>
                <View style={[styles.orgTypeCount, organizationView === "trial" && styles.orgTypeCountActive]}>
                  <Text style={[styles.orgTypeCountText, organizationView === "trial" && styles.orgTypeCountTextActive]}>
                    {organizationTypeCounts.trial}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setOrganizationView("paid")}
                style={[styles.orgTypeTab, organizationView === "paid" && styles.orgTypeTabActive]}
              >
                <BadgeIndianRupee size={16} color={organizationView === "paid" ? COLORS.blue : COLORS.muted} />
                <Text style={[styles.orgTypeTabText, organizationView === "paid" && styles.orgTypeTabTextActive]}>
                  Paid
                </Text>
                <View style={[styles.orgTypeCount, organizationView === "paid" && styles.orgTypeCountActive]}>
                  <Text style={[styles.orgTypeCountText, organizationView === "paid" && styles.orgTypeCountTextActive]}>
                    {organizationTypeCounts.paid}
                  </Text>
                </View>
              </Pressable>
            </View>
            <View style={styles.orgList}>
              <View style={styles.orgSectionHeader}>
                <View style={styles.orgSectionCopy}>
                  <Text style={styles.orgSectionTitle}>{organizationViewMeta.title}</Text>
                  <Text style={styles.orgSectionSubtitle}>{organizationViewMeta.subtitle}</Text>
                </View>
                <View style={styles.orgSectionCount}>
                  <Text style={styles.orgSectionCountText}>{visibleOrganizations.length}</Text>
                </View>
              </View>
              {!visibleOrganizations.length ? <Text style={styles.empty}>{organizationViewMeta.empty}</Text> : null}
              {visibleOrganizations.map((org) => (
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

     

<View
  style={[
    styles.bottomNav,
    {
      paddingBottom: Math.max(insets.bottom, 6),
    },
  ]}
>
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
      <AssistantChat />
    </View>
  );
}

const styles = StyleSheet.create({
  /* ==========================================================
     BASE
  ========================================================== */

  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },

  content: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingTop: 6,
  },

  error: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,

    color: COLORS.red,
    fontSize: 12,
    fontWeight: "700",

    borderRadius: 10,
    backgroundColor: COLORS.redSoft,
  },

  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },

  /* ==========================================================
     NORMAL PAGE HEADER
  ========================================================== */

  header: {
    minHeight: 52,
    marginBottom: 7,

    flexDirection: "row",
    alignItems: "center",
  },

  menuButton: {
    width: 36,
    height: 36,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 10,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 5,
  },

  eyebrow: {
    color: COLORS.blue,

    fontSize: 10,
    fontWeight: "900",

    letterSpacing: 0.7,
  },

  title: {
    marginTop: 1,

    color: COLORS.text,

    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  bellButton: {
    width: 36,
    height: 36,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 10,
  },

  avatar: {
    width: 38,
    height: 38,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 19,

    backgroundColor: COLORS.blueSoft,
  },

  avatarText: {
    color: COLORS.blue,

    fontSize: 13,
    fontWeight: "900",
  },

  topIconButton: {
    width: 40,
    height: 40,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,
    backgroundColor: COLORS.card,
  },

  topAddButton: {
    width: 40,
    height: 40,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 12,
    backgroundColor: COLORS.blue,
  },

  badge: {
    position: "absolute",

    right: 0,
    top: 0,

    minWidth: 16,
    height: 16,

    paddingHorizontal: 4,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,
    backgroundColor: COLORS.red,
  },

  badgeText: {
    color: "#FFFFFF",

    fontSize: 9,
    fontWeight: "800",
  },

  /* ==========================================================
     REUSABLE ICON BOX
  ========================================================== */

  iconBox: {
    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",
  },

  /* ==========================================================
     DASHBOARD HEADER
  ========================================================== */

  dashboardHeader: {
    minHeight: 70,
    marginBottom: 8,

    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  dashboardHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  dashboardEyebrow: {
    color: COLORS.blue,

    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",

    letterSpacing: 0.8,
  },

  dashboardTitle: {
    marginTop: 2,

    color: COLORS.text,

    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
  },

  dashboardSubtitle: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },

  dashboardHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  dashboardHeaderButton: {
    width: 38,
    height: 38,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 19,
    backgroundColor: COLORS.card,
  },

  dashboardAvatar: {
    width: 38,
    height: 38,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 19,
    backgroundColor: COLORS.blueSoft,
  },

  dashboardAvatarText: {
    color: COLORS.blue,

    fontSize: 12,
    fontWeight: "900",
  },

  dashboardNotificationDot: {
    position: "absolute",

    top: 4,
    right: 4,

    width: 7,
    height: 7,

    borderWidth: 2,
    borderColor: "#FFFFFF",

    borderRadius: 4,
    backgroundColor: COLORS.red,
  },

  /* ==========================================================
     HERO
  ========================================================== */

  dashboardHero: {
    position: "relative",

    minHeight: 124,

    marginBottom: 8,

    paddingHorizontal: 12,
    paddingVertical: 10,

    overflow: "hidden",

    borderWidth: 1,
    borderColor: "#D2E2E0",

    borderRadius: 14,

    backgroundColor: "#EAF4F3",
  },

  dashboardHeroContent: {
    width: "54%",
    zIndex: 4,
  },

  dashboardHeroTitle: {
    color: COLORS.text,

    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
  },

  dashboardHeroDescription: {
    marginTop: 4,

    color: COLORS.muted,

    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
  },

  dashboardHeroButton: {
    alignSelf: "flex-start",

    minHeight: 30,

    marginTop: 8,

    paddingHorizontal: 10,

    flexDirection: "row",
    alignItems: "center",

    gap: 3,

    borderRadius: 15,
    backgroundColor: COLORS.blue,
  },

  dashboardHeroButtonText: {
    color: "#FFFFFF",

    fontSize: 9.5,
    fontWeight: "900",
  },

  dashboardHeroRevenue: {
    position: "absolute",

    top: 9,
    right: 9,

    zIndex: 5,

    minHeight: 39,

    paddingHorizontal: 8,

    flexDirection: "row",
    alignItems: "center",

    gap: 5,

    borderWidth: 1,
    borderColor: "#D8E6E4",

    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },

  dashboardHeroRevenueIcon: {
    width: 28,
    height: 28,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 14,
    backgroundColor: COLORS.blue,
  },

  dashboardHeroRevenueValue: {
    color: COLORS.text,

    fontSize: 11,
    fontWeight: "900",
  },

  dashboardHeroRevenueLabel: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 7.5,
    fontWeight: "600",
  },

  dashboardHeroScene: {
    position: "absolute",

    right: -34,
    bottom: -15,

    width: "69%",
    opacity: 0.58,
  },

  /* ==========================================================
     OLD REVENUE COMPONENT
  ========================================================== */

  revenueCard: {
    minHeight: 160,
    padding: 14,

    overflow: "hidden",

    borderRadius: 15,
    backgroundColor: COLORS.blueDark,
  },

  revenueOrbLarge: {
    position: "absolute",

    right: -52,
    bottom: -78,

    width: 220,
    height: 220,

    borderRadius: 110,

    backgroundColor: "rgba(255,255,255,0.06)",
  },

  revenueOrbSmall: {
    position: "absolute",

    right: 72,
    bottom: 56,

    width: 42,
    height: 42,

    borderRadius: 21,

    backgroundColor: "rgba(255,255,255,0.10)",
  },

  revenueTop: {
    zIndex: 1,

    flexDirection: "row",
    justifyContent: "space-between",
  },

  revenueLabel: {
    color: "#D9EFEC",

    fontSize: 12,
    fontWeight: "800",
  },

  revenueValue: {
    marginTop: 7,

    color: "#FFFFFF",

    fontSize: 27,
    fontWeight: "900",
  },

  walletBubble: {
    width: 40,
    height: 40,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",

    borderRadius: 12,

    backgroundColor: "rgba(255,255,255,0.12)",
  },

  growthPill: {
    zIndex: 1,

    alignSelf: "flex-start",

    marginTop: 12,

    paddingHorizontal: 9,
    paddingVertical: 5,

    borderRadius: 8,

    backgroundColor: "rgba(255,255,255,0.10)",
  },

  growthText: {
    color: "#E5F4F2",

    fontSize: 10,
    fontWeight: "900",
  },

  revenueImageArea: {
    height: 65,
    marginTop: 7,
    justifyContent: "flex-end",
  },

  revenueBottom: {
    position: "absolute",

    right: 0,
    bottom: 0,

    width: "72%",
    height: 90,

    overflow: "hidden",
  },

  revenueImage: {
    width: "145%",
    height: 90,

    marginLeft: -55,

    opacity: 0.7,
  },

  pendingMiniCard: {
    width: 135,

    minHeight: 50,

    paddingHorizontal: 10,
    paddingVertical: 7,

    flexDirection: "row",
    alignItems: "center",

    gap: 8,

    borderRadius: 10,

    backgroundColor: "rgba(255,255,255,0.10)",
  },

  pendingCount: {
    color: "#FFFFFF",

    fontSize: 12,
    fontWeight: "900",
  },

  pendingLabel: {
    marginTop: 1,

    color: "#DCEFED",

    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
  },

  revenueBars: {
    flex: 1,

    height: 58,

    marginLeft: 10,

    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",

    gap: 6,
  },

  revenueBar: {
    width: 10,

    borderRadius: 6,

    backgroundColor: "rgba(255,255,255,0.65)",
  },

  /* ==========================================================
     KPI
  ========================================================== */

  kpiGrid: {
    marginTop: 1,

    flexDirection: "row",
    flexWrap: "wrap",

    justifyContent: "space-between",

    rowGap: 7,
  },

  kpiTile: {
    width: "48.7%",

    minHeight: 60,

    paddingHorizontal: 8,
    paddingVertical: 6,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,

    backgroundColor: COLORS.card,
  },

  kpiCopy: {
    flex: 1,
    minWidth: 0,

    marginLeft: 8,
  },

  kpiValue: {
    color: COLORS.text,

    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },

  kpiLabel: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
  },

  /* ==========================================================
     REVENUE TREND
  ========================================================== */

  revenueTrendCard: {
    marginTop: 8,

    padding: 10,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 13,

    backgroundColor: COLORS.card,
  },

  revenueTrendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    gap: 5,
  },

  revenueTrendTitle: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "900",
  },

  revenueTrendSubtitle: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 8.5,
    fontWeight: "600",
  },

  revenuePeriodButton: {
    minHeight: 26,

    paddingHorizontal: 8,

    flexDirection: "row",
    alignItems: "center",

    gap: 2,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 13,

    backgroundColor: COLORS.card,
  },

  revenuePeriodText: {
    color: COLORS.text,

    fontSize: 8,
    fontWeight: "800",
  },

  revenueChartWrap: {
    marginTop: 8,
  },

  revenueChartGrid: {
    position: "relative",

    height: 92,

    overflow: "hidden",

    justifyContent: "space-between",
  },

  revenueGridLine: {
    height: 1,

    backgroundColor: "#E9EEF0",
  },

  revenueBarsArea: {
    position: "absolute",

    left: 3,
    right: 3,
    top: 3,
    bottom: 1,

    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  revenueChartColumn: {
    width: "15%",
    height: "100%",

    alignItems: "center",
    justifyContent: "flex-end",
  },

  revenueChartBar: {
    width: 15,

    minHeight: 3,

    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,

    backgroundColor: COLORS.blue,
  },

  revenueMonthsRow: {
    marginTop: 4,

    flexDirection: "row",
    justifyContent: "space-between",
  },

  revenueChartMonth: {
    width: "16%",

    color: COLORS.muted,

    fontSize: 7.5,
    fontWeight: "700",

    textAlign: "center",
  },

  revenueGrowthBox: {
    minHeight: 42,

    marginTop: 8,

    paddingHorizontal: 8,

    flexDirection: "row",
    alignItems: "center",

    gap: 6,

    borderRadius: 10,

    backgroundColor: COLORS.blueSoft,
  },

  revenueGrowthIcon: {
    width: 28,
    height: 28,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 14,

    backgroundColor: "#D8ECE9",
  },

  revenueGrowthCopy: {
    flex: 1,
    minWidth: 0,
  },

  revenueGrowthTitle: {
    color: COLORS.blue,

    fontSize: 10,
    fontWeight: "900",
  },

  revenueGrowthText: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "600",
  },

  /* ==========================================================
     DASHBOARD SECTIONS
  ========================================================== */

  dashboardSectionHeader: {
    marginTop: 11,
    marginBottom: 6,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dashboardSectionTitle: {
    color: COLORS.text,

    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
  },

  dashboardViewAll: {
    color: COLORS.blue,

    fontSize: 10,
    fontWeight: "900",
  },

  middlePanel: {
    marginTop: 10,

    gap: 7,
  },

  middleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  middleTitle: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "900",
  },

  middleRefresh: {
    width: 29,
    height: 29,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 9,

    backgroundColor: COLORS.blueSoft,
  },

  /* ==========================================================
     NEEDS ATTENTION
  ========================================================== */

  attentionGrid: {
    flexDirection: "row",

    gap: 7,
  },

  attentionTile: {
    flex: 1,

    minHeight: 58,

    paddingHorizontal: 7,
    paddingVertical: 6,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,

    backgroundColor: COLORS.card,
  },

  attentionIcon: {
    width: 27,
    height: 27,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,
  },

  attentionValue: {
    marginTop: 4,

    color: COLORS.text,

    fontSize: 15,
    lineHeight: 17,
    fontWeight: "900",
  },

  attentionLabel: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: "700",
  },

  /* ==========================================================
     RECENT ACTIVITY
  ========================================================== */

  activityCard: {
    paddingHorizontal: 8,
    paddingVertical: 3,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,

    backgroundColor: COLORS.card,
  },

  activityHeader: {
    minHeight: 28,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: 3,
  },

  activityHeading: {
    color: COLORS.text,

    fontSize: 13,
    fontWeight: "900",
  },

  activityLink: {
    color: COLORS.blue,

    fontSize: 10,
    fontWeight: "900",
  },

  activityRow: {
    minHeight: 40,

    flexDirection: "row",
    alignItems: "center",

    borderTopWidth: 1,
    borderTopColor: "#EDF1F2",
  },

  activityIcon: {
    width: 29,
    height: 29,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,
  },

  activityCopy: {
    flex: 1,
    minWidth: 0,

    paddingHorizontal: 7,
  },

  activityTitle: {
    color: COLORS.text,

    fontSize: 11.5,
    fontWeight: "900",
  },

  activityMeta: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 9,
    fontWeight: "600",
  },

  activityAmount: {
    color: COLORS.text,

    fontSize: 11,
    fontWeight: "900",
  },

  activityEmpty: {
    paddingVertical: 8,

    color: COLORS.muted,

    fontSize: 11,
    fontWeight: "700",

    textAlign: "center",
  },

  /* ==========================================================
     QUICK ACTIONS
  ========================================================== */

  dashboardQuickGrid: {
    width: "100%",

    flexDirection: "row",
    flexWrap: "wrap",

    justifyContent: "space-between",

    rowGap: 7,
  },

  quickAction: {
    width: "48.7%",

    minHeight: 50,

    paddingHorizontal: 7,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 11,

    backgroundColor: COLORS.card,
  },

  quickActionIconWrap: {
    width: 33,
    height: 33,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 9,
  },

  quickActionText: {
    flex: 1,

    marginLeft: 7,

    color: COLORS.text,

    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
  },

  quickActionPressed: {
    opacity: 0.78,

    transform: [{ scale: 0.98 }],
  },

  /* ==========================================================
     TRACK CARD
  ========================================================== */

  dashboardTrackWrap: {
    marginTop: 9,
    marginBottom: 3,
  },

  floatingTrackWrap: {
    position: "absolute",

    bottom: 76,

    maxWidth: 410,

    alignSelf: "center",
  },

  trackCard: {
    minHeight: 60,

    paddingHorizontal: 7,
    paddingVertical: 5,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor: "#D9E7E5",

    borderRadius: 12,

    backgroundColor: "#EEF7F5",
  },

  trackImage: {
    width: 66,
    height: 44,
  },

  trackCopy: {
    flex: 1,
    minWidth: 0,

    paddingHorizontal: 6,
  },

  trackTitle: {
    color: COLORS.text,

    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "900",
  },

  trackText: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "600",
  },

  trackIcon: {
    width: 36,
    height: 36,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 11,

    backgroundColor: COLORS.blue,
  },

  /* ==========================================================
     REPORT / SECTION CARDS
  ========================================================== */

  sectionHeading: {
    marginTop: 12,
    marginBottom: 6,
  },

  sectionSmallTitle: {
    color: COLORS.text,

    fontSize: 13,
    fontWeight: "900",
  },

  sectionCard: {
    marginTop: 10,

    padding: 10,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,

    backgroundColor: COLORS.card,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: 7,
  },

  sectionTitle: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "800",
  },

  monthButton: {
    minHeight: 28,

    paddingHorizontal: 8,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 8,

    backgroundColor: COLORS.card,
  },

  monthText: {
    color: COLORS.text,

    fontSize: 11,
    fontWeight: "800",
  },

  donutWrap: {
    alignItems: "center",

    paddingVertical: 2,
  },

  donut: {
    width: 108,
    height: 108,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 15,
    borderColor: COLORS.blue,
    borderTopColor: COLORS.orange,

    borderRadius: 54,
  },

  donutInner: {
    alignItems: "center",
  },

  donutAmount: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "800",
  },

  donutText: {
    marginTop: 3,

    color: COLORS.muted,

    fontSize: 10,
    fontWeight: "700",
  },

  legend: {
    marginTop: 8,

    gap: 7,
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  legendDot: {
    width: 9,
    height: 9,

    marginRight: 8,

    borderRadius: 5,
  },

  legendLabel: {
    flex: 1,

    color: COLORS.text,

    fontSize: 12,
    fontWeight: "700",
  },

  legendValue: {
    color: COLORS.text,

    fontSize: 12,
    fontWeight: "800",
  },

  /* ==========================================================
     ORGANIZATION FILTERS
  ========================================================== */

  filterGrid: {
    flexDirection: "row",
    justifyContent: "space-between",

    marginBottom: 8,

    gap: 5,
  },

  filterTile: {
    flex: 1,
    minWidth: 0,

    minHeight: 68,

    padding: 6,

    justifyContent: "space-between",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 11,

    backgroundColor: COLORS.card,
  },

  filterTileSelected: {
    borderColor: COLORS.blue,

    backgroundColor: COLORS.blueSoft,
  },

  filterTileTiny: {
    flex: 0,

    width: 76,
  },

  filterIcon: {
    width: 30,
    height: 30,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 9,
  },

  filterLabel: {
    width: "100%",

    color: COLORS.muted,

    fontSize: 10,
    fontWeight: "900",
  },

  filterLabelSelected: {
    color: COLORS.blue,
  },

  filterCount: {
    fontSize: 14,
    fontWeight: "900",
  },

  searchBox: {
    height: 44,

    marginBottom: 8,

    paddingLeft: 10,
    paddingRight: 5,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 12,

    backgroundColor: COLORS.card,
  },

  searchInput: {
    flex: 1,

    height: "100%",

    marginLeft: 6,

    color: COLORS.text,

    fontSize: 13,
  },

  searchFilterButton: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: COLORS.soft,
  },

  orgTypeTabs: {
    minHeight: 48,
    marginBottom: 8,
    padding: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },

  orgTypeTab: {
    flex: 1,
    minWidth: 0,
    height: 38,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 9,
  },

  orgTypeTabActive: {
    backgroundColor: COLORS.blueSoft,
  },

  orgTypeTabText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "900",
  },

  orgTypeTabTextActive: {
    color: COLORS.blue,
  },

  orgTypeCount: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: COLORS.soft,
  },

  orgTypeCountActive: {
    backgroundColor: COLORS.card,
  },

  orgTypeCountText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "900",
  },

  orgTypeCountTextActive: {
    color: COLORS.blue,
  },

  /* ==========================================================
     ORGANIZATION CARDS
  ========================================================== */

  orgList: {
    gap: 8,
  },

  orgSection: {
    gap: 8,
  },

  orgSectionHeader: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.blueSoft,
  },

  orgSectionCopy: {
    flex: 1,
    minWidth: 0,
  },

  orgSectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  orgSectionSubtitle: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 10.5,
    fontWeight: "700",
  },

  orgSectionCount: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: COLORS.card,
  },

  orgSectionCountText: {
    color: COLORS.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  orgCard: {
    padding: 10,

    overflow: "hidden",

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 13,

    backgroundColor: COLORS.card,
  },

  orgAccent: {
    position: "absolute",

    left: 0,
    top: 0,
    bottom: 0,

    width: 4,
  },

  orgHeader: {
    flexDirection: "row",
    alignItems: "flex-start",

    paddingLeft: 5,
  },

  orgInfo: {
    flex: 1,
    minWidth: 0,

    paddingHorizontal: 8,
  },

  orgName: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "900",
  },

  orgOwner: {
    color: COLORS.muted,

    fontSize: 11,
    fontWeight: "800",
  },

  orgEmail: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 10,
    fontWeight: "600",
  },

  orgPhoneRow: {
    marginTop: 2,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,
  },

  orgPhone: {
    color: COLORS.text,

    fontSize: 10.5,
    fontWeight: "800",
  },

  orgRight: {
    alignItems: "flex-end",

    gap: 6,
  },

  planTypeBadge: {
    minHeight: 22,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  planTypeTrial: {
    backgroundColor: COLORS.orangeSoft,
  },

  planTypePaid: {
    backgroundColor: COLORS.greenSoft,
  },

  planTypeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  planTypeTrialText: {
    color: COLORS.orange,
  },

  planTypePaidText: {
    color: COLORS.green,
  },

  statusBadge: {
    minHeight: 23,

    paddingHorizontal: 8,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,
  },

  status_active: {
    backgroundColor: COLORS.greenSoft,
  },

  status_pending: {
    backgroundColor: COLORS.orangeSoft,
  },

  status_suspended: {
    backgroundColor: COLORS.redSoft,
  },

  status_expired: {
    backgroundColor: COLORS.orangeSoft,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  statusText_active: {
    color: COLORS.green,
  },

  statusText_pending: {
    color: COLORS.orange,
  },

  statusText_suspended: {
    color: COLORS.red,
  },

  statusText_expired: {
    color: COLORS.orange,
  },

  unitStrip: {
    marginTop: 8,
    marginLeft: 5,

    paddingVertical: 6,

    flexDirection: "row",

    borderRadius: 10,

    backgroundColor: COLORS.blueSoft,
  },

  unitCell: {
    flex: 1,

    alignItems: "center",
  },

  unitDivider: {
    width: 1,

    backgroundColor: COLORS.border,
  },

  unitLabel: {
    color: COLORS.blue,

    fontSize: 9,
    fontWeight: "900",
  },

  unitValue: {
    marginTop: 2,

    color: COLORS.blue,

    fontSize: 13,
    fontWeight: "900",
  },

  orgFooter: {
    marginTop: 8,
    marginLeft: 5,

    flexDirection: "row",
    alignItems: "center",
  },

  subscriptionBlock: {
    flex: 1,
    minWidth: 0,
  },

  subscriptionText: {
    color: COLORS.muted,

    fontSize: 10.5,
    fontWeight: "800",
  },

  subscriptionStatus: {
    color: COLORS.green,
  },

  subscriptionDate: {
    marginTop: 1,

    color: COLORS.muted,

    fontSize: 9.5,
    fontWeight: "700",
  },

  renewButton: {
    minWidth: 84,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: COLORS.blue,

    borderRadius: 9,

    backgroundColor: COLORS.card,
  },

  renewText: {
    color: COLORS.blue,

    fontSize: 11.5,
    fontWeight: "800",
  },

  inlineStatusAction: {
    alignSelf: "flex-end",

    marginTop: -28,
    marginRight: 12,

    minHeight: 29,

    paddingHorizontal: 9,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    borderRadius: 9,

    backgroundColor: COLORS.redSoft,
  },

  inlineStatusReactivate: {
    backgroundColor: COLORS.greenSoft,
  },

  inlineStatusText: {
    color: COLORS.red,

    fontSize: 9.5,
    fontWeight: "900",
  },

  /* ==========================================================
     TRANSACTIONS
  ========================================================== */

  transactionPage: {
    marginTop: 6,

    minHeight: 500,
  },

  transactionSkyline: {
    display: "none",
  },

  transactionPanel: {
    marginHorizontal: 0,

    paddingTop: 8,
    paddingBottom: 4,

    borderRadius: 14,
  },

  transactionPanelHeader: {
    minHeight: 34,

    marginBottom: 5,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  transactionPanelTitle: {
    flex: 1,

    color: COLORS.text,

    fontSize: 16,
    fontWeight: "900",
  },

  transactionRefresh: {
    width: 32,
    height: 32,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: COLORS.blueSoft,
  },

  transactionRow: {
    marginBottom: 7,

    padding: 8,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 11,

    backgroundColor: COLORS.card,
  },

  transactionMainRow: {
    minHeight: 58,

    flexDirection: "row",
    alignItems: "center",
  },

  transactionInfo: {
    flex: 1,
    minWidth: 0,

    paddingHorizontal: 7,
  },

  transactionTitle: {
    color: COLORS.text,

    fontSize: 12.5,
    fontWeight: "900",
  },

  transactionMeta: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 9.5,
    fontWeight: "600",
  },

  transactionRight: {
    width: 86,

    alignItems: "flex-end",
    justifyContent: "center",
  },

  transactionStatusPill: {
    minWidth: 58,
    maxWidth: 72,

    minHeight: 23,

    marginTop: 4,

    paddingHorizontal: 7,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 9,
  },

  transactionStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  transactionAmount: {
    width: "100%",

    color: COLORS.text,

    fontSize: 12,
    fontWeight: "900",

    textAlign: "right",
  },

  transactionWalletText: {
    marginTop: 2,

    width: "100%",

    color: COLORS.blue,

    fontSize: 8.5,
    fontWeight: "900",

    textAlign: "right",
  },

  amountSuccess: {
    color: COLORS.green,
  },

  amountFailed: {
    color: COLORS.red,
  },

  amountPending: {
    color: COLORS.text,
  },

  transactionDetailsCard: {
    marginTop: 6,
    paddingTop: 6,

    borderTopWidth: 1,
    borderTopColor: COLORS.soft,
  },

  transactionDetailRow: {
    marginBottom: 3,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  transactionDetailLabel: {
    flex: 1,
    minWidth: 0,

    color: COLORS.muted,

    fontSize: 9.5,
    fontWeight: "800",
  },

  transactionDetailValue: {
    flex: 1.4,
    minWidth: 0,

    color: COLORS.text,

    fontSize: 9.5,
    fontWeight: "800",

    textAlign: "right",
  },

  detailSuccess: {
    color: COLORS.green,
  },

  detailDanger: {
    color: COLORS.red,
  },

  viewAll: {
    color: COLORS.blue,

    fontSize: 11,
    fontWeight: "800",
  },

  /* ==========================================================
     MORE
  ========================================================== */

  morePanel: {
    marginTop: 5,

    gap: 7,
  },

  moreRow: {
    minHeight: 56,

    paddingHorizontal: 8,
    paddingVertical: 6,

    flexDirection: "row",
    alignItems: "center",

    gap: 9,

    borderWidth: 1,
    borderColor: COLORS.border,

    borderRadius: 11,

    backgroundColor: COLORS.card,
  },

  moreRowLast: {},

  moreIconBox: {
    width: 36,
    height: 36,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 11,

    backgroundColor: COLORS.blueSoft,
  },

  moreIconDanger: {
    backgroundColor: COLORS.redSoft,
  },

  moreCopy: {
    flex: 1,
    minWidth: 0,
  },

  moreText: {
    color: COLORS.text,

    fontSize: 13,
    fontWeight: "900",
  },

  moreSubText: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 10,
    fontWeight: "600",
  },

  empty: {
    paddingVertical: 16,

    color: COLORS.muted,

    fontSize: 12,
    fontWeight: "700",

    textAlign: "center",
  },

  /* ==========================================================
     BOTTOM NAV
  ========================================================== */

  bottomNav: {
    position: "absolute",

    left: 0,
    right: 0,
    bottom: 0,

    width: "100%",

    minHeight: 64,

    paddingHorizontal: 6,
    paddingTop: 6,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    borderTopWidth: 1,
    borderTopColor: COLORS.border,

    backgroundColor: "#FFFFFF",

    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: -2,
    },

    elevation: 8,
  },

  navItem: {
    flex: 1,
    minWidth: 0,

    alignItems: "center",
    justifyContent: "center",

    gap: 2,

    paddingHorizontal: 1,
  },

  navText: {
    width: "100%",

    color: COLORS.muted,

    fontSize: 9.5,
    fontWeight: "700",

    textAlign: "center",
  },

  navActive: {
    color: COLORS.blue,

    fontWeight: "900",
  },

  centerAdd: {
    width: 46,
    height: 46,

    marginHorizontal: 3,
    marginTop: -22,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 23,

    backgroundColor: COLORS.blue,

    shadowColor: COLORS.blue,
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 4,
  },

  /* ==========================================================
     SIDEBAR
  ========================================================== */

  sidebarOverlay: {
    flex: 1,

    flexDirection: "row",

    backgroundColor: "rgba(16,24,40,0.30)",
  },

  sidebarScrim: {
    flex: 1,
  },

  sidebarPanel: {
    width: "82%",
    maxWidth: 320,
    height: "100%",

    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 15,

    backgroundColor: COLORS.card,

    shadowColor: COLORS.text,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {
      width: 5,
      height: 0,
    },

    elevation: 8,
  },

  sidebarTop: {
    minHeight: 68,

    flexDirection: "row",
    alignItems: "center",

    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  sidebarAvatar: {
    width: 44,
    height: 44,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 22,

    backgroundColor: COLORS.blueSoft,
  },

  sidebarAvatarText: {
    color: COLORS.blue,

    fontSize: 15,
    fontWeight: "900",
  },

  sidebarProfile: {
    flex: 1,
    minWidth: 0,

    marginLeft: 9,
  },

  sidebarName: {
    color: COLORS.text,

    fontSize: 15,
    fontWeight: "900",
  },

  sidebarEmail: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 10,
    fontWeight: "600",
  },

  sidebarClose: {
    width: 32,
    height: 32,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 16,

    backgroundColor: COLORS.soft,
  },

  sidebarMenu: {
    paddingTop: 10,

    gap: 5,
  },

  sidebarFooter: {
    marginTop: "auto",

    paddingTop: 10,

    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  sidebarItem: {
    minHeight: 42,

    paddingHorizontal: 10,

    flexDirection: "row",
    alignItems: "center",

    gap: 9,

    borderRadius: 10,
  },

  sidebarItemActive: {
    backgroundColor: COLORS.blueSoft,
  },

  sidebarItemText: {
    color: COLORS.text,

    fontSize: 13,
    fontWeight: "800",
  },

  sidebarItemTextActive: {
    color: COLORS.blue,
  },

  sidebarItemTextDanger: {
    color: COLORS.red,
  },
});
