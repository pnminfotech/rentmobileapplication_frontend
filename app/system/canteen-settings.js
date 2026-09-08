import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, IndianRupee, Save, Utensils } from "lucide-react-native";

import { getCanteenSettings, updateCanteenSettings } from "../../src/api/canteenApi";
import { systemColors as colors, systemShadow } from "../../src/theme/systemTheme";

const MEALS = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Dinner", value: "dinner" },
];

const PRIMARY_MODES = [
  { key: "full_package", title: "Full food package", subtitle: "Breakfast + lunch + dinner fixed monthly" },
  { key: "per_meal", title: "Per meal pricing", subtitle: "Bill depends on marked attendance" },
  { key: "meal_package", title: "Meal package monthly", subtitle: "Selected meals as a fixed package" },
];
const GUEST_MODE = { key: "guest_meal", title: "Guest / extra meal charges", subtitle: "Optional add-on for extra meals" };

const EMPTY = {
  activeModes: [],
  fullPackage: { monthlyAmount: "", includedMeals: ["breakfast", "lunch", "dinner"] },
  perMeal: { breakfast: "", lunch: "", dinner: "" },
  mealPackage: { name: "Lunch + Dinner", monthlyAmount: "", includedMeals: ["lunch", "dinner"] },
  guestMeal: { breakfast: "", lunch: "", dinner: "" },
};

function amountText(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "";
}

function normalizeForm(settings = {}) {
  const rawModes = Array.isArray(settings.activeModes) ? settings.activeModes : [];
  const primaryMode = rawModes.find((mode) => PRIMARY_MODES.some((item) => item.key === mode));
  return {
    activeModes: [...(primaryMode ? [primaryMode] : []), ...(rawModes.includes("guest_meal") ? ["guest_meal"] : [])],
    fullPackage: {
      monthlyAmount: amountText(settings.fullPackage?.monthlyAmount),
      includedMeals: settings.fullPackage?.includedMeals?.length ? settings.fullPackage.includedMeals : ["breakfast", "lunch", "dinner"],
    },
    perMeal: {
      breakfast: amountText(settings.perMeal?.breakfast),
      lunch: amountText(settings.perMeal?.lunch),
      dinner: amountText(settings.perMeal?.dinner),
    },
    mealPackage: {
      name: settings.mealPackage?.name || "Lunch + Dinner",
      monthlyAmount: amountText(settings.mealPackage?.monthlyAmount),
      includedMeals: settings.mealPackage?.includedMeals?.length ? settings.mealPackage.includedMeals : ["lunch", "dinner"],
    },
    guestMeal: {
      breakfast: amountText(settings.guestMeal?.breakfast),
      lunch: amountText(settings.guestMeal?.lunch),
      dinner: amountText(settings.guestMeal?.dinner),
    },
  };
}

function moneyInput(value, onChange) {
  return (
    <View style={styles.moneyField}>
      <IndianRupee size={15} color={colors.deep} />
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d.]/g, ""))}
        keyboardType="numeric"
        placeholder="0"
        style={styles.moneyInput}
      />
    </View>
  );
}

