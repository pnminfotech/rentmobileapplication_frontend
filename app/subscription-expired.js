import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { CreditCard, LogOut, RefreshCw, WalletCards } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  completeMockSaasPayment,
  createSaasPayment,
  getAppBootstrap,
  getSaasPaymentStatus,
  getWalletSummary,
  requestSubscriptionRenewal,
} from "../src/api/saasApi";
import { clearAuthSession } from "../src/storage/authStorage";
import { colors } from "../src/theme/colors";
import { useResponsive } from "../src/utils/responsive";

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function UnitBox({ label, value, style }) {
  return (
    <View style={[styles.unitBox, style]}>
      <Text style={styles.unitValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {Number(value || 0)}
      </Text>
      <Text style={styles.unitLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {label}
      </Text>
    </View>
  );
}

function isPendingPaymentStatus(value) {
  return String(value || "").toLowerCase() === "pending_payment";
}

export default function SubscriptionExpiredScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState(null);
  const [useWallet, setUseWallet] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      const [data, walletData] = await Promise.all([
        getAppBootstrap(),
        getWalletSummary().catch(() => null),
      ]);

      const latestTransactionId = data?.latestTransaction?._id;
      const latestTransactionStatus = String(data?.latestTransaction?.status || "").toLowerCase();
      const needsPayment =
        isPendingPaymentStatus(data?.subscription?.status) ||
        isPendingPaymentStatus(data?.organization?.status);

      if (latestTransactionId && needsPayment && ["created", "pending", "pending_payment"].includes(latestTransactionStatus)) {
        try {
          const paymentStatus = await getSaasPaymentStatus(latestTransactionId);
          const refreshedTransactionStatus = String(paymentStatus?.transaction?.status || "").toLowerCase();
          const refreshedSubscriptionStatus = String(paymentStatus?.subscription?.status || "").toLowerCase();

          if (refreshedTransactionStatus === "success" || refreshedSubscriptionStatus === "active") {
            const refreshedBootstrap = await getAppBootstrap();
            if (refreshedBootstrap?.access?.canUseSystem) {
              router.replace(refreshedBootstrap.user?.role === "superadmin" ? "/superadmin" : "/system");
              return;
            }
            setBootstrap(refreshedBootstrap);
            setWallet(walletData);
            return;
          }
        } catch (_statusError) {
          // Keep the pending screen visible if the status refresh is not ready yet.
        }
      }

      if (data.access?.canUseSystem) {
        router.replace(data.user?.role === "superadmin" ? "/superadmin" : "/system");
        return;
      }
      setBootstrap(data);
      setWallet(walletData);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load subscription.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!String(url || "").includes("payment-result")) return;
      WebBrowser.dismissBrowser().catch(() => {});
      load();
    });
    return () => subscription.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  async function verifyRenewalPayment(transactionId) {
    let latest = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await getSaasPaymentStatus(transactionId);
      const paymentStatus = String(latest?.transaction?.status || "").toLowerCase();
      if (["success", "failed", "cancelled", "canceled"].includes(paymentStatus)) return latest;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return latest;
  }

  async function renewNow() {
    try {
      setRenewing(true);
      const isPendingPayment = isPendingPaymentStatus(bootstrap?.subscription?.status) || isPendingPaymentStatus(bootstrap?.organization?.status);
      const existingTransactionId =
        isPendingPayment && bootstrap?.latestTransaction?._id
          ? bootstrap?.latestTransaction?._id
          : null;
      let transactionId = existingTransactionId;

      if (!transactionId) {
        const renewal = await requestSubscriptionRenewal({
          durationMonths: bootstrap?.subscription?.durationMonths || 12,
          useWallet,
        });
        transactionId = renewal?.transaction?._id;
      }

      if (!transactionId) throw new Error(isPendingPayment ? "Activation transaction was not found." : "Renewal transaction was not created.");

      const payment = await createSaasPayment({ transactionId });
      const provider = String(payment?.payment?.provider || "").toLowerCase();
      if (provider === "mock" && payment?.payment?.mockSuccessUrl) {
        await completeMockSaasPayment(transactionId);
        Alert.alert(isPendingPayment ? "Activated" : "Renewed", isPendingPayment ? "Subscription activated successfully." : "Subscription renewed successfully.", [
          { text: "Continue", onPress: () => router.replace("/system") },
        ]);
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

        const latest = await verifyRenewalPayment(transactionId);
        const paymentStatus = String(latest?.transaction?.status || "").toLowerCase();
        if (paymentStatus === "success") {
          Alert.alert(
            isPendingPayment ? "Payment successful" : "Renewal successful",
            isPendingPayment ? "Subscription activated successfully." : "Subscription renewed successfully.",
            [{ text: "Continue", onPress: () => router.replace("/system") }]
          );
          return;
        }
        if (["failed", "cancelled", "canceled"].includes(paymentStatus)) {
          Alert.alert("Payment not completed", "The subscription payment was not successful. Please try again.");
          return;
        }
        Alert.alert("Payment pending", "We could not confirm the payment yet. If money was deducted, refresh after a minute.");
      } else {
        Alert.alert("Payment created", `Payment request created. Complete payment to ${isPendingPayment ? "activate" : "renew"} your subscription.`);
      }
      await load();
    } catch (err) {
      const backendMessage = err.response?.data?.message || err.message || "";
      const friendlyMessage = backendMessage && backendMessage !== "Server error"
        ? backendMessage
        : "The payment request could not be started right now. This is usually caused by a PhonePe configuration or gateway issue. Please try again in a moment or contact support.";
      Alert.alert("Payment could not be started", friendlyMessage);
    } finally {
      setRenewing(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const organization = bootstrap?.organization || {};
  const subscription = bootstrap?.subscription || {};
  const units = subscription.units || {};
  const pendingPayment = isPendingPaymentStatus(subscription.status) || isPendingPaymentStatus(organization.status);
  const renewalAmount = Number(subscription.amount || 0);
  const walletBalance = pendingPayment ? 0 : Number(wallet?.balance || 0);
  const walletCoinsUsed = useWallet ? Math.min(walletBalance, renewalAmount) : 0;
  const payableAmount = Math.max(0, renewalAmount - walletCoinsUsed);
  const pageCopy = pendingPayment
    ? {
        eyebrow: "Payment required",
        title: "Subscription payment required",
        subtitle: `${organization.name || "Your account"} needs activation payment to start.`,
        cardText: "Complete the subscription payment to activate dashboard, tenants, payments and reports.",
        amountLabel: "Activation amount",
        buttonText: "Complete payment",
      }
    : {
        eyebrow: "Subscription required",
        title: "Subscription expired",
        subtitle: `${organization.name || "Your account"} needs renewal to continue.`,
        cardText: `Your subscription ended on ${formatDate(subscription.endDate)}. Renew now to restore dashboard, tenants, payments and reports.`,
        amountLabel: "Renewal amount",
        buttonText: "Renew subscription",
      };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 12, 22),
          paddingBottom: Math.max(insets.bottom + 28, 42),
          paddingHorizontal: responsive.pagePadding,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{pageCopy.eyebrow}</Text>
          <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>
            {pageCopy.title}
          </Text>
          <Text style={styles.subtitle}>
            {pageCopy.subtitle}
          </Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <LogOut size={18} color={colors.danger} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={styles.cardIcon}><CreditCard size={24} color={colors.primary} /></View>
        <Text style={styles.cardTitle}>{organization.name || "Business account"}</Text>
        <Text style={styles.cardText}>{pageCopy.cardText}</Text>

        <View style={styles.summary}>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Current status</Text><Text style={styles.summaryValue}>{subscription.status || organization.status || "-"}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{pageCopy.amountLabel}</Text><Text style={styles.summaryValue}>{money(renewalAmount)}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Duration</Text><Text style={styles.summaryValue}>{subscription.durationMonths || 12} months</Text></View>
        </View>

        {!pendingPayment ? (
          <Pressable
            onPress={() => walletBalance > 0 && setUseWallet((value) => !value)}
            disabled={!walletBalance}
            style={[styles.walletRow, !walletBalance && styles.walletDisabled]}
          >
            <View style={styles.walletIcon}>
              <WalletCards size={20} color={colors.primary} />
            </View>
            <View style={styles.walletCopy}>
              <Text style={styles.walletTitle}>Use wallet coins</Text>
              <Text style={styles.walletText}>
                Available {walletBalance.toLocaleString("en-IN")} coins
                {walletCoinsUsed ? ` | Discount ${money(walletCoinsUsed)}` : ""}
              </Text>
            </View>
            <View style={[styles.toggle, useWallet && walletBalance > 0 && styles.toggleActive]}>
              <View style={[styles.toggleKnob, useWallet && walletBalance > 0 && styles.toggleKnobActive]} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.payableRow}>
          <Text style={styles.payableLabel}>Payable now</Text>
          <Text style={styles.payableValue}>{money(payableAmount)}</Text>
        </View>

        <View style={styles.unitGrid}>
          <UnitBox label="Beds" value={units.beds} style={{ width: responsive.isTiny ? "100%" : "31.5%" }} />
          <UnitBox label="Rooms" value={units.rooms} style={{ width: responsive.isTiny ? "100%" : "31.5%" }} />
          <UnitBox label="Shops" value={units.shops} style={{ width: responsive.isTiny ? "100%" : "31.5%" }} />
        </View>

        <Pressable onPress={renewNow} disabled={renewing} style={[styles.primaryButton, renewing && styles.disabled]}>
          {renewing ? <ActivityIndicator color={colors.surface} /> : <><RefreshCw size={18} color={colors.surface} /><Text style={styles.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{pageCopy.buttonText}</Text></>}
        </Pressable>
        {/* The payment confirmation check has been intentionally removed because the screen only needs the payment action. */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.danger, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  title: { marginTop: 4, color: colors.text, fontSize: 26, fontWeight: "800" },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 18 },
  logoutButton: { width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 8, backgroundColor: colors.surface },
  card: { padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  cardIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primarySoft },
  cardTitle: { marginTop: 14, color: colors.text, fontSize: 20, fontWeight: "800" },
  cardText: { marginTop: 7, color: colors.muted, lineHeight: 20 },
  summary: { marginTop: 16, gap: 10 },
  summaryItem: { minWidth: 0 },
  summaryLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  summaryValue: { marginTop: 4, color: colors.text, fontSize: 15, fontWeight: "800", textTransform: "capitalize" },
  unitGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9 },
  unitBox: { minHeight: 72, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.surfaceSoft },
  unitValue: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  unitLabel: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: "700" },
  walletRow: { marginTop: 16, minHeight: 64, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceSoft },
  walletDisabled: { opacity: 0.62 },
  walletIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primarySoft },
  walletCopy: { flex: 1, minWidth: 0 },
  walletTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  walletText: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: "700" },
  toggle: { width: 46, height: 26, padding: 3, justifyContent: "center", borderRadius: 13, backgroundColor: colors.border },
  toggleActive: { backgroundColor: colors.primary },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  toggleKnobActive: { alignSelf: "flex-end" },
  payableRow: { marginTop: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  payableLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  payableValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
  primaryButton: { marginTop: 18, minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 8, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontWeight: "800" },
  secondaryButton: { marginTop: 10, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: 8, backgroundColor: colors.surface },
  secondaryText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  error: { marginBottom: 12, color: colors.danger },
});
