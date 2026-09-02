import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { addBed, getUnit } from "../../src/api/roomApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

function nextBedNumber(beds = []) {
  const numbers = beds
    .map((bed) => /^B(\d+)$/i.exec(String(bed.bedNo || "")))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return `B${numbers.length ? Math.max(...numbers) + 1 : 1}`;
}

export default function AddBedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [unit, setUnit] = useState(null);
  const [quota, setQuota] = useState(null);
  const [bedNo, setBedNo] = useState("");
  const [bedCategory, setBedCategory] = useState("Standard");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRoom = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const data = await getUnit(id);
      setUnit(data.unit);
      setQuota(data.quota);
      setBedNo(nextBedNumber(data.unit?.beds));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load room.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadRoom(); }, [loadRoom]));

  async function saveBed() {
    const monthlyPrice = Number(price);
    if (!bedNo.trim()) {
      setError("Enter a bed number.");
      return;
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      setError("Enter a valid monthly price.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await addBed(unit._id, {
        bedNo: bedNo.trim(),
        bedCategory: bedCategory.trim() || "Standard",
        price: monthlyPrice,
      });
      router.replace({ pathname: "/system/unit-details", params: { id } });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to add bed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const remaining = quota?.remaining?.beds ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace({ pathname: "/system/unit-details", params: { id } })} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Add bed</Text>
          {unit ? <Text style={styles.subtitle}>{[unit.category, unit.wingName ? `Wing ${unit.wingName}` : "", `Floor ${unit.floorNo}`, `Room ${unit.roomNo}`].filter(Boolean).join(" | ")}</Text> : null}
        </View>
      </View>

      {unit ? (
        <View style={styles.form}>
          <Text style={styles.remaining}>{remaining} purchased beds remaining</Text>
          {unit.wingName ? <Text style={styles.contextText}>This bed will be added in Wing {unit.wingName}.</Text> : null}

          <Text style={styles.label}>Bed number</Text>
          <TextInput value={bedNo} onChangeText={setBedNo} placeholder="Example: B2" style={styles.input} />

          <Text style={styles.label}>Bed category</Text>
          <TextInput value={bedCategory} onChangeText={setBedCategory} placeholder="Example: Standard" style={styles.input} />

          <Text style={styles.label}>Monthly price</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Example: 5000" style={styles.input} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={saveBed} disabled={saving || remaining < 1} style={[styles.saveButton, (saving || remaining < 1) && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Add bed</Text>}
          </Pressable>
        </View>
      ) : <Text style={styles.error}>{error || "Room not found."}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 22, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  form: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  remaining: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  contextText: { marginTop: 8, color: colors.muted, fontSize: 13 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  error: { marginTop: 14, color: colors.danger },
  saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  saveButtonText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
