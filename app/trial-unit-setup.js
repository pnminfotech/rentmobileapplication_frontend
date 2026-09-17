import { useCallback, useMemo, useState } from "react";
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
import { BedDouble, DoorOpen, Store, Utensils } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getAppBootstrap, saveOnboardingUnits } from "../src/api/saasApi";
import { clearAuthSession } from "../src/storage/authStorage";
import { colors } from "../src/theme/colors";

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

function UnitInput({ Icon, label, value, onChangeText }) {
  return (
    <View style={styles.unitCard}>
      <View style={styles.unitIcon}><Icon size={21} color={colors.primary} /></View>
      <View style={styles.unitBody}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          placeholder="0"
          style={styles.input}
        />
      </View>
    </View>
  );
}

export default function TrialUnitSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bootstrap, setBootstrap] = useState(null);
  const [form, setForm] = useState({ beds: "", rooms: "", shops: "" });
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const units = useMemo(() => ({
    beds: Number(form.beds || 0),
    rooms: Number(form.rooms || 0),
    shops: Number(form.shops || 0),
  }), [form.beds, form.rooms, form.shops]);
  const totalUnits = units.beds + units.rooms + units.shops;

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await getAppBootstrap();
      if (data.user?.role === "superadmin") {
        router.replace("/superadmin");
        return;
      }
      if (data.access?.expired || data.access?.needsPayment) {
        router.replace("/subscription-expired");
        return;
      }
      if (!data.access?.needsUnitSetup) {
        router.replace("/system");
        return;
      }
      setBootstrap(data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load trial setup.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function logout() {
    await clearAuthSession();
    router.replace("/login");
  }

  async function saveUnits() {
    if (!totalUnits) return setError("Enter at least one bed, room, or shop.");
    try {
      setSaving(true);
      setError("");
      await saveOnboardingUnits({
        units,
        canteenEnabled: canteenEnabled && units.beds > 0,
      });
      Alert.alert("Units saved", "Your trial workspace is ready.", [
        { text: "Continue", onPress: () => router.replace("/system") },
      ]);
    } catch (err) {
      const status = err.response?.status;
      if (status === 402) {
        router.replace("/subscription-expired");
        return;
      }
      setError(err.response?.data?.message || "Unable to save units.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const organization = bootstrap?.organization || {};
  const subscription = bootstrap?.subscription || {};

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        ...styles.content,
        paddingTop: Math.max(insets.top + 12, 24),
        paddingBottom: Math.max(insets.bottom + 32, 42),
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Trial setup</Text>
          <Text style={styles.title}>Set property units</Text>
          <Text style={styles.subtitle}>
            {organization.name || "Your account"} has free access until {formatDate(subscription.endDate)}.
          </Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <UnitInput Icon={BedDouble} label="Hostel beds" value={form.beds} onChangeText={(value) => setForm((current) => ({ ...current, beds: countText(value) }))} />
        <UnitInput Icon={DoorOpen} label="Residential rooms" value={form.rooms} onChangeText={(value) => setForm((current) => ({ ...current, rooms: countText(value) }))} />
        <UnitInput Icon={Store} label="Commercial shops" value={form.shops} onChangeText={(value) => setForm((current) => ({ ...current, shops: countText(value) }))} />

        {units.beds > 0 ? (
          <Pressable onPress={() => setCanteenEnabled((value) => !value)} style={styles.canteenRow}>
            <View style={styles.canteenIcon}><Utensils size={20} color={colors.primary} /></View>
            <View style={styles.canteenCopy}>
              <Text style={styles.canteenTitle}>Canteen available</Text>
              <Text style={styles.canteenText}>Enable only if hostel meals are managed in this property.</Text>
            </View>
            <View style={[styles.toggle, canteenEnabled && styles.toggleActive]}>
              <View style={[styles.toggleKnob, canteenEnabled && styles.toggleKnobActive]} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total trial units</Text>
          <Text style={styles.summaryValue}>{totalUnits.toLocaleString("en-IN")}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={saveUnits} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Start using system</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 4, color: colors.text, fontSize: 27, fontWeight: "900" },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  logoutButton: { minHeight: 38, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  logoutText: { color: colors.danger, fontSize: 12, fontWeight: "900" },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  unitCard: { minHeight: 76, marginBottom: 10, padding: 11, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  unitIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primarySoft },
  unitBody: { flex: 1, minWidth: 0, marginLeft: 11 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  input: { minHeight: 42, marginTop: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 15, fontWeight: "800" },
  canteenRow: { minHeight: 66, marginTop: 3, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 8, backgroundColor: colors.primarySoft },
  canteenIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  canteenCopy: { flex: 1, minWidth: 0 },
  canteenTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  canteenText: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  toggle: { width: 44, height: 26, padding: 3, justifyContent: "center", borderRadius: 13, backgroundColor: colors.border },
  toggleActive: { backgroundColor: colors.primary },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  toggleKnobActive: { alignSelf: "flex-end" },
  summary: { marginTop: 13, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, backgroundColor: colors.surfaceSoft },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  summaryValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  error: { marginTop: 12, color: colors.danger, fontWeight: "700" },
  primaryButton: { marginTop: 16, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
