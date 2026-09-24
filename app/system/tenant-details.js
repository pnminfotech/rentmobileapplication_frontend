import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Image } from "expo-image";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Home,
  MessageCircle,
  MoveRight,
  Pencil,
  Phone,
  ReceiptText,
  Share2,
  ShieldCheck,
  Trash2,
  Utensils,
  UserRound,
} from "lucide-react-native";

import { deleteTenant, getTenant } from "../../src/api/tenantApi";

/* ============================================================
   THEME
============================================================ */

const UI = {
  screen: "#F6F8F7",
  card: "#FFFFFF",

  text: "#111B2A",
  muted: "#63738A",
  subtle: "#94A3B8",

  border: "#D9E1E7",

  primary: "#4F7FA6",
  primaryDark: "#244F70",
  primarySoft: "#E7F1F8",

  green: "#258467",
  greenSoft: "#E8F6F1",

  orange: "#A96313",
  orangeSoft: "#FFF4E6",
  orangeBorder: "#F2D1A7",

  purple: "#7459A6",
  purpleSoft: "#F2ECFA",

  red: "#D64B4B",
  redSoft: "#FFF1F0",

  yellow: "#B07815",
  yellowSoft: "#FFF7DE",
};

/* avoids shadow* warning on web */

const lightShadow = Platform.select({
  web: {
    boxShadow: "0px 3px 10px rgba(36,79,112,0.06)",
  },

  android: {
    elevation: 1,
  },

  ios: {
    shadowColor: "#244F70",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  default: {},
});

const mediumShadow = Platform.select({
  web: {
    boxShadow: "0px 5px 16px rgba(36,79,112,0.10)",
  },

  android: {
    elevation: 3,
  },

  ios: {
    shadowColor: "#244F70",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },

  default: {},
});

/* ============================================================
   TABS
============================================================ */

const TABS = [
  {
    key: "overview",
    label: "Overview",
    icon: Home,
  },
  {
    key: "payments",
    label: "Payments",
    icon: ReceiptText,
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileText,
  },
];

/* ============================================================
   HELPERS
============================================================ */

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function toDisplayName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1).toLowerCase()
    )
    .join(" ");
}

function hasCanteenEnabled(tenant) {
  if (tenant?.hasCanteen === true) return true;

  const value = String(tenant?.hasCanteen || "")
    .trim()
    .toLowerCase();

  return ["yes", "true", "enabled", "1"].includes(value);
}

function isAdvancePaid(tenant) {
  const value = String(tenant?.firstRentStatus || "")
    .trim()
    .toUpperCase();

  return value === "ADVANCE_PAID";
}

function phoneValue(tenant) {
  return String(
    tenant?.phoneNo ||
      tenant?.phone ||
      ""
  ).replace(/\D/g, "");
}

function tenantInitials(name) {
  const parts = String(name || "Tenant")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "T";
  }

  if (parts.length === 1) {
    return parts[0]
      .charAt(0)
      .toUpperCase();
  }

  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

function tenantPhotoUrl(tenant) {
  if (tenant?.avatarUrl) {
    return tenant.avatarUrl;
  }

  if (tenant?.photoUrl) {
    return tenant.photoUrl;
  }

  const documents = Array.isArray(tenant?.documents)
    ? tenant.documents
    : [];

  const photo = documents.find((document) => {
    const label = `
      ${document?.relation || ""}
      ${document?.fileName || ""}
      ${document?.storedName || ""}
    `.toLowerCase();

    return (
      document?.url &&
      (
        label.includes("photo") ||
        label.includes("selfie") ||
        label.includes("photograph")
      )
    );
  });

  return photo?.url || "";
}

function propertyType(tenant) {
  const raw = String(
    tenant?.propertyType || ""
  ).toLowerCase();

  if (raw === "room") return "room";
  if (raw === "shop") return "shop";

  return "bed";
}

function roomNumber(tenant) {
  if (propertyType(tenant) === "shop") {
    return (
      tenant?.shopNumber ||
      tenant?.roomNo ||
      "-"
    );
  }

  return tenant?.roomNo || "-";
}

