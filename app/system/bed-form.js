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
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown, Plus } from "lucide-react-native";

import { addBeds, getRooms, getUnitUsage } from "../../src/api/roomApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

export default function BedFormScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState([]);
  const [quota, setQuota] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [showRooms, setShowRooms] = useState(false);
  const [count, setCount] = useState("1");
  const [bedCategory, setBedCategory] = useState("Standard");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [unitData, quotaData] = await Promise.all([getRooms(), getUnitUsage()]);
      const bedRooms = (Array.isArray(unitData) ? unitData : []).filter(
        (unit) => (unit.propertyType || "bed") === "bed"
      );
      setRooms(bedRooms);
      setQuota(quotaData);
      setSelectedRoomId((current) => current || bedRooms[0]?._id || "");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load hostel rooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const selectedRoom = rooms.find((room) => String(room._id) === String(selectedRoomId));
  const remaining = quota?.remaining?.beds ?? 0;

  async function saveBeds() {
    const bedCount = Number(count);
    const monthlyPrice = Number(price);

    if (!selectedRoom) {
      setError("Select an existing hostel room.");
      return;
    }
    if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > remaining) {
      setError(`Enter between 1 and ${remaining} beds.`);
      return;
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      setError("Enter a valid monthly price.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await addBeds(selectedRoom._id, {
        count: bedCount,
        bedCategory: bedCategory.trim() || "Standard",
        price: monthlyPrice,
      });
      router.replace("/system/units");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to add beds.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>Add beds</Text>
          <Text style={styles.subtitle}>{remaining} of {quota?.limits?.beds ?? 0} purchased beds remaining</Text>
        </View>
      </View>

      {rooms.length ? (
        <>
          <Text style={styles.label}>Existing hostel room</Text>
          <Pressable onPress={() => setShowRooms((value) => !value)} style={styles.select}>
            <View style={styles.selectText}>
              <Text style={styles.selectTitle}>{selectedRoom?.category}</Text>
              <Text style={styles.selectMeta}>
                Room {selectedRoom?.roomNo} · Floor {selectedRoom?.floorNo} · {selectedRoom?.beds?.length || 0} beds
              </Text>
            </View>
            <ChevronDown size={20} color={colors.muted} />
          </Pressable>

          {showRooms ? (
            <View style={styles.options}>
              {rooms.map((room) => {
                const selected = String(room._id) === String(selectedRoomId);
                return (
                  <Pressable
                    key={room._id}
                    onPress={() => {
                      setSelectedRoomId(room._id);
                      setShowRooms(false);
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <View style={styles.optionText}>
                      <Text style={styles.optionTitle}>{room.category}</Text>
                      <Text style={styles.optionMeta}>
                        Room {room.roomNo} · Floor {room.floorNo} · {room.beds?.length || 0} beds
                      </Text>
                    </View>
                    {selected ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>Beds to add</Text>
          <View style={styles.countRow}>
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" style={[styles.input, styles.countInput]} />
            <Pressable onPress={() => setCount(String(remaining))} disabled={remaining < 1} style={styles.remainingButton}>
              <Text style={styles.remainingButtonText}>Use all {remaining}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Bed category</Text>
          <TextInput value={bedCategory} onChangeText={setBedCategory} placeholder="Example: Standard" style={styles.input} />

          <Text style={styles.label}>Monthly price per bed</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Example: 5000" style={styles.input} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={saveBeds} disabled={saving || remaining < 1} style={[styles.saveButton, (saving || remaining < 1) && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Add beds</Text>}
          </Pressable>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No hostel room exists yet</Text>
          <Text style={styles.emptyText}>Create the first room before adding beds.</Text>
        </View>
      )}

      <Pressable onPress={() => router.replace({ pathname: "/system/unit-form", params: { type: "bed" } })} style={styles.newRoomButton}>
        <Plus size={18} color={colors.primary} />
        <Text style={styles.newRoomText}>Create a new hostel room</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 22, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  select: { minHeight: 60, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectText: { flex: 1 },
  selectTitle: { color: colors.text, fontWeight: "700" },
  selectMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  options: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  option: { minHeight: 58, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1 },
  optionTitle: { color: colors.text, fontWeight: "600" },
  optionMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  countRow: { flexDirection: "row", gap: 9 },
  countInput: { flex: 1 },
  remainingButton: { minWidth: 110, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft },
  remainingButtonText: { color: colors.primary, fontWeight: "600" },
  error: { marginTop: 14, color: colors.danger },
  saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  saveButtonText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  empty: { paddingVertical: 28, alignItems: "center" },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: { marginTop: 5, color: colors.muted },
  newRoomButton: { height: 48, marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  newRoomText: { color: colors.primary, fontWeight: "700" },
});
