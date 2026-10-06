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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react-native";

import { deleteBed, deleteUnit, getRooms, getUnit, updateBed, updateUnit } from "../../src/api/roomApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { systemColors as colors } from "../../src/theme/systemTheme";
import SecurityPinModal from "../../src/components/SecurityPinModal";

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
  const insets = useSafeAreaInsets();
  const { isUnitTypeAllowed } = useSystemAccess();
  const { id } = useLocalSearchParams();
  const [unit, setUnit] = useState(null);
  const [quota, setQuota] = useState(null);
  const [pendingBedCount, setPendingBedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingUnit, setEditingUnit] = useState(false);
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [editingBedNo, setEditingBedNo] = useState("");
  const [updatingBedNo, setUpdatingBedNo] = useState("");
  const [deletingBedNo, setDeletingBedNo] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [unitEdits, setUnitEdits] = useState({});
  const [bedEdits, setBedEdits] = useState({});
  const [error, setError] = useState("");

  const loadUnit = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const [data, allUnits] = await Promise.all([getUnit(id), getRooms()]);
      const loadedUnit = data?.unit || null;
      if (loadedUnit && !isUnitTypeAllowed(loadedUnit.propertyType || "bed")) {
        setError("This property type is not included in the current subscription.");
        setUnit(null);
        return;
      }
      setUnit(loadedUnit);
      setQuota(data?.quota || null);
      setPendingBedCount((Array.isArray(allUnits) ? allUnits : []).filter((item) => item?.propertyType === "bed" && item?.isPlaceholder).length);

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
  const canAddBed = remainingBeds > 0 || pendingBedCount > 0;

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
          onPress: () => setPendingDelete({ kind: "bed", bed }),
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
          onPress: () => setPendingDelete({ kind: "unit" }),
        },
      ]
    );
  }

  async function deleteWithPin(pin) {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === "bed") {
        const bed = pendingDelete.bed; setDeletingBedNo(String(bed.bedNo));
        const data = await deleteBed(unit._id, bed.bedNo, pin); setUnit(data.room); setQuota(data.quota || quota); setEditingBedNo("");
      } else { setDeletingUnit(true); await deleteUnit(unit._id, pin); router.replace({ pathname: "/system/units", params: { type: unit.propertyType || "bed" } }); }
      setPendingDelete(null);
    } catch (err) { Alert.alert("Unable to delete", err.response?.data?.message || "Please try again."); }
    finally { setDeletingBedNo(""); setDeletingUnit(false); }
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
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 8, 20) }]} keyboardShouldPersistTaps="handled">
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
            onPress={() => router.push({ pathname: "/system/add-bed", params: { id: unit._id, usePlaceholder: remainingBeds < 1 ? "true" : "false", pendingBeds: String(pendingBedCount) } })}
            disabled={!canAddBed}
            style={[styles.headerAction, !canAddBed && styles.disabled]}
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
                  {isEditing ? <View style={styles.editBedContent}>
                    <Text style={styles.bedName}>{bed.bedNo}</Text>
                    <View style={styles.editBedFields}>
                      <TextInput
                        value={draft.bedCategory}
                        onChangeText={(value) => setBedEdit(String(bed.bedNo), "bedCategory", value)}
                        placeholder="Bed category"
                        style={styles.bedCategoryInput}
                      />
                      <TextInput
                        value={draft.price}
                        onChangeText={(value) => setBedEdit(String(bed.bedNo), "price", value)}
                        keyboardType="numeric"
                        placeholder="Price"
                        style={styles.bedPriceInput}
                      />
                      <Pressable onPress={() => saveBedChanges(bed)} disabled={updatingBedNo === String(bed.bedNo)} style={[styles.editButton, updatingBedNo === String(bed.bedNo) && styles.disabled]}>
                        {updatingBedNo === String(bed.bedNo) ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.saveIconText}>Save</Text>}
                      </Pressable>
                      <Pressable onPress={() => confirmDeleteBed(bed)} disabled={deletingBedNo === String(bed.bedNo)} style={[styles.deleteButton, deletingBedNo === String(bed.bedNo) && styles.disabled]}>
                        {deletingBedNo === String(bed.bedNo) ? <ActivityIndicator size="small" color={colors.danger} /> : <Trash2 size={17} color={colors.danger} />}
                      </Pressable>
                    </View>
                  </View> : <>
                  <View style={styles.bedInfo}>
                    <Text style={styles.bedName}>{bed.bedNo}</Text>
                      <Text style={styles.bedCategory}>{bed.bedCategory || "Standard"}</Text>
                  </View>
                  <View style={styles.bedActions}>
                      <Text style={styles.bedPrice} numberOfLines={1}>Rs. {bed.price ?? 0} /month</Text>
                    <Pressable
                      onPress={() => setEditingBedNo(String(bed.bedNo))}
                      disabled={updatingBedNo === String(bed.bedNo)}
                      style={[styles.editButton, updatingBedNo === String(bed.bedNo) && styles.disabled]}
                    >
                      {updatingBedNo === String(bed.bedNo) ? (
                        <ActivityIndicator size="small" color={colors.primary} />
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
                  </>}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </ScrollView>
    <SecurityPinModal visible={Boolean(pendingDelete)} title={pendingDelete?.kind === "bed" ? "Delete bed" : "Delete unit"} message="Enter your security PIN to confirm deletion." loading={Boolean(deletingUnit || deletingBedNo)} onClose={() => setPendingDelete(null)} onConfirm={deleteWithPin} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8F7" },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 18, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 18, backgroundColor: "#F6F8F7" },
  iconButton: { width: 44, height: 44, marginRight: 7, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  headerAction: { height: 42, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 7, backgroundColor: colors.primary },
  headerActionText: { color: colors.surface, fontSize: 13, fontWeight: "700" },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted },
  formSection: { marginBottom: 18, padding: 16, borderWidth: 1, borderColor: "#D9E1E7", borderRadius: 8, backgroundColor: "#FFFFFF" },
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
  editBedContent: { flex: 1, minWidth: 0 },
  editBedFields: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 7 },
  bedInfo: { flex: 1, minWidth: 0 },
  bedActions: { flex: 1.7, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bedName: { color: colors.text, fontWeight: "700" },
  bedCategory: { marginTop: 3, color: colors.muted, fontSize: 12 },
  bedCategoryInput: { flex: 1.15, minWidth: 0, height: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 12, fontWeight: "700" },
  bedPrice: { flex: 1, minWidth: 92, color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "right" },
  bedPriceInput: { flex: 1, minWidth: 70, height: 38, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontWeight: "700" },
  editButton: { width: 48, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.primarySoft },
  deleteButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.dangerSoft },
  saveIconText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  error: { marginTop: 13, color: colors.danger },
  emptyText: { paddingVertical: 24, textAlign: "center", color: colors.muted },
  backText: { marginTop: 12, color: colors.primary, fontWeight: "600" },
  disabled: { opacity: 0.45 },
});
