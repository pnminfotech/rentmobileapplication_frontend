import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Crown,
  Edit3,
  HelpCircle,
  LogOut,
  Plus,
  Sparkles,
  Store,
  Trash2,
  WalletCards,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getAdminSubscriptionPlans,
  updateSubscriptionPlan,
} from "../../src/api/saasApi";
import { useResponsive } from "../../src/utils/responsive";

const COLORS = {
  // Kept in sync with the Super Admin dashboard.
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

const DURATIONS = [
  { months: 12, label: "1 Year", shortLabel: "1 Year" },
  { months: 24, label: "2 Years", shortLabel: "2 Years" },
  { months: 36, label: "3 Years", shortLabel: "3 Years" },
];

const PLAN_TONES = [
  { accent: COLORS.burgundy, soft: COLORS.burgundySoft },
  { accent: COLORS.green, soft: COLORS.greenSoft },
  { accent: COLORS.orange, soft: COLORS.orangeSoft },
];

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function numberText(value) {
  return String(value || "").replace(/[^\d.]/g, "").slice(0, 8);
}

function percentText(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "").slice(0, 5);
  const numeric = Number(cleaned || 0);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.min(100, numeric));
}

function yearText(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

function durationLabel(months) {
  const totalMonths = Number(months || 0);
  const years = totalMonths / 12;
  if (Number.isInteger(years) && years > 0) {
    return `${years} ${years === 1 ? "Year" : "Years"}`;
  }
  return `${totalMonths || 0} Months`;
}

function yearsFromMonths(months) {
  const years = Math.max(1, Math.round(Number(months || 12) / 12));
  return String(years);
}

function PriceMetric({ Icon, label, value }) {
  return (
    <View style={styles.metricCell}>
      <Icon size={18} color={COLORS.burgundy} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{money(value)}</Text>
      <Text style={styles.metricMeta}>monthly</Text>
    </View>
  );
}

function PricingInput({ Icon, label, tone, value, onChangeText, placeholder }) {
  return (
    <View style={styles.priceInputRow}>
      <View style={[styles.priceInputIcon, { backgroundColor: tone }]}>
        <Icon size={21} color={COLORS.burgundy} />
      </View>
      <Text style={styles.priceInputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        style={styles.priceInput}
      />
    </View>
  );
}

function DurationCard({ duration, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.durationCard, active && styles.durationCardActive, pressed && styles.pressed]}>
      <CalendarDays size={23} color={active ? COLORS.burgundy : COLORS.muted} />
      <Text style={[styles.durationTitle, active && styles.durationTitleActive]}>{duration.shortLabel}</Text>
      <View style={[styles.durationPill, active && styles.durationPillActive]}>
        <Text style={[styles.durationPillText, active && styles.durationPillTextActive]}>{duration.months} months</Text>
      </View>
    </Pressable>
  );
}

function Stepper() {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepItem}>
        <View style={styles.stepCircleActive}><Text style={styles.stepCircleTextActive}>1</Text></View>
        <Text style={styles.stepLabelActive}>Plan details</Text>
      </View>
      <View style={styles.stepLine} />
      <View style={styles.stepItem}>
        <View style={styles.stepCircle}><Text style={styles.stepCircleText}>2</Text></View>
        <Text style={styles.stepLabel}>Pricing</Text>
      </View>
      <View style={styles.stepLine} />
      <View style={styles.stepItem}>
        <View style={styles.stepCircle}><Text style={styles.stepCircleText}>3</Text></View>
        <Text style={styles.stepLabel}>Review</Text>
      </View>
    </View>
  );
}