export default function CanteenSettingsScreen() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const settings = await getCanteenSettings();
      setForm(normalizeForm(settings));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load canteen settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function modeEnabled(mode) {
    return form.activeModes.includes(mode);
  }

  function toggleMode(mode) {
    setForm((current) => ({
      ...current,
      activeModes: [
        ...(current.activeModes.includes(mode) ? [] : [mode]),
        ...(current.activeModes.includes("guest_meal") ? ["guest_meal"] : []),
      ],
    }));
  }

  function toggleGuestMode() {
    setForm((current) => ({
      ...current,
      activeModes: current.activeModes.includes("guest_meal")
        ? current.activeModes.filter((item) => item !== "guest_meal")
        : [...current.activeModes, "guest_meal"],
    }));
  }

  function setNested(section, key, value) {
    setForm((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  }

  function toggleMeal(section, meal) {
    setForm((current) => {
      const existing = current[section]?.includedMeals || [];
      const includedMeals = existing.includes(meal) ? existing.filter((item) => item !== meal) : [...existing, meal];
      return { ...current, [section]: { ...current[section], includedMeals } };
    });
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      await updateCanteenSettings({
        activeModes: form.activeModes,
        fullPackage: {
          monthlyAmount: Number(form.fullPackage.monthlyAmount || 0),
          includedMeals: form.fullPackage.includedMeals,
        },
        perMeal: {
          breakfast: Number(form.perMeal.breakfast || 0),
          lunch: Number(form.perMeal.lunch || 0),
          dinner: Number(form.perMeal.dinner || 0),
        },
        mealPackage: {
          name: form.mealPackage.name,
          monthlyAmount: Number(form.mealPackage.monthlyAmount || 0),
          includedMeals: form.mealPackage.includedMeals,
        },
        guestMeal: {
          breakfast: Number(form.guestMeal.breakfast || 0),
          lunch: Number(form.guestMeal.lunch || 0),
          dinner: Number(form.guestMeal.dinner || 0),
        },
      });
      Alert.alert("Saved", "Canteen settings updated successfully.");
      router.replace("/system/canteen-attendance");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save canteen settings.");
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
          <Text style={styles.eyebrow}>HOSTEL MANAGEMENT</Text>
          <Text style={styles.title}>Canteen Settings</Text>
          <Text style={styles.subtitle}>Choose how your canteen billing works</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Utensils size={26} color={colors.deep} /></View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>{PRIMARY_MODES.find((mode) => modeEnabled(mode.key))?.title || "No billing type selected"}</Text>
          <Text style={styles.heroMeta}>Choose one main billing type. Guest meals can be enabled as an add-on.</Text>
        </View>
      </View>

      <Text style={styles.groupTitle}>Main billing type</Text>
      <View style={styles.modeGrid}>
        {PRIMARY_MODES.map((mode) => {
          const active = modeEnabled(mode.key);
          return (
            <Pressable key={mode.key} onPress={() => toggleMode(mode.key)} style={[styles.modeCard, active && styles.modeActive]}>
              <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
              <Text style={styles.modeTitle}>{mode.title}</Text>
              <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.groupTitle}>Optional add-on</Text>
      <Pressable onPress={toggleGuestMode} style={[styles.modeCard, modeEnabled(GUEST_MODE.key) && styles.modeActive]}>
        <View style={[styles.checkBox, modeEnabled(GUEST_MODE.key) && styles.checkBoxActive]}>{modeEnabled(GUEST_MODE.key) ? <Check size={15} color={colors.card} /> : null}</View>
        <Text style={styles.modeTitle}>{GUEST_MODE.title}</Text>
        <Text style={styles.modeSubtitle}>{GUEST_MODE.subtitle}</Text>
      </Pressable>

      {modeEnabled("full_package") ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full food package</Text>
          <Text style={styles.label}>Monthly amount</Text>
          {moneyInput(form.fullPackage.monthlyAmount, (value) => setNested("fullPackage", "monthlyAmount", value))}
          <Text style={styles.label}>Included meals</Text>
          <MealPicker selected={form.fullPackage.includedMeals} onToggle={(meal) => toggleMeal("fullPackage", meal)} />
        </View>
      ) : null}

      {modeEnabled("per_meal") ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Per meal pricing</Text>
          {MEALS.map((meal) => (
            <View key={meal.value}>
              <Text style={styles.label}>{meal.label}</Text>
              {moneyInput(form.perMeal[meal.value], (value) => setNested("perMeal", meal.value, value))}
            </View>
          ))}
        </View>
      ) : null}

      {modeEnabled("meal_package") ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meal package monthly</Text>
          <Text style={styles.label}>Package name</Text>
          <TextInput value={form.mealPackage.name} onChangeText={(value) => setNested("mealPackage", "name", value)} style={styles.input} placeholder="Lunch + Dinner" />
          <Text style={styles.label}>Monthly amount</Text>
          {moneyInput(form.mealPackage.monthlyAmount, (value) => setNested("mealPackage", "monthlyAmount", value))}
          <Text style={styles.label}>Included meals</Text>
          <MealPicker selected={form.mealPackage.includedMeals} onToggle={(meal) => toggleMeal("mealPackage", meal)} />
        </View>
      ) : null}

      {modeEnabled("guest_meal") ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guest / extra meal charges</Text>
          {MEALS.map((meal) => (
            <View key={meal.value}>
              <Text style={styles.label}>{meal.label} extra charge</Text>
              {moneyInput(form.guestMeal[meal.value], (value) => setNested("guestMeal", meal.value, value))}
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={save} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.card} /> : <><Save size={19} color={colors.card} /><Text style={styles.saveText}>Save settings</Text></>}
      </Pressable>
    </ScrollView>
  );
}

function MealPicker({ selected, onToggle }) {
  return (
    <View style={styles.mealPicker}>
      {MEALS.map((meal) => {
        const active = selected.includes(meal.value);
        return (
          <Pressable key={meal.value} onPress={() => onToggle(meal.value)} style={[styles.mealOption, active && styles.mealActive]}>
            <Text style={[styles.mealText, active && styles.mealTextActive]}>{meal.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 42 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screen },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 42, height: 42, marginRight: 7, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.deep, fontSize: 11, fontWeight: "900" },
  title: { marginTop: 2, color: colors.text, fontSize: 26, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13, fontWeight: "700" },
  hero: { minHeight: 104, padding: 15, flexDirection: "row", alignItems: "center", borderRadius: 18, backgroundColor: colors.deep, ...systemShadow },
  heroIcon: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: colors.card },
  heroText: { flex: 1, minWidth: 0, marginLeft: 12 },
  heroTitle: { color: colors.card, fontSize: 21, fontWeight: "900" },
  heroMeta: { marginTop: 4, color: "#DCEAF4", fontSize: 12, fontWeight: "700" },
  modeGrid: { marginTop: 13, gap: 10 },
  groupTitle: { marginTop: 15, marginBottom: 8, color: colors.text, fontSize: 15, fontWeight: "900" },
  modeCard: { minHeight: 82, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, ...systemShadow },
  modeActive: { borderColor: colors.deep, backgroundColor: colors.soft },
  checkBox: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  checkBoxActive: { borderColor: colors.deep, backgroundColor: colors.deep },
  radio: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  radioActive: { borderColor: colors.deep },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.deep },
  modeTitle: { marginTop: 10, color: colors.text, fontSize: 16, fontWeight: "900" },
  modeSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: "700" },
  section: { marginTop: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, ...systemShadow },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  label: { marginTop: 12, marginBottom: 7, color: colors.muted, fontSize: 13, fontWeight: "800" },
  input: { height: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card, color: colors.text, fontSize: 15, fontWeight: "700" },
  moneyField: { height: 48, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card },
  moneyInput: { flex: 1, height: 46, marginLeft: 6, color: colors.text, fontSize: 15, fontWeight: "800" },
  mealPicker: { flexDirection: "row", gap: 7 },
  mealOption: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  mealActive: { borderColor: colors.deep, backgroundColor: colors.soft },
  mealText: { color: colors.muted, fontSize: 12, fontWeight: "900", textAlign: "center" },
  mealTextActive: { color: colors.deep },
  error: { marginTop: 12, color: colors.red, fontWeight: "800" },
  saveButton: { height: 54, marginTop: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.deep, ...systemShadow },
  saveText: { color: colors.card, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
