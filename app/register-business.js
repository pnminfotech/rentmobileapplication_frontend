import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { completeMockSaasPayment, getSaasPaymentStatus, getSubscriptionPlans, quoteReferralCode, registerBusiness } from "../src/api/saasApi";
import { clearAuthSession } from "../src/storage/authStorage";
import { stackedPropertyLabel } from "../src/utils/unitLabels";
import { colors } from "../src/theme/colors";

const BUSINESS_TYPES = [
  { value: "hostel", label: "Hostel Beds" },
  { value: "rooms", label: "Residential Rooms" },
  { value: "shops", label: "Commercial Shop" },
  { value: "mixed", label: "Mixed" },
];

const DURATIONS = [
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
  { months: 36, label: "3 years" },
];

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function planDurationLabel(months) {
  const totalMonths = Number(months || 0);
  const years = totalMonths / 12;
  if (Number.isInteger(years) && years > 0) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${totalMonths || 0} months`;
}

function Field({ label, ...props }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} />
    </>
  );
}

function countText(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function RegisterBusinessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const contentInsetStyle = {
    paddingTop: Math.max(insets.top + 12, 24),
    paddingBottom: Math.max(insets.bottom + 32, 42),
  };
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    password: "",
    phone: "",
    businessType: "hostel",
    planId: "",
    beds: "",
    rooms: "",
    shops: "",
    canteenEnabled: false,
    referralCode: "",
  });
  const [referralQuote, setReferralQuote] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingPayment, setOpeningPayment] = useState(false);
  const [autoCheckingPayment, setAutoCheckingPayment] = useState(false);
  const [error, setError] = useState("");
  const [paymentOpenError, setPaymentOpenError] = useState("");
  const [result, setResult] = useState(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const latestTransactionIdRef = useRef(null);
  const paymentPollRef = useRef(null);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const clearReferralQuote = () => setReferralQuote(null);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/login");
  };

  useEffect(() => {
    let active = true;
    getSubscriptionPlans()
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data.filter((plan) => plan.isActive !== false) : [];
        setPlans(list);
        setForm((current) => current.planId || !list[0]?._id ? current : { ...current, planId: list[0]._id });
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || "Unable to load subscription plans.");
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setReferralQuote(null);
  }, [form.planId, form.beds, form.rooms, form.shops]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
      const transactionId = latestTransactionIdRef.current;
      if (nextState === "active" && transactionId) {
        paymentPollRef.current?.(transactionId);
      }
    });
    return () => subscription.remove();
  }, []);

  const units = useMemo(() => ({
    beds: Number(form.beds || 0),
    rooms: Number(form.rooms || 0),
    shops: Number(form.shops || 0),
  }), [form.beds, form.rooms, form.shops]);

  const totalUnits = units.beds + units.rooms + units.shops;
  const canOfferCanteen = form.businessType === "hostel" || form.businessType === "mixed" || units.beds > 0;
  latestTransactionIdRef.current = result?.transaction?._id || null;
  paymentPollRef.current = pollRegistrationPayment;
  const paymentStatus = String(result?.transaction?.status || "").toLowerCase();
  const selectedPlan = useMemo(() => plans.find((plan) => String(plan._id) === String(form.planId)) || null, [form.planId, plans]);
  const pricing = selectedPlan?.unitPricing || {};
  const amountBreakdown = useMemo(() => {
    const months = Number(selectedPlan?.durationMonths || 0);
    const bedAmount = units.beds * Number(pricing.bedMonthly || 0) * months;
    const roomAmount = units.rooms * Number(pricing.roomMonthly || 0) * months;
    const shopAmount = units.shops * Number(pricing.shopMonthly || 0) * months;
    const baseAmount = Number(selectedPlan?.baseAmount || 0);
    const discountPercent = Math.min(100, Math.max(0, Number(selectedPlan?.discountPercent || 0)));
    const subtotal = bedAmount + roomAmount + shopAmount + baseAmount;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const referralPricing = referralQuote?.pricing;
    const referralDiscountPercent = Number(referralPricing?.referralDiscountPercent || 0);
    const referralDiscountAmount = Number(referralPricing?.referralDiscountAmount || 0);
    return {
      bedAmount,
      roomAmount,
      shopAmount,
      baseAmount,
      discountPercent,
      discountAmount,
      referralDiscountPercent,
      referralDiscountAmount,
      referralCode: referralQuote?.referral?.code || "",
      subtotal,
      total: referralPricing ? Number(referralPricing.payableAmount || 0) : Math.max(0, subtotal - discountAmount),
    };
  }, [pricing.bedMonthly, pricing.roomMonthly, pricing.shopMonthly, referralQuote, selectedPlan?.baseAmount, selectedPlan?.discountPercent, selectedPlan?.durationMonths, units.beds, units.rooms, units.shops]);

  async function applyReferralCode() {
    const code = form.referralCode.trim().toUpperCase();
    if (!code) {
      setReferralQuote(null);
      return setError("Enter a referral code first.");
    }
    if (!selectedPlan?._id) return setError("Select an active subscription plan first.");
    try {
      setReferralLoading(true);
      setError("");
      const data = await quoteReferralCode({
        referralCode: code,
        planId: selectedPlan._id,
        durationMonths: selectedPlan.durationMonths,
        units,
      });
      setReferralQuote(data);
      setForm((current) => ({ ...current, referralCode: data.referral?.code || code }));
    } catch (err) {
      setReferralQuote(null);
      setError(err.response?.data?.message || "Unable to apply referral code.");
    } finally {
      setReferralLoading(false);
    }
  }

  async function submit() {
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, "");
    if (!form.businessName.trim() || !form.ownerName.trim()) return setError("Business name and owner name are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a valid 10-digit phone number.");
    if (totalUnits < 1) return setError("Add at least one bed, room, or shop.");
    if (!selectedPlan?._id) return setError("Select an active subscription plan.");

    try {
      setSaving(true);
      setError("");
      const data = await registerBusiness({
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        email,
        password: form.password,
        phone,
        businessType: form.businessType,
        canteenEnabled: canOfferCanteen ? Boolean(form.canteenEnabled) : false,
        features: {
          canteenEnabled: canOfferCanteen ? Boolean(form.canteenEnabled) : false,
        },
        planId: selectedPlan._id,
        durationMonths: selectedPlan.durationMonths,
        referralCode: referralQuote?.referral?.code || form.referralCode.trim().toUpperCase(),
        units,
      });
      startTransition(() => {
        setResult(data);
      });
      const firstPaymentUrl = data?.payment?.directPaymentUrl || data?.payment?.paymentUrl || data?.payment?.checkoutPageUrl;
      if (firstPaymentUrl && String(data?.payment?.provider || "").toLowerCase() !== "mock") {
        await openCheckoutUrl(firstPaymentUrl, data?.transaction?._id);
      }
      if (data?.paymentError) {
        Alert.alert("Payment not opened", "Your account was created, but payment could not open. Sign in and complete payment from the subscription screen.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to register business.");
    } finally {
      setSaving(false);
    }
  }

  function getCheckoutUrl() {
    return result?.payment?.directPaymentUrl || result?.payment?.paymentUrl || result?.payment?.checkoutPageUrl || "";
  }

  async function openCheckoutUrl(paymentUrl, transactionId) {
    if (!paymentUrl) {
      setPaymentOpenError("Payment URL was not created. Please try again.");
      return;
    }
    try {
      setOpeningPayment(true);
      setPaymentOpenError("");
      const supported = await Linking.canOpenURL(paymentUrl);
      if (!supported) throw new Error("Unable to open payment link on this device.");
      await Linking.openURL(paymentUrl);
      setTimeout(() => {
        pollRegistrationPayment(transactionId);
      }, 3000);
    } catch (err) {
      setPaymentOpenError(err.message || "Unable to open checkout.");
      Alert.alert("Unable to open checkout", err.message || "Please try again.");
    } finally {
      setOpeningPayment(false);
    }
  }

  async function openRegistrationPayment() {
    await openCheckoutUrl(getCheckoutUrl(), result?.transaction?._id);
  }

  async function completeTestPayment() {
    const transactionId = result?.transaction?._id;
    const provider = String(result?.payment?.provider || "").toLowerCase();
    if (!transactionId || provider !== "mock" || !result?.payment?.mockSuccessUrl) return;
    try {
      setOpeningPayment(true);
      setPaymentOpenError("");
      const status = await completeMockSaasPayment(transactionId);
      await showPaymentSuccess(status);
    } catch (err) {
      const message = err.response?.data?.message || err.message || "Unable to complete the test payment.";
      setPaymentOpenError(message);
      Alert.alert("Test payment failed", message);
    } finally {
      setOpeningPayment(false);
    }
  }

  async function pollRegistrationPayment(transactionIdArg = result?.transaction?._id) {
    const transactionId = transactionIdArg;
    if (!transactionId || autoCheckingPayment) return;
    try {
      setAutoCheckingPayment(true);
      setError("");
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const status = await getSaasPaymentStatus(transactionId);
        const paymentStatus = String(status?.transaction?.status || "").toLowerCase();
        startTransition(() => {
          setResult((current) => current ? {
            ...current,
            transaction: status?.transaction || current.transaction,
            subscription: status?.subscription || current.subscription,
            organization: status?.subscription?.organizationId ? current.organization : current.organization,
          } : current);
        });
        if (paymentStatus === "success") {
          await showPaymentSuccess(status);
          return;
        }
        if (["failed", "cancelled", "canceled"].includes(paymentStatus)) {
          setPaymentOpenError("Payment was not completed. Please make payment to activate your account.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      setPaymentOpenError("Payment is not confirmed yet. Please make payment to activate your account.");
    } catch (err) {
      setPaymentOpenError(err.response?.data?.message || err.message || "Unable to auto-check payment status.");
    } finally {
      setAutoCheckingPayment(false);
    }
  }

  async function showPaymentSuccess(status) {
    const subscription = status?.subscription || result?.subscription || {};
    const transaction = status?.transaction || result?.transaction || {};
    startTransition(() => {
      setResult((current) => current ? {
        ...current,
        transaction,
        subscription,
      } : current);
    });
    Alert.alert(
      "Payment successful",
      `Your subscription is active.\nAmount: ${money(transaction.amount || subscription.amount)}\nValid till: ${formatDate(subscription.endDate)}\n\nPlease start your system.`,
      [
        {
          text: "Go to login",
          onPress: async () => {
            await clearAuthSession();
            router.replace({
              pathname: "/login",
              params: { subscription: "active" },
            });
          },
        },
      ]
    );
    setTimeout(async () => {
      await clearAuthSession();
      router.replace({
        pathname: "/login",
        params: { subscription: "active" },
      });
    }, 500);
  }

  useEffect(() => {
    if (!result?.transaction?._id) return undefined;
    if (autoCheckingPayment) return undefined;
    if (appState !== "active") return undefined;
    if (!["created", "pending"].includes(paymentStatus)) return undefined;

    const timer = setInterval(() => {
      paymentPollRef.current?.(result.transaction._id);
    }, 4000);

    return () => clearInterval(timer);
  }, [appState, autoCheckingPayment, paymentStatus, result?.transaction?._id]);

  if (result) {
    const isSuccess = paymentStatus === "success";
    const isFailed = ["failed", "cancelled", "canceled"].includes(paymentStatus);
    const isMockPayment = String(result?.payment?.provider || "").toLowerCase() === "mock";
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentInsetStyle]}>
        <View style={styles.successCard}>
          <CheckCircle2 size={42} color={colors.success} />
          <Text style={styles.successTitle}>
            {autoCheckingPayment ? "Verifying payment" : isSuccess ? "Subscription active" : "Registration completed"}
          </Text>
          <Text style={styles.successText}>
            {autoCheckingPayment
              ? "Please wait while we confirm your subscription payment."
              : isSuccess
                ? "Your payment is confirmed. You can now sign in and start your system."
                : "Your account is created. Complete payment to activate your subscription."}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{result.organization?.name}</Text>
          <Text style={styles.summaryLine}>Owner: {result.user?.name}</Text>
          <Text style={styles.summaryLine}>Email: {result.user?.email}</Text>
          <Text style={styles.summaryLine}>Status: {result.organization?.status}</Text>
          <Text style={styles.summaryLine}>Subscription: {result.subscription?.durationMonths} months</Text>
          {result.subscription?.startDate ? <Text style={styles.summaryLine}>Start: {formatDate(result.subscription.startDate)}</Text> : null}
          {result.subscription?.endDate ? <Text style={styles.summaryLine}>Valid till: {formatDate(result.subscription.endDate)}</Text> : null}
          <Text style={styles.summaryAmount}>{money(result.subscription?.amount)}</Text>
          {result.paymentError ? <Text style={styles.error}>{result.paymentError}</Text> : null}
        </View>

        {autoCheckingPayment ? (
          <View style={styles.verifyingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.confirmingText}>Checking payment status...</Text>
          </View>
        ) : null}

        {!autoCheckingPayment && !isSuccess && isMockPayment && result?.payment?.mockSuccessUrl ? (
          <Pressable onPress={completeTestPayment} disabled={openingPayment} style={[styles.primaryButton, openingPayment && styles.disabled]}>
            {openingPayment ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Complete mock payment</Text>}
          </Pressable>
        ) : null}
        {!autoCheckingPayment && !isSuccess && getCheckoutUrl() && !isMockPayment ? (
          <Pressable onPress={openRegistrationPayment} disabled={openingPayment} style={[styles.primaryButton, openingPayment && styles.disabled]}>
            {openingPayment ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{isFailed ? "Retry payment" : "Make payment"}</Text>}
          </Pressable>
        ) : null}
        {!autoCheckingPayment && isSuccess ? (
          <Pressable
            onPress={async () => {
              await clearAuthSession();
              router.replace({ pathname: "/login", params: { subscription: "active" } });
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryText}>Go to login</Text>
          </Pressable>
        ) : null}
        {paymentOpenError ? <Text style={styles.error}>{paymentOpenError}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, contentInsetStyle]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View>
            <Text style={styles.title}>Register business</Text>
            <Text style={styles.subtitle}>Create a property-owner account</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Business</Text>
        <Field label="Business name" value={form.businessName} onChangeText={(value) => setValue("businessName", value)} placeholder="Example: Demo Hostel" />
        <Field label="Owner name" value={form.ownerName} onChangeText={(value) => setValue("ownerName", value)} placeholder="Owner full name" />
        <Text style={styles.label}>Business type</Text>
        <View style={styles.segment}>
          {BUSINESS_TYPES.map((type) => (
            <Pressable key={type.value} onPress={() => setValue("businessType", type.value)} style={[styles.segmentButton, form.businessType === type.value && styles.segmentActive]}>
              <Text style={[styles.segmentText, form.businessType === type.value && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{type.value === "mixed" ? type.label : stackedPropertyLabel(type.label)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Login account</Text>
        <Field label="Email" value={form.email} onChangeText={(value) => setValue("email", value)} autoCapitalize="none" keyboardType="email-address" placeholder="owner@example.com" />
        <Field label="Phone number" value={form.phone} onChangeText={(value) => setValue("phone", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" placeholder="10-digit number" />
        <Field label="Password" value={form.password} onChangeText={(value) => setValue("password", value)} secureTextEntry placeholder="Minimum 8 characters" />

        <Text style={styles.sectionTitle}>Subscription units</Text>
        <View style={styles.unitGrid}>
          <View style={styles.unitField}><Field label="Beds" value={form.beds} onChangeText={(value) => setValue("beds", countText(value))} keyboardType="number-pad" placeholder="0" /></View>
          <View style={styles.unitField}><Field label="Rooms" value={form.rooms} onChangeText={(value) => setValue("rooms", countText(value))} keyboardType="number-pad" placeholder="0" /></View>
          <View style={styles.unitField}><Field label="Shops" value={form.shops} onChangeText={(value) => setValue("shops", countText(value))} keyboardType="number-pad" placeholder="0" /></View>
        </View>

        {canOfferCanteen ? (
          <>
            <Text style={styles.sectionTitle}>Canteen feature</Text>
            <Text style={styles.helperText}>Enable this only if this hostel provides canteen service.</Text>
            <View style={styles.segment}>
              {[
                { label: "No canteen", value: false },
                { label: "Canteen available", value: true },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => setValue("canteenEnabled", item.value)}
                  style={[styles.segmentButton, form.canteenEnabled === item.value && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, form.canteenEnabled === item.value && styles.segmentTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Subscription plan</Text>
        {plansLoading ? <View style={styles.planLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.planLoadingText}>Loading active plans...</Text></View> : null}
        {!plansLoading && !plans.length ? <Text style={styles.error}>No active plans available. Please contact superadmin.</Text> : null}
        <View style={styles.planList}>
          {plans.map((plan) => {
            const active = String(form.planId) === String(plan._id);
            const durationLabel = DURATIONS.find((item) => item.months === plan.durationMonths)?.label || planDurationLabel(plan.durationMonths);
            return (
              <Pressable key={plan._id} onPress={() => setValue("planId", plan._id)} style={[styles.planOption, active && styles.planActive]}>
                <View style={styles.planOptionHeader}>
                  <Text style={[styles.planName, active && styles.planTextActive]}>{plan.name || durationLabel}</Text>
                  <Text style={[styles.planDuration, active && styles.planTextActive]}>{durationLabel}</Text>
                </View>
                <Text style={[styles.planPrices, active && styles.planTextActive]}>
                  Bed {money(plan.unitPricing?.bedMonthly)}/mo | Room {money(plan.unitPricing?.roomMonthly)}/mo | Shop {money(plan.unitPricing?.shopMonthly)}/mo
                </Text>
                {Number(plan.discountPercent || 0) > 0 ? (
                  <Text style={[styles.planDiscount, active && styles.planTextActive]}>{Number(plan.discountPercent)}% discount applied at checkout</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Referral code</Text>
        <View style={styles.referralRow}>
          <TextInput
            value={form.referralCode}
            onChangeText={(value) => {
              setValue("referralCode", value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24));
              clearReferralQuote();
            }}
            autoCapitalize="characters"
            placeholder="Example: WELCOME10"
            style={styles.referralInput}
          />
          <Pressable onPress={applyReferralCode} disabled={referralLoading || !selectedPlan} style={[styles.applyButton, (referralLoading || !selectedPlan) && styles.disabled]}>
            {referralLoading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.applyText}>Apply</Text>}
          </Pressable>
        </View>
        {referralQuote?.referral ? (
          <Text style={styles.referralSuccess}>
            {Number(referralQuote.referral.discountPercent || 0) > 0
              ? `${referralQuote.referral.code} applied: ${Number(referralQuote.referral.discountPercent)}% referral discount`
              : `${referralQuote.referral.code} applied for referral reward`}
          </Text>
        ) : null}

        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Registration summary</Text>
          <Text style={styles.previewLine}>Beds {units.beds} | Rooms {units.rooms} | Shops {units.shops}</Text>
          <Text style={styles.previewLine}>Canteen: {canOfferCanteen && form.canteenEnabled ? "Enabled" : "Not enabled"}</Text>
          <Text style={styles.previewLine}>Plan: {selectedPlan?.name || "-"} | {selectedPlan?.durationMonths || 0} months</Text>
          <Text style={styles.previewLine}>Beds: {money(amountBreakdown.bedAmount)}</Text>
          <Text style={styles.previewLine}>Rooms: {money(amountBreakdown.roomAmount)}</Text>
          <Text style={styles.previewLine}>Shops: {money(amountBreakdown.shopAmount)}</Text>
          <Text style={styles.previewLine}>Base: {money(amountBreakdown.baseAmount)}</Text>
          {amountBreakdown.discountPercent > 0 ? (
            <>
              <Text style={styles.previewLine}>Subtotal: {money(amountBreakdown.subtotal)}</Text>
              <Text style={styles.previewDiscount}>Discount ({amountBreakdown.discountPercent}%): -{money(amountBreakdown.discountAmount)}</Text>
            </>
          ) : null}
          {amountBreakdown.referralDiscountPercent > 0 ? (
            <Text style={styles.previewDiscount}>Referral ({amountBreakdown.referralCode}, {amountBreakdown.referralDiscountPercent}%): -{money(amountBreakdown.referralDiscountAmount)}</Text>
          ) : null}
          <Text style={styles.previewTotal}>Total: {money(amountBreakdown.total)}</Text>
          <Text style={styles.previewNote}>This amount is calculated from the selected active plan.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={saving || plansLoading || !selectedPlan} style={[styles.primaryButton, (saving || plansLoading || !selectedPlan) && styles.disabled]}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Submit and make payment</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13 },
  sectionTitle: { marginTop: 22, color: colors.text, fontSize: 18, fontWeight: "700" },
  label: { marginTop: 14, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "700" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  segment: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segmentButton: { minHeight: 58, flexGrow: 1, flexBasis: "45%", paddingHorizontal: 4, paddingVertical: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segmentText: { width: "100%", color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
  unitGrid: { flexDirection: "row", gap: 8 },
  unitField: { flex: 1 },
  planLoading: { height: 48, paddingHorizontal: 13, flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 7, backgroundColor: colors.primarySoft },
  planLoadingText: { color: colors.primary, fontWeight: "700" },
  planList: { gap: 8 },
  planOption: { minHeight: 72, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  planActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  planOptionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  planName: { flex: 1, color: colors.text, fontWeight: "800" },
  planDuration: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  planPrices: { marginTop: 7, color: colors.muted, fontSize: 12 },
  planDiscount: { marginTop: 6, color: colors.primary, fontSize: 12, fontWeight: "800" },
  planTextActive: { color: colors.primaryDark },
  referralRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  referralInput: { flex: 1, minWidth: 0, height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 15, fontWeight: "800" },
  applyButton: { width: 86, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  applyText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  referralSuccess: { marginTop: 8, color: colors.success, fontSize: 12, fontWeight: "800" },
  preview: { marginTop: 18, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.primarySoft },
  previewTitle: { color: colors.primaryDark, fontWeight: "800" },
  helperText: { marginTop: 6, marginBottom: 8, color: colors.muted, fontSize: 12, fontWeight: "600" },
  previewLine: { marginTop: 6, color: colors.muted, fontSize: 13 },
  previewDiscount: { marginTop: 6, color: colors.success, fontSize: 13, fontWeight: "800" },
  previewTotal: { marginTop: 10, color: colors.primaryDark, fontSize: 17, fontWeight: "800" },
  previewNote: { marginTop: 8, color: colors.muted, fontSize: 12 },
  error: { marginTop: 14, color: colors.danger },
  primaryButton: { height: 50, marginTop: 22, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  secondaryButton: { minHeight: 50, marginTop: 12, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: 7, backgroundColor: colors.surface },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: "900" },
  linkButton: { marginTop: 10, alignItems: "center" },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  verifyingCard: { minHeight: 58, marginTop: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primarySoft },
  confirmingText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  uatButton: { minHeight: 50, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.successSoft },
  uatText: { color: colors.success, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  successCard: { marginTop: 40, padding: 22, alignItems: "center", borderWidth: 1, borderColor: colors.successSoft, borderRadius: 8, backgroundColor: colors.successSoft },
  successTitle: { marginTop: 12, color: colors.success, fontSize: 22, fontWeight: "800" },
  successText: { marginTop: 8, color: colors.success, textAlign: "center", lineHeight: 21 },
  summaryCard: { marginTop: 16, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  summaryTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  summaryLine: { marginTop: 7, color: colors.muted },
  summaryAmount: { marginTop: 12, color: colors.text, fontSize: 20, fontWeight: "800" },
});
