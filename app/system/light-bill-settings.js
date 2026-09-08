import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, IndianRupee, Save, Zap } from "lucide-react-native";

import { getSystemDashboard } from "../../src/api/saasApi";
import { getLightBillSettings, updateLightBillSettings } from "../../src/api/lightBillApi";
import { allowedUnitTypes, isTypeAllowed } from "../../src/utils/subscriptionAccess";
import { systemColors as colors, systemShadow } from "../../src/theme/systemTheme";

const MODE_OPTIONS = {
  bed: [
    { value: "owner_only", title: "Owner pays the bill", subtitle: "Only record the hostel light bill. It will not be added to tenant rent." },
    { value: "fixed_per_tenant", title: "Same fixed amount for every tenant", subtitle: "Example: collect Rs. 300 per tenant every month with rent." },
    { value: "room_meter_rate", title: "Meter rate", subtitle: "Enter readings. Units above the included limit are charged at your set rate and split between active room tenants." },
    { value: "room_meter_actual_bill", title: "Actual bill split", subtitle: "Enter readings and the actual bill amount. Only the proportion above the included limit is split between active room tenants." },
    { value: "common_hostel_bill", title: "One common hostel bill", subtitle: "Use one bill for the entire hostel when rooms do not have separate meters." },
  ],
  room: [
    { value: "owner_only", title: "Owner pays the bill", subtitle: "Only record the room light bill. It will not be added to tenant rent." },
    { value: "fixed_monthly", title: "Fixed amount every month", subtitle: "Example: collect Rs. 500 per room every month with rent." },
    { value: "tenant_unit_manual", title: "Enter amount manually", subtitle: "Add the bill amount for a selected room and collect it with rent." },
    { value: "tenant_unit_meter", title: "Use meter reading", subtitle: "Enter previous/current reading and rate to calculate the bill." },
  ],
  shop: [
    { value: "owner_only", title: "Owner pays the bill", subtitle: "Only record the shop light bill. It will not be added to tenant rent." },
    { value: "fixed_monthly", title: "Fixed amount every month", subtitle: "Example: collect Rs. 700 per shop every month with rent." },
    { value: "tenant_unit_manual", title: "Enter amount manually", subtitle: "Add the bill amount for a selected shop and collect it with rent." },
    { value: "tenant_unit_meter", title: "Use meter reading", subtitle: "Enter previous/current reading and rate to calculate the bill." },
  ],
};

const LEGACY_MODE_ALIASES = {
  record_only: "owner_only",
  tenant_direct: "owner_only",
  included_extra_split: "room_meter_rate",
  room_meter_split: "room_meter_rate",
};
const COMMON_HOSTEL_MODES = new Set(["common_owner_bill", "common_meter_split"]);

const EMPTY_PROPERTY = {
  enabled: false,
  mode: "owner_only",
  addToRentCollection: false,
  fixedAmount: "",
  includedAmount: "",
  includedUnits: "",
  ratePerUnit: "",
  splitMethod: "equal_active_tenants",
  notes: "",
};

const PROPERTY_HINT = {
  bed: "Hostel beds",
  room: "Residential rooms",
  shop: "Commercial shops",
};

function amountText(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "";
}

function normalizeProperty(settings = {}) {
  const mode = LEGACY_MODE_ALIASES[settings.mode] || settings.mode || "owner_only";
  return {
    ...EMPTY_PROPERTY,
    enabled: Boolean(settings.enabled) || mode !== "none",
    mode: mode === "none" ? "owner_only" : mode,
    addToRentCollection: canRecover(mode),
    fixedAmount: amountText(settings.fixedAmount),
    includedAmount: amountText(settings.includedAmount),
    includedUnits: amountText(settings.includedUnits),
    ratePerUnit: amountText(settings.ratePerUnit),
    splitMethod: settings.splitMethod || "equal_active_tenants",
    notes: settings.notes || "",
  };
}

function normalizeSettings(settings = {}) {
  return {
    bed: normalizeProperty(settings.bed),
    room: normalizeProperty(settings.room),
    shop: normalizeProperty(settings.shop),
  };
}

function moneyInput(value, onChange, placeholder = "0") {
  return (
    <View style={styles.moneyField}>
      <IndianRupee size={15} color={colors.deep} />
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d.]/g, ""))}
        keyboardType="numeric"
        placeholder={placeholder}
        style={styles.moneyInput}
      />
    </View>
  );
}

function unitInput(value, onChange, placeholder = "100") {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/[^\d]/g, ""))}
      keyboardType="numeric"
      placeholder={placeholder}
      style={styles.input}
    />
  );
}

function needsFixedAmount(mode) {
  return ["fixed_monthly", "fixed_per_tenant"].includes(mode);
}

function needsRate(mode) {
  return ["tenant_unit_meter", "room_meter_rate"].includes(mode);
}

function needsIncludedUnits(type, mode) {
  return type === "bed" && ["room_meter_rate", "room_meter_actual_bill"].includes(mode);
}

function canRecover(mode) {
  return !["none", "owner_only", "record_only", "tenant_direct", "common_owner_bill"].includes(mode);
}