function PlanCard({ plan, index, busy, onEdit, onDelete }) {
  const pricing = plan.unitPricing || {};
  const tone = PLAN_TONES[index % PLAN_TONES.length];

  return (
    <View style={styles.planCard}>
      <View style={[styles.planAccent, { backgroundColor: plan.isActive ? tone.accent : COLORS.red }]} />
      <View style={styles.planTop}>
        <View style={[styles.planIcon, { backgroundColor: tone.soft }]}>
          <Crown size={24} color={tone.accent} />
        </View>
        <View style={styles.planInfo}>
          <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
          <Text style={styles.planMeta}>{durationLabel(plan.durationMonths)}  |  {plan.currency || "INR"}</Text>
        </View>
        <View style={[styles.statusBadge, plan.isActive && styles.statusBadgeActive]}>
          <Text style={[styles.statusText, plan.isActive && styles.statusTextActive]}>{plan.isActive ? "Active" : "Inactive"}</Text>
        </View>
      </View>

      <View style={[styles.metricGrid, { backgroundColor: plan.isActive ? tone.soft : COLORS.soft }]}>
        <PriceMetric Icon={BedDouble} label="Bed" value={pricing.bedMonthly} />
        <View style={styles.metricDivider} />
        <PriceMetric Icon={Building2} label="Room" value={pricing.roomMonthly} />
        <View style={styles.metricDivider} />
        <PriceMetric Icon={Store} label="Shop" value={pricing.shopMonthly} />
      </View>

      <View style={styles.baseRow}>
        <Text style={styles.baseLabel}>Base amount</Text>
        <Text style={styles.baseValue}>{money(plan.baseAmount)}</Text>
      </View>

      <View style={styles.discountRow}>
        <Text style={styles.discountLabel}>Discount</Text>
        <Text style={styles.discountValue}>{Number(plan.discountPercent || 0)}%</Text>
      </View>

      <View style={styles.planActions}>
        <Pressable
          onPress={onEdit}
          disabled={busy}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <Edit3 size={16} color={COLORS.burgundy} />
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={busy}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator size="small" color={COLORS.red} /> : <Trash2 size={16} color={COLORS.red} />}
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState({
    durationMonths: 12,
    customYears: "1",
    bedMonthly: "",
    roomMonthly: "",
    shopMonthly: "",
    baseAmount: "0",
    discountPercent: "0",
  });

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setDurationMonths = (months) => {
    setForm((current) => ({
      ...current,
      durationMonths: Number(months || 12),
      customYears: yearsFromMonths(months),
    }));
  };

  const loadPlans = useCallback(async () => {
    try {
      setError("");
      const data = await getAdminSubscriptionPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadPlans(); }, [loadPlans]));

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => Number(a.durationMonths || 0) - Number(b.durationMonths || 0)), [plans]);
  const currentDuration = useMemo(
    () => ({ months: Number(form.durationMonths || 12), label: durationLabel(form.durationMonths) }),
    [form.durationMonths]
  );
  const isEditing = Boolean(editingPlan?._id);

  function resetForm(nextDuration = form.durationMonths) {
    setForm({ durationMonths: nextDuration, customYears: yearsFromMonths(nextDuration), bedMonthly: "", roomMonthly: "", shopMonthly: "", baseAmount: "0", discountPercent: "0" });
    setEditingPlan(null);
  }

  function openCreate() {
    setError("");
    resetForm(form.durationMonths);
    setCreating(true);
  }

  function openEdit(plan) {
    const pricing = plan.unitPricing || {};
    setError("");
    setEditingPlan(plan);
    setForm({
      durationMonths: Number(plan.durationMonths || 12),
      customYears: yearsFromMonths(plan.durationMonths),
      bedMonthly: String(pricing.bedMonthly ?? ""),
      roomMonthly: String(pricing.roomMonthly ?? ""),
      shopMonthly: String(pricing.shopMonthly ?? ""),
      baseAmount: String(plan.baseAmount ?? "0"),
      discountPercent: String(plan.discountPercent ?? "0"),
    });
    setCreating(true);
  }

  async function submit() {
    const bedMonthly = Number(form.bedMonthly || 0);
    const roomMonthly = Number(form.roomMonthly || 0);
    const shopMonthly = Number(form.shopMonthly || 0);
    const baseAmount = Number(form.baseAmount || 0);
    const discountPercent = Number(form.discountPercent || 0);
    const durationMonths = Math.max(1, Number(form.durationMonths || 0));
    if (!Number.isFinite(durationMonths) || durationMonths < 1) {
      setError("Plan duration is required.");
      return;
    }
    if (bedMonthly < 0 || roomMonthly < 0 || shopMonthly < 0 || baseAmount < 0) {
      setError("Plan amounts cannot be negative.");
      return;
    }
    if (discountPercent < 0 || discountPercent > 100) {
      setError("Discount must be between 0 and 100%.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = {
        name: `${currentDuration.label} Plan`,
        durationMonths,
        baseAmount,
        discountPercent,
        unitPricing: { bedMonthly, roomMonthly, shopMonthly },
        currency: "INR",
        isActive: true,
      };
      if (isEditing) await updateSubscriptionPlan(editingPlan._id, payload);
      else await createSubscriptionPlan(payload);
      resetForm(form.durationMonths);
      await loadPlans();
      setCreating(false);
    } catch (err) {
      setError(err.response?.data?.message || `Unable to ${isEditing ? "update" : "create"} plan.`);
    } finally {
      setSaving(false);
    }
  }

  async function removePlan(plan) {
    try {
      setActionId(String(plan._id));
      const result = await deleteSubscriptionPlan(plan._id);
      await loadPlans();
      if (result?.deactivated) {
        setError(result.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete plan.");
    } finally {
      setActionId("");
    }
  }

  function confirmDelete(plan) {
    Alert.alert(
      "Delete subscription plan?",
      `${plan.name} will be permanently removed from subscription plan templates.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removePlan(plan) },
      ]
    );
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.burgundy} /></View>;

  const contentInsets = {
    paddingHorizontal: responsive.pagePadding,
    paddingTop: 5,
    paddingBottom: Math.max(insets.bottom + 36, 48),
  };

  if (creating) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentInsets]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.builderHeader}>
          <Pressable onPress={() => { setCreating(false); resetForm(); }} style={styles.headerButton}><ArrowLeft size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.builderTitle}>{isEditing ? "Edit Plan" : "Create Plan"}</Text>
          <Pressable style={styles.headerButton}><HelpCircle size={23} color={COLORS.burgundy} /></Pressable>
        </View>

        <View style={styles.builderHero}>
          <View>
            <Text style={styles.builderHeroTitle}>Plan Builder</Text>
            <Text style={styles.builderHeroText}>{isEditing ? "Update this subscription" : "Create a new subscription"}{"\n"}plan for your businesses</Text>
          </View>
          <View style={styles.builderGraphic}>
            <View style={styles.builderSheet}>
              <View style={styles.sheetLine} />
              <View style={styles.sheetLineSmall} />
              <View style={styles.sheetLine} />
            </View>
            <View style={styles.builderPlus}><Plus size={24} color={COLORS.card} /></View>
          </View>
        </View>

        <Stepper />

        <Text style={styles.builderSectionTitle}>Plan duration</Text>
        <View style={styles.durationCards}>
          {DURATIONS.map((duration) => (
            <DurationCard
              key={duration.months}
              duration={duration}
              active={form.durationMonths === duration.months}
              onPress={() => setDurationMonths(duration.months)}
            />
          ))}
        </View>
        <View style={styles.customDurationRow}>
          <View style={styles.customDurationText}>
            <Text style={styles.customDurationLabel}>Custom duration</Text>
            <Text style={styles.customDurationHint}>Enter any plan length in years, like 5 years.</Text>
          </View>
          <TextInput
            value={form.customYears}
            onChangeText={(value) => {
              const years = yearText(value);
              setForm((current) => ({
                ...current,
                customYears: years,
                durationMonths: years ? Number(years) * 12 : 0,
              }));
            }}
            keyboardType="number-pad"
            placeholder="5"
            style={styles.customDurationInput}
          />
        </View>

        <Text style={styles.builderSectionTitle}>Monthly pricing (INR)</Text>
        <View style={styles.pricingList}>
          <PricingInput Icon={BedDouble} label="Bed monthly" tone={COLORS.burgundySoft} value={form.bedMonthly} onChangeText={(value) => setValue("bedMonthly", numberText(value))} placeholder="20" />
          <PricingInput Icon={Building2} label="Room monthly" tone={COLORS.greenSoft} value={form.roomMonthly} onChangeText={(value) => setValue("roomMonthly", numberText(value))} placeholder="30" />
          <PricingInput Icon={Store} label="Shop monthly" tone={COLORS.orangeSoft} value={form.shopMonthly} onChangeText={(value) => setValue("shopMonthly", numberText(value))} placeholder="40" />
          <PricingInput Icon={WalletCards} label="Base amount" tone={COLORS.soft} value={form.baseAmount} onChangeText={(value) => setValue("baseAmount", numberText(value))} placeholder="0" />
          <PricingInput Icon={Sparkles} label="Discount (%)" tone={COLORS.burgundySoft} value={form.discountPercent} onChangeText={(value) => setValue("discountPercent", percentText(value))} placeholder="0" />
        </View>

        <View style={styles.infoBox}>
          <Sparkles size={20} color={COLORS.burgundy} />
          <Text style={styles.infoText}>Base amount is charged once during <Text style={styles.infoLink}>business registration.</Text></Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={saving} style={({ pressed }) => [styles.builderButton, saving && styles.disabled, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator color={COLORS.card} /> : <><Text style={styles.builderButtonText}>{isEditing ? "Update plan" : "Create plan"}</Text><ArrowRight size={22} color={COLORS.card} /></>}
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentInsets]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.menuButton}><ArrowLeft size={24} color={COLORS.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
          <Text style={styles.title}>Subscription Plans</Text>
        </View>
        <Pressable onPress={() => router.push("/superadmin/notifications")} style={styles.topAction}>
          <Bell size={23} color={COLORS.text} />
          <View style={styles.notificationDot}><Text style={styles.notificationText}>1</Text></View>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.topAction}><LogOut size={24} color={COLORS.red} /></Pressable>
      </View>

      <View style={styles.overviewHero}>
        <View style={styles.heroIconBox}>
          <CheckCircle2 size={25} color={COLORS.burgundy} />
        </View>
        <Text style={styles.overviewLabel}>Plans overview</Text>
        <Text style={styles.overviewValue}>{sortedPlans.length} Plans configured</Text>
        <Text style={styles.overviewText}>Manage and customize your{"\n"}subscription plans</Text>
        <View style={styles.overviewArt}>
          <View style={styles.artBase} />
          <View style={styles.artLayer} />
          <View style={styles.artCard}>
            <View style={styles.artLine} />
            <View style={styles.artLineShort} />
          </View>
        </View>
      </View>

      <Pressable onPress={openCreate} style={({ pressed }) => [styles.newPlanButton, pressed && styles.pressed]}>
        <Plus size={22} color={COLORS.card} />
        <Text style={styles.newPlanText}>Create new plan</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Existing plans</Text>
        <Text style={styles.listCount}>{sortedPlans.length} plans</Text>
      </View>
      {!sortedPlans.length ? <Text style={styles.empty}>No plans created yet.</Text> : null}
      {sortedPlans.map((plan, index) => (
        <PlanCard
          key={plan._id}
          plan={plan}
          index={index}
          busy={actionId === String(plan._id)}
          onEdit={() => openEdit(plan)}
          onDelete={() => confirmDelete(plan)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  menuButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  topAction: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.card },
  notificationDot: { position: "absolute", right: 2, top: 2, minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: COLORS.red },
  notificationText: { color: COLORS.card, fontSize: 10, fontWeight: "900" },

  overviewHero: { minHeight: 130, padding: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  heroIconBox: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: COLORS.burgundySoft },
  overviewLabel: { marginTop: 14, color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  overviewValue: { marginTop: 5, color: COLORS.text, fontSize: 18, fontWeight: "900" },
  overviewText: { marginTop: 6, color: COLORS.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  overviewArt: { position: "absolute", right: 14, bottom: 21, width: 108, height: 88 },
  artBase: { position: "absolute", left: 10, bottom: 0, width: 88, height: 22, borderRadius: 11, backgroundColor: COLORS.soft },
  artLayer: { position: "absolute", left: 20, bottom: 16, width: 88, height: 25, borderRadius: 8, backgroundColor: COLORS.burgundySoft, transform: [{ rotate: "-12deg" }] },
  artCard: { position: "absolute", right: 0, bottom: 35, width: 80, height: 58, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.card, transform: [{ rotate: "6deg" }] },
  artLine: { width: 42, height: 8, borderRadius: 4, backgroundColor: COLORS.burgundySoft },
  artLineShort: { width: 30, height: 8, marginTop: 10, borderRadius: 4, backgroundColor: COLORS.greenSoft },

  newPlanButton: { height: 46, marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, backgroundColor: COLORS.burgundy, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  newPlanText: { color: COLORS.card, fontSize: 14, fontWeight: "900" },
  listHeader: { marginTop: 20, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  listCount: { color: COLORS.burgundy, fontSize: 12, fontWeight: "900" },
  empty: { paddingVertical: 22, color: COLORS.muted, textAlign: "center", fontWeight: "700" },
  error: { marginTop: 12, padding: 11, color: COLORS.red, borderRadius: 10, backgroundColor: COLORS.redSoft, fontWeight: "700" },

  planCard: { marginBottom: 11, padding: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  planAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  planTop: { flexDirection: "row", alignItems: "center" },
  planIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  planInfo: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  planName: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  planMeta: { marginTop: 4, color: COLORS.muted, fontSize: 11.5, fontWeight: "700" },
  statusBadge: { minHeight: 28, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: COLORS.redSoft },
  statusBadgeActive: { backgroundColor: COLORS.greenSoft },
  statusText: { color: COLORS.red, fontSize: 11.5, fontWeight: "900" },
  statusTextActive: { color: COLORS.green },
  metricGrid: { marginTop: 12, paddingVertical: 10, flexDirection: "row", borderRadius: 11 },
  metricCell: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  metricDivider: { width: 1, backgroundColor: COLORS.border },
  metricLabel: { marginTop: 5, color: COLORS.muted, fontSize: 10.5, fontWeight: "800" },
  metricValue: { marginTop: 4, color: COLORS.text, fontSize: 13, fontWeight: "900" },
  metricMeta: { marginTop: 4, color: COLORS.muted, fontSize: 9.5, fontWeight: "700" },
  baseRow: { marginTop: 10, minHeight: 38, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.card },
  baseLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  baseValue: { color: COLORS.text, fontSize: 13, fontWeight: "900" },
  discountRow: { marginTop: 8, minHeight: 34, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.burgundySoft },
  discountLabel: { color: COLORS.burgundy, fontSize: 12, fontWeight: "900" },
  discountValue: { color: COLORS.burgundy, fontSize: 13, fontWeight: "900" },
  planActions: { marginTop: 10, flexDirection: "row", gap: 8 },
  editButton: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: COLORS.burgundy, borderRadius: 10, backgroundColor: COLORS.burgundySoft },
  deleteButton: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#FFB4B0", borderRadius: 10, backgroundColor: "#FFF7F6" },
  editText: { color: COLORS.burgundy, fontSize: 13, fontWeight: "900" },
  deleteText: { color: COLORS.red, fontSize: 13, fontWeight: "900" },

  builderHeader: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  builderTitle: { color: COLORS.text, fontSize: 23, fontWeight: "900" },
  builderHero: { minHeight: 112, padding: 14, flexDirection: "row", justifyContent: "space-between", overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.burgundy },
  builderHeroTitle: { color: COLORS.card, fontSize: 17, fontWeight: "900" },
  builderHeroText: { marginTop: 8, color: "#F8DFEC", fontSize: 13, lineHeight: 20, fontWeight: "700" },
  builderGraphic: { width: 92, alignItems: "center", justifyContent: "center" },
  builderSheet: { width: 56, height: 68, padding: 11, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.28)", transform: [{ rotate: "10deg" }] },
  sheetLine: { width: 36, height: 7, borderRadius: 4, backgroundColor: "#F8DFEC" },
  sheetLineSmall: { width: 25, height: 7, marginTop: 10, marginBottom: 10, borderRadius: 4, backgroundColor: "#F8DFEC" },
  builderPlus: { position: "absolute", left: 10, bottom: 14, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.28)" },
  stepper: { marginTop: 18, marginBottom: 4, paddingHorizontal: 22, flexDirection: "row", alignItems: "flex-start" },
  stepItem: { alignItems: "center", width: 68 },
  stepLine: { flex: 1, height: 2, marginTop: 16, borderRadius: 2, backgroundColor: COLORS.border },
  stepCircleActive: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: COLORS.burgundy },
  stepCircle: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: COLORS.soft },
  stepCircleTextActive: { color: COLORS.card, fontSize: 14, fontWeight: "900" },
  stepCircleText: { color: COLORS.muted, fontSize: 14, fontWeight: "900" },
  stepLabelActive: { marginTop: 8, color: COLORS.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  stepLabel: { marginTop: 8, color: COLORS.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  builderSectionTitle: { marginTop: 20, marginBottom: 10, color: COLORS.text, fontSize: 16, fontWeight: "900" },
  durationCards: { flexDirection: "row", gap: 8 },
  durationCard: { flex: 1, minHeight: 96, paddingVertical: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card },
  durationCardActive: { borderColor: COLORS.burgundy, backgroundColor: COLORS.burgundySoft },
  durationTitle: { marginTop: 9, color: COLORS.text, fontSize: 13, fontWeight: "900", textAlign: "center" },
  durationTitleActive: { color: COLORS.text },
  durationPill: { marginTop: 8, minHeight: 24, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.soft },
  durationPillActive: { backgroundColor: COLORS.card },
  durationPillText: { color: COLORS.muted, fontSize: 10, fontWeight: "900" },
  durationPillTextActive: { color: COLORS.burgundy },
  customDurationRow: { minHeight: 62, marginTop: 10, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card },
  customDurationText: { flex: 1, minWidth: 0 },
  customDurationLabel: { color: COLORS.text, fontSize: 13, fontWeight: "900" },
  customDurationHint: { marginTop: 4, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  customDurationInput: { width: 76, height: 42, paddingHorizontal: 10, color: COLORS.text, textAlign: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.soft, fontSize: 15, fontWeight: "900" },
  pricingList: { gap: 9 },
  priceInputRow: { minHeight: 62, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  priceInputIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  priceInputLabel: { flex: 1, minWidth: 0, marginLeft: 11, color: COLORS.muted, fontSize: 13, fontWeight: "900" },
  priceInput: { width: 74, height: 44, paddingHorizontal: 10, color: COLORS.text, textAlign: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, backgroundColor: COLORS.card, fontSize: 14, fontWeight: "700" },
  infoBox: { minHeight: 60, marginTop: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.soft },
  infoText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  infoLink: { color: COLORS.burgundy },
  builderButton: { height: 50, marginTop: 18, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, backgroundColor: COLORS.burgundy, shadowColor: COLORS.burgundyDark, shadowOpacity: 0.14, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  builderButtonText: { flex: 1, color: COLORS.card, fontSize: 14, fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
});
