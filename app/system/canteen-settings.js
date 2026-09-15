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
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  IndianRupee,
  Save,
  Utensils,
  UsersRound,
} from "lucide-react-native";

import { getCanteenSettings, updateCanteenSettings } from "../../src/api/canteenApi";
import { needsCanteenAttendance } from "../../src/utils/featureAccess";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

/*
  Matches the visual language used in tenants.js:
  - #F6F8F7 page background
  - #244F70 dark blue actions
  - #4F7FA6 secondary blue
  - #E7F1F8 soft selected state
  - 8px card/input radius
  - subtle borders + systemShadow
*/
const UI = {
  blue: "#4F7FA6",
  blueDark: "#244F70",
  blueSoft: "#E7F1F8",
  navy: "#111B2A",
  muted: "#63738A",
  border: "#D9E1E7",
  screen: "#F6F8F7",
  card: "#FFFFFF",
};

const MEALS = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Dinner", value: "dinner" },
];

const PRIMARY_MODES = [
  {
    key: "full_package",
    title: "Full food package",
    subtitle: "Breakfast + lunch + dinner fixed monthly",
  },
  {
    key: "per_meal",
    title: "Per meal pricing",
    subtitle: "Bill depends on marked attendance",
  },
  {
    key: "meal_package",
    title: "Meal package monthly",
    subtitle: "Selected meals as a fixed package",
  },
];

const GUEST_MODE = {
  key: "guest_meal",
  title: "Guest / extra meal charges",
  subtitle: "Optional add-on for extra meals",
};

const PACKAGE_BILLING_METHODS = [
  { key: "attendance_day", label: "Attendance day wise" },
  { key: "fixed_monthly", label: "Fixed monthly" },
];

const EMPTY = {
  activeModes: [],
  fullPackage: {
    monthlyAmount: "",
    billingMethod: "attendance_day",
    includedMeals: ["breakfast", "lunch", "dinner"],
  },
  perMeal: { breakfast: "", lunch: "", dinner: "" },
  mealPackage: {
    name: "Lunch + Dinner",
    monthlyAmount: "",
    billingMethod: "attendance_day",
    includedMeals: ["lunch", "dinner"],
  },
  guestMeal: { breakfast: "", lunch: "", dinner: "" },
};

function amountText(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "";
}

function normalizeForm(settings = {}) {
  const rawModes = Array.isArray(settings.activeModes) ? settings.activeModes : [];
  const primaryMode = rawModes.find((mode) =>
    PRIMARY_MODES.some((item) => item.key === mode)
  );

  return {
    activeModes: [
      ...(primaryMode ? [primaryMode] : []),
      ...(rawModes.includes("guest_meal") ? ["guest_meal"] : []),
    ],
    fullPackage: {
      monthlyAmount: amountText(settings.fullPackage?.monthlyAmount),
      billingMethod:
        settings.fullPackage?.billingMethod === "fixed_monthly"
          ? "fixed_monthly"
          : "attendance_day",
      includedMeals: settings.fullPackage?.includedMeals?.length
        ? settings.fullPackage.includedMeals
        : ["breakfast", "lunch", "dinner"],
    },
    perMeal: {
      breakfast: amountText(settings.perMeal?.breakfast),
      lunch: amountText(settings.perMeal?.lunch),
      dinner: amountText(settings.perMeal?.dinner),
    },
    mealPackage: {
      name: settings.mealPackage?.name || "Lunch + Dinner",
      monthlyAmount: amountText(settings.mealPackage?.monthlyAmount),
      billingMethod:
        settings.mealPackage?.billingMethod === "fixed_monthly"
          ? "fixed_monthly"
          : "attendance_day",
      includedMeals: settings.mealPackage?.includedMeals?.length
        ? settings.mealPackage.includedMeals
        : ["lunch", "dinner"],
    },
    guestMeal: {
      breakfast: amountText(settings.guestMeal?.breakfast),
      lunch: amountText(settings.guestMeal?.lunch),
      dinner: amountText(settings.guestMeal?.dinner),
    },
  };
}