function settingModeTitle(type, mode) {
  if (mode === "common_owner_bill") return "One common hostel bill - owner pays";
  if (mode === "common_meter_split") return "One common hostel bill - split among tenants";
  return (MODE_OPTIONS[type] || []).find((option) => option.value === mode)?.title || "Not configured";
}

export default function LightBillSettingsScreen() {
  const router = useRouter();
  const [form, setForm] = useState(normalizeSettings());
  const [unitAccess, setUnitAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [settings, dashboard] = await Promise.all([getLightBillSettings(), getSystemDashboard()]);
      setForm(normalizeSettings(settings));
      setUnitAccess(dashboard?.units || dashboard);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load light bill settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visibleTypes = useMemo(() => allowedUnitTypes(unitAccess).filter((type) => isTypeAllowed(type.value, unitAccess)), [unitAccess]);

  function setProperty(type, patch) {
    setForm((current) => ({ ...current, [type]: { ...current[type], ...patch } }));
  }

function applyMode(type, mode) {
    const savedMode = mode === "common_hostel_bill" ? "common_owner_bill" : mode;
    setProperty(type, {
      enabled: true,
      mode: savedMode,
      addToRentCollection: canRecover(savedMode),
    });
  }

  function selectMode(type, mode) {
    const savedMode = mode === "common_hostel_bill" ? "common_owner_bill" : mode;
    const current = form[type] || EMPTY_PROPERTY;
    if (!current.enabled || current.mode === savedMode) {
      applyMode(type, mode);
      return;
    }

    Alert.alert(
      "Change light bill rule?",
      `${PROPERTY_HINT[type]} will change from ${settingModeTitle(type, current.mode)} to ${settingModeTitle(type, savedMode)}. Existing bills and recorded rent payments will not change. New bills and rent calculations will use the new rule after you save.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Change rule", style: "destructive", onPress: () => applyMode(type, mode) },
      ]
    );
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      for (const type of visibleTypes) {
        const property = form[type.value];
        if (!property?.enabled) continue;
        if (needsFixedAmount(property.mode) && Number(property.fixedAmount || 0) <= 0) {
          throw new Error(`Enter fixed monthly amount for ${PROPERTY_HINT[type.value]}.`);
        }
        if (needsRate(property.mode) && Number(property.ratePerUnit || 0) <= 0) {
          throw new Error(`Enter rate per unit for ${PROPERTY_HINT[type.value]}.`);
        }
        if (needsIncludedUnits(type.value, property.mode) && Number(property.includedUnits || 0) < 0) {
          throw new Error(`Enter valid included units for ${PROPERTY_HINT[type.value]}.`);
        }
      }
      const payload = {
        bed: {
          ...form.bed,
          addToRentCollection: canRecover(form.bed.mode),
          fixedAmount: Number(form.bed.fixedAmount || 0),
          includedAmount: Number(form.bed.includedAmount || 0),
          includedUnits: Number(form.bed.includedUnits || 0),
          ratePerUnit: Number(form.bed.ratePerUnit || 0),
          fixedCharge: 0,
        },
        room: {
          ...form.room,
          addToRentCollection: canRecover(form.room.mode),
          fixedAmount: Number(form.room.fixedAmount || 0),
          includedAmount: Number(form.room.includedAmount || 0),
          includedUnits: Number(form.room.includedUnits || 0),
          ratePerUnit: Number(form.room.ratePerUnit || 0),
          fixedCharge: 0,
        },
        shop: {
          ...form.shop,
          addToRentCollection: canRecover(form.shop.mode),
          fixedAmount: Number(form.shop.fixedAmount || 0),
          includedAmount: Number(form.shop.includedAmount || 0),
          includedUnits: Number(form.shop.includedUnits || 0),
          ratePerUnit: Number(form.shop.ratePerUnit || 0),
          fixedCharge: 0,
        },
      };
      await updateLightBillSettings(payload);
      Alert.alert("Saved", "Light bill settings updated successfully.");
      router.replace("/system/light-bills");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Unable to save light bill settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.deep} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/more")} style={styles.backButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>LIGHT BILL SETUP</Text>
          <Text style={styles.title}>Light Bill Settings</Text>
          <Text style={styles.subtitle}>Choose how electricity billing works for each property type.</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Zap size={24} color={colors.deep} /></View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Billing scenario</Text>
          <Text style={styles.heroSubtitle}>Pick one simple rule. The app will use it while adding bills and collecting rent.</Text>
        </View>
      </View>

      {visibleTypes.map((type) => {
        const property = form[type.value] || EMPTY_PROPERTY;
        const activeMode = property.mode || "none";
        return (
            <View key={type.value} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{PROPERTY_HINT[type.value]}</Text>
              <Text style={[styles.statusBadge, property.enabled && styles.statusBadgeActive]}>{property.enabled ? "Enabled" : "Not used"}</Text>
            </View>
            {(MODE_OPTIONS[type.value] || []).map((option) => {
              const selected = option.value === "common_hostel_bill"
                ? COMMON_HOSTEL_MODES.has(activeMode)
                : activeMode === option.value;
              return (
                <Pressable key={option.value} onPress={() => selectMode(type.value, option.value)} style={[styles.option, selected && styles.optionActive]}>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                  </View>
                  {selected ? <Check size={19} color={colors.deep} /> : null}
                </Pressable>
              );
            })}

            {property.enabled ? (
              <View style={styles.configBox}>
                {needsFixedAmount(activeMode) ? (
                  <View>
                    <Text style={styles.label}>Fixed monthly amount</Text>
                    {moneyInput(property.fixedAmount, (value) => setProperty(type.value, { fixedAmount: value }))}
                  </View>
                ) : null}
                {needsRate(activeMode) ? (
                  <View>
                    <Text style={styles.label}>Rate per unit</Text>
                    {moneyInput(property.ratePerUnit, (value) => setProperty(type.value, { ratePerUnit: value }))}
                  </View>
                ) : null}
                {needsIncludedUnits(type.value, activeMode) ? (
                  <View>
                    <Text style={styles.label}>Included units per room</Text>
                    {unitInput(property.includedUnits, (value) => setProperty(type.value, { includedUnits: value }))}
                    <Text style={styles.infoText}>Example: if 100 units are included, tenants only share the bill for units consumed after 100.</Text>
                  </View>
                ) : null}
                {type.value === "bed" && COMMON_HOSTEL_MODES.has(activeMode) ? (
                  <View>
                    <Text style={styles.label}>Who pays this common bill?</Text>
                    <View style={styles.commonChoiceRow}>
                      <Pressable onPress={() => selectMode("bed", "common_hostel_bill")} style={[styles.commonChoice, activeMode === "common_owner_bill" && styles.commonChoiceActive]}>
                        <Text style={[styles.commonChoiceText, activeMode === "common_owner_bill" && styles.commonChoiceTextActive]}>Owner pays</Text>
                      </Pressable>
                      <Pressable onPress={() => selectMode("bed", "common_meter_split")} style={[styles.commonChoice, activeMode === "common_meter_split" && styles.commonChoiceActive]}>
                        <Text style={[styles.commonChoiceText, activeMode === "common_meter_split" && styles.commonChoiceTextActive]}>Split among tenants</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.infoText}>{activeMode === "common_owner_bill" ? "The bill is recorded for the whole hostel and not added to tenant rent." : "The bill is divided equally among all active hostel tenants for the billing month."}</Text>
                  </View>
                ) : null}
                {activeMode === "owner_only" ? (
                  <Text style={styles.infoText}>This bill will appear in Light bills and reports as owner/admin paid. It will not be added in tenant rent.</Text>
                ) : null}
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={property.notes}
                  onChangeText={(value) => setProperty(type.value, { notes: value })}
                  placeholder="Optional instructions for this billing flow"
                  multiline
                  style={[styles.input, styles.notesInput]}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={save} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.surface} /> : <><Save size={19} color={colors.surface} /><Text style={styles.saveText}>Save light bill settings</Text></>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screen },
  header: { marginBottom: 14, flexDirection: "row", alignItems: "flex-start" },
  backButton: { width: 42, height: 42, marginRight: 6, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.deep, fontSize: 11, fontWeight: "900" },
  title: { marginTop: 2, color: colors.text, fontSize: 27, fontWeight: "900" },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: "700" },
  hero: { marginBottom: 14, padding: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, ...systemShadow },
  heroIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.soft },
  heroText: { flex: 1, marginLeft: 12 },
  heroTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  heroSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: "700" },
  section: { marginBottom: 14, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, ...systemShadow },
  sectionHeader: { marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statusBadge: { overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.pale, color: colors.muted, fontSize: 11, fontWeight: "900" },
  statusBadgeActive: { backgroundColor: colors.soft, color: colors.deep },
  option: { minHeight: 70, marginBottom: 8, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.screen },
  optionActive: { borderColor: colors.deep, backgroundColor: colors.soft },
  optionText: { flex: 1, minWidth: 0, marginRight: 10 },
  optionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  optionSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: "700" },
  configBox: { marginTop: 4, padding: 12, borderRadius: 13, backgroundColor: colors.pale },
  label: { marginTop: 10, marginBottom: 7, color: colors.muted, fontSize: 12, fontWeight: "900" },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, color: colors.text, fontSize: 14, fontWeight: "700" },
  notesInput: { minHeight: 74, paddingTop: 12, textAlignVertical: "top" },
  moneyField: { height: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  moneyInput: { flex: 1, marginLeft: 7, color: colors.text, fontSize: 15, fontWeight: "800" },
  twoColumn: { flexDirection: "row", gap: 10 },
  column: { flex: 1, minWidth: 0 },
  infoText: { marginTop: 10, color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  commonChoiceRow: { flexDirection: "row", gap: 8 },
  commonChoice: { flex: 1, minHeight: 42, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.card },
  commonChoiceActive: { borderColor: colors.deep, backgroundColor: colors.soft },
  commonChoiceText: { color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  commonChoiceTextActive: { color: colors.deep },
  error: { marginBottom: 12, color: colors.danger, fontWeight: "800" },
  saveButton: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, backgroundColor: colors.deep, ...systemShadow },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
