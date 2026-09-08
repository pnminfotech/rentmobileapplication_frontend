import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { ArrowLeft, Check, Plus } from "lucide-react-native";

import { createRoom, getRooms } from "../../src/api/roomApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

const UNIT_TYPES = [
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueValues(items, selector) {
  const seen = new Set();
  return items.reduce((list, item) => {
    const value = String(selector(item) || "").trim();
    const key = normalizeKey(value);
    if (!value || seen.has(key)) return list;
    seen.add(key);
    return [...list, value];
  }, []);
}

function unitTypeOf(unit) {
  const type = String(unit?.propertyType || "bed").toLowerCase();
  return type === "room" || type === "shop" ? type : "bed";
}

function formatLocation(unit) {
  const parts = [unit.category, unit.wingName ? `Wing ${unit.wingName}` : "", `Floor ${unit.floorNo}`, unit.roomNo];
  return parts.filter(Boolean).join(" | ");
}

export default function UnitFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { unitTypes, firstUnitType, isUnitTypeAllowed } = useSystemAccess();
  const visibleUnitTypes = useMemo(
    () => UNIT_TYPES.filter((item) => unitTypes.some((allowed) => allowed.value === item.value)),
    [unitTypes]
  );
  const requestedType = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialType = isUnitTypeAllowed(requestedType) ? requestedType : firstUnitType;

  const [propertyType, setPropertyType] = useState(initialType);
  const [category, setCategory] = useState("");
  const [floorNo, setFloorNo] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [hasWing, setHasWing] = useState(false);
  const [wingName, setWingName] = useState("");
  const [flatType, setFlatType] = useState("");
  const [meterNo, setMeterNo] = useState("");
  const [lastMeterReading, setLastMeterReading] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [bedCount, setBedCount] = useState("1");
  const [bedCategory, setBedCategory] = useState("Standard");
  const [bedRoomMode, setBedRoomMode] = useState("new");
  const [units, setUnits] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadUnits = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await getRooms();
      setUnits(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load existing units.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadUnits(); }, [loadUnits]));

  useEffect(() => {
    if (!isUnitTypeAllowed(propertyType)) setPropertyType(firstUnitType);
  }, [firstUnitType, isUnitTypeAllowed, propertyType]);

  const labels = useMemo(() => {
    if (propertyType === "bed") {
      return {
        title: "Add hostel beds",
        category: "Hostel or building",
        number: "Room number",
        numberPlaceholder: "Example: 101",
        price: "Monthly price per bed",
      };
    }
    if (propertyType === "room") {
      return {
        title: "Add rental room",
        category: "Property or building",
        number: "Room or unit number",
        numberPlaceholder: "Example: A-101",
        price: "Monthly room rent",
      };
    }
    return {
      title: "Add shop",
      category: "Market or building",
      number: "Shop number",
      numberPlaceholder: "Example: S-12",
      price: "Monthly shop rent",
    };
  }, [propertyType]);

  const unitsOfType = useMemo(
    () => units.filter((unit) => unitTypeOf(unit) === propertyType),
    [propertyType, units]
  );

 const locationSourceUnits = useMemo(
  () => units,
  [units]
);
  const categoryOptions = useMemo(
    () => uniqueValues(locationSourceUnits, (unit) => unit.category),
    [locationSourceUnits]
  );

  const floorOptions = useMemo(() => {
    const categoryKey = normalizeKey(category);
    return uniqueValues(
      locationSourceUnits.filter((unit) => !categoryKey || normalizeKey(unit.category) === categoryKey),
      (unit) => unit.floorNo
    );
  }, [category, locationSourceUnits]);

  const wingOptions = useMemo(() => {
    const categoryKey = normalizeKey(category);
    const floorKey = normalizeKey(floorNo);
    return uniqueValues(
      locationSourceUnits.filter((unit) => {
        if (categoryKey && normalizeKey(unit.category) !== categoryKey) return false;
        if (floorKey && normalizeKey(unit.floorNo) !== floorKey) return false;
        return Boolean(unit.wingName);
      }),
      (unit) => unit.wingName
    );
  }, [category, floorNo, locationSourceUnits]);

  const flatTypeOptions = useMemo(() => {
    const categoryKey = normalizeKey(category);
    const floorKey = normalizeKey(floorNo);
    return uniqueValues(
      locationSourceUnits.filter((unit) => {
        if (categoryKey && normalizeKey(unit.category) !== categoryKey) return false;
        if (floorKey && normalizeKey(unit.floorNo) !== floorKey) return false;
        return Boolean(unit.flatType);
      }),
      (unit) => unit.flatType
    );
  }, [category, floorNo, locationSourceUnits]);

  const selectedLocationUnits = useMemo(() => {
    const categoryKey = normalizeKey(category);
    const floorKey = normalizeKey(floorNo);
    const wingKey = normalizeKey(wingName);
    if (!categoryKey || !floorKey) return [];
    return unitsOfType
      .filter((unit) => {
        if (normalizeKey(unit.category) !== categoryKey) return false;
        if (normalizeKey(unit.floorNo) !== floorKey) return false;
        if (hasWing && wingKey && normalizeKey(unit.wingName) !== wingKey) return false;
        return true;
      })
      .sort((a, b) => String(a.roomNo || "").localeCompare(String(b.roomNo || ""), undefined, { numeric: true }));
  }, [category, floorNo, hasWing, unitsOfType, wingName]);

  function selectType(value) {
    setPropertyType(value);
    setError("");
    setCategory("");
    setFloorNo("");
    setRoomNo("");
    setMeterNo("");
    setLastMeterReading("");
    setBedRoomMode("new");
    if (value !== "room") setFlatType("");
  }

  function selectCategory(value) {
    setCategory(value);
    setFloorNo("");
    setRoomNo("");
    setWingName("");
    setFlatType("");
    setBedRoomMode("new");
    setError("");
  }

  function selectFloor(value) {
    setFloorNo(value);
    setRoomNo("");
    setError("");
  }

  function openExistingUnit(unit) {
    if (unitTypeOf(unit) === "bed") {
      router.push({ pathname: "/system/add-bed", params: { id: unit._id } });
      return;
    }
    router.push({ pathname: "/system/unit-details", params: { id: unit._id } });
  }

  function OptionList({ options, selectedValue, onSelect, emptyText }) {
    if (listLoading) {
      return <Text style={styles.optionHelper}>Loading saved options...</Text>;
    }
    if (!options.length) {
      return <Text style={styles.optionHelper}>{emptyText}</Text>;
    }
    return (
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const selected = normalizeKey(option) === normalizeKey(selectedValue);
          return (
            <Pressable key={option} onPress={() => onSelect(option)} style={[styles.optionChip, selected && styles.optionChipActive]}>
              <Text style={[styles.optionText, selected && styles.optionTextActive]} numberOfLines={1}>{option}</Text>
              {selected ? <Check size={14} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  async function saveUnit() {
    const price = Number(monthlyPrice);
    const numberOfBeds = Number(bedCount);
    const reading = lastMeterReading === "" ? null : Number(lastMeterReading);

    if (!category.trim() || !floorNo.trim() || !roomNo.trim()) {
      setError(`${labels.category}, floor and ${labels.number.toLowerCase()} are required.`);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid monthly price.");
      return;
    }
    if (propertyType === "bed" && (!Number.isInteger(numberOfBeds) || numberOfBeds < 1)) {
      setError("Enter a valid number of beds.");
      return;
    }
    if (propertyType === "room" && !flatType.trim()) {
      setError("Enter the flat type.");
      return;
    }
    if (hasWing && !wingName.trim()) {
      setError("Enter the wing or block name.");
      return;
    }
    if (lastMeterReading !== "" && (!Number.isFinite(reading) || reading < 0)) {
      setError("Enter a valid last meter reading.");
      return;
    }

    const categoryKey = normalizeKey(category);
    const floorKey = normalizeKey(floorNo);
    const roomKey = normalizeIdentifier(roomNo);
    const wingKey = hasWing ? normalizeKey(wingName) : "";
    const duplicateUnit = unitsOfType.find((unit) => {
      const sameBase =
        normalizeKey(unit.category) === categoryKey &&
        normalizeKey(unit.floorNo) === floorKey &&
        normalizeIdentifier(unit.roomNo) === roomKey;
      if (!sameBase) return false;
      return normalizeKey(unit.wingName) === wingKey;
    });

    if (duplicateUnit) {
      setError(`${labels.number} already exists in this location.`);
      return;
    }

    const meterKey = normalizeIdentifier(meterNo);
    if (meterKey) {
      const duplicateMeter = units.find((unit) => normalizeIdentifier(unit.meterNo) === meterKey);
      if (duplicateMeter) {
        setError("Meter number already exists for another unit.");
        return;
      }
    }

    try {
      setLoading(true);
      setError("");
      await createRoom({
        propertyType,
        category: category.trim(),
        floorNo: floorNo.trim(),
        roomNo: normalizeIdentifier(roomNo),
        hasWing,
        wingName: hasWing ? wingName.trim() : "",
        flatType: propertyType === "room" ? flatType.trim() : "",
        meterNo: normalizeIdentifier(meterNo),
        lastMeterReading: reading,
        bedCount: propertyType === "bed" ? numberOfBeds : undefined,
        bedCategory: propertyType === "bed" ? bedCategory.trim() || "Standard" : undefined,
        price,
      });
      router.replace("/system/units");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create unit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{labels.title}</Text>
      </View>

      <Text style={styles.label}>Unit type</Text>
      <View style={styles.segmented}>
        {visibleUnitTypes.map((item) => {
          const active = propertyType === item.value;
          return (
            <Pressable key={item.value} onPress={() => selectType(item.value)} style={[styles.segment, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{labels.category}</Text>
      <OptionList
        options={categoryOptions}
        selectedValue={category}
        onSelect={selectCategory}
        emptyText={`No saved ${labels.category.toLowerCase()} yet.`}
      />
      <TextInput value={category} onChangeText={setCategory} placeholder={`Enter ${labels.category.toLowerCase()}`} style={styles.input} />

      {propertyType === "bed" ? (
        <>
          <Text style={styles.label}>Add bed in</Text>
          <View style={styles.modeTabs}>
            {[
              { label: "New room", value: "new" },
              { label: "Existing room", value: "existing" },
            ].map((item) => {
              const active = bedRoomMode === item.value;
              return (
                <Pressable key={item.value} onPress={() => { setBedRoomMode(item.value); setError(""); }} style={[styles.modeTab, active && styles.modeTabActive]}>
                  <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>Floor</Text>
      <OptionList
        options={floorOptions}
        selectedValue={floorNo}
        onSelect={selectFloor}
        emptyText={category.trim() ? "No saved floors for this selection yet." : `Choose or enter ${labels.category.toLowerCase()} first.`}
      />
      <TextInput value={floorNo} onChangeText={setFloorNo} placeholder="Example: Ground or 1" style={styles.input} />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Has wing or block</Text>
        <Switch value={hasWing} onValueChange={setHasWing} />
      </View>

      {hasWing ? (
        <>
          <Text style={styles.label}>Wing or block</Text>
          <OptionList
            options={wingOptions}
            selectedValue={wingName}
            onSelect={setWingName}
            emptyText="No saved wing or block for this selection yet."
          />
          <TextInput value={wingName} onChangeText={setWingName} placeholder="Example: A" style={styles.input} />
        </>
      ) : null}

      {propertyType === "room" ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Flat type required</Text>
          <Text style={styles.optionHelper}>Residential rooms need a flat or room type.</Text>
        </View>
      ) : null}

      {propertyType === "room" ? (
        <>
          <Text style={styles.label}>Flat type</Text>
          <OptionList
            options={flatTypeOptions}
            selectedValue={flatType}
            onSelect={setFlatType}
            emptyText="No saved flat types for this selection yet."
          />
          <TextInput value={flatType} onChangeText={setFlatType} placeholder="Example: 1 RK or 1 BHK" style={styles.input} />
        </>
      ) : null}

      {selectedLocationUnits.length && (propertyType !== "bed" || bedRoomMode === "existing") ? (
        <View style={styles.existingPanel}>
          <Text style={styles.existingTitle}>
            Existing {propertyType === "bed" ? "hostel rooms" : propertyType === "shop" ? "shops" : "rooms"} here
          </Text>
          <Text style={styles.existingHint}>
            {propertyType === "bed"
              ? "Tap a room to add beds inside it instead of creating the same room again."
              : "Tap an existing unit to view it before creating another one."}
          </Text>
          {selectedLocationUnits.map((unit) => (
            <Pressable key={unit._id} onPress={() => openExistingUnit(unit)} style={styles.existingRow}>
              <View style={styles.existingInfo}>
                <Text style={styles.existingName}>{formatLocation(unit)}</Text>
                <Text style={styles.existingMeta}>
                  {(unit.beds || []).length} {unitTypeOf(unit) === "bed" ? "beds" : "record"} | Meter {unit.meterNo || "not set"}
                </Text>
              </View>
              {unitTypeOf(unit) === "bed" ? <Plus size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {propertyType === "bed" && bedRoomMode === "existing" ? (
        <Text style={styles.existingOnlyHint}>
          Select a saved room above to add another bed in that room.
        </Text>
      ) : null}

      {propertyType !== "bed" || bedRoomMode === "new" ? (
        <>
          <Text style={styles.label}>{labels.number}</Text>
          <TextInput value={roomNo} onChangeText={setRoomNo} placeholder={labels.numberPlaceholder} style={styles.input} />

          <Text style={styles.label}>Meter number (optional)</Text>
          <TextInput value={meterNo} onChangeText={setMeterNo} placeholder="Example: MTR-101" style={styles.input} />

          <Text style={styles.label}>Last meter reading (optional)</Text>
          <TextInput value={lastMeterReading} onChangeText={setLastMeterReading} keyboardType="numeric" placeholder="Example: 250" style={styles.input} />

          {propertyType === "bed" ? (
            <>
              <Text style={styles.label}>Number of beds</Text>
              <TextInput value={bedCount} onChangeText={setBedCount} keyboardType="number-pad" placeholder="Example: 3" style={styles.input} />

              <Text style={styles.label}>Bed category</Text>
              <TextInput value={bedCategory} onChangeText={setBedCategory} placeholder="Example: Standard" style={styles.input} />
            </>
          ) : null}

          <Text style={styles.label}>{labels.price}</Text>
          <TextInput value={monthlyPrice} onChangeText={setMonthlyPrice} keyboardType="numeric" placeholder="Example: 5000" style={styles.input} />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {propertyType !== "bed" || bedRoomMode === "new" ? (
        <Pressable onPress={saveUnit} disabled={loading} style={[styles.saveButton, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Save {propertyType}</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 20 },
  header: { marginBottom: 22, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 24, fontWeight: "700", color: colors.text },
  label: { marginTop: 15, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  optionWrap: { marginBottom: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { maxWidth: "100%", minHeight: 36, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  optionChipActive: { borderColor: colors.border, backgroundColor: colors.primarySoft },
  optionText: { maxWidth: 220, color: colors.muted, fontSize: 13, fontWeight: "600" },
  optionTextActive: { color: colors.primary },
  optionHelper: { marginBottom: 8, color: colors.muted, fontSize: 12, fontWeight: "600" },
  segmented: { minHeight: 68, flexDirection: "row", gap: 4, padding: 4, borderRadius: 7, backgroundColor: colors.border },
  segment: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
  modeTabs: { minHeight: 52, flexDirection: "row", gap: 6, padding: 5, borderRadius: 10, backgroundColor: colors.border },
  modeTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  modeTabActive: { backgroundColor: colors.surface },
  modeTabText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  modeTabTextActive: { color: colors.primary },
  switchRow: { marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  existingPanel: { marginTop: 16, padding: 12, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: 8, backgroundColor: colors.primarySoft },
  existingTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  existingHint: { marginTop: 4, marginBottom: 10, color: colors.muted, fontSize: 12, lineHeight: 17 },
  existingRow: { minHeight: 58, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  existingInfo: { flex: 1, minWidth: 0, paddingRight: 10 },
  existingName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  existingMeta: { marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: "600" },
  existingOnlyHint: { marginTop: 12, padding: 12, color: colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  error: { marginTop: 18, color: colors.danger },
  saveButton: { height: 50, marginTop: 26, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  disabled: { opacity: 0.65 },
  saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
});
