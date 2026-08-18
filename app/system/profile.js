import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  Building2,
  CirclePlus,
  HelpCircle,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react-native";

import { getAppBootstrap, getWalletSummary, requestPasswordReset, requestSubscriptionUpgrade } from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { systemColors as S, systemShadow } from "../../src/theme/systemTheme";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(value) {
  const label = String(value || "-").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function money(value, currency = "INR") {
  return `${currency === "INR" ? "Rs." : currency} ${Number(value || 0).toLocaleString("en-IN")}`;
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
        <Icon size={20} color={danger ? S.red : S.deep} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function SystemProfileScreen() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeUnits, setUpgradeUnits] = useState({ beds: "", rooms: "", shops: "" });
  const [wallet, setWallet] = useState(null);
  const [useWalletForUpgrade, setUseWalletForUpgrade] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      const [data, walletData] = await Promise.all([
        getAppBootstrap(),
        getWalletSummary().catch(() => null),
      ]);
      setBootstrap(data);
      setWallet(walletData);
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

  function updateUpgradeUnit(key, value) {
    setUpgradeUnits((current) => ({
      ...current,
      [key]: String(value || "").replace(/[^0-9]/g, ""),
    }));
  }

  async function submitUpgradeRequest() {
    const unitsToAdd = {
      beds: Number(upgradeUnits.beds || 0),
      rooms: Number(upgradeUnits.rooms || 0),
      shops: Number(upgradeUnits.shops || 0),
    };

    if (!unitsToAdd.beds && !unitsToAdd.rooms && !unitsToAdd.shops) {
      return Alert.alert("Add units", "Enter at least one extra bed, room, or shop.");
    }

    try {
      setAction("upgrade");
      const result = await requestSubscriptionUpgrade({ units: unitsToAdd, useWallet: useWalletForUpgrade });
      setUpgradeUnits({ beds: "", rooms: "", shops: "" });
      setShowUpgrade(false);
      await load();
      const walletCoinsUsed = Number(result?.upgrade?.walletCoinsUsed || 0);
      Alert.alert(
        "Upgrade request sent",
        `Request sent to superadmin. Payable amount: ${money(result?.upgrade?.amount, result?.upgrade?.currency)}${walletCoinsUsed ? `\nWallet used: ${walletCoinsUsed} coins` : ""}`
      );
    } catch (err) {
      Alert.alert("Unable to request upgrade", err.response?.data?.message || "Please try again.");
    } finally {
      setAction("");
    }
  }

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={S.deep} /></View>;
  }

  const user = bootstrap?.user || {};
  const organization = bootstrap?.organization || {};
  const subscription = bootstrap?.subscription || {};
  const units = subscription?.units || organization?.unitAllocation || {};
  const initials = String(user.name || user.email || "AD").trim().slice(0, 2).toUpperCase();
  const walletBalance = Number(wallet?.balance || 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={S.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SYSTEM CONTROL CENTER</Text>
          <Text style={styles.headerTitle}>Profile Settings</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        <View style={styles.heroCurve} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.name || "System admin"}</Text>
        <Text style={styles.email}>{formatEmail(user.email)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account information</Text>
        <InfoRow label="Name" value={user.name || "System admin"} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Role" value={statusLabel(user.role)} />
        <InfoRow label="Status" value={statusLabel(user.status)} />
        <InfoRow label="Created" value={formatDate(user.createdAt)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Business information</Text>
        <InfoRow label="Business" value={organization.name} />
        <InfoRow label="Type" value={statusLabel(organization.businessType)} />
        <InfoRow label="Owner" value={organization.ownerName} />
        <InfoRow label="Phone" value={organization.phone} />
        <InfoRow label="Status" value={statusLabel(organization.status)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <InfoRow label="Status" value={statusLabel(subscription.status)} />
        <InfoRow label="Amount" value={money(subscription.amount, subscription.currency)} />
        <InfoRow label="Duration" value={subscription.durationMonths ? `${subscription.durationMonths} months` : "-"} />
        <InfoRow label="Ends" value={formatDate(subscription.endDate)} />
        <View style={styles.unitGrid}>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.beds || 0}</Text><Text style={styles.unitLabel}>Beds</Text></View>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.rooms || 0}</Text><Text style={styles.unitLabel}>Rooms</Text></View>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.shops || 0}</Text><Text style={styles.unitLabel}>Shops</Text></View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Upgrade package</Text>
            <Text style={styles.helperText}>Buy extra units for this same account.</Text>
          </View>
          <Pressable onPress={() => setShowUpgrade((value) => !value)} style={styles.smallAction}>
            <CirclePlus size={17} color={S.deep} />
            <Text style={styles.smallActionText}>{showUpgrade ? "Close" : "Add"}</Text>
          </Pressable>
        </View>
        {showUpgrade ? (
          <View style={styles.upgradeForm}>
            <View style={styles.upgradeInputs}>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Extra beds</Text>
                <TextInput
                  value={upgradeUnits.beds}
                  onChangeText={(value) => updateUpgradeUnit("beds", value)}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={styles.input}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Extra rooms</Text>
                <TextInput
                  value={upgradeUnits.rooms}
                  onChangeText={(value) => updateUpgradeUnit("rooms", value)}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={styles.input}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Extra shops</Text>
                <TextInput
                  value={upgradeUnits.shops}
                  onChangeText={(value) => updateUpgradeUnit("shops", value)}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={styles.input}
                />
              </View>
            </View>
            <Pressable
              onPress={() => walletBalance > 0 && setUseWalletForUpgrade((value) => !value)}
              disabled={!walletBalance}
              style={[styles.walletRow, !walletBalance && styles.walletDisabled]}
            >
              <View style={styles.walletIcon}>
                <WalletCards size={19} color={S.deep} />
              </View>
              <View style={styles.walletCopy}>
                <Text style={styles.walletTitle}>Use wallet coins</Text>
                <Text style={styles.walletText}>
                  Available {walletBalance.toLocaleString("en-IN")} coins. Backend will apply up to payable amount.
                </Text>
              </View>
              <View style={[styles.toggle, useWalletForUpgrade && walletBalance > 0 && styles.toggleActive]}>
                <View style={[styles.toggleKnob, useWalletForUpgrade && walletBalance > 0 && styles.toggleKnobActive]} />
              </View>
            </Pressable>
            <Pressable onPress={submitUpgradeRequest} disabled={action === "upgrade"} style={styles.upgradeButton}>
              {action === "upgrade" ? <ActivityIndicator size="small" color="#fff" /> : <CirclePlus size={18} color="#fff" />}
              <Text style={styles.upgradeButtonText}>Send upgrade request</Text>
            </Pressable>
          </View>
        ) : null}
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
          Icon={RefreshCw}
          title="Refresh Profile"
          subtitle="Sync latest account data"
          onPress={load}
        />
        <SettingRow
          Icon={Building2}
          title="Business Settings"
          subtitle="Business editing will be added later"
          onPress={() => Alert.alert("Coming soon", "Business profile editing will be added later.")}
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
  screen: { flex: 1, backgroundColor: S.screen },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", padding: 16, paddingBottom: 42 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: S.screen },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: S.deep, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  headerTitle: { marginTop: 2, color: S.text, fontSize: 24, fontWeight: "900" },
  error: { marginBottom: 12, padding: 12, color: S.red, borderRadius: 12, backgroundColor: S.redSoft, fontWeight: "700" },
  hero: { minHeight: 190, overflow: "hidden", alignItems: "center", padding: 16, borderWidth: 1, borderColor: S.border, borderRadius: 16, backgroundColor: S.card, ...systemShadow },
  heroCurve: { position: "absolute", left: -30, right: -30, top: 0, height: 76, borderBottomLeftRadius: 130, borderBottomRightRadius: 130, backgroundColor: S.deep },
  avatar: { width: 76, height: 76, marginTop: 20, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: S.card, borderRadius: 38, backgroundColor: S.soft },
  avatarText: { color: S.deep, fontSize: 23, fontWeight: "900" },
  name: { marginTop: 12, color: S.text, fontSize: 21, fontWeight: "900" },
  email: { marginTop: 5, color: S.muted, fontSize: 13, fontWeight: "700" },
  card: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  sectionTitle: { marginBottom: 6, color: S.text, fontSize: 16, fontWeight: "900" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  helperText: { marginTop: 2, color: S.muted, fontSize: 11, fontWeight: "700" },
  smallAction: { minHeight: 36, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: S.border, borderRadius: 12, backgroundColor: S.soft },
  smallActionText: { color: S.deep, fontSize: 12, fontWeight: "900" },
  infoRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: S.border },
  infoLabel: { color: S.muted, fontSize: 12, fontWeight: "700" },
  infoValue: { maxWidth: "62%", color: S.text, fontSize: 13, fontWeight: "800", textAlign: "right", textTransform: "capitalize" },
  infoEmailValue: { textTransform: "none" },
  unitGrid: { marginTop: 12, flexDirection: "row", gap: 8 },
  unitBox: { flex: 1, minHeight: 68, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: S.soft },
  unitValue: { color: S.deep, fontSize: 21, fontWeight: "900" },
  unitLabel: { marginTop: 4, color: S.muted, fontSize: 12, fontWeight: "800" },
  upgradeForm: { marginTop: 12, gap: 12 },
  upgradeInputs: { flexDirection: "row", gap: 8 },
  inputWrap: { flex: 1, minWidth: 0 },
  inputLabel: { marginBottom: 5, color: S.muted, fontSize: 11, fontWeight: "800" },
  input: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: S.border, borderRadius: 12, backgroundColor: "#fff", color: S.text, fontSize: 14, fontWeight: "800" },
  walletRow: { minHeight: 62, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: S.border, borderRadius: 13, backgroundColor: S.soft },
  walletDisabled: { opacity: 0.62 },
  walletIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: S.greenSoft },
  walletCopy: { flex: 1, minWidth: 0 },
  walletTitle: { color: S.text, fontSize: 13, fontWeight: "900" },
  walletText: { marginTop: 3, color: S.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  toggle: { width: 44, height: 26, padding: 3, justifyContent: "center", borderRadius: 13, backgroundColor: S.border },
  toggleActive: { backgroundColor: S.deep },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  toggleKnobActive: { alignSelf: "flex-end" },
  upgradeButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, backgroundColor: S.deep },
  upgradeButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  settings: { marginTop: 14, gap: 10 },
  settingRow: { minHeight: 64, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  settingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: S.soft },
  settingIconDanger: { backgroundColor: S.redSoft },
  settingCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  settingTitle: { color: S.text, fontSize: 14, fontWeight: "900" },
  settingSubtitle: { marginTop: 3, color: S.muted, fontSize: 11, fontWeight: "700" },
  dangerText: { color: S.red },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