function MoneyInput({ value, onChange }) {
  return (
    <View style={styles.moneyField}>
      <View style={styles.rupeeBox}>
        <IndianRupee size={15} color={UI.blueDark} />
      </View>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d.]/g, ""))}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={UI.muted}
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
      setError(
        err.response?.data?.message || "Unable to load canteen settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function modeEnabled(mode) {
    return form.activeModes.includes(mode);
  }

  function toggleMode(mode) {
    setForm((current) => ({
      ...current,
      activeModes: [
        ...(current.activeModes.includes(mode) ? [] : [mode]),
        ...(current.activeModes.includes("guest_meal")
          ? ["guest_meal"]
          : []),
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
    setForm((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  }

  function toggleMeal(section, meal) {
    setForm((current) => {
      const existing = current[section]?.includedMeals || [];
      const includedMeals = existing.includes(meal)
        ? existing.filter((item) => item !== meal)
        : [...existing, meal];

      return {
        ...current,
        [section]: { ...current[section], includedMeals },
      };
    });
  }

  async function save() {
    try {
      setSaving(true);
      setError("");

      const payload = {
        activeModes: form.activeModes,
        fullPackage: {
          monthlyAmount: Number(form.fullPackage.monthlyAmount || 0),
          billingMethod: form.fullPackage.billingMethod,
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
          billingMethod: form.mealPackage.billingMethod,
          includedMeals: form.mealPackage.includedMeals,
        },
        guestMeal: {
          breakfast: Number(form.guestMeal.breakfast || 0),
          lunch: Number(form.guestMeal.lunch || 0),
          dinner: Number(form.guestMeal.dinner || 0),
        },
      };

      await updateCanteenSettings(payload);
      Alert.alert("Saved", "Canteen settings updated successfully.");

      router.replace(
        needsCanteenAttendance(payload)
          ? "/system/canteen-attendance"
          : "/system/more"
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to save canteen settings."
      );
    } finally {
      setSaving(false);
    }
  }

  const activePrimary = PRIMARY_MODES.find((mode) => modeEnabled(mode.key));

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={UI.blueDark} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace("/system/more")}
            style={styles.backButton}
          >
            <ArrowLeft size={21} color={UI.blueDark} />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.title}>Canteen Settings</Text>
            <Text style={styles.subtitle}>
              Configure billing, packages and meal charges
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.overviewCard}>
            <View style={styles.overviewIcon}>
              <Utensils size={21} color={UI.blueDark} />
            </View>

            <View style={styles.overviewCopy}>
              <Text style={styles.overviewLabel}>Current billing type</Text>
              <Text style={styles.overviewTitle}>
                {activePrimary?.title || "Not configured"}
              </Text>
              <Text style={styles.overviewMeta}>
                Select one main billing method below
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>Main billing type</Text>
            <Text style={styles.sectionHeaderMeta}>Select one</Text>
          </View>

          <View style={styles.modeList}>
            {PRIMARY_MODES.map((mode, index) => {
              const active = modeEnabled(mode.key);

              return (
                <Pressable
                  key={mode.key}
                  onPress={() => toggleMode(mode.key)}
                  style={[
                    styles.modeCard,
                    active && styles.modeCardActive,
                  ]}
                >
                  <View
                    style={[
                      styles.modeAccent,
                      index === 0 && styles.modeAccentBlue,
                      index === 1 && styles.modeAccentPurple,
                      index === 2 && styles.modeAccentOrange,
                    ]}
                  />

                  <View style={styles.modeCopy}>
                    <Text style={styles.modeTitle}>{mode.title}</Text>
                    <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
                  </View>

                  <View
                    style={[
                      styles.radio,
                      active && styles.radioActive,
                    ]}
                  >
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {modeEnabled("full_package") ? (
            <View style={styles.sectionCard}>
              <View style={styles.cardHeading}>
                <View style={styles.cardHeadingIcon}>
                  <Utensils size={18} color={UI.blueDark} />
                </View>
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>Full food package</Text>
                  <Text style={styles.cardSubtitle}>
                    Set amount, billing method and included meals
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Monthly amount</Text>
              <MoneyInput
                value={form.fullPackage.monthlyAmount}
                onChange={(value) =>
                  setNested("fullPackage", "monthlyAmount", value)
                }
              />

              <Text style={styles.label}>Billing method</Text>
              <BillingMethodPicker
                value={form.fullPackage.billingMethod}
                onChange={(value) =>
                  setNested("fullPackage", "billingMethod", value)
                }
              />

              <Text style={styles.label}>Included meals</Text>
              <MealPicker
                selected={form.fullPackage.includedMeals}
                onToggle={(meal) => toggleMeal("fullPackage", meal)}
              />
            </View>
          ) : null}

          {modeEnabled("per_meal") ? (
            <View style={styles.sectionCard}>
              <View style={styles.cardHeading}>
                <View style={styles.cardHeadingIcon}>
                  <IndianRupee size={18} color={UI.blueDark} />
                </View>
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>Per meal pricing</Text>
                  <Text style={styles.cardSubtitle}>
                    Enter the charge for each meal
                  </Text>
                </View>
              </View>

              <View style={styles.mealPriceGrid}>
                {MEALS.map((meal) => (
                  <View key={meal.value} style={styles.mealPriceItem}>
                    <Text style={styles.label}>{meal.label}</Text>
                    <MoneyInput
                      value={form.perMeal[meal.value]}
                      onChange={(value) =>
                        setNested("perMeal", meal.value, value)
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {modeEnabled("meal_package") ? (
            <View style={styles.sectionCard}>
              <View style={styles.cardHeading}>
                <View style={styles.cardHeadingIcon}>
                  <Utensils size={18} color={UI.blueDark} />
                </View>
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>Meal package monthly</Text>
                  <Text style={styles.cardSubtitle}>
                    Create a fixed package for selected meals
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Package name</Text>
              <TextInput
                value={form.mealPackage.name}
                onChangeText={(value) =>
                  setNested("mealPackage", "name", value)
                }
                style={styles.input}
                placeholder="Lunch + Dinner"
                placeholderTextColor={UI.muted}
              />

              <Text style={styles.label}>Monthly amount</Text>
              <MoneyInput
                value={form.mealPackage.monthlyAmount}
                onChange={(value) =>
                  setNested("mealPackage", "monthlyAmount", value)
                }
              />

              <Text style={styles.label}>Billing method</Text>
              <BillingMethodPicker
                value={form.mealPackage.billingMethod}
                onChange={(value) =>
                  setNested("mealPackage", "billingMethod", value)
                }
              />

              <Text style={styles.label}>Included meals</Text>
              <MealPicker
                selected={form.mealPackage.includedMeals}
                onToggle={(meal) => toggleMeal("mealPackage", meal)}
              />
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>Optional add-on</Text>
          </View>

          <Pressable
            onPress={toggleGuestMode}
            style={[
              styles.addOnCard,
              modeEnabled(GUEST_MODE.key) && styles.addOnCardActive,
            ]}
          >
            <View style={styles.addOnIcon}>
              <UsersRound size={20} color={UI.blueDark} />
            </View>

            <View style={styles.addOnCopy}>
              <Text style={styles.addOnTitle}>{GUEST_MODE.title}</Text>
              <Text style={styles.addOnSubtitle}>{GUEST_MODE.subtitle}</Text>
            </View>

            <View
              style={[
                styles.switchTrack,
                modeEnabled(GUEST_MODE.key) && styles.switchTrackActive,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  modeEnabled(GUEST_MODE.key) && styles.switchThumbActive,
                ]}
              />
            </View>
          </Pressable>

          {modeEnabled("guest_meal") ? (
            <View style={styles.sectionCard}>
              <View style={styles.cardHeading}>
                <View style={styles.cardHeadingIcon}>
                  <UsersRound size={18} color={UI.blueDark} />
                </View>
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>Guest / extra meal charges</Text>
                  <Text style={styles.cardSubtitle}>
                    Set additional charges for extra meals
                  </Text>
                </View>
              </View>

              <View style={styles.mealPriceGrid}>
                {MEALS.map((meal) => (
                  <View key={meal.value} style={styles.mealPriceItem}>
                    <Text style={styles.label}>{meal.label}</Text>
                    <MoneyInput
                      value={form.guestMeal[meal.value]}
                      onChange={(value) =>
                        setNested("guestMeal", meal.value, value)
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.saveButton, saving && styles.disabled]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveText}>Save settings</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function BillingMethodPicker({ value, onChange }) {
  return (
    <View style={styles.segmentedControl}>
      {PACKAGE_BILLING_METHODS.map((method) => {
        const active = value === method.key;

        return (
          <Pressable
            key={method.key}
            onPress={() => onChange(method.key)}
            style={[
              styles.segmentedOption,
              active && styles.segmentedOptionActive,
            ]}
          >
            <Text
              style={[
                styles.segmentedText,
                active && styles.segmentedTextActive,
              ]}
            >
              {method.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MealPicker({ selected, onToggle }) {
  return (
    <View style={styles.mealPicker}>
      {MEALS.map((meal) => {
        const active = selected.includes(meal.value);

        return (
          <Pressable
            key={meal.value}
            onPress={() => onToggle(meal.value)}
            style={[
              styles.mealOption,
              active && styles.mealOptionActive,
            ]}
          >
            <View
              style={[
                styles.mealCheck,
                active && styles.mealCheckActive,
              ]}
            >
              {active ? <Check size={13} color="#FFFFFF" /> : null}
            </View>

            <Text
              style={[
                styles.mealText,
                active && styles.mealTextActive,
              ]}
            >
              {meal.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.screen,
  },

  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.screen,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    ...systemShadow,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: UI.navy,
    fontSize: 30,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 2,
    color: UI.muted,
    fontSize: 14,
    fontWeight: "600",
  },

  scroller: {
    flex: 1,
    minHeight: 0,
  },

  scrollContent: {
    paddingBottom: 92,
  },

  overviewCard: {
    minHeight: 74,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    ...systemShadow,
  },

  overviewIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.blueSoft,
  },

  overviewCopy: {
    flex: 1,
    minWidth: 0,
  },

  overviewLabel: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
  },

  overviewTitle: {
    marginTop: 2,
    color: UI.navy,
    fontSize: 15,
    fontWeight: "900",
  },

  overviewMeta: {
    marginTop: 2,
    color: UI.muted,
    fontSize: 10,
    fontWeight: "600",
  },

  sectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionHeaderTitle: {
    color: UI.navy,
    fontSize: 14,
    fontWeight: "900",
  },

  sectionHeaderMeta: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
  },

  modeList: {
    gap: 8,
  },

  modeCard: {
    minHeight: 70,
    overflow: "hidden",
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    ...systemShadow,
  },

  modeCardActive: {
    borderColor: "#AFC8DA",
    backgroundColor: "#F7FBFE",
  },

  modeAccent: {
    width: 4,
    alignSelf: "stretch",
    marginRight: 12,
  },

  modeAccentBlue: {
    backgroundColor: "#7C98F9",
  },

  modeAccentPurple: {
    backgroundColor: "#9B8CF2",
  },

  modeAccentOrange: {
    backgroundColor: "#E9A24A",
  },

  modeCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
  },

  modeTitle: {
    color: UI.navy,
    fontSize: 14,
    fontWeight: "900",
  },

  modeSubtitle: {
    marginTop: 4,
    color: UI.muted,
    fontSize: 11,
    fontWeight: "600",
  },

  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#AEBAC6",
    borderRadius: 11,
    backgroundColor: UI.card,
  },

  radioActive: {
    borderColor: UI.blueDark,
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI.blueDark,
  },

  sectionCard: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    ...systemShadow,
  },

  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },

  cardHeadingIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.blueSoft,
  },

  cardHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },

  cardTitle: {
    color: UI.navy,
    fontSize: 14,
    fontWeight: "900",
  },

  cardSubtitle: {
    marginTop: 2,
    color: UI.muted,
    fontSize: 10,
    fontWeight: "600",
  },

  label: {
    marginTop: 11,
    marginBottom: 6,
    color: UI.muted,
    fontSize: 11,
    fontWeight: "800",
  },

  input: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    color: UI.navy,
    fontSize: 13,
    fontWeight: "700",
  },

  moneyField: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
  },

  rupeeBox: {
    width: 40,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: UI.border,
    backgroundColor: "#F8FAFB",
  },

  moneyInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 11,
    color: UI.navy,
    fontSize: 13,
    fontWeight: "800",
  },

  segmentedControl: {
    minHeight: 40,
    padding: 2,
    flexDirection: "row",
    gap: 2,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: "#F4F6F7",
  },

  segmentedOption: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },

  segmentedOptionActive: {
    borderWidth: 1,
    borderColor: UI.blueDark,
    backgroundColor: UI.card,
  },

  segmentedText: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },

  segmentedTextActive: {
    color: UI.blueDark,
    fontWeight: "900",
  },

  mealPicker: {
    flexDirection: "row",
    gap: 7,
  },

  mealOption: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
  },

  mealOptionActive: {
    borderColor: "#AFC8DA",
    backgroundColor: UI.blueSoft,
  },

  mealCheck: {
    width: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#AEBAC6",
    borderRadius: 5,
    backgroundColor: UI.card,
  },

  mealCheckActive: {
    borderColor: UI.blueDark,
    backgroundColor: UI.blueDark,
  },

  mealText: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
  },

  mealTextActive: {
    color: UI.blueDark,
    fontWeight: "900",
  },

  mealPriceGrid: {
    gap: 2,
  },

  mealPriceItem: {
    width: "100%",
  },

  addOnCard: {
    minHeight: 68,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    backgroundColor: UI.card,
    ...systemShadow,
  },

  addOnCardActive: {
    borderColor: "#AFC8DA",
    backgroundColor: "#F7FBFE",
  },

  addOnIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UI.blueSoft,
  },

  addOnCopy: {
    flex: 1,
    minWidth: 0,
  },

  addOnTitle: {
    color: UI.navy,
    fontSize: 13,
    fontWeight: "900",
  },

  addOnSubtitle: {
    marginTop: 3,
    color: UI.muted,
    fontSize: 10,
    fontWeight: "600",
  },

  switchTrack: {
    width: 42,
    height: 24,
    padding: 2,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#D9E1E7",
  },

  switchTrackActive: {
    backgroundColor: UI.blueDark,
  },

  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    transform: [{ translateX: 0 }],
  },

  switchThumbActive: {
    transform: [{ translateX: 18 }],
  },

  error: {
    marginTop: 12,
    color: S.red,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },

  saveButton: {
    height: 48,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    backgroundColor: UI.blueDark,
    ...systemShadow,
  },

  saveText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  
  disabled: {
    opacity: 0.6,
  },

  
});
