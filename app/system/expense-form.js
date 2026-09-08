import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { createExpense, getExpenses, updateExpense } from "../../src/api/expenseApi";
import { getRooms } from "../../src/api/roomApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

const PROPERTY_TYPES = [
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];
const STATUSES = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
];

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizePropertyType(value) {
  if (value === "room" || value === "shop") return value;
  return "bed";
}

function propertyLabel(value) {
  const type = normalizePropertyType(value);
  if (type === "room") return "Room";
  if (type === "shop") return "Shop";
  return "Hostel";
}

function scopeTypeFor(value) {
  const type = normalizePropertyType(value);
  if (type === "room" || type === "shop") return type;
  return "hostel";
}

function unitMeta(unit) {
  const parts = [
    unit?.category,
    unit?.hasWing && unit?.wingName ? `Wing ${unit.wingName}` : "",
    unit?.floorNo ? `Floor ${unit.floorNo}` : "",
    unit?.flatType,
  ].filter(Boolean);

  const bedCount = Array.isArray(unit?.beds) ? unit.beds.length : 0;
  if (normalizePropertyType(unit?.propertyType) === "bed" && bedCount) {
    parts.push(`${bedCount} bed${bedCount === 1 ? "" : "s"}`);
  }
  return parts.join(" | ") || propertyLabel(unit?.propertyType);
}

function roomShopTitle(unit) {
  const type = normalizePropertyType(unit?.propertyType);
  const number = unit?.roomNo || "-";
  if (type === "shop") return `${unit?.category || "Shop"} | Shop ${number}`;
  return `${unit?.category || "Room"} | Room ${number}`;
}

