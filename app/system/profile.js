import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  BedDouble,
  Building2,
  ChevronRight,
  CirclePlus,
  Coins,
  Crown,
  DoorOpen,
  HelpCircle,
  KeyRound,
  Layers3,
  LogOut,
  Settings,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react-native";

import {
  completeMockSaasPayment,
  createSaasPayment,
  getAppBootstrap,
  getSaasPaymentStatus,
  getWalletSummary,
  requestPasswordReset,
  requestSubscriptionUpgrade,
} from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { UNIT_TYPES, allowedUnitTypes } from "../../src/utils/subscriptionAccess";
import { systemColors as S } from "../../src/theme/systemTheme";

const PROFILE_BLUE = "#4F7FA6";
const PROFILE_BLUE_DARK = "#244F70";
const PROFILE_BLUE_SOFT = "#E7F1F8";

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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, danger && styles.settingRowDanger, pressed && styles.pressed]}>
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Icon size={18} color={danger ? S.red : PROFILE_BLUE_DARK} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        <Text style={[styles.settingSubtitle, danger && styles.dangerSubtitle]}>{subtitle}</Text>
      </View>
      <ChevronRight size={19} color={danger ? S.red : S.muted} />
    </Pressable>
  );
}

function UnitBox({ Icon, value, label }) {
  return (
    <View style={styles.unitBox}>
      <Icon size={19} color={PROFILE_BLUE_DARK} />
      <View>
        <Text style={styles.unitValue}>{Number(value || 0).toLocaleString("en-IN")}</Text>
        <Text style={styles.unitLabel}>{label}</Text>
      </View>
    </View>
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

  async function verifyUpgradePayment(transactionId) {
    let latest = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await getSaasPaymentStatus(transactionId);
      const paymentStatus = String(latest?.transaction?.status || "").toLowerCase();
      if (["success", "failed", "cancelled", "canceled"].includes(paymentStatus)) return latest;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return latest;
  }

  async function submitUpgradePayment() {
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
      const transactionId = result?.transaction?._id;
      if (!transactionId) throw new Error("Upgrade payment transaction was not created.");
      const payment = await createSaasPayment({ transactionId });

      setUpgradeUnits({ beds: "", rooms: "", shops: "" });
      setShowUpgrade(false);
      const walletCoinsUsed = Number(result?.upgrade?.walletCoinsUsed || 0);

      const provider = String(payment?.payment?.provider || "").toLowerCase();
      if (provider === "mock" && payment?.payment?.mockSuccessUrl) {
        await completeMockSaasPayment(transactionId);
        await load();
        Alert.alert("Package upgraded", "Payment completed and your package is active.");
        return;
      }

      const paymentUrl = payment?.payment?.directPaymentUrl || payment?.payment?.paymentUrl || payment?.payment?.checkoutPageUrl;
      if (paymentUrl) {
        const canOpenPaymentUrl = await Linking.canOpenURL(paymentUrl);
        if (canOpenPaymentUrl) {
          await Linking.openURL(paymentUrl);
        } else {
          await WebBrowser.openBrowserAsync(paymentUrl, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            showTitle: true,
          });
        }

        const latest = await verifyUpgradePayment(transactionId);
        const paymentStatus = String(latest?.transaction?.status || "").toLowerCase();
        await load();

        if (paymentStatus === "success") {
          Alert.alert("Package upgraded", "Payment confirmed and your new units are active.");
          return;
        }
        if (["failed", "cancelled", "canceled"].includes(paymentStatus)) {
          Alert.alert("Payment not completed", "The package upgrade payment was not successful. Please try again.");
          return;
        }
        Alert.alert(
          "Payment pending",
          `We could not confirm the payment yet. If money was deducted, refresh profile after a minute. Payable amount: ${money(result?.upgrade?.amount, result?.upgrade?.currency)}${walletCoinsUsed ? `\nWallet used: ${walletCoinsUsed} coins` : ""}`
        );
      } else {
        Alert.alert("Payment created", "Complete the payment to activate your package upgrade.");
      }
      await load();
    } catch (err) {
      Alert.alert("Unable to start payment", err.response?.data?.message || err.message || "Please try again.");
    } finally {
      setAction("");
    }
  }

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={PROFILE_BLUE} /></View>;
  }

  const user = bootstrap?.user || {};
  const organization = bootstrap?.organization || {};
  const subscription = bootstrap?.subscription || {};
  const units = subscription?.units || organization?.unitAllocation || {};
  const purchasedUnitTypes = allowedUnitTypes(subscription);
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

      <View style={styles.hero} >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.name}>{user.name || "System admin"}</Text>
          <Text style={styles.email}>{formatEmail(user.email)}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{statusLabel(user.role || "administrator")}</Text></View>
            {/* <View style={styles.activeBadge}><View style={styles.activeDot} /><Text style={styles.activeBadgeText}>{accountStatus}</Text></View> */}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeading}><Building2 size={18} color={S.muted} /><Text style={styles.sectionTitle}>Account &amp; Business</Text></View>
        <View style={styles.detailColumns}>
          <View style={styles.detailColumn}>
            <InfoRow label="Name" value={user.name || "System admin"} />
            <InfoRow label="Role" value={statusLabel(user.role)} />
            <InfoRow label="Created" value={formatDate(user.createdAt)} />
            <InfoRow label="Phone" value={organization.phone || user.phone} />
          </View>
          <View style={styles.columnDivider} />
          <View style={styles.detailColumn}>
            <InfoRow label="Business" value={organization.name} />
            <InfoRow label="Type" value={statusLabel(organization.businessType)} />
            <InfoRow label="Owner" value={organization.ownerName} />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.sectionHeading}><Crown size={19} color={S.muted} /><Text style={styles.sectionTitle}>Subscription</Text></View>
          <View style={styles.activeBadge}><View style={styles.activeDot} /><Text style={styles.activeBadgeText}>{statusLabel(subscription.status || "active")}</Text></View>
        </View>
        <View style={styles.subscriptionStats}>
          <View style={styles.subscriptionStat}><Text style={styles.statLabel}>Amount</Text><Text style={styles.statValue}>{money(subscription.amount, subscription.currency)}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.subscriptionStat}><Text style={styles.statLabel}>Duration</Text><Text style={styles.statValue}>{subscription.durationMonths ? `${subscription.durationMonths} months` : "-"}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.subscriptionStat}><Text style={styles.statLabel}>Ends</Text><Text style={styles.statValue}>{formatDate(subscription.endDate)}</Text></View>
        </View>
        <View style={styles.unitGrid}>
          {purchasedUnitTypes.map((type) => {
            if (type.value === "bed") return <UnitBox key={type.value} Icon={BedDouble} value={units.beds} label="Beds" />;
            if (type.value === "room") return <UnitBox key={type.value} Icon={DoorOpen} value={units.rooms} label="Rooms" />;
            return <UnitBox key={type.value} Icon={Store} value={units.shops} label="Shops" />;
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.upgradeHeading}>
            <Layers3 size={19} color={S.muted} />
            <View>
              <Text style={styles.sectionTitle}>Upgrade package</Text>
              <Text style={styles.helperText}>Buy extra beds, rooms, or shops for this account</Text>
            </View>
          </View>
          <Pressable onPress={() => setShowUpgrade((value) => !value)} style={styles.smallAction}>
            <CirclePlus size={17} color={PROFILE_BLUE_DARK} />
            <Text style={styles.smallActionText}>{showUpgrade ? "Close" : "Add units"}</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push("/system/wallet")} style={styles.walletSummary}>
          <Coins size={27} color={S.orange} />
          <View style={styles.walletSummaryCopy}>
            <Text style={styles.walletSummaryLabel}>Wallet balance</Text>
            <Text style={styles.walletSummaryValue}>{walletBalance.toLocaleString("en-IN")} coins</Text>
          </View>
          <ChevronRight size={18} color={S.orange} />
        </Pressable>
        {showUpgrade ? (
          <View style={styles.upgradeForm}>
            <View style={styles.upgradeInputs}>
              {UNIT_TYPES.map((type) => (
                <View key={type.value} style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Extra {type.value === "bed" ? "beds" : type.value === "room" ? "rooms" : "shops"}</Text>
                  <TextInput
                    value={upgradeUnits[type.quotaKey]}
                    onChangeText={(value) => updateUpgradeUnit(type.quotaKey, value)}
                    keyboardType="number-pad"
                    placeholder="0"
                    style={styles.input}
                  />
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => walletBalance > 0 && setUseWalletForUpgrade((value) => !value)}
              disabled={!walletBalance}
              style={[styles.walletRow, !walletBalance && styles.walletDisabled]}
            >
              <View style={styles.walletIcon}>
                <WalletCards size={19} color={PROFILE_BLUE_DARK} />
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
            <Pressable onPress={submitUpgradePayment} disabled={action === "upgrade"} style={styles.upgradeButton}>
              {action === "upgrade" ? <ActivityIndicator size="small" color="#fff" /> : <CirclePlus size={18} color="#fff" />}
              <Text style={styles.upgradeButtonText}>Make payment</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.settings}>
        <View style={styles.settingsHeading}><Settings size={19} color={S.muted} /><Text style={styles.sectionTitle}>Account actions</Text></View>
        <SettingRow
          Icon={KeyRound}
          title="Change Password"
          subtitle={action === "password" ? "Sending reset link..." : "Send reset link to registered email"}
          onPress={sendPasswordReset}
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
  screen: { flex: 1, backgroundColor: "#F6F8F7" },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingHorizontal: 20, paddingTop: 3, paddingBottom: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F8F7" },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", marginBottom: 7 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: S.muted, fontSize: 9, letterSpacing: 0, fontWeight: "800", textTransform: "uppercase" },
  headerTitle: { marginTop: 0, color: S.text, fontSize: 23, fontWeight: "900" },
  error: { marginBottom: 10, padding: 11, color: S.red, borderRadius: 8, backgroundColor:"#fffdf8", fontWeight: "700" },
  hero: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: "#E1E6EA", borderRadius: 8, backgroundColor: "#FFFFFF" },
  avatar: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 30, backgroundColor: PROFILE_BLUE_SOFT },
  avatarText: { color: PROFILE_BLUE_DARK, fontSize: 22, fontWeight: "900" },
  heroCopy: { flex: 1, minWidth: 0, marginLeft: 15 },
  name: { color: S.text, fontSize: 18, fontWeight: "900" },
  email: { marginTop: 2, color: S.muted, fontSize: 12, fontWeight: "600" },
  badgeRow: { marginTop: 7, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  roleBadge: { minHeight: 24, justifyContent: "center", paddingHorizontal: 10, borderRadius: 7, backgroundColor: "#EEF2F8" },
  roleBadgeText: { color: "#344767", fontSize: 11, fontWeight: "700" },
  activeBadge: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderRadius: 12, backgroundColor: PROFILE_BLUE_SOFT },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PROFILE_BLUE },
  activeBadgeText: { color: PROFILE_BLUE_DARK, fontSize: 11, fontWeight: "800" },
  card: { marginTop: 10, padding: 12, borderWidth: 1, borderColor: "#E1E6EA", borderRadius: 8, backgroundColor: "#FFFFFF" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { color: S.text, fontSize: 15, fontWeight: "900" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  detailColumns: { marginTop: 9, flexDirection: "row", alignItems: "stretch" },
  detailColumn: { flex: 1, minWidth: 0 },
  columnDivider: { width: 1, marginHorizontal: 9, backgroundColor: "#E1E6EA" },
  helperText: { marginTop: 2, color: S.muted, fontSize: 10, fontWeight: "600" },
  smallAction: { minHeight: 32, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: PROFILE_BLUE_DARK, borderRadius: 7, backgroundColor: "#FFFFFF" },
  smallActionText: { color: PROFILE_BLUE_DARK, fontSize: 11, fontWeight: "900" },
  infoRow: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 5 },
  infoLabel: { width: 50, color: S.muted, fontSize: 10, fontWeight: "600" },
  infoValue: { flex: 1, minWidth: 0, color: S.text, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  infoEmailValue: { textTransform: "none" },
  subscriptionStats: { marginTop: 10, flexDirection: "row", alignItems: "center" },
  subscriptionStat: { flex: 1, minWidth: 0 },
  statDivider: { width: 1, height: 31, marginHorizontal: 8, backgroundColor: "#E1E6EA" },
  statLabel: { color: S.muted, fontSize: 10, fontWeight: "600" },
  statValue: { marginTop: 2, color: S.text, fontSize: 14, fontWeight: "900" },
  unitGrid: { marginTop: 8, flexDirection: "row", gap: 6 },
  unitBox: { flex: 1, minHeight: 46, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 7, backgroundColor: PROFILE_BLUE_SOFT },
  unitValue: { color: PROFILE_BLUE_DARK, fontSize: 15, fontWeight: "900" },
  unitLabel: { marginTop: 0, color: S.muted, fontSize: 10, fontWeight: "600" },
  upgradeHeading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  walletSummary: { minHeight: 46, marginTop: 8, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 7, backgroundColor: "#FFF4DE" },
  walletSummaryCopy: { flex: 1, minWidth: 0 },
  walletSummaryLabel: { color: S.text, fontSize: 10, fontWeight: "700" },
  walletSummaryValue: { marginTop: 1, color: S.text, fontSize: 15, fontWeight: "900" },
  upgradeForm: { marginTop: 12, gap: 12 },
  upgradeInputs: { flexDirection: "row", gap: 8 },
  inputWrap: { flex: 1, minWidth: 0 },
  inputLabel: { marginBottom: 5, color: S.muted, fontSize: 11, fontWeight: "800" },
  input: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: S.border, borderRadius: 12, backgroundColor: "#fff", color: S.text, fontSize: 14, fontWeight: "800" },
  walletRow: { minHeight: 62, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#D9E1E7", borderRadius: 13, backgroundColor: PROFILE_BLUE_SOFT },
  walletDisabled: { opacity: 0.62 },
  walletIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#D8E8F3" },
  walletCopy: { flex: 1, minWidth: 0 },
  walletTitle: { color: S.text, fontSize: 13, fontWeight: "900" },
  walletText: { marginTop: 3, color: S.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  toggle: { width: 44, height: 26, padding: 3, justifyContent: "center", borderRadius: 13, backgroundColor: S.border },
  toggleActive: { backgroundColor: PROFILE_BLUE_DARK },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  toggleKnobActive: { alignSelf: "flex-end" },
  upgradeButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, backgroundColor: PROFILE_BLUE_DARK },
  upgradeButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  settings: { marginTop: 10, overflow: "hidden", borderWidth: 1, borderColor: "#E1E6EA", borderRadius: 8, backgroundColor: "#FFFFFF" },
  settingsHeading: { minHeight: 40, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#E1E6EA" },
  settingRow: { minHeight: 42, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E1E6EA", backgroundColor: "#FFFFFF" },
  settingRowDanger: { margin: 4, borderBottomWidth: 0, borderRadius: 7, backgroundColor: S.redSoft },
  settingIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  settingIconDanger: { backgroundColor: "transparent" },
  settingCopy: { flex: 1, minWidth: 0, marginLeft: 7 },
  settingTitle: { color: S.text, fontSize: 12, fontWeight: "800" },
  settingSubtitle: { marginTop: 1, color: S.muted, fontSize: 9, fontWeight: "600" },
  dangerText: { color: S.red },
  dangerSubtitle: { color: "#D76A62" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
