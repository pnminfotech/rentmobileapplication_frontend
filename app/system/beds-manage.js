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
import { useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native";

import { addBeds, createRoom, getRooms, getUnitUsage, updateBed } from "../../src/api/roomApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export default function BedsManageScreen() {
  const router = useRouter();
  const [mode, setMode] = useState("existing");
  const [rooms, setRooms] = useState([]);
  const [quota, setQuota] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [showRooms, setShowRooms] = useState(false);
  const [buildingMode, setBuildingMode] = useState("existing");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [showBuildings, setShowBuildings] = useState(false);
  const [building, setBuilding] = useState("");
  const [floorNo, setFloorNo] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [meterNo, setMeterNo] = useState("");
  const [lastMeterReading, setLastMeterReading] = useState("");
  const [count, setCount] = useState("1");
  const [bedCategory, setBedCategory] = useState("Standard");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBedNo, setEditingBedNo] = useState("");
  const [bedPriceEdits, setBedPriceEdits] = useState({});
  const [updatingBedNo, setUpdatingBedNo] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [unitData, quotaData] = await Promise.all([getRooms(), getUnitUsage()]);
      const bedRooms = (Array.isArray(unitData) ? unitData : []).filter(
        (unit) => (unit.propertyType || "bed") === "bed"
      );
      setRooms(bedRooms);
      setQuota(quotaData);
      setBedPriceEdits((current) => {
        const next = { ...current };
        bedRooms.forEach((room) => {
          (room.beds || []).forEach((bed) => {
            const key = `${room._id}:${bed.bedNo}`;
            if (next[key] === undefined) next[key] = bed.price === null || bed.price === undefined ? "" : String(bed.price);
          });
        });
        return next;
      });
      setSelectedRoomId((current) => current || bedRooms[0]?._id || "");
      setSelectedBuilding((current) => current || bedRooms[0]?.category || "");
      if (!bedRooms.length) {
        setMode("new");
        setBuildingMode("new");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load rooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const selectedRoom = rooms.find((room) => String(room._id) === String(selectedRoomId));
  const buildings = [...new Set(rooms.map((room) => String(room.category || "").trim()).filter(Boolean))];
  const remaining = quota?.remaining?.beds ?? 0;

  function chooseMode(value) {
    setMode(value);
    setShowRooms(false);
    setError("");
  }

  async function save() {
    const bedCount = Number(count);
    const monthlyPrice = Number(price);
    const reading = lastMeterReading === "" ? null : Number(lastMeterReading);

    if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > remaining) {
      setError(`Enter between 1 and ${remaining} beds.`);
      return;
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      setError("Enter a valid monthly price.");
      return;
    }
    if (mode === "existing" && !selectedRoom) {
      setError("Select an existing room.");
      return;
    }
    const buildingName = buildingMode === "existing" ? selectedBuilding : building.trim();
    if (mode === "new" && (!buildingName || !floorNo.trim() || !roomNo.trim())) {
      setError("Building, floor and room number are required.");
      return;
    }
    if (mode === "new" && lastMeterReading !== "" && (!Number.isFinite(reading) || reading < 0)) {
      setError("Enter a valid last meter reading.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const common = {
        bedCategory: bedCategory.trim() || "Standard",
        price: monthlyPrice,
      };

      if (mode === "existing") {
        await addBeds(selectedRoom._id, { count: bedCount, ...common });
      } else {
        await createRoom({
          propertyType: "bed",
          category: buildingName,
          floorNo: floorNo.trim(),
          roomNo: normalizeIdentifier(roomNo),
          meterNo: normalizeIdentifier(meterNo),
          lastMeterReading: reading,
          bedCount,
          ...common,
        });
      }
      router.replace("/system/units");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save beds.");
    } finally {
      setSaving(false);
    }
  }

  function bedEditKey(roomId, bedNo) {
    return `${roomId}:${bedNo}`;
  }

  function setBedPrice(roomId, bedNo, value) {
    const key = bedEditKey(roomId, bedNo);
    setBedPriceEdits((current) => ({
      ...current,
      [key]: String(value || "").replace(/[^0-9.]/g, ""),
    }));
  }

  async function saveBedPrice(bed) {
    if (!selectedRoom?._id || !bed?.bedNo) return;
    const key = bedEditKey(selectedRoom._id, bed.bedNo);
    const nextPrice = bedPriceEdits[key] ?? "";
    const numericPrice = Number(nextPrice);
    if (nextPrice === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Enter a valid bed price.");
      return;
    }

    try {
      setUpdatingBedNo(String(bed.bedNo));
      setError("");
      await updateBed(selectedRoom._id, bed.bedNo, {
        price: numericPrice,
        bedCategory: bed.bedCategory || "Standard",
      });
      await loadData();
      setEditingBedNo("");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update bed price.");
    } finally {
      setUpdatingBedNo("");
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.backButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>Add beds</Text>
          <Text style={styles.subtitle}>{remaining} purchased beds remaining</Text>
        </View>
      </View>

      <View style={styles.modeControl}>
        <Pressable
          onPress={() => chooseMode("existing")}
          disabled={!rooms.length}
          style={[styles.modeButton, mode === "existing" && styles.modeButtonActive, !rooms.length && styles.disabledMode]}
        >
          <Text style={[styles.modeText, mode === "existing" && styles.modeTextActive]}>Existing room</Text>
        </Pressable>
        <Pressable
          onPress={() => chooseMode("new")}
          style={[styles.modeButton, mode === "new" && styles.modeButtonActive]}
        >
          <Text style={[styles.modeText, mode === "new" && styles.modeTextActive]}>New room</Text>
        </Pressable>
      </View>

      {mode === "existing" ? (
        <>
          <Text style={styles.label}>Select room</Text>
          <Pressable onPress={() => setShowRooms((value) => !value)} style={styles.select}>
            <View style={styles.flex}>
              <Text style={styles.selectTitle}>{selectedRoom?.category || "Choose a room"}</Text>
              {selectedRoom ? (
                <Text style={styles.selectMeta}>Room {selectedRoom.roomNo} · Floor {selectedRoom.floorNo} · {selectedRoom.beds?.length || 0} beds</Text>
              ) : null}
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
                    onPress={() => { setSelectedRoomId(room._id); setShowRooms(false); }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.selectTitle}>{room.category}</Text>
                      <Text style={styles.selectMeta}>Room {room.roomNo} · Floor {room.floorNo} · {room.beds?.length || 0} beds</Text>
                    </View>
                    {selected ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selectedRoom?.beds?.length ? (
            <View style={styles.bedList}>
              <View style={styles.bedListHeader}>
                <Text style={styles.bedListTitle}>Existing beds</Text>
                <Text style={styles.bedListMeta}>{selectedRoom.beds.length} beds</Text>
              </View>
              {selectedRoom.beds.map((bed) => {
                const key = bedEditKey(selectedRoom._id, bed.bedNo);
                const isEditing = editingBedNo === String(bed.bedNo);
                return (
                  <View key={String(bed.bedNo)} style={styles.bedRow}>
                    <View style={styles.bedInfo}>
                      <Text style={styles.bedNo}>{bed.bedNo}</Text>
                      <Text style={styles.bedMeta}>{bed.bedCategory || "Standard"}</Text>
                    </View>
                    {isEditing ? (
                      <TextInput
                        value={bedPriceEdits[key] ?? ""}
                        onChangeText={(value) => setBedPrice(selectedRoom._id, bed.bedNo, value)}
                        keyboardType="numeric"
                        placeholder="Price"
                        style={styles.bedPriceInput}
                      />
                    ) : (
                      <Text style={styles.bedPrice}>Rs. {Number(bed.price || 0).toLocaleString("en-IN")}</Text>
                    )}
                    <Pressable
                      onPress={() => (isEditing ? saveBedPrice(bed) : setEditingBedNo(String(bed.bedNo)))}
                      disabled={updatingBedNo === String(bed.bedNo)}
                      style={styles.bedEditButton}
                    >
                      {updatingBedNo === String(bed.bedNo) ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.bedEditText}>{isEditing ? "Save" : "Edit"}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label}>Building</Text>
          <View style={styles.buildingModeControl}>
            <Pressable
              onPress={() => { setBuildingMode("existing"); setError(""); }}
              disabled={!buildings.length}
              style={[styles.buildingModeButton, buildingMode === "existing" && styles.buildingModeActive, !buildings.length && styles.disabledMode]}
            >
              <Text style={[styles.buildingModeText, buildingMode === "existing" && styles.modeTextActive]}>Existing building</Text>
            </Pressable>
            <Pressable
              onPress={() => { setBuildingMode("new"); setError(""); }}
              style={[styles.buildingModeButton, buildingMode === "new" && styles.buildingModeActive]}
            >
              <Text style={[styles.buildingModeText, buildingMode === "new" && styles.modeTextActive]}>New building</Text>
            </Pressable>
          </View>

          {buildingMode === "existing" ? (
            <>
              <Pressable onPress={() => setShowBuildings((value) => !value)} style={styles.select}>
                <Text style={[styles.selectTitle, styles.flex]}>{selectedBuilding || "Choose a building"}</Text>
                <ChevronDown size={20} color={colors.muted} />
              </Pressable>
              {showBuildings ? (
                <View style={styles.options}>
                  {buildings.map((name) => (
                    <Pressable
                      key={name}
                      onPress={() => { setSelectedBuilding(name); setShowBuildings(false); }}
                      style={[styles.option, name === selectedBuilding && styles.optionSelected]}
                    >
                      <Text style={[styles.selectTitle, styles.flex]}>{name}</Text>
                      {name === selectedBuilding ? <Check size={18} color={colors.primary} /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <TextInput value={building} onChangeText={setBuilding} placeholder="Enter new building name" style={styles.input} />
          )}

          <Text style={styles.label}>Floor</Text>
          <TextInput value={floorNo} onChangeText={setFloorNo} placeholder="Example: Ground or 1" style={styles.input} />
          <Text style={styles.label}>Room number</Text>
          <TextInput value={roomNo} onChangeText={setRoomNo} placeholder="Example: 101" style={styles.input} />
          <Text style={styles.label}>Meter number (optional)</Text>
          <TextInput value={meterNo} onChangeText={setMeterNo} placeholder="Example: MTR-101" style={styles.input} />
          <Text style={styles.label}>Last meter reading (optional)</Text>
          <TextInput value={lastMeterReading} onChangeText={setLastMeterReading} keyboardType="numeric" placeholder="Example: 250" style={styles.input} />
        </>
      )}

      <Text style={styles.label}>Number of beds</Text>
      <View style={styles.countRow}>
        <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" style={[styles.input, styles.flex]} />
        <Pressable onPress={() => setCount(String(remaining))} disabled={remaining < 1} style={styles.allButton}>
          <Text style={styles.allButtonText}>All {remaining}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Bed category</Text>
      <TextInput value={bedCategory} onChangeText={setBedCategory} placeholder="Example: Standard" style={styles.input} />
      <Text style={styles.label}>Monthly price per bed</Text>
      <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Example: 5000" style={styles.input} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={save} disabled={saving || remaining < 1} style={[styles.saveButton, (saving || remaining < 1) && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.surface} /> : (
          <Text style={styles.saveText}>{mode === "existing" ? "Add to room" : "Create room and beds"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 20, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  backButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  modeControl: { flexDirection: "row", padding: 4, borderRadius: 7, backgroundColor: colors.border },
  modeButton: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  modeButtonActive: { backgroundColor: colors.surface },
  disabledMode: { opacity: 0.45 },
  modeText: { color: colors.muted, fontWeight: "600" },
  modeTextActive: { color: colors.primary },
  buildingModeControl: { marginBottom: 8, flexDirection: "row", gap: 8 },
  buildingModeButton: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface },
  buildingModeActive: { borderColor: colors.border, backgroundColor: colors.primarySoft },
  buildingModeText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  select: { minHeight: 60, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectTitle: { color: colors.text, fontWeight: "700" },
  selectMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  options: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  option: { minHeight: 58, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  optionSelected: { backgroundColor: colors.primarySoft },
  bedList: { marginTop: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  bedListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bedListTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  bedListMeta: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  bedRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.surfaceSoft, paddingTop: 8 },
  bedInfo: { flex: 1, minWidth: 0 },
  bedNo: { color: colors.text, fontSize: 14, fontWeight: "800" },
  bedMeta: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: "600" },
  bedPrice: { minWidth: 82, color: colors.primary, fontSize: 13, fontWeight: "800", textAlign: "right" },
  bedPriceInput: { width: 94, height: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontWeight: "800" },
  bedEditButton: { minWidth: 54, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft },
  bedEditText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  countRow: { flexDirection: "row", gap: 9 },
  flex: { flex: 1 },
  allButton: { minWidth: 90, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft },
  allButtonText: { color: colors.primary, fontWeight: "700" },
  error: { marginTop: 14, color: colors.danger },
  saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  saveText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
