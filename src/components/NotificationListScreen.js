import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notificationApi";

const COLORS = {
  // Super Admin variant: same palette as the Super Admin dashboard.
  bg: "#F6F8F8",
  card: "#FFFFFF",
  soft: "#F0F3F4",
  text: "#101828",
  muted: "#667085",
  subtle: "#98A2B3",
  border: "#D9E1E5",
  burgundy: "#006D9E",
  burgundyDark: "#004B76",
  burgundySoft: "#E3F4FA",
  green: "#27845C",
  greenSoft: "#E7F5ED",
  orange: "#C98216",
  orangeSoft: "#FFF3DE",
  red: "#D14343",
  redSoft: "#FDEAEA",
};

const SYSTEM_COLORS = {
  // Keep this in lockstep with the System Admin screens (tenants, light bills,
  // expenses and dashboard), rather than the older cream system theme.
  bg: "#F6F8F7",
  card: "#FFFFFF",
  soft: "#E7F1F8",
  pale: "#F4F8FB",
  text: "#111B2A",
  muted: "#63738A",
  subtle: "#94A3B8",
  border: "#D9E1E7",
  burgundy: "#4F7FA6",
  burgundyDark: "#244F70",
  burgundySoft: "#E7F1F8",
  green: "#258467",
  greenSoft: "#E8F6F1",
  orange: "#DC9800",
  orangeSoft: "#FFF4E6",
  red: "#EF574F",
  redSoft: "#FFE8E6",
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + " " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function typeLabel(value) {
  const label = String(value || "system").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function priorityStyle(priority, isSystem) {
  if (priority === "high") return isSystem ? styles.systemHigh : styles.high;
  if (priority === "low") return isSystem ? styles.systemLow : styles.low;
  return isSystem ? styles.systemNormal : styles.normal;
}

function isActiveNotification(item) {
  if (!item || item.status === "resolved") return false;
  if (!item.expiresAt) return true;
  const expiresAt = new Date(item.expiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt > new Date();
}

export default function NotificationListScreen({ backTo, title = "Notifications", subtitle = "System updates and reminders", variant = "superadmin" }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isSystem = variant === "system";
  const theme = isSystem ? SYSTEM_COLORS : COLORS;
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await getNotifications({ status: "all", unreadOnly: true, limit: 100 });
      setNotifications(Array.isArray(data) ? data.filter(isActiveNotification) : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  async function markRead(notification) {
    if (notification.read) return;
    try {
      setActionId(String(notification._id));
      await markNotificationRead(notification._id);
      setNotifications((current) => current.filter((item) => String(item._id) !== String(notification._id)));
    } catch (err) {
      Alert.alert("Unable to update", err.response?.data?.message || "Please try again.");
    } finally {
      setActionId("");
    }
  }

  function notificationTarget(notification) {
    const organizationId =
      notification?.payload?.organizationId ||
      (notification?.entityType === "organization" ? notification?.entityId : "") ||
      "";

    if (organizationId && notification?.audience === "superadmin") {
      return {
        pathname: "/superadmin/organization-detail",
        params: { id: String(organizationId) },
      };
    }

    return null;
  }

  async function openNotification(notification) {
    await markRead(notification);
    const target = notificationTarget(notification);
    if (target) router.push(target);
  }

  async function markAllRead() {
    try {
      setActionId("all");
      await markAllNotificationsRead();
      setNotifications([]);
    } catch (err) {
      Alert.alert("Unable to update", err.response?.data?.message || "Please try again.");
    } finally {
      setActionId("");
    }
  }

  const unread = notifications.filter((item) => !item.read && item.status !== "read").length;

  return (
    <View style={[styles.screen, isSystem && styles.systemScreen]}>
      <View style={[styles.header, isSystem && styles.systemHeader]}>
        <Pressable onPress={() => router.replace(backTo)} style={styles.iconButton}>
          <ArrowLeft size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerText}>
          {!isSystem ? <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text> : null}
          <Text style={[styles.title, isSystem && styles.systemTitle]}>{title}</Text>
          {isSystem ? <Text style={styles.systemSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable disabled={!unread || actionId === "all"} onPress={markAllRead} style={[styles.readAll, isSystem && styles.systemReadAll, (!unread || actionId === "all") && styles.disabled]}>
            {actionId === "all" ? <ActivityIndicator size="small" color={theme.burgundy} /> : <CheckCheck size={18} color={theme.burgundy} />}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={theme.burgundy} /></View>
      ) : error ? (
        <View style={styles.loading}><Text style={[styles.error, isSystem && styles.systemError]}>{error}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, isSystem && styles.systemContent, { paddingBottom: Math.max(insets.bottom + 28, 42) }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.summaryCard, isSystem && styles.systemSummaryCard]}>
            <View style={[styles.summaryIcon, isSystem && styles.systemSummaryIcon]}>
              <Bell size={22} color={theme.burgundy} />
            </View>
            <View style={styles.summaryText}>
              <Text style={[styles.summaryTitle, isSystem && styles.systemText]}>{notifications.length} notifications</Text>
              <Text style={[styles.summarySubtitle, isSystem && styles.systemMuted]}>{unread ? `${unread} need attention` : "Everything is read"}</Text>
            </View>
          </View>
          {!notifications.length ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, isSystem && styles.systemEmptyIcon]}>
                <Bell size={34} color={theme.burgundy} />
              </View>
              <Text style={[styles.emptyTitle, isSystem && styles.systemText]}>No notifications yet</Text>
              <Text style={[styles.emptyText, isSystem && styles.systemMuted]}>New alerts will appear here.</Text>
            </View>
          ) : null}
          {notifications.map((item) => {
            const organization = item.organizationId?.name;
            return (
              <Pressable key={item._id} onPress={() => openNotification(item)} style={[styles.card, isSystem && styles.systemCard, !item.read && styles.unreadCard, isSystem && !item.read && styles.systemUnreadCard]}>
                <View style={styles.cardTop}>
                  <View style={[styles.cardIcon, isSystem && styles.systemCardIcon, !item.read && styles.cardIconUnread, isSystem && !item.read && styles.systemCardIconUnread]}>
                    <Bell size={18} color={!item.read ? theme.burgundy : theme.muted} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardTitle, isSystem && styles.systemText]}>{item.title || typeLabel(item.type)}</Text>
                    <Text style={[styles.cardMessage, isSystem && styles.systemMuted]}>{item.message || "System notification"}</Text>
                    {organization ? <Text style={[styles.cardMeta, isSystem && styles.systemCardMeta]}>{organization}</Text> : null}
                  </View>
                  <View style={[styles.priority, priorityStyle(item.priority, isSystem)]}>
                    <Text style={[styles.priorityText, isSystem && styles.systemPriorityText]}>{typeLabel(item.priority)}</Text>
                  </View>
                </View>
                <View style={[styles.cardFooter, isSystem && styles.systemCardFooter]}>
                  <Text style={[styles.type, isSystem && styles.systemType]}>{typeLabel(item.type)}</Text>
                  <Text style={[styles.date, isSystem && styles.systemMuted]}>{formatDate(item.createdAt)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { width: "100%", maxWidth: 430, minHeight: 58, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, marginBottom: 8, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.bg },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  title: { marginTop: 2, color: COLORS.text, fontSize: 24, fontWeight: "900" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  readAll: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  disabled: { opacity: 0.45 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  error: { color: COLORS.red, textAlign: "center" },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  summaryCard: { minHeight: 78, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  summaryIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: COLORS.burgundySoft },
  summaryText: { flex: 1, minWidth: 0 },
  summaryTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  summarySubtitle: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  empty: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: COLORS.burgundySoft },
  emptyTitle: { marginTop: 12, color: COLORS.text, fontSize: 16, fontWeight: "900" },
  emptyText: { marginTop: 5, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  card: { padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  unreadCard: { borderColor: COLORS.burgundy, backgroundColor: "#FFFCF8" },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  cardIcon: { width: 42, height: 42, marginRight: 10, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.soft },
  cardIconUnread: { backgroundColor: COLORS.burgundySoft },
  cardText: { flex: 1, minWidth: 0, paddingRight: 8 },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  cardMessage: { marginTop: 5, color: COLORS.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  cardMeta: { marginTop: 5, color: COLORS.burgundy, fontSize: 12, fontWeight: "800" },
  priority: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: COLORS.soft },
  high: { backgroundColor: COLORS.redSoft },
  normal: { backgroundColor: COLORS.burgundySoft },
  low: { backgroundColor: COLORS.soft },
  priorityText: { color: COLORS.text, fontSize: 10, fontWeight: "900" },
  cardFooter: { marginTop: 12, paddingTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: COLORS.border },
  type: { color: COLORS.burgundy, fontSize: 11, fontWeight: "900" },
  date: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  systemScreen: { backgroundColor: SYSTEM_COLORS.bg },
  systemHeader: {
    maxWidth: undefined,
    alignSelf: "stretch",
    minHeight: 58,
    paddingHorizontal: 18,
    paddingTop: 0,
    marginBottom: 4,
    alignItems: "center",
    backgroundColor: SYSTEM_COLORS.bg,
  },
  systemEyebrow: { color: SYSTEM_COLORS.deep },
  systemTitle: { marginTop: 0, color: SYSTEM_COLORS.text, fontSize: 30, lineHeight: 34 },
  systemSubtitle: { marginTop: 2, color: SYSTEM_COLORS.muted, fontSize: 14, fontWeight: "600" },
  systemReadAll: { backgroundColor: SYSTEM_COLORS.soft },
  systemError: { color: SYSTEM_COLORS.red },
  systemContent: { maxWidth: undefined, alignSelf: "stretch", paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  systemSummaryCard: { minHeight: 74, padding: 12, borderRadius: 8, borderColor: SYSTEM_COLORS.border, backgroundColor: SYSTEM_COLORS.card },
  systemSummaryIcon: { backgroundColor: SYSTEM_COLORS.soft },
  systemText: { color: SYSTEM_COLORS.text },
  systemMuted: { color: SYSTEM_COLORS.muted },
  systemEmptyIcon: { backgroundColor: SYSTEM_COLORS.soft },
  systemCard: { minHeight: 88, padding: 13, borderRadius: 8, borderColor: SYSTEM_COLORS.border, backgroundColor: SYSTEM_COLORS.card },
  systemUnreadCard: { borderColor: SYSTEM_COLORS.burgundy, backgroundColor: "#F7FBFE" },
  systemCardIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: SYSTEM_COLORS.pale },
  systemCardIconUnread: { backgroundColor: SYSTEM_COLORS.soft },
  systemCardMeta: { color: SYSTEM_COLORS.deep },
  systemHigh: { backgroundColor: SYSTEM_COLORS.redSoft },
  systemNormal: { backgroundColor: SYSTEM_COLORS.soft },
  systemLow: { backgroundColor: SYSTEM_COLORS.pale },
  systemPriorityText: { color: SYSTEM_COLORS.text },
  systemCardFooter: { borderTopColor: SYSTEM_COLORS.border },
  systemType: { color: SYSTEM_COLORS.deep },
});
