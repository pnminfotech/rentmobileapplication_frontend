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
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  HelpCircle,
  KeyRound,
  LogOut,
  ShieldCheck,
} from "lucide-react-native";

import { getAppBootstrap, requestPasswordReset } from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { colors } from "../../src/theme/colors";
import { useResponsive } from "../../src/utils/responsive";

const COLORS = {
  bg: "#FFF8F1",
  card: "#FFFDF9",
  soft: "#F8EFE6",
  text: colors.text,
  muted: colors.muted,
  border: "#EFE0D3",
  burgundy: "#7A365D",
  burgundyDark: "#4A2138",
  burgundySoft: "#F5E6EE",
  green: "#496E3F",
  greenSoft: "#EEF3E8",
  orange: "#D9742F",
  orangeSoft: "#FFF0E4",
  red: colors.danger,
  redSoft: colors.dangerSoft,
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatEmail(value) {
  return value ? String(value).trim().toLowerCase() : "-";
}

function InfoRow({ label, value }) {
  const isEmail = String(label || "").toLowerCase() === "email";
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, isEmail && styles.infoEmailValue]} numberOfLines={2}>
        {isEmail ? formatEmail(value) : value || "-"}
      </Text>
    </View>
  );
}

function SettingRow({ Icon, title, subtitle, onPress, danger }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Icon size={19} color={danger ? COLORS.red : COLORS.burgundy} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function SuperAdminProfileScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await getAppBootstrap();
      setBootstrap(data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function sendPasswordReset() {
    const rawEmail = bootstrap?.user?.email;
    if (!rawEmail) return Alert.alert("Email missing", "No email found for this profile.");
    const email = formatEmail(rawEmail);

    try {
      setAction("password");
      await requestPasswordReset(email);
      Alert.alert("Reset link sent", `Password reset link has been sent to ${email}.`);
    } catch (err) {
      Alert.alert("Unable to send link", err.response?.data?.message || "Please try again.");
    } finally {
      setAction("");
    }
  }

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.burgundy} /></View>;
  }

  const user = bootstrap?.user || {};
  const initials = String(user.name || user.email || "SA").trim().slice(0, 2).toUpperCase();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
          <Text style={styles.headerTitle}>Profile Settings</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        <View style={styles.heroCurve} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.name || "Superadmin"}</Text>
        <Text style={styles.email}>{formatEmail(user.email)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account information</Text>
        <InfoRow label="Name" value={user.name || "Superadmin"} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Role" value={String(user.role || "superadmin").replace(/_/g, " ")} />
        <InfoRow label="Status" value={user.status || "active"} />
        <InfoRow label="Created" value={formatDate(user.createdAt)} />
      </View>

      <View style={styles.settings}>
        <SettingRow
          Icon={KeyRound}
          title="Change Password"
          subtitle={action === "password" ? "Sending reset link..." : "Send reset link to registered email"}
          onPress={sendPasswordReset}
        />
        <SettingRow
          Icon={Bell}
          title="Notification Preferences"
          subtitle="Coming soon"
          onPress={() => Alert.alert("Coming soon", "Notification preferences will be added later.")}
        />
        <SettingRow
          Icon={HelpCircle}
          title="Help & Support"
          subtitle="Contact support details"
          onPress={() => Alert.alert("Support", "Support details can be added here.")}
        />
        <SettingRow
          Icon={ShieldCheck}
          title="Terms & Conditions"
          subtitle="App policy and usage terms"
          onPress={() => Alert.alert("Terms", "Terms and conditions page can be added here.")}
        />
        <SettingRow
          Icon={LogOut}
          title="Logout"
          subtitle="Sign out from your account"
          onPress={logout}
          danger
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingTop: 8, paddingBottom: 42 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  headerTitle: { marginTop: 2, color: COLORS.text, fontSize: 24, fontWeight: "900" },
  error: { marginBottom: 12, padding: 12, color: COLORS.red, borderRadius: 12, backgroundColor: COLORS.redSoft, fontWeight: "700" },
  hero: { minHeight: 190, overflow: "hidden", alignItems: "center", padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  heroCurve: { position: "absolute", left: -30, right: -30, top: 0, height: 76, borderBottomLeftRadius: 130, borderBottomRightRadius: 130, backgroundColor: COLORS.burgundy },
  avatar: { width: 76, height: 76, marginTop: 20, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: COLORS.card, borderRadius: 38, backgroundColor: COLORS.burgundySoft },
  avatarText: { color: COLORS.burgundy, fontSize: 23, fontWeight: "900" },
  name: { marginTop: 12, color: COLORS.text, fontSize: 21, fontWeight: "900" },
  email: { marginTop: 5, color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  card: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionTitle: { marginBottom: 6, color: COLORS.text, fontSize: 16, fontWeight: "900" },
  infoRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  infoValue: { maxWidth: "62%", color: COLORS.text, fontSize: 13, fontWeight: "800", textAlign: "right", textTransform: "capitalize" },
  infoEmailValue: { textTransform: "none" },
  settings: { marginTop: 14, gap: 10 },
  settingRow: { minHeight: 64, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  settingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.burgundySoft },
  settingIconDanger: { backgroundColor: COLORS.redSoft },
  settingCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  settingTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  settingSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  dangerText: { color: COLORS.red },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
