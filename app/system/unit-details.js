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
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react-native";

import { deleteBed, deleteUnit, getUnit, updateBed, updateUnit } from "../../src/api/roomApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { systemColors as colors } from "../../src/theme/systemTheme";

function normalizeNumericText(value) {
  return String(value || "").replace(/[^0-9.]/g, "");
}

function unitTypeLabel(unit) {
  const type = String(unit?.propertyType || "bed");
  if (type === "shop") return "Shop";
  if (type === "room") return "Residential room";
  return "Hostel room";
}

export default function UnitDetailsScreen() {
  const router = useRouter();
  const { isUnitTypeAllowed } = useSystemAccess();
  const { id } = useLocalSearchParams();
  const [unit, setUnit] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingUnit, setEditingUnit] = useState(false);
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [editingBedNo, setEditingBedNo] = useState("");
  const [updatingBedNo, setUpdatingBedNo] = useState("");
  const [deletingBedNo, setDeletingBedNo] = useState("");
  const [unitEdits, setUnitEdits] = useState({});
  const [bedEdits, setBedEdits] = useState({});
  const [error, setError] = useState("");

  const loadUnit = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const data = await getUnit(id);
      const loadedUnit = data?.unit || null;
      if (loadedUnit && !isUnitTypeAllowed(loadedUnit.propertyType || "bed")) {
        setError("This property type is not included in the current subscription.");
        setUnit(null);
        return;
      }
      setUnit(loadedUnit);
      setQuota(data?.quota || null);

      const primaryBed = loadedUnit?.beds?.[0] || {};
      setUnitEdits({
        category: loadedUnit?.category || "",
        floorNo: loadedUnit?.floorNo || "",
        roomNo: loadedUnit?.roomNo || "",
        wingName: loadedUnit?.wingName || "",
        flatType: loadedUnit?.flatType || "",
        meterNo: loadedUnit?.meterNo || "",
        lastMeterReading:
          loadedUnit?.lastMeterReading === null || loadedUnit?.lastMeterReading === undefined
            ? ""
            : String(loadedUnit.lastMeterReading),
        price:
          primaryBed?.price === null || primaryBed?.price === undefined
            ? ""
            : String(primaryBed.price),
      });

      const nextBedEdits = {};
      (loadedUnit?.beds || []).forEach((bed) => {
        nextBedEdits[String(bed.bedNo)] = {
          price: bed?.price === null || bed?.price === undefined ? "" : String(bed.price),
          bedCategory: bed?.bedCategory || "Standard",
        };
      });
      setBedEdits(nextBedEdits);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load unit.");
    } finally {
      setLoading(false);
    }
  }, [id, isUnitTypeAllowed]);

  useFocusEffect(useCallback(() => { loadUnit(); }, [loadUnit]));

  function setUnitEdit(key, value) {
    setUnitEdits((current) => ({ ...current, [key]: value }));
  }

  function setBedEdit(bedNo, key, value) {
    setBedEdits((current) => ({
      ...current,
      [bedNo]: {
        ...(current[bedNo] || {}),
        [key]: key === "price" ? normalizeNumericText(value) : value,
      },
    }));
  }

  const isBedUnit = (unit?.propertyType || "bed") === "bed";
  const isShop = (unit?.propertyType || "bed") === "shop";
  const beds = Array.isArray(unit?.beds) ? unit.beds : [];
  const remainingBeds = quota?.remaining?.beds ?? 0;

  function unitSlotBedNo() {
    return isShop ? "SHOP-1" : "ROOM-1";
  }

  async function saveUnitChanges() {
    if (!unit?._id || updatingUnit) return;

    const priceValue = unitEdits.price ?? "";
    const numericPrice = Number(priceValue);
    if (priceValue === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
      Alert.alert("Invalid price", "Enter a valid monthly rent.");
      return;
    }

    try {
      setUpdatingUnit(true);
      const updatedUnit = await updateUnit(unit._id, {
        category: unitEdits.category,
        floorNo: unitEdits.floorNo,
        roomNo: unitEdits.roomNo,
        hasWing: Boolean(String(unitEdits.wingName || "").trim()),
        wingName: unitEdits.wingName,
        flatType: isBedUnit ? "" : unitEdits.flatType,
        meterNo: unitEdits.meterNo,
        lastMeterReading: unitEdits.lastMeterReading,
      });

      if (!isBedUnit) {
        const updatedBedResponse = await updateBed(updatedUnit._id || unit._id, unitSlotBedNo(), {
          price: numericPrice,
          bedCategory: isShop ? "Shop" : "Rental Room",
        });
        const updatedRoom = updatedBedResponse?.room || updatedUnit;
        setUnit(updatedRoom);
      } else {
        setUnit((current) => ({
          ...updatedUnit,
          beds: current?.beds || [],
        }));
      }

      setEditingUnit(false);
      await loadUnit();
    } catch (err) {
      Alert.alert("Unable to update unit", err.response?.data?.message || "Please try again.");
    } finally {
      setUpdatingUnit(false);
    }
  }

  async function saveBedChanges(bed) {
    if (!unit?._id || !bed?.bedNo) return;
    const draft = bedEdits[String(bed.bedNo)] || {};
    const numericPrice = Number(draft.price);
    if (draft.price === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
      Alert.alert("Invalid price", "Enter a valid monthly bed price.");
      return;
    }

    try {
      setUpdatingBedNo(String(bed.bedNo));
      const response = await updateBed(unit._id, bed.bedNo, {
        price: numericPrice,
        bedCategory: draft.bedCategory || "Standard",
      });
      const updatedRoom = response?.room || unit;
      setUnit(updatedRoom);
      setEditingBedNo("");
      await loadUnit();
    } catch (err) {
      Alert.alert("Unable to update bed", err.response?.data?.message || "Please try again.");
    } finally {
      setUpdatingBedNo("");
    }
  }

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
              setEditingBedNo("");
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

  async function confirmDeleteUnit() {
    if (!unit?._id || deletingUnit) return;
    const label = unitTypeLabel(unit).toLowerCase();
    Alert.alert(
      `Delete ${label}?`,
      `This will remove ${isShop ? "Shop" : "Room"} ${unit.roomNo}. This is allowed only when no tenant is assigned to it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingUnit(true);
              await deleteUnit(unit._id);
              router.replace({ pathname: "/system/units", params: { type: unit.propertyType || "bed" } });
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isShop ? "Shop" : "Room"} {unit.roomNo}</Text>
          <Text style={styles.subtitle}>
            {[unit.category, unit.wingName ? `Wing ${unit.wingName}` : "", `Floor ${unit.floorNo}`].filter(Boolean).join(" | ")}
          </Text>
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

      <View style={styles.formSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{unitTypeLabel(unit)}</Text>
          <View style={styles.unitActionRow}>
            <Pressable
              onPress={() => (editingUnit ? saveUnitChanges() : setEditingUnit(true))}
              disabled={updatingUnit}
              style={[styles.editButton, updatingUnit && styles.disabled]}
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
              style={[styles.deleteButton, deletingUnit && styles.disabled]}
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
            <Text style={styles.inputLabel}>Wing</Text>
            <TextInput value={unitEdits.wingName} onChangeText={(value) => setUnitEdit("wingName", value)} style={styles.input} />
            <Text style={styles.inputLabel}>Floor</Text>
            <TextInput value={unitEdits.floorNo} onChangeText={(value) => setUnitEdit("floorNo", value)} style={styles.input} />
            <Text style={styles.inputLabel}>{isShop ? "Shop number" : "Room number"}</Text>
            <TextInput value={unitEdits.roomNo} onChangeText={(value) => setUnitEdit("roomNo", value)} style={styles.input} />
            {!isBedUnit && !isShop ? (
              <>
                <Text style={styles.inputLabel}>Flat / room type</Text>
                <TextInput value={unitEdits.flatType} onChangeText={(value) => setUnitEdit("flatType", value)} style={styles.input} />
              </>
            ) : null}
            <Text style={styles.inputLabel}>Meter no.</Text>
            <TextInput value={unitEdits.meterNo} onChangeText={(value) => setUnitEdit("meterNo", value)} style={styles.input} />
            <Text style={styles.inputLabel}>Last meter reading</Text>
            <TextInput value={unitEdits.lastMeterReading} onChangeText={(value) => setUnitEdit("lastMeterReading", normalizeNumericText(value))} keyboardType="numeric" style={styles.input} />
            {!isBedUnit ? (
              <>
                <Text style={styles.inputLabel}>Monthly rent</Text>
                <TextInput value={unitEdits.price} onChangeText={(value) => setUnitEdit("price", normalizeNumericText(value))} keyboardType="numeric" style={styles.input} />
              </>
            ) : null}
          </View>
        ) : (
          <>
            {!isBedUnit ? <Text style={styles.unitPrice}>Rs. {beds[0]?.price ?? 0} /month</Text> : null}
            {unit.flatType ? <Text style={styles.unitMeta}>{unit.flatType}</Text> : null}
            <Text style={styles.unitMeta}>Meter no: {unit.meterNo || "Not set"}</Text>
            <Text style={styles.unitMeta}>Last reading: {unit.lastMeterReading ?? "Not set"}</Text>
          </>
        )}
      </View>

      {isBedUnit ? (
        <>
          <View style={styles.quotaRow}>
            <Text style={styles.sectionTitle}>Beds</Text>
            <Text style={styles.quotaText}>
              {quota?.usage?.beds ?? 0}/{quota?.limits?.beds ?? 0} used | {remainingBeds} remaining
            </Text>
          </View>

          <View style={styles.bedList}>
            {!beds.length ? <Text style={styles.emptyText}>No beds have been added to this room.</Text> : null}
            {beds.map((bed) => {
              const draft = bedEdits[String(bed.bedNo)] || { price: "", bedCategory: "Standard" };
              const isEditing = editingBedNo === String(bed.bedNo);
              return (
                <View key={bed.bedNo} style={styles.bedRow}>
                  <View style={styles.bedInfo}>
                    <Text style={styles.bedName}>{bed.bedNo}</Text>
                    {isEditing ? (
                      <TextInput
                        value={draft.bedCategory}
                        onChangeText={(value) => setBedEdit(String(bed.bedNo), "bedCategory", value)}
                        placeholder="Bed category"
                        style={styles.bedCategoryInput}
                      />
                    ) : (
                      <Text style={styles.bedCategory}>{bed.bedCategory || "Standard"}</Text>
                    )}
                  </View>
                  <View style={styles.bedActions}>
                    {isEditing ? (
                      <TextInput
                        value={draft.price}
                        onChangeText={(value) => setBedEdit(String(bed.bedNo), "price", value)}
                        keyboardType="numeric"
                        placeholder="Price"
                        style={styles.bedPriceInput}
                      />
                    ) : (
                      <Text style={styles.bedPrice} numberOfLines={1}>Rs. {bed.price ?? 0} /month</Text>
                    )}
                    <Pressable
                      onPress={() => (isEditing ? saveBedChanges(bed) : setEditingBedNo(String(bed.bedNo)))}
                      disabled={updatingBedNo === String(bed.bedNo)}
                      style={[styles.editButton, updatingBedNo === String(bed.bedNo) && styles.disabled]}
                    >
                      {updatingBedNo === String(bed.bedNo) ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : isEditing ? (
                        <Text style={styles.saveIconText}>Save</Text>
                      ) : (
                        <Pencil size={16} color={colors.primary} />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteBed(bed)}
                      disabled={deletingBedNo === String(bed.bedNo)}
                      style={[styles.deleteButton, deletingBedNo === String(bed.bedNo) && styles.disabled]}
                    >
                      {deletingBedNo === String(bed.bedNo) ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <Trash2 size={17} color={colors.danger} />
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
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
  formSection: { marginBottom: 18, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  unitActionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  unitForm: { marginTop: 12 },
  inputLabel: { marginTop: 10, marginBottom: 6, color: colors.muted, fontSize: 12, fontWeight: "700" },
  input: { height: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 14, fontWeight: "700" },
  unitPrice: { marginTop: 10, color: colors.muted, fontSize: 18, fontWeight: "700" },
  unitMeta: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: "700" },
  quotaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  quotaText: { color: colors.muted, fontSize: 12 },
  bedList: { gap: 8 },
  bedRow: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  bedInfo: { flex: 1, minWidth: 0 },
  bedActions: { flex: 1.7, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bedName: { color: colors.text, fontWeight: "700" },
  bedCategory: { marginTop: 3, color: colors.muted, fontSize: 12 },
  bedCategoryInput: { marginTop: 6, height: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 12, fontWeight: "700" },
  bedPrice: { flex: 1, minWidth: 92, color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "right" },
  bedPriceInput: { flex: 1, minWidth: 76, maxWidth: 105, height: 42, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontWeight: "700" },
  editButton: { width: 48, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.primarySoft },
  deleteButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.dangerSoft },
  saveIconText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  error: { marginTop: 13, color: colors.danger },
  emptyText: { paddingVertical: 24, textAlign: "center", color: colors.muted },
  backText: { marginTop: 12, color: colors.primary, fontWeight: "600" },
  disabled: { opacity: 0.45 },
});