export default function ExpenseFormScreen() {
  const router = useRouter();
  const { unitTypes, firstUnitType, isUnitTypeAllowed } = useSystemAccess();
  const visiblePropertyTypes = useMemo(
    () => PROPERTY_TYPES.filter((item) => unitTypes.some((allowed) => allowed.value === item.value)),
    [unitTypes]
  );
  const { id } = useLocalSearchParams();
  const editing = Boolean(id);
  const [category, setCategory] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [amount, setAmount] = useState("");
  const [propertyType, setPropertyType] = useState(firstUnitType);
  const [scopeName, setScopeName] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [units, setUnits] = useState([]);
  const [existingExpenses, setExistingExpenses] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [showUnits, setShowUnits] = useState(false);
  const [status, setStatus] = useState("pending");
  const [date, setDate] = useState(toDateValue());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadItem = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [unitData, list] = await Promise.all([
        getRooms(),
        getExpenses(),
      ]);
      const unitList = (Array.isArray(unitData) ? unitData : [])
        .filter((unit) => isUnitTypeAllowed(normalizePropertyType(unit.propertyType)));
      const expenseList = Array.isArray(list) ? list : [];
      setUnits(unitList);
      setExistingExpenses(expenseList);
      if (!editing) return;

      const item = expenseList.find((entry) => String(entry._id) === String(id));
      if (!item) {
        setError("Expense not found.");
        return;
      }
      if (!isUnitTypeAllowed(normalizePropertyType(item.propertyType))) {
        setError("This property type is not included in the current subscription.");
        return;
      }
      const parts = Array.isArray(item.expenses) ? item.expenses : [];
      setCategory(parts[0] || "");
      setNotes(parts.slice(1).join(" | "));
      setAmount(String(item.mainAmount ?? ""));
      setPropertyType(item.propertyType || "bed");
      setScopeName(item.scopeName || item.buildingName || "");
      setRoomNo(item.roomNo || "");
      const matchedUnit = unitList.find((unit) => {
        const unitType = normalizePropertyType(unit.propertyType);
        const itemType = normalizePropertyType(item.propertyType);
        if (itemType === "bed") return unitType === "bed" && unit.category === (item.scopeName || item.buildingName);
        return unitType === itemType && unit.roomNo === item.roomNo;
      });
      setSelectedUnitId(matchedUnit?._id || "");
      setStatus(item.status || "pending");
      setDate(toDateValue(item.date));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load expense.");
    } finally {
      setLoading(false);
    }
  }, [editing, id, isUnitTypeAllowed]);

  useFocusEffect(useCallback(() => { loadItem(); }, [loadItem]));

  const selectedUnit = useMemo(
    () => units.find((unit) => String(unit._id) === String(selectedUnitId)),
    [selectedUnitId, units]
  );
  const filteredUnits = useMemo(
    () => units.filter((unit) => normalizePropertyType(unit.propertyType) === propertyType),
    [propertyType, units]
  );
  const hostelOptions = useMemo(() => {
    const names = [...new Set(units
      .filter((unit) => normalizePropertyType(unit.propertyType) === "bed")
      .map((unit) => String(unit.category || "").trim())
      .filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [units]);
  const existingCategories = useMemo(() => {
    const map = new Map();
    existingExpenses.forEach((item) => {
      const first = Array.isArray(item.expenses) ? item.expenses[0] : "";
      const clean = String(first || "").trim().replace(/\s+/g, " ");
      const key = clean.toLowerCase();
      if (clean && !map.has(key)) map.set(key, clean);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [existingExpenses]);
  const existingDetails = useMemo(() => {
    const selected = String(category || "").trim().toLowerCase();
    const map = new Map();
    existingExpenses.forEach((item) => {
      const parts = Array.isArray(item.expenses) ? item.expenses : [];
      if (String(parts[0] || "").trim().toLowerCase() !== selected) return;
      const detail = parts.slice(1).join(" | ").trim().replace(/\s+/g, " ");
      const key = detail.toLowerCase();
      if (detail && !map.has(key)) map.set(key, detail);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [category, existingExpenses]);

  function selectPropertyType(value) {
    setPropertyType(value);
    setShowUnits(false);
    if (selectedUnit && normalizePropertyType(selectedUnit.propertyType) !== value) {
      setSelectedUnitId("");
      setRoomNo("");
      setScopeName("");
    }
  }

  function selectUnit(unit) {
    setSelectedUnitId(unit._id);
    setPropertyType(normalizePropertyType(unit.propertyType));
    setScopeName(unit.category || "");
    setRoomNo(normalizePropertyType(unit.propertyType) === "bed" ? "" : unit.roomNo || "");
    setShowUnits(false);
  }

  function selectHostel(name) {
    setSelectedUnitId("");
    setScopeName(name);
    setRoomNo("");
    setShowUnits(false);
  }

  async function saveItem() {
    const numericAmount = Number(amount);
    const matchedCategory = existingCategories.find((item) => item.toLowerCase() === category.trim().toLowerCase());
    if (!category.trim()) return setError("Enter expense category.");
    if (propertyType === "bed" && !scopeName.trim()) return setError("Select hostel/building name.");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid amount.");
    if (!date) return setError("Select a date.");

    try {
      setSaving(true);
      setError("");
      const payload = {
        propertyType,
        scopeType: scopeTypeFor(propertyType),
        scopeName: scopeName.trim(),
        buildingName: scopeName.trim(),
        roomNo: propertyType === "bed" ? "" : normalizeIdentifier(roomNo),
        mainAmount: numericAmount,
        expenses: [matchedCategory || category.trim().replace(/\s+/g, " "), notes.trim().replace(/\s+/g, " ")].filter(Boolean),
        status,
        date,
      };
      if (editing) await updateExpense(id, payload);
      else await createExpense(payload);
      router.replace("/system/expenses");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}><Pressable onPress={() => router.replace("/system/expenses")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><Text style={styles.title}>{editing ? "Edit expense" : "Add expense"}</Text></View>
      <Text style={styles.label}>Category</Text>
      <Pressable onPress={() => setShowCategories((value) => !value)} style={styles.select}>
        <View style={styles.selectText}>
          <Text style={styles.selectTitle}>{category || "Select existing category"}</Text>
          <Text style={styles.selectMeta}>{existingCategories.length ? `${existingCategories.length} previous categor${existingCategories.length === 1 ? "y" : "ies"}` : "No previous categories yet"}</Text>
        </View>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showCategories ? (
        <View style={styles.options}>
          {!existingCategories.length ? <Text style={styles.emptyOption}>No previous categories. Type a new category below.</Text> : null}
          {existingCategories.map((item) => (
            <Pressable key={item} onPress={() => { setCategory(item); setShowCategories(false); setShowDetails(false); }} style={[styles.option, category.trim().toLowerCase() === item.toLowerCase() && styles.optionSelected]}>
              <View style={styles.selectText}>
                <Text style={styles.optionTitle}>{item}</Text>
                <Text style={styles.selectMeta}>Reuse this category</Text>
              </View>
              {category.trim().toLowerCase() === item.toLowerCase() ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.helper}>Use an existing category when possible. Type below only for a new category.</Text>
      <TextInput value={category} onChangeText={setCategory} placeholder="Example: Repairs, internet, cleaning material" style={styles.input} />
      <Text style={styles.label}>Notes</Text>
      <Pressable disabled={!category.trim()} onPress={() => setShowDetails((value) => !value)} style={[styles.select, !category.trim() && styles.selectDisabled]}>
        <View style={styles.selectText}>
          <Text style={styles.selectTitle}>{notes || "Select previous details"}</Text>
          <Text style={styles.selectMeta}>{category.trim() ? `${existingDetails.length} previous detail${existingDetails.length === 1 ? "" : "s"}` : "Select category first"}</Text>
        </View>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showDetails ? (
        <View style={styles.options}>
          {!existingDetails.length ? <Text style={styles.emptyOption}>No previous details for this category. Type new details below.</Text> : null}
          {existingDetails.map((item) => (
            <Pressable key={item} onPress={() => { setNotes(item); setShowDetails(false); }} style={[styles.option, notes.trim().toLowerCase() === item.toLowerCase() && styles.optionSelected]}>
              <View style={styles.selectText}>
                <Text style={styles.optionTitle}>{item}</Text>
                <Text style={styles.selectMeta}>Reuse these details</Text>
              </View>
              {notes.trim().toLowerCase() === item.toLowerCase() ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput value={notes} onChangeText={setNotes} placeholder="Optional details" style={styles.input} />
      <Text style={styles.label}>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Example: 1500" style={styles.input} />
      <Text style={styles.label}>Property type</Text>
      <View style={styles.segmented}>{visiblePropertyTypes.map((item) => <Pressable key={item.value} onPress={() => selectPropertyType(item.value)} style={[styles.segment, propertyType === item.value && styles.segmentActive]}><Text style={[styles.segmentText, propertyType === item.value && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text></Pressable>)}</View>
      <Text style={styles.label}>Unit (optional)</Text>
      <Pressable onPress={() => setShowUnits((value) => !value)} style={styles.select}>
        <View style={styles.selectText}>
          <Text style={styles.selectTitle}>
            {propertyType === "bed"
              ? scopeName || "Select hostel/building"
              : selectedUnit ? roomShopTitle(selectedUnit) : `Select ${propertyLabel(propertyType).toLowerCase()}`}
          </Text>
          <Text style={styles.selectMeta}>
            {propertyType === "bed"
              ? "Hostel/building level expense"
              : selectedUnit ? unitMeta(selectedUnit) : `${propertyLabel(propertyType)} units only`}
          </Text>
        </View>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showUnits ? (
        <View style={styles.options}>
          {propertyType === "bed" ? (
            <>
              {!hostelOptions.length ? <Text style={styles.emptyOption}>No hostel/building names found.</Text> : null}
              {hostelOptions.map((name) => (
                <Pressable key={name} onPress={() => selectHostel(name)} style={[styles.option, scopeName === name && styles.optionSelected]}>
                  <View style={styles.selectText}>
                    <Text style={styles.optionTitle}>{name}</Text>
                    <Text style={styles.selectMeta}>Hostel/building expense</Text>
                  </View>
                  {scopeName === name ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              ))}
            </>
          ) : filteredUnits.map((unit) => {
            const active = String(unit._id) === String(selectedUnitId);
            return (
              <Pressable key={unit._id} onPress={() => selectUnit(unit)} style={[styles.option, active && styles.optionSelected]}>
                <View style={styles.selectText}>
                  <Text style={styles.optionTitle}>{roomShopTitle(unit)}</Text>
                  <Text style={styles.selectMeta}>{unitMeta(unit)}</Text>
                </View>
                {active ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {propertyType === "bed" ? (
        <>
          <Text style={styles.label}>Hostel/building name (manual optional)</Text>
          <TextInput value={scopeName} onChangeText={(value) => { setScopeName(value); setSelectedUnitId(""); }} placeholder="Example: Sai Hostel" style={styles.input} />
        </>
      ) : (
        <>
          <Text style={styles.label}>Unit number (manual optional)</Text>
          <TextInput value={roomNo} onChangeText={(value) => { setRoomNo(value); setSelectedUnitId(""); }} placeholder="Example: 101" style={styles.input} />
        </>
      )}
      <FormDateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
      <Text style={styles.label}>Status</Text>
      <View style={styles.segmented}>{STATUSES.map((item) => <Pressable key={item.value} onPress={() => setStatus(item.value)} style={[styles.segment, status === item.value && styles.segmentActive]}><Text style={[styles.segmentText, status === item.value && styles.segmentTextActive]} numberOfLines={1}>{item.label}</Text></Pressable>)}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={saveItem} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>{editing ? "Update expense" : "Save expense"}</Text>}</Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 18, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.text, fontSize: 24, fontWeight: "700" },
  label: { marginTop: 15, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  select: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectDisabled: { opacity: 0.6 },
  selectText: { flex: 1, minWidth: 0 },
  selectTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  selectMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  options: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, overflow: "hidden", backgroundColor: colors.surface },
  option: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  emptyOption: { padding: 14, color: colors.muted, fontSize: 13, fontWeight: "600" },
  helper: { marginTop: 8, color: colors.muted, fontSize: 12 },
  segmented: { minHeight: 68, flexDirection: "row", gap: 4, padding: 4, borderRadius: 7, backgroundColor: colors.border },
  segment: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
  error: { marginTop: 18, color: colors.danger },
  saveButton: { height: 50, marginTop: 26, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  disabled: { opacity: 0.65 },
  saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
});
