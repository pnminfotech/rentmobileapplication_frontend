import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock3, XCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getSaasPaymentStatus } from "../src/api/saasApi";
import { clearAuthSession } from "../src/storage/authStorage";
import { colors } from "../src/theme/colors";

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

export default function PaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [transactionId, setTransactionId] = useState(String(params.transactionId || ""));

  const goToLogin = useCallback(async () => {
    await clearAuthSession();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const syncTransactionFromUrl = (url) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        const nextTransactionId = parsed.searchParams.get("transactionId");
        if (nextTransactionId) setTransactionId(nextTransactionId);
      } catch (_err) {
        const queryString = url.split("?")[1] || "";
        const searchParams = new URLSearchParams(queryString);
        const nextTransactionId = searchParams.get("transactionId");
        if (nextTransactionId) setTransactionId(nextTransactionId);
      }
    };

    const handleUrl = ({ url }) => syncTransactionFromUrl(url);
    Linking.getInitialURL().then(syncTransactionFromUrl);
    const subscription = Linking.addEventListener("url", handleUrl);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    async function verifyPayment() {
      const activeTransactionId = transactionId || params.transactionId;
      if (!activeTransactionId) {
        setError("Payment transaction was not found. Please login and check your subscription.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        let latest = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          latest = await getSaasPaymentStatus(activeTransactionId);
          const transactionStatus = String(latest?.transaction?.status || "").toLowerCase();
          if (["success", "failed", "cancelled", "canceled"].includes(transactionStatus)) break;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (!active) return;
        setStatus(latest);

        const transactionStatus = String(latest?.transaction?.status || "").toLowerCase();
        if (transactionStatus === "success") {
          const subscription = latest?.subscription || {};
          Alert.alert(
            "Payment successful",
            `Subscription activated.\nAmount: ${money(latest?.transaction?.amount)}\nValid till: ${formatDate(subscription.endDate)}\n\nPlease login to start your system.`,
            [{ text: "Login", onPress: goToLogin }]
          );
          setTimeout(() => {
            goToLogin();
          }, 400);
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || err.message || "Unable to verify payment.");
      } finally {
        if (active) setLoading(false);
      }
    }
    verifyPayment();
    return () => {
      active = false;
    };
  }, [goToLogin, params.transactionId, transactionId]);

  const transactionStatus = String(status?.transaction?.status || "").toLowerCase();
  const isSuccess = transactionStatus === "success";
  const isFailed = ["failed", "cancelled", "canceled"].includes(transactionStatus);
  const subscription = status?.subscription || {};

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top + 20, 36), paddingBottom: Math.max(insets.bottom + 20, 36) }]}>
      <View style={styles.card}>
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {!loading && isSuccess ? <CheckCircle2 size={54} color={colors.success} /> : null}
        {!loading && isFailed ? <XCircle size={54} color={colors.danger} /> : null}
        {!loading && !isSuccess && !isFailed ? <Clock3 size={54} color={colors.warning || colors.primary} /> : null}

        <Text style={styles.title}>
          {loading ? "Verifying payment" : isSuccess ? "Payment successful" : isFailed ? "Payment failed" : "Payment pending"}
        </Text>

        {isSuccess ? (
          <>
            <Text style={styles.message}>Your subscription is active. Login to start your system.</Text>
            <View style={styles.summary}>
              <Text style={styles.summaryLine}>Amount: {money(status?.transaction?.amount)}</Text>
              <Text style={styles.summaryLine}>Valid till: {formatDate(subscription.endDate)}</Text>
            </View>
          </>
        ) : null}

        {!loading && !isSuccess ? (
          <Text style={styles.message}>
            {error || "Payment is not confirmed yet. If money was deducted, wait a moment and login again to check status."}
          </Text>
        ) : null}

        <Pressable onPress={goToLogin} style={styles.button}>
          <Text style={styles.buttonText}>Go to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 22,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    alignItems: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  title: {
    marginTop: 16,
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  message: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  summary: {
    width: "100%",
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  summaryLine: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  button: {
    width: "100%",
    minHeight: 50,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "900",
  },
});
