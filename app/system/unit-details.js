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
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react-native";

import { deleteBed, deleteUnit, getUnit, updateBed, updateUnit } from "../../src/api/roomApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

export default function UnitDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [unit, setUnit] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingBedNo, setDeletingBedNo] = useState("");
  const [editingBedNo, setEditingBedNo] = useState("");
  const [updatingBedNo, setUpdatingBedNo] = useState("");
  const [bedPriceEdits, setBedPriceEdits] = useState({});
  const [editingUnit, setEditingUnit] = useState(false);
  const [unitEdits, setUnitEdits] = useState({});
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [error, setError] = useState("");

  const loadUnit = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const data = await getUnit(id);
      setUnit(data.unit);
      setQuota(data.quota);
      const primaryBed = data.unit?.beds?.[0] || {};
      setUnitEdits({
        category: data.unit?.category || "",
        floorNo: data.unit?.floorNo || "",
        roomNo: data.unit?.roomNo || "",
        wingName: data.unit?.wingName || "",
        flatType: data.unit?.flatType || "",
        meterNo: data.unit?.meterNo || "",
        lastMeterReading: data.unit?.lastMeterReading === null || data.unit?.lastMeterReading === undefined ? "" : String(data.unit.lastMeterReading),
        price: primaryBed.price === null || primaryBed.price === undefined ? "" : String(primaryBed.price),
      });
      setBedPriceEdits((current) => {
        const next = { ...current };
        (data.unit?.beds || []).forEach((bed) => {
          if (next[bed.bedNo] === undefined) {
            next[bed.bedNo] = bed.price === null || bed.price === undefined ? "" : String(bed.price);
          }
        });
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load unit.");
    } finally {
      setLoading(false);




      
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadUnit(); }, [loadUnit]));

  async function confirmDeleteBed(bed) {
    if (!unit?._id || !bed?.bedNo || deletingBedNo) return;

    Alert.alert(
      "Delete bed?",
      `${bed.bedNo} will be removed from Room ${unit.roomNo}. This is allowed only when no tenant is assigned to this bed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingBedNo(String(bed.bedNo));
              const data = await deleteBed(unit._id, bed.bedNo);
              setUnit(data.room);
              setQuota(data.quota || quota);
            } catch (err) {
              Alert.alert("Unable to delete bed", err.response?.data?.message || "Please try again.");
            } finally {
              setDeletingBedNo("");
            }
          },
        },
      ]
    );
  }

  function setBedPrice(bedNo, value) {
    setBedPriceEdits((current) => ({
      ...current,
      [bedNo]: String(value || "").replace(/[^0-9.]/g, ""),
    }));
  }

  async function saveBedPrice(bed) {
    if (!unit?._id || !bed?.bedNo) return;
    const value = bedPriceEdits[bed.bedNo] ?? "";
    const numericPrice = Number(value);
    if (value === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
      return Alert.alert("Invalid price", "Enter a valid monthly bed price.");
    }

    try {
      setUpdatingBedNo(String(bed.bedNo));
      const updatedBed = await updateBed(unit._id, bed.bedNo, {
        price: numericPrice,
        bedCategory: bed.bedCategory || "Standard",
      });
      setUnit((current) => ({
        ...current,
        beds: (current?.beds || []).map((item) =>
          String(item.bedNo) === String(bed.bedNo)
            ? { ...item, price: updatedBed.price, bedCategory: updatedBed.bedCategory }
            : item
        ),
      }));
      setEditingBedNo("");
    } catch (err) {
      Alert.alert("Unable to update price", err.response?.data?.message || "Please try again.");
    } finally {
      setUpdatingBedNo("");
    }
  }

  function setUnitEdit(key, value) {
    setUnitEdits((current) => ({ ...current, [key]: value }));
  }

  function unitSlotBedNo() {
    return unit?.propertyType === "shop" ? "SHOP-1" : "ROOM-1";
  }

  async function saveUnitChanges() {
    if (!unit?._id || updatingUnit) return;
    const priceValue = unitEdits.price ?? "";
    const numericPrice = Number(priceValue);
    if (priceValue === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
      return Alert.alert("Invalid price", "Enter a valid monthly rent.");
    }

    try {
      setUpdatingUnit(true);
      const updated = await updateUnit(unit._id, {
        category: unitEdits.category,
        floorNo: unitEdits.floorNo,
        roomNo: unitEdits.roomNo,
        wingName: unitEdits.wingName,
        flatType: unitEdits.flatType,
        meterNo: unitEdits.meterNo,
        lastMeterReading: unitEdits.lastMeterReading,
      });
      const updatedBed = await updateBed(updated._id || unit._id, unitSlotBedNo(), {
        price: numericPrice,
        bedCategory: unit.propertyType === "shop" ? "Shop" : "Rental Room",
      });
      setUnit({
        ...updated,
        beds: (updated.beds || unit.beds || []).map((bed) =>
          String(bed.bedNo) === String(unitSlotBedNo())
            ? { ...bed, price: updatedBed.price, bedCategory: updatedBed.bedCategory }
            : bed
        ),
      });
      setEditingUnit(false);
    } catch (err) {
      Alert.alert("Unable to update unit", err.response?.data?.message || "Please try again.");
    } finally {
      setUpdatingUnit(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!unit?._id || deletingUnit) return;
    const label = unit.propertyType === "shop" ? "shop" : "residential room";
    Alert.alert(
      `Delete ${label}?`,
      `This will remove ${unit.propertyType === "shop" ? "Shop" : "Room"} ${unit.roomNo}. This is allowed only when no tenant is assigned to it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingUnit(true);
              await deleteUnit(unit._id);
              router.replace({ pathname: "/system/units", params: { type: unit.propertyType || "room" } });
            } catch (err) {
              Alert.alert("Unable to delete unit", err.response?.data?.message || "Please try again.");
            } finally {
              setDeletingUnit(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!unit) {
    return (
      <View style={styles.loading}>
        <Text style={styles.error}>{error || "Unit not found."}</Text>
        <Pressable onPress={() => router.replace("/system/units")}><Text style={styles.backText}>Go back</Text></Pressable>
      </View>
    );
  }

  const beds = Array.isArray(unit.beds) ? unit.beds : [];
  const isBedUnit = (unit.propertyType || "bed") === "bed";
  const remainingBeds = quota?.remaining?.beds ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isBedUnit ? "Room" : "Unit"} {unit.roomNo}</Text>
          <Text style={styles.subtitle}>{unit.category} · Floor {unit.floorNo}</Text>
        </View>
        {isBedUnit ? (
          <Pressable
            onPress={() => router.push({ pathname: "/system/add-bed", params: { id: unit._id } })}
            disabled={remainingBeds < 1}
            style={[styles.headerAction, remainingBeds < 1 && styles.disabled]}
          >
            <Plus size={18} color={colors.surface} />
            <Text style={styles.headerActionText}>Add bed</Text>
          </Pressable>
        ) : null}
      </View>

      {isBedUnit ? (
        <>
          <View style={styles.meterBox}>
            <Text style={styles.sectionTitle}>Meter</Text>
            <Text style={styles.meterText}>Meter no: {unit.meterNo || "Not set"}</Text>
            <Text style={styles.meterText}>Last reading: {unit.lastMeterReading ?? "Not set"}</Text>
          </View>

          <View style={styles.quotaRow}>
            <Text style={styles.sectionTitle}>Beds</Text>
            <Text style={styles.quotaText}>
              {quota?.usage?.beds ?? 0}/{quota?.limits?.beds ?? 0} used · {remainingBeds} remaining
            </Text>
          </View>

          <View style={styles.bedList}>
            {!beds.length ? <Text style={styles.emptyText}>No beds have been added to this room.</Text> : null}
            {beds.map((bed) => (
              <View key={bed.bedNo} style={styles.bedRow}>
                <View style={styles.bedInfo}>
                  <Text style={styles.bedName}>{bed.bedNo}</Text>
                  <Text style={styles.bedCategory}>{bed.bedCategory || "Standard"}</Text>
                </View>
                <View style={styles.bedActions}>
                  {editingBedNo === String(bed.bedNo) ? (
                    <TextInput
                      value={bedPriceEdits[bed.bedNo] ?? ""}
                      onChangeText={(value) => setBedPrice(bed.bedNo, value)}
                      keyboardType="numeric"
                      placeholder="Price"
                      style={styles.bedPriceInput}
                    />
                  ) : (
                      <Text style={styles.bedPrice} numberOfLines={1}>Rs. {bed.price ?? 0} /month</Text>
                  )}
                  <Pressable
                    onPress={() =>
                      editingBedNo === String(bed.bedNo)
                        ? saveBedPrice(bed)
                        : setEditingBedNo(String(bed.bedNo))
                    }
                    disabled={updatingBedNo === String(bed.bedNo)}
                    style={[styles.editBedButton, updatingBedNo === String(bed.bedNo) && styles.disabled]}
                  >
                    {updatingBedNo === String(bed.bedNo) ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : editingBedNo === String(bed.bedNo) ? (
                      <Text style={styles.saveIconText}>Save</Text>
                    ) : (
                      <Pencil size={16} color={colors.primary} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteBed(bed)}
                    disabled={deletingBedNo === String(bed.bedNo)}
                    style={[styles.deleteBedButton, deletingBedNo === String(bed.bedNo) && styles.disabled]}
                  >
                    {deletingBedNo === String(bed.bedNo) ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Trash2 size={17} color={colors.danger} />
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

        </>
      ) : (
        <>
          <View style={styles.meterBox}>
            <Text style={styles.sectionTitle}>Meter</Text>
            <Text style={styles.meterText}>Meter no: {unit.meterNo || "Not set"}</Text>
            <Text style={styles.meterText}>Last reading: {unit.lastMeterReading ?? "Not set"}</Text>
          </View>
          <View style={styles.formSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{unit.propertyType === "shop" ? "Shop" : "Rental room"}</Text>
              <View style={styles.unitActionRow}>
                <Pressable
                  onPress={() => (editingUnit ? saveUnitChanges() : setEditingUnit(true))}
                  disabled={updatingUnit}
                  style={[styles.editBedButton, updatingUnit && styles.disabled]}
                >
                  {updatingUnit ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : editingUnit ? (
                    <Text style={styles.saveIconText}>Save</Text>
                  ) : (
                    <Pencil size={16} color={colors.primary} />
                  )}
                </Pressable>
                <Pressable
                  onPress={confirmDeleteUnit}
                  disabled={deletingUnit}
                  style={[styles.deleteBedButton, deletingUnit && styles.disabled]}
                >
                  {deletingUnit ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Trash2 size={17} color={colors.danger} />
                  )}
                </Pressable>
              </View>
            </View>

            {editingUnit ? (
              <View style={styles.unitForm}>
                <Text style={styles.inputLabel}>Building / property</Text>
                <TextInput value={unitEdits.category} onChangeText={(value) => setUnitEdit("category", value)} style={styles.input} />
                <Text style={styles.inputLabel}>Floor</Text>
                <TextInput value={unitEdits.floorNo} onChangeText={(value) => setUnitEdit("floorNo", value)} style={styles.input} />
                <Text style={styles.inputLabel}>{unit.propertyType === "shop" ? "Shop number" : "Room number"}</Text>
                <TextInput value={unitEdits.roomNo} onChangeText={(value) => setUnitEdit("roomNo", value)} style={styles.input} />
                {unit.propertyType === "room" ? (
                  <>
                    <Text style={styles.inputLabel}>Wing</Text>
                    <TextInput value={unitEdits.wingName} onChangeText={(value) => setUnitEdit("wingName", value)} style={styles.input} />
                    <Text style={styles.inputLabel}>Flat / room type</Text>
                    <TextInput value={unitEdits.flatType} onChangeText={(value) => setUnitEdit("flatType", value)} style={styles.input} />
                  </>
                ) : null}
                <Text style={styles.inputLabel}>Meter no.</Text>
                <TextInput value={unitEdits.meterNo} onChangeText={(value) => setUnitEdit("meterNo", value)} style={styles.input} />
                <Text style={styles.inputLabel}>Last meter reading</Text>
                <TextInput value={unitEdits.lastMeterReading} onChangeText={(value) => setUnitEdit("lastMeterReading", value.replace(/[^0-9.]/g, ""))} keyboardType="numeric" style={styles.input} />
                <Text style={styles.inputLabel}>Monthly rent</Text>
                <TextInput value={unitEdits.price} onChangeText={(value) => setUnitEdit("price", value.replace(/[^0-9.]/g, ""))} keyboardType="numeric" style={styles.input} />
              </View>
            ) : (
              <>
                <Text style={styles.unitPrice}>Rs. {beds[0]?.price ?? 0} /month</Text>
                {unit.propertyType === "room" && unit.flatType ? <Text style={styles.unitMeta}>{unit.flatType}</Text> : null}
                {unit.wingName ? <Text style={styles.unitMeta}>Wing {unit.wingName}</Text> : null}
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", padding: 18, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 22, backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 7, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  headerAction: { height: 42, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 7, backgroundColor: colors.primary },
  headerActionText: { color: colors.surface, fontSize: 13, fontWeight: "700" },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted },
  quotaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meterBox: { marginBottom: 18, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  meterText: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: "600" },
  quotaText: { color: colors.muted, fontSize: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  bedList: { marginTop: 12, gap: 8 },
  bedRow: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  bedInfo: { flex: 0.9, minWidth: 0 },
  bedActions: { flex: 1.7, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bedName: { color: colors.text, fontWeight: "700" },
  bedCategory: { marginTop: 3, color: colors.muted, fontSize: 12 },
  bedPrice: { flex: 1, minWidth: 92, color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "right" },
  bedPriceInput: { flex: 1, minWidth: 76, maxWidth: 105, height: 42, paddingHorizontal: 8, paddingVertical: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontWeight: "700", textAlignVertical: "center", includeFontPadding: false },
  editBedButton: { width: 48, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.primarySoft },
  saveIconText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  deleteBedButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.dangerSoft },
  emptyText: { paddingVertical: 24, textAlign: "center", color: colors.muted },
  formSection: { marginTop: 22, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  unitActionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  unitForm: { marginTop: 12 },
  inputLabel: { marginTop: 10, marginBottom: 6, color: colors.muted, fontSize: 12, fontWeight: "700" },
  input: { height: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 14, fontWeight: "700" },
  error: { marginTop: 13, color: colors.danger },
  disabled: { opacity: 0.45 },
  unitPrice: { marginTop: 10, color: colors.muted, fontSize: 18, fontWeight: "700" },
  unitMeta: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: "700" },
  backText: { marginTop: 12, color: colors.primary, fontWeight: "600" },
});