function unitText(tenant) {
  const type = propertyType(tenant);

  if (type === "shop") {
    const value =
      tenant?.shopNumber ||
      tenant?.roomNo;

    return value
      ? `Shop ${value}`
      : "-";
  }

  if (type === "room") {
    return tenant?.roomNo
      ? `Room ${tenant.roomNo}`
      : "-";
  }

  return [
    tenant?.roomNo
      ? `Room ${tenant.roomNo}`
      : "",

    tenant?.bedNo
      ? `Bed ${tenant.bedNo}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ") || "-";
}

/* ============================================================
   RENT PAYMENT HELPER
============================================================ */

function flattenPayments(tenant) {
  const rents = Array.isArray(tenant?.rents)
    ? tenant.rents
    : [];

  const result = [];

  rents.forEach((rent) => {
    let payments = [];

    if (
      Array.isArray(rent?.payments) &&
      rent.payments.length
    ) {
      payments = rent.payments;
    } else if (
      Number(rent?.rentAmount || rent?.totalAmount || 0) > 0
    ) {
      payments = [
        {
          amount:
            rent.totalAmount ??
            rent.rentAmount ??
            0,

          date:
            rent.date ||
            rent.createdAt,

          paymentMode:
            rent.paymentMode,
        },
      ];
    }

    payments.forEach((payment, index) => {
      result.push({
        key: `${
          rent?._id ||
          rent?.month ||
          "rent"
        }-${index}`,

        month:
          rent?.month ||
          "Rent",

        amount: Number(
          payment?.amount ||
            payment?.rentAmount ||
            0
        ),

        date:
          payment?.date ||
          payment?.createdAt ||
          rent?.date,

        paymentMode:
          payment?.paymentMode ||
          "-",
      });
    });
  });

  return result.sort((a, b) => {
    const left =
      new Date(a.date || 0).getTime();

    const right =
      new Date(b.date || 0).getTime();

    return right - left;
  });
}

/* ============================================================
   REUSABLE COMPONENTS
============================================================ */

function InfoRow({
  label,
  value,
  last = false,
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last && styles.infoRowLast,
      ]}
    >
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text
        style={styles.infoValue}
        numberOfLines={3}
      >
        {value || "-"}
      </Text>
    </View>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  onAction,
  tone = "blue",
}) {
  const iconStyle =
    tone === "orange"
      ? styles.sectionIconOrange
      : tone === "green"
        ? styles.sectionIconGreen
        : tone === "purple"
          ? styles.sectionIconPurple
          : styles.sectionIconBlue;

  const iconColor =
    tone === "orange"
      ? UI.orange
      : tone === "green"
        ? UI.green
        : tone === "purple"
          ? UI.purple
          : UI.primaryDark;

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <View
          style={[
            styles.sectionIcon,
            iconStyle,
          ]}
        >
          <Icon
            size={17}
            color={iconColor}
          />
        </View>

        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>
            {title}
          </Text>

          {subtitle ? (
            <Text
              style={styles.sectionSubtitle}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {action ? (
        <Pressable
          onPress={onAction}
          style={styles.sectionAction}
        >
          <Pencil
            size={13}
            color={UI.primary}
          />

          <Text style={styles.sectionActionText}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ============================================================
   MAIN SCREEN
============================================================ */

export default function TenantDetailsScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams();

  const idParam =
    params.id ??
    params.tenantId;

  const id = Array.isArray(idParam)
    ? idParam[0]
    : idParam;

  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo ||
      "/system/tenants";

  const returnTo =
    returnToParam ===
    "/system/tenant-details"
      ? "/system/tenants"
      : returnToParam;

  const [tenant, setTenant] =
    useState(null);

  const [activeTab, setActiveTab] =
    useState("overview");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* ========================================================
     LOAD
  ======================================================== */

  const load = useCallback(async () => {
    if (!id) {
      setError("Tenant id is missing.");
      setLoading(false);
      return;
    }

    try {
      setError("");

      const data =
        await getTenant(id);

      setTenant(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load tenant details."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  /* ========================================================
     DERIVED
  ======================================================== */

  const payments = useMemo(
    () => flattenPayments(tenant),
    [tenant]
  );

  const documents = useMemo(
    () =>
      Array.isArray(tenant?.documents)
        ? tenant.documents
        : [],
    [tenant]
  );

  const canteen =
    hasCanteenEnabled(tenant);

  const advance =
    isAdvancePaid(tenant);

  const photoUrl =
    tenantPhotoUrl(tenant);

  const phone =
    phoneValue(tenant);

  /* ========================================================
     NAVIGATION
  ======================================================== */

  function goBack() {
    router.replace(returnTo);
  }

  function editTenant() {
    router.push({
      pathname:
        "/system/tenant-edit",

      params: {
        id,
        returnTo,
      },
    });
  }

  function shiftTenant() {
    router.push({
      pathname: "/system/tenant-shift",
      params: { id, returnTo: `/system/tenant-details?id=${id}&returnTo=${encodeURIComponent(returnTo)}` },
    });
  }

  function requestDelete() {
    Alert.alert("Delete tenant", "This permanently deletes the tenant and their payment records. Continue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", style: "destructive", onPress: () => setShowDeleteModal(true) },
    ]);
  }

  async function confirmDelete() {
    if (!deletePassword.trim()) return Alert.alert("Password required", "Enter your password to delete this tenant.");
    try {
      setDeleting(true);
      await deleteTenant(id, deletePassword);
      setShowDeleteModal(false);
      Alert.alert("Tenant deleted", "The tenant has been deleted successfully.", [{ text: "OK", onPress: () => router.replace(returnTo) }]);
    } catch (err) {
      Alert.alert("Unable to delete tenant", err.response?.data?.message || err.message || "Please check the password and try again.");
    } finally {
      setDeleting(false);
    }
  }

  function markLeaving() {
    router.push({
      pathname:
        "/system/tenant-leave",

      params: {
        id,
        returnTo,
      },
    });
  }

  /* ========================================================
     ACTIONS
  ======================================================== */

  async function callTenant() {
    if (!phone) return;

    await Linking.openURL(
      `tel:${phone}`
    );
  }

  async function messageTenant() {
    if (!phone) return;

    await Linking.openURL(
      `sms:${phone}`
    );
  }

  async function shareTenant() {
    await Share.share({
      title: "Tenant details",

      message: [
        toDisplayName(
          tenant?.name
        ),

        phone
          ? `+91 ${phone}`
          : "",

        tenant?.category ||
          "",

        unitText(tenant),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  /* ========================================================
     LOADING
  ======================================================== */

  if (loading) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingIcon}>
          <UserRound
            size={28}
            color={UI.primaryDark}
          />
        </View>

        <ActivityIndicator
          size="small"
          color={UI.primary}
          style={{ marginTop: 14 }}
        />

        <Text style={styles.loadingText}>
          Loading tenant details...
        </Text>
      </View>
    );
  }

  /* ========================================================
     ERROR
  ======================================================== */

  if (error || !tenant) {
    return (
      <View style={styles.loading}>
        <Text style={styles.error}>
          {error ||
            "Tenant not found."}
        </Text>

        <Pressable
          onPress={goBack}
          style={styles.backButtonLarge}
        >
          <Text
            style={
              styles.backButtonLargeText
            }
          >
            Back to tenants
          </Text>
        </Pressable>
      </View>
    );
  }

  /* ========================================================
     UI
  ======================================================== */

  return (
    <View style={styles.screen}>

      <View style={styles.content}>

        {/* HEADER */}

        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            style={styles.headerButton}
          >
            <ArrowLeft
              size={21}
              color={UI.primaryDark}
            />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>
              Tenant Details
            </Text>

            <Text
              style={styles.headerSubtitle}
            >
              Complete tenant profile and stay information
            </Text>
          </View>

          <Pressable
            onPress={editTenant}
            style={styles.headerEditButton}
          >
            <Pencil
              size={16}
              color={UI.primaryDark}
            />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={false}
        >

          {/* =============================================
              PROFILE HERO
          ============================================= */}

          <View style={styles.profileCard}>

            <View style={styles.profileTop}>

              <View style={styles.profileDecorCircleOne} />
              <View style={styles.profileDecorCircleTwo} />

              <View style={styles.avatar}>
                {photoUrl ? (
                  <Image
                    source={{
                      uri: photoUrl,
                    }}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {tenantInitials(
                      tenant.name
                    )}
                  </Text>
                )}
              </View>

              <View style={styles.profileCopy}>

                <Text
                  style={styles.profileName}
                  numberOfLines={2}
                >
                  {toDisplayName(
                    tenant.name
                  )}
                </Text>

                <Text
                  style={styles.profilePhone}
                >
                  {phone
                    ? `+91 ${phone}`
                    : "Phone not available"}
                </Text>

                <View style={styles.badgeRow}>

                  {canteen ? (
                    <View
                      style={styles.canteenBadge}
                    >
                      <Utensils
                        size={12}
                        color={UI.orange}
                      />

                      <Text
                        style={
                          styles.canteenBadgeText
                        }
                      >
                        Canteen
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cycleBadge}>

                    {advance ? (
                      <Check
                        size={12}
                        color={UI.primaryDark}
                      />
                    ) : null}

                    <Text
                      style={styles.cycleBadgeText}
                    >
                      {advance
                        ? "Advance cycle · paid at joining"
                        : "Normal cycle · payable after month"}
                    </Text>
                  </View>

                </View>

              </View>

              <View
                style={[
                  styles.activeBadge,
                  tenant.leaveDate &&
                    styles.leavingBadge,
                ]}
              >
                <View
                  style={[
                    styles.activeDot,
                    tenant.leaveDate &&
                      styles.leavingDot,
                  ]}
                />

                <Text
                  style={[
                    styles.activeText,
                    tenant.leaveDate &&
                      styles.leavingText,
                  ]}
                >
                  {tenant.leaveDate
                    ? "Leaving"
                    : "Active"}
                </Text>
              </View>

            </View>

            {/* PROPERTY STATS */}

            <View style={styles.quickStats}>

              <View style={styles.quickStat}>
                <View style={styles.quickStatIconBlue}>
                  <Building2
                    size={17}
                    color={UI.primaryDark}
                  />
                </View>

                <Text style={styles.quickStatLabel}>
                  Property
                </Text>

                <Text
                  style={styles.quickStatValue}
                  numberOfLines={2}
                >
                  {tenant.category ||
                    "Property"}
                </Text>
              </View>

              <View style={styles.quickDivider} />

              <View style={styles.quickStat}>
                <View style={styles.quickStatIconOrange}>
                  <BedDouble
                    size={17}
                    color={UI.orange}
                  />
                </View>

                <Text style={styles.quickStatLabel}>
                  Room / Bed
                </Text>

                <Text
                  style={styles.quickStatValue}
                  numberOfLines={2}
                >
                  {unitText(tenant)}
                </Text>
              </View>

              <View style={styles.quickDivider} />

              <View style={styles.quickStat}>
                <View style={styles.quickStatIconPurple}>
                  <CalendarDays
                    size={17}
                    color={UI.purple}
                  />
                </View>

                <Text style={styles.quickStatLabel}>
                  Joined
                </Text>

                <Text
                  style={styles.quickStatValue}
                  numberOfLines={2}
                >
                  {formatDate(
                    tenant.joiningDate ||
                      tenant.createdAt
                  )}
                </Text>
              </View>

            </View>

          </View>

          {/* =============================================
              QUICK ACTIONS
          ============================================= */}

          <View style={styles.quickActions}>

            <Pressable
              onPress={callTenant}
              disabled={!phone}
              style={[
                styles.quickAction,
                styles.quickActionCall,
                !phone && styles.disabled,
              ]}
            >
              <View style={styles.quickActionIconGreen}>
                <Phone
                  size={18}
                  color={UI.green}
                />
              </View>

              <Text style={styles.quickActionText}>
                Call
              </Text>
            </Pressable>

            <Pressable
              onPress={messageTenant}
              disabled={!phone}
              style={[
                styles.quickAction,
                styles.quickActionMessage,
                !phone && styles.disabled,
              ]}
            >
              <View style={styles.quickActionIconBlue}>
                <MessageCircle
                  size={18}
                  color={UI.primaryDark}
                />
              </View>

              <Text style={styles.quickActionText}>
                Message
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setActiveTab("payments")
              }
              style={[
                styles.quickAction,
                styles.quickActionRent,
              ]}
            >
              <View style={styles.quickActionIconOrange}>
                <ReceiptText
                  size={18}
                  color={UI.orange}
                />
              </View>

              <Text style={styles.quickActionText}>
                Rent
              </Text>
            </Pressable>

            <Pressable
              onPress={shiftTenant}
              style={[
                styles.quickAction,
                styles.quickActionShift,
              ]}
            >
              <View style={styles.quickActionIconPurple}>
                <MoveRight
                  size={18}
                  color={UI.purple}
                />
              </View>

              <Text style={styles.quickActionText}>
                {tenant?.bedNo ? "Shift bed" : "Shift room"}
              </Text>
            </Pressable>

            <Pressable
              onPress={shareTenant}
              style={[
                styles.quickAction,
                styles.quickActionShare,
              ]}
            >
              <View style={styles.quickActionIconPurple}>
                <Share2
                  size={18}
                  color={UI.purple}
                />
              </View>

              <Text style={styles.quickActionText}>
                Share
              </Text>
            </Pressable>

          </View>

          {/* =============================================
              TAB BAR
          ============================================= */}

          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const Icon = tab.icon;

              const active =
                activeTab === tab.key;

              return (
                <Pressable
                  key={tab.key}
                  onPress={() =>
                    setActiveTab(tab.key)
                  }
                  style={[
                    styles.tab,
                    active &&
                      styles.tabActive,
                  ]}
                >
                  <Icon
                    size={16}
                    color={
                      active
                        ? UI.primaryDark
                        : UI.muted
                    }
                  />

                  <Text
                    style={[
                      styles.tabText,
                      active &&
                        styles.tabTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* =============================================
              OVERVIEW
          ============================================= */}

          {activeTab === "overview" ? (
            <>

              {/* PERSONAL INFORMATION */}

              <View
                style={[
                  styles.sectionCard,
                  styles.sectionCardBlue,
                ]}
              >
                <SectionHeader
                  icon={UserRound}
                  title="Personal Information"
                  subtitle="Basic tenant and contact details"
                  action="Edit"
                  onAction={editTenant}
                  tone="blue"
                />

                <View style={styles.sectionBody}>
                  <InfoRow
                    label="Full Name"
                    value={toDisplayName(
                      tenant.name
                    )}
                  />

                  <InfoRow
                    label="Phone Number"
                    value={
                      phone
                        ? `+91 ${phone}`
                        : "-"
                    }
                  />

                  <InfoRow
                    label="Email"
                    value={
                      tenant.email || "-"
                    }
                  />

                  <InfoRow
                    label="Date of Birth"
                    value={formatDate(
                      tenant.dob ||
                        tenant.dateOfBirth
                    )}
                  />

                  <InfoRow
                    label="Emergency Contact"
                    value={
                      tenant.emergencyContact ||
                      tenant.relative1Phone ||
                      "-"
                    }
                  />

                  <InfoRow
                    label="Address"
                    value={
                      tenant.address || "-"
                    }
                    last
                  />
                </View>
              </View>

              {/* STAY INFORMATION */}

              <View
                style={[
                  styles.sectionCard,
                  styles.sectionCardPurple,
                ]}
              >
                <SectionHeader
                  icon={Home}
                  title="Stay Information"
                  subtitle="Property, rent and occupancy details"
                  action="Edit"
                  onAction={editTenant}
                  tone="purple"
                />

                <View style={styles.sectionBody}>

                  <InfoRow
                    label="Property"
                    value={
                      tenant.category || "-"
                    }
                  />

                  {tenant.wingName ? (
                    <InfoRow
                      label="Wing"
                      value={
                        tenant.wingName
                      }
                    />
                  ) : null}

                  <InfoRow
                    label={
                      propertyType(tenant) ===
                      "shop"
                        ? "Shop No."
                        : "Room No."
                    }
                    value={roomNumber(
                      tenant
                    )}
                  />

                  {propertyType(tenant) ===
                  "bed" ? (
                    <InfoRow
                      label="Bed No."
                      value={
                        tenant.bedNo || "-"
                      }
                    />
                  ) : null}

                  <InfoRow
                    label="Joining Date"
                    value={formatDate(
                      tenant.joiningDate
                    )}
                  />

                  <InfoRow
                    label="Leave Date"
                    value={formatDate(
                      tenant.leaveDate
                    )}
                  />

                  <InfoRow
                    label="Deposit"
                    value={money(
                      tenant.depositAmount
                    )}
                  />

                  <InfoRow
                    label="Monthly Rent"
                    value={money(
                      tenant.baseRent
                    )}
                    last
                  />

                </View>
              </View>

              {/* CANTEEN */}

              {propertyType(tenant) === "bed" ? (
                <View
                  style={[
                    styles.sectionCard,
                    styles.sectionCardOrange,
                  ]}
                >
                  <SectionHeader
                    icon={Utensils}
                    title="Additional Services"
                    subtitle="Services enabled for this tenant"
                    tone="orange"
                  />

                  <View
                    style={[
                      styles.serviceRow,
                      canteen
                        ? styles.serviceRowActive
                        : styles.serviceRowInactive,
                    ]}
                  >

                    <View style={styles.serviceIcon}>
                      <Utensils
                        size={20}
                        color={
                          canteen
                            ? UI.orange
                            : UI.muted
                        }
                      />
                    </View>

                    <View style={styles.serviceCopy}>
                      <Text style={styles.serviceTitle}>
                        Canteen
                      </Text>

                      <Text style={styles.serviceSubtitle}>
                        Breakfast / lunch / dinner service
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.serviceStatus,
                        canteen
                          ? styles.serviceEnabled
                          : styles.serviceDisabled,
                      ]}
                    >
                      {canteen ? (
                        <Check
                          size={12}
                          color={UI.green}
                        />
                      ) : null}

                      <Text
                        style={[
                          styles.serviceStatusText,
                          canteen
                            ? styles.serviceEnabledText
                            : styles.serviceDisabledText,
                        ]}
                      >
                        {canteen
                          ? "Enabled"
                          : "Not enabled"}
                      </Text>
                    </View>

                  </View>
                </View>
              ) : null}

              {/* RECENT PAYMENTS */}

              <View
                style={[
                  styles.sectionCard,
                  styles.sectionCardGreen,
                ]}
              >
                <View style={styles.sectionHeader}>

                  <View style={styles.sectionTitleWrap}>

                    <View
                      style={[
                        styles.sectionIcon,
                        styles.sectionIconGreen,
                      ]}
                    >
                      <ReceiptText
                        size={17}
                        color={UI.green}
                      />
                    </View>

                    <View style={styles.sectionHeadingCopy}>
                      <Text style={styles.sectionTitle}>
                        Recent Payments
                      </Text>

                      <Text style={styles.sectionSubtitle}>
                        Latest rent payment transactions
                      </Text>
                    </View>

                  </View>

                  <Pressable
                    onPress={() =>
                      setActiveTab("payments")
                    }
                    style={styles.viewAllButton}
                  >
                    <Text style={styles.viewAllText}>
                      View all
                    </Text>

                    <ChevronRight
                      size={15}
                      color={UI.primary}
                    />
                  </Pressable>

                </View>

                <View style={styles.simpleList}>

                  {payments
                    .slice(0, 3)
                    .map((payment) => (
                      <View
                        key={payment.key}
                        style={styles.paymentCard}
                      >

                        <View style={styles.paymentIcon}>
                          <ReceiptText
                            size={17}
                            color={UI.green}
                          />
                        </View>

                        <View style={styles.paymentMain}>
                          <Text style={styles.paymentMonth}>
                            {payment.month}
                          </Text>

                          <Text style={styles.paymentDate}>
                            {formatDate(
                              payment.date
                            )}
                          </Text>
                        </View>

                        <View style={styles.paymentRight}>
                          <Text style={styles.paymentAmount}>
                            {money(
                              payment.amount
                            )}
                          </Text>

                          <View style={styles.paidBadge}>
                            <Check
                              size={10}
                              color={UI.green}
                            />

                            <Text style={styles.paidBadgeText}>
                              Paid
                            </Text>
                          </View>
                        </View>

                      </View>
                    ))}

                  {!payments.length ? (
                    <View style={styles.emptyBox}>
                      <ReceiptText
                        size={22}
                        color={UI.subtle}
                      />

                      <Text style={styles.emptyText}>
                        No rent payments recorded yet.
                      </Text>
                    </View>
                  ) : null}

                </View>
              </View>

            </>
          ) : null}

          {/* =============================================
              PAYMENTS TAB
          ============================================= */}

          {activeTab === "payments" ? (
            <View
              style={[
                styles.sectionCard,
                styles.sectionCardGreen,
              ]}
            >
              <SectionHeader
                icon={ReceiptText}
                title="Payment History"
                subtitle={`${payments.length} payment transaction${
                  payments.length === 1
                    ? ""
                    : "s"
                }`}
                tone="green"
              />

              <View style={styles.simpleList}>

                {payments.map(
                  (payment) => (
                    <View
                      key={payment.key}
                      style={styles.paymentCard}
                    >

                      <View style={styles.paymentIcon}>
                        <ReceiptText
                          size={17}
                          color={UI.green}
                        />
                      </View>

                      <View style={styles.paymentMain}>
                        <Text style={styles.paymentMonth}>
                          {payment.month}
                        </Text>

                        <Text style={styles.paymentDate}>
                          {formatDate(
                            payment.date
                          )}
                          {" · "}
                          {payment.paymentMode}
                        </Text>
                      </View>

                      <View style={styles.paymentRight}>
                        <Text style={styles.paymentAmount}>
                          {money(
                            payment.amount
                          )}
                        </Text>

                        <View style={styles.paidBadge}>
                          <Check
                            size={10}
                            color={UI.green}
                          />

                          <Text style={styles.paidBadgeText}>
                            Paid
                          </Text>
                        </View>
                      </View>

                    </View>
                  )
                )}

                {!payments.length ? (
                  <View style={styles.emptyBox}>
                    <ReceiptText
                      size={24}
                      color={UI.subtle}
                    />

                    <Text style={styles.emptyTitle}>
                      No payments yet
                    </Text>

                    <Text style={styles.emptyText}>
                      Rent payments will appear here once they are recorded.
                    </Text>
                  </View>
                ) : null}

              </View>
            </View>
          ) : null}

          {/* =============================================
              DOCUMENTS
          ============================================= */}

          {activeTab === "documents" ? (
            <View
              style={[
                styles.sectionCard,
                styles.sectionCardBlue,
              ]}
            >
              <SectionHeader
                icon={FileText}
                title="Documents"
                subtitle={`${documents.length} uploaded document${
                  documents.length === 1
                    ? ""
                    : "s"
                }`}
                tone="blue"
              />

              <View style={styles.simpleList}>

                {documents.map(
                  (document, index) => (
                    <View
                      key={
                        document?._id ||
                        document?.url ||
                        index
                      }
                      style={styles.documentCard}
                    >

                      <View style={styles.documentIcon}>
                        <FileText
                          size={18}
                          color={UI.primaryDark}
                        />
                      </View>

                      <View style={styles.documentCopy}>

                        <Text
                          style={styles.documentTitle}
                          numberOfLines={1}
                        >
                          {document?.documentType ||
                            document?.relation ||
                            document?.fileName ||
                            `Document ${
                              index + 1
                            }`}
                        </Text>

                        <Text style={styles.documentMeta}>
                          {document?.createdAt
                            ? `Uploaded · ${formatDate(
                                document.createdAt
                              )}`
                            : "Uploaded document"}
                        </Text>

                      </View>

                      <View style={styles.availableBadge}>
                        <ShieldCheck
                          size={12}
                          color={UI.green}
                        />

                        <Text style={styles.availableText}>
                          Available
                        </Text>
                      </View>

                    </View>
                  )
                )}

                {!documents.length ? (
                  <View style={styles.emptyBox}>
                    <FileText
                      size={24}
                      color={UI.subtle}
                    />

                    <Text style={styles.emptyTitle}>
                      No documents
                    </Text>

                    <Text style={styles.emptyText}>
                      Uploaded tenant documents will appear here.
                    </Text>
                  </View>
                ) : null}

              </View>
            </View>
          ) : null}

          {/* =============================================
              BOTTOM ACTIONS
          ============================================= */}

          <View style={styles.bottomActions}>

            <Pressable
              onPress={markLeaving}
              style={styles.leaveButton}
            >
              <View style={styles.leaveButtonIcon}>
                <ArrowLeft
                  size={16}
                  color={UI.red}
                />
              </View>

              <Text style={styles.leaveButtonText}>
                Mark Leaving
              </Text>
            </Pressable>

            <Pressable
              onPress={editTenant}
              style={styles.editButton}
            >
              <Pencil
                size={17}
                color="#FFFFFF"
              />

              <Text style={styles.editButtonText}>
                Edit Tenant
              </Text>
            </Pressable>

            <Pressable
              onPress={requestDelete}
              style={styles.deleteButton}
            >
              <Trash2 size={16} color={UI.red} />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>

          </View>

        </ScrollView>

      </View>
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteModal}>
            <Text style={styles.deleteTitle}>Confirm deletion</Text>
            <Text style={styles.deleteHint}>Enter your password to permanently delete {tenant.name}.</Text>
            <TextInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry placeholder="Password" style={styles.deleteInput} />
            <View style={styles.deleteActions}>
              <Pressable onPress={() => { setShowDeleteModal(false); setDeletePassword(""); }} style={styles.deleteCancel}><Text style={styles.deleteCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={confirmDelete} disabled={deleting} style={styles.deleteConfirm}>{deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteConfirmText}>Delete tenant</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({

  screen: {
    flex: 1,
    backgroundColor: UI.screen,
  },

  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  /* ========================================================
     LOADING
  ======================================================== */

  loading: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.screen,
  },

  loadingIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: UI.primarySoft,
  },

  loadingText: {
    marginTop: 9,
    color: UI.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  error: {
    color: UI.red,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },

  backButtonLarge: {
    marginTop: 14,
    height: 42,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.primaryDark,
  },

  backButtonLargeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  /* ========================================================
     HEADER
  ======================================================== */

  header: {
    minHeight: 58,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card,
    ...lightShadow,
  },

  headerEditButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#C6D9E8",
    backgroundColor: UI.primarySoft,
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
  },

  headerTitle: {
    color: UI.text,
    fontSize: 26,
    fontWeight: "900",
  },

  headerSubtitle: {
    marginTop: 2,
    color: UI.muted,
    fontSize: 11,
    fontWeight: "600",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 45,
  },

  /* ========================================================
     PROFILE CARD
  ======================================================== */

  profileCard: {
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#C9D9E6",
    backgroundColor: UI.card,
    ...mediumShadow,
  },

  profileTop: {
    position: "relative",
    minHeight: 112,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#F0F6FA",
  },

  profileDecorCircleOne: {
    position: "absolute",
    width: 130,
    height: 130,
    top: -70,
    right: -40,
    borderRadius: 65,
    backgroundColor: "#DFEDF6",
  },

  profileDecorCircleTwo: {
    position: "absolute",
    width: 80,
    height: 80,
    bottom: -55,
    left: 85,
    borderRadius: 40,
    backgroundColor: "#E6F2F8",
  },

  avatar: {
    width: 70,
    height: 70,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 35,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#DCEAF4",
    ...mediumShadow,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  avatarText: {
    color: UI.primaryDark,
    fontSize: 22,
    fontWeight: "900",
  },

  profileCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },

  profileName: {
    color: UI.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
  },

  profilePhone: {
    marginTop: 3,
    color: UI.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  badgeRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  /* CANTEEN BADGE */

  canteenBadge: {
    minHeight: 27,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F3C88E",
    backgroundColor: "#FFF1DE",
  },

  canteenBadgeText: {
    color: UI.orange,
    fontSize: 9,
    fontWeight: "900",
  },

  /* PAYMENT CYCLE */

  cycleBadge: {
    minHeight: 27,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#B7D0E2",
    backgroundColor: "#E8F3FA",
  },

  cycleBadgeText: {
    color: UI.primaryDark,
    fontSize: 9,
    fontWeight: "900",
  },

  /* ACTIVE */

  activeBadge: {
    alignSelf: "flex-start",
    minHeight: 27,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#B9DFC9",
    backgroundColor: "#EAF7F0",
  },

  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: UI.green,
  },

  activeText: {
    color: UI.green,
    fontSize: 9,
    fontWeight: "900",
  },

  leavingBadge: {
    borderColor: "#F1D0A2",
    backgroundColor: UI.yellowSoft,
  },

  leavingDot: {
    backgroundColor: UI.yellow,
  },

  leavingText: {
    color: UI.yellow,
  },

  /* ========================================================
     PROFILE STATS
  ======================================================== */

  quickStats: {
    minHeight: 90,
    paddingVertical: 12,
    paddingHorizontal: 6,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
  },

  quickStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  quickStatIconBlue: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.primarySoft,
  },

  quickStatIconOrange: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.orangeSoft,
  },

  quickStatIconPurple: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.purpleSoft,
  },

  quickStatLabel: {
    marginTop: 5,
    color: UI.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  quickStatValue: {
    marginTop: 3,
    width: "100%",
    color: UI.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  quickDivider: {
    width: 1,
    marginVertical: 8,
    backgroundColor: UI.border,
  },

  /* ========================================================
     QUICK ACTIONS
  ======================================================== */

  quickActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 7,
  },

  quickAction: {
    flex: 1,
    minWidth: 0,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    ...lightShadow,
  },

  quickActionCall: {
    borderColor: "#CBE2D7",
    backgroundColor: "#F2FAF6",
  },

  quickActionMessage: {
    borderColor: "#C9DCEB",
    backgroundColor: "#F3F8FC",
  },

  quickActionRent: {
    borderColor: "#EFD5A8",
    backgroundColor: "#FFF9EF",
  },

  quickActionShare: {
    borderColor: "#DDD0EE",
    backgroundColor: "#F8F5FC",
  },

  quickActionShift: {
    borderColor: "#DDD0EE",
    backgroundColor: "#F8F5FC",
  },

  quickActionIconGreen: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.greenSoft,
  },

  quickActionIconBlue: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.primarySoft,
  },

  quickActionIconOrange: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.orangeSoft,
  },

  quickActionIconPurple: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.purpleSoft,
  },

  quickActionText: {
    color: UI.text,
    fontSize: 9,
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.35,
  },

  /* ========================================================
     TABS
  ======================================================== */

  tabs: {
    minHeight: 56,
    marginTop: 11,
    padding: 4,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "#ECEFF1",
  },

  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 8,
  },

  tabActive: {
    borderWidth: 1,
    borderColor: "#C8D8E5",
    backgroundColor: "#FFFFFF",
    ...lightShadow,
  },

  tabText: {
    color: UI.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  tabTextActive: {
    color: UI.primaryDark,
    fontWeight: "900",
  },

  /* ========================================================
     SECTION CARDS
  ======================================================== */

  sectionCard: {
    marginTop: 11,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4DEE5",
    borderLeftWidth: 4,
    backgroundColor: UI.card,
    ...lightShadow,
  },

  sectionCardBlue: {
    borderLeftColor: UI.primary,
  },

  sectionCardOrange: {
    borderLeftColor: "#D99B46",
  },

  sectionCardGreen: {
    borderLeftColor: UI.green,
  },

  sectionCardPurple: {
    borderLeftColor: "#8B72B5",
  },

  sectionHeader: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E3E8EC",
    backgroundColor: "#FAFCFD",
  },

  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  sectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },

  sectionIconBlue: {
    backgroundColor: UI.primarySoft,
  },

  sectionIconOrange: {
    backgroundColor: UI.orangeSoft,
  },

  sectionIconGreen: {
    backgroundColor: UI.greenSoft,
  },

  sectionIconPurple: {
    backgroundColor: UI.purpleSoft,
  },

  sectionHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },

  sectionSubtitle: {
    marginTop: 2,
    color: UI.muted,
    fontSize: 9,
    fontWeight: "600",
  },

  sectionAction: {
    height: 31,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    backgroundColor: UI.primarySoft,
  },

  sectionActionText: {
    color: UI.primaryDark,
    fontSize: 9,
    fontWeight: "900",
  },

  sectionBody: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },

  /* ========================================================
     INFO
  ======================================================== */

  infoRow: {
    minHeight: 43,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E9ED",
  },

  infoRowLast: {
    borderBottomWidth: 0,
  },

  infoLabel: {
    width: "42%",
    color: "#718096",
    fontSize: 10,
    fontWeight: "700",
  },

  infoValue: {
    flex: 1,
    color: UI.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },

  /* ========================================================
     CANTEEN SERVICE
  ======================================================== */

  serviceRow: {
    minHeight: 74,
    margin: 10,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
  },

  serviceRowActive: {
    borderColor: "#F0D6B0",
    backgroundColor: "#FFF8EF",
  },

  serviceRowInactive: {
    borderColor: UI.border,
    backgroundColor: "#F8F9FA",
  },

  serviceIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFE9CD",
  },

  serviceCopy: {
    flex: 1,
    minWidth: 0,
  },

  serviceTitle: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  serviceSubtitle: {
    marginTop: 3,
    color: UI.muted,
    fontSize: 9,
    fontWeight: "600",
  },

  serviceStatus: {
    minHeight: 27,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 999,
  },

  serviceEnabled: {
    backgroundColor: UI.greenSoft,
  },

  serviceDisabled: {
    backgroundColor: "#ECEFF1",
  },

  serviceStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  serviceEnabledText: {
    color: UI.green,
  },

  serviceDisabledText: {
    color: UI.muted,
  },

  /* ========================================================
     VIEW ALL
  ======================================================== */

  viewAllButton: {
    minHeight: 31,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  viewAllText: {
    color: UI.primary,
    fontSize: 9,
    fontWeight: "900",
  },

  /* ========================================================
     PAYMENTS
  ======================================================== */

  simpleList: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  paymentCard: {
    minHeight: 62,
    marginVertical: 4,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E2E7EB",
    backgroundColor: "#FCFDFD",
  },

  paymentIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.greenSoft,
  },

  paymentMain: {
    flex: 1,
    minWidth: 0,
  },

  paymentMonth: {
    color: UI.text,
    fontSize: 11,
    fontWeight: "900",
  },

  paymentDate: {
    marginTop: 3,
    color: UI.muted,
    fontSize: 8,
    fontWeight: "600",
  },

  paymentRight: {
    alignItems: "flex-end",
  },

  paymentAmount: {
    color: UI.text,
    fontSize: 11,
    fontWeight: "900",
  },

  paidBadge: {
    minHeight: 23,
    marginTop: 4,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: UI.greenSoft,
  },

  paidBadgeText: {
    color: UI.green,
    fontSize: 8,
    fontWeight: "900",
  },

  /* ========================================================
     DOCUMENTS
  ======================================================== */

  documentCard: {
    minHeight: 64,
    marginVertical: 4,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E1E8ED",
    backgroundColor: "#FBFCFD",
  },

  documentIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: UI.primarySoft,
  },

  documentCopy: {
    flex: 1,
    minWidth: 0,
  },

  documentTitle: {
    color: UI.text,
    fontSize: 10,
    fontWeight: "900",
  },

  documentMeta: {
    marginTop: 3,
    color: UI.muted,
    fontSize: 8,
    fontWeight: "600",
  },

  availableBadge: {
    minHeight: 25,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: UI.greenSoft,
  },

  availableText: {
    color: UI.green,
    fontSize: 8,
    fontWeight: "900",
  },

  /* ========================================================
     NOTES
  ======================================================== */

  noteCard: {
    minHeight: 60,
    marginVertical: 4,
    padding: 10,
    flexDirection: "row",
    gap: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E3D9F0",
    backgroundColor: "#FAF8FD",
  },

  noteIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.purpleSoft,
  },

  noteCopy: {
    flex: 1,
    minWidth: 0,
  },

  noteText: {
    color: UI.text,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "700",
  },

  noteDate: {
    marginTop: 5,
    color: UI.muted,
    fontSize: 8,
    fontWeight: "600",
  },

  /* ========================================================
     EMPTY
  ======================================================== */

  emptyBox: {
    minHeight: 115,
    marginVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 9,
    backgroundColor: "#F8FAFB",
  },

  emptyTitle: {
    marginTop: 7,
    color: UI.text,
    fontSize: 11,
    fontWeight: "900",
  },

  emptyText: {
    marginTop: 4,
    color: UI.muted,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  /* ========================================================
     BOTTOM ACTIONS
  ======================================================== */

  bottomActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },

  leaveButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E89A9A",
    backgroundColor: "#FFF9F8",
  },

  leaveButtonIcon: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: UI.redSoft,
  },

  leaveButtonText: {
    color: UI.red,
    fontSize: 10,
    fontWeight: "900",
  },

  editButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: UI.primaryDark,
    ...mediumShadow,
  },

  editButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  deleteButton: { flex: 0.8, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, borderWidth: 1.5, borderColor: "#E89A9A", backgroundColor: "#FFF1F1" },
  deleteButtonText: { color: UI.red, fontSize: 10, fontWeight: "900" },
  deleteOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(16,31,43,.45)" },
  deleteModal: { width: "100%", maxWidth: 380, padding: 20, borderRadius: 14, backgroundColor: "#FFFFFF" },
  deleteTitle: { color: UI.text, fontSize: 19, fontWeight: "800" },
  deleteHint: { marginTop: 8, color: UI.muted, fontSize: 13, lineHeight: 19 },
  deleteInput: { height: 48, marginTop: 16, paddingHorizontal: 13, borderWidth: 1, borderColor: UI.border, borderRadius: 8, color: UI.text },
  deleteActions: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end", gap: 9 },
  deleteCancel: { minHeight: 42, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: UI.primarySoft },
  deleteCancelText: { color: UI.primaryDark, fontWeight: "800" },
  deleteConfirm: { minWidth: 118, minHeight: 42, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: UI.red },
  deleteConfirmText: { color: "#FFFFFF", fontWeight: "800" },

});
