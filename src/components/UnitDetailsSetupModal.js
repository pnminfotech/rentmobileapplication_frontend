import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { getBedCategories, getRoomCategories, updateBed, updateBedCategories, updateUnit } from "../api/roomApi";

const DEFAULT_BED_CATEGORIES = ["Standard", "Single",  "Bunk"];
const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
const keyOf = (value) => normalize(value).toLowerCase();
const unique = (values) => Array.from(new Map(values.map((value) => [keyOf(value), normalize(value)])).values()).filter(Boolean);
const normalizeRoomCategory = (value) => normalize(value).toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);

function Field({ label, required, value, onChange, options = [], numeric, clearOnFocus, placeholder, normalizeOnBlur }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null);
  const filtered = options.filter((option) => query == null || !query || keyOf(option).includes(keyOf(query))).slice(0, 8);
  return <View style={s.fieldWrap}>
    <Text style={s.label}>{label}{required ? <Text style={s.required}> *</Text> : null}</Text>
    <View style={s.select}>
      <TextInput value={value} placeholder={placeholder} placeholderTextColor="#98A2B3" onFocus={() => { if (clearOnFocus) onChange(""); setQuery(null); setOpen(true); }} onBlur={() => { if (normalizeOnBlur && value) { onChange(normalizeOnBlur(value)); setQuery(null); } }} onChangeText={(text) => { onChange(text); setQuery(text); setOpen(true); }} keyboardType={numeric ? "numeric" : "default"} style={s.selectInput} />
      {options.length ? <Pressable onPress={() => { setQuery(null); setOpen((current) => !current); }} style={s.selectArrow}><ChevronDown size={18} color="#63738A" /></Pressable> : null}
    </View>
    {open && filtered.length ? <View style={s.options}>{filtered.map((item) => <Pressable key={item} onPress={() => { onChange(item); setQuery(null); setOpen(false); }} style={s.option}><Text style={s.optionText}>{item}</Text></Pressable>)}</View> : null}
  </View>;
}

export default function UnitDetailsSetupModal({ visible, unit, bed, savedUnits = [], onClose, onSaved }) {
  const type = unit?.propertyType || "bed";
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showMeter, setShowMeter] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_BED_CATEGORIES);
  const [roomCategoryOptions, setRoomCategoryOptions] = useState([]);
  const [categoryEditor, setCategoryEditor] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    let active = true;
    getBedCategories().then((categories) => {
      if (active && categories.length) setCategoryOptions(categories);
    }).catch(() => {});
    getRoomCategories().then((categories) => {
      if (active) setRoomCategoryOptions(categories.map(normalizeRoomCategory).filter(Boolean));
    }).catch(() => {});
    setForm({
      category: unit?.isPlaceholder ? "" : normalize(unit?.category),
      floorNo: unit?.isPlaceholder ? "" : normalize(unit?.floorNo),
      wingName: unit?.isPlaceholder ? "" : normalize(unit?.wingName),
      roomNo: unit?.isPlaceholder ? "" : normalize(unit?.roomNo),
      flatType: unit?.isPlaceholder ? "" : normalize(unit?.flatType),
      meterNo: unit?.isPlaceholder ? "" : normalize(unit?.meterNo),
      lastMeterReading: unit?.isPlaceholder || unit?.lastMeterReading == null ? "" : String(unit.lastMeterReading),
      bedCategory: keyOf(bed?.bedCategory) === "unassigned" ? "Standard" : normalize(bed?.bedCategory) || "Standard",
      roomCategory: unit?.isPlaceholder ? "" : normalizeRoomCategory(unit?.roomCategory),
      bedNo: normalize(bed?.bedNo),
      monthlyPrice: bed?.price > 0 ? String(bed.price) : "",
    });
    setShowMeter(Boolean(unit?.meterNo || unit?.lastMeterReading != null));
    setError("");
    setCategoryEditor("");
    setCategoryName("");
    return () => { active = false; };
  }, [visible, unit?._id, bed?.bedNo]);

  const options = useMemo(() => {
    const existing = savedUnits.filter((item) => !item?.isPlaceholder);
    const matchingCategory = existing.filter((item) => !form.category || keyOf(item.category) === keyOf(form.category));
    const matchingFloor = matchingCategory.filter((item) => !form.floorNo || keyOf(item.floorNo) === keyOf(form.floorNo));
    return {
      category: unique(existing.map((item) => item.category)),
      floorNo: unique(matchingCategory.map((item) => item.floorNo)),
      wingName: unique(matchingFloor.map((item) => item.wingName)),
      flatType: unique(matchingFloor.map((item) => item.flatType)),
      roomNo: unique(matchingFloor.map((item) => item.roomNo)),
      roomCategory: unique([...roomCategoryOptions, ...existing.map((item) => normalizeRoomCategory(item.roomCategory))]),
      bedCategory: unique([...categoryOptions, ...existing.flatMap((item) => (item.beds || []).map((itemBed) => itemBed.bedCategory))]),
    };
  }, [savedUnits, form.category, form.floorNo, categoryOptions, roomCategoryOptions]);

  const set = (field, value) => { setForm((old) => ({ ...old, [field]: value })); setError(""); };
  const nameLabels = type === "shop"
    ? ["Market or building", "Shop number", "Monthly shop rent"]
    : type === "room"
      ? ["Property or building", "Room or unit number", "Monthly room rent"]
      : ["Hostel or building", "Room number", "Monthly price per bed"];

  async function saveCategory() {
    const nextName = normalize(categoryName);
    if (!nextName) return;
    const renameFrom = categoryEditor === "rename" ? normalize(form.bedCategory) : "";
    const nextOptions = unique([...categoryOptions.filter((item) => !renameFrom || keyOf(item) !== keyOf(renameFrom)), nextName]);
    try {
      const savedOptions = await updateBedCategories(nextOptions, renameFrom, renameFrom ? nextName : "");
      setCategoryOptions(savedOptions.length ? savedOptions : nextOptions);
    } catch (err) {
      Alert.alert("Unable to save bed category", err.response?.data?.message || "Please try again.");
      return;
    }
    set("bedCategory", nextName);
    setCategoryEditor("");
    setCategoryName("");
  }

  async function save() {
    const category = normalize(form.category);
    const floorNo = normalize(form.floorNo);
    const roomNo = normalize(form.roomNo);
    const bedNo = normalize(form.bedNo);
    const monthlyPrice = Number(form.monthlyPrice);
    const meterReading = form.lastMeterReading === "" ? null : Number(form.lastMeterReading);
    if (!category || !floorNo || !roomNo || !form.monthlyPrice || (type === "bed" && (!bedNo || !normalize(form.bedCategory))) || (type === "room" && !normalize(form.flatType))) {
      setError("Complete all required unit details.");
      return;
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) { setError("Enter a valid monthly rent greater than 0."); return; }
    if (form.lastMeterReading !== "" && (!Number.isFinite(meterReading) || meterReading < 0)) { setError("Enter a valid last meter reading."); return; }

    const roomConflict = savedUnits.some((item) => String(item?._id || "") !== String(unit?._id || "") && !item?.isPlaceholder && keyOf(item.category) === keyOf(category) && keyOf(item.floorNo) === keyOf(floorNo) && keyOf(item.roomNo) === keyOf(roomNo) && (type !== "bed" || (item.beds || []).some((itemBed) => keyOf(itemBed.bedNo) === keyOf(bedNo))));
    if (roomConflict) { setError(type === "bed" ? "This bed number already exists in this room." : "This unit number already exists on this floor."); return; }

    try {
      setSaving(true);
      setError("");
      const bedCategory = type === "shop" ? "Shop" : type === "room" ? "Rental Room" : normalize(form.bedCategory) || "Standard";
      if (type === "bed" && !categoryOptions.some((item) => keyOf(item) === keyOf(bedCategory))) {
        const savedOptions = await updateBedCategories([...categoryOptions, bedCategory]);
        setCategoryOptions(savedOptions.length ? savedOptions : unique([...categoryOptions, bedCategory]));
      }
      const bedResult = await updateBed(unit._id, bed?.bedNo || "1", {
        price: monthlyPrice,
        newBedNo: type === "bed" ? bedNo : undefined,
        bedCategory,
      });
      const unitResult = await updateUnit(unit._id, {
        category,
        roomCategory: type === "bed" ? normalizeRoomCategory(form.roomCategory) : "",
        floorNo,
        wingName: normalize(form.wingName),
        hasWing: Boolean(normalize(form.wingName)),
        roomNo,
        flatType: type === "room" ? normalize(form.flatType) : "",
        meterNo: normalize(form.meterNo),
        lastMeterReading: meterReading,
      });
      const resultBed = bedResult?.bed || bedResult?.beds?.find?.((item) => keyOf(item.bedNo) === keyOf(bedNo)) || {
        ...bed,
        bedNo: type === "bed" ? bedNo : bed?.bedNo,
        price: monthlyPrice,
        bedCategory,
      };
      const resultUnit = {
        ...unit,
        ...(unitResult?.unit || unitResult || {}),
        category,
        roomCategory: type === "bed" ? normalizeRoomCategory(form.roomCategory) : "",
        floorNo,
        wingName: normalize(form.wingName),
        hasWing: Boolean(normalize(form.wingName)),
        roomNo,
        flatType: type === "room" ? normalize(form.flatType) : "",
        meterNo: normalize(form.meterNo),
        lastMeterReading: meterReading,
        isPlaceholder: false,
        beds: (unitResult?.beds || unit?.beds || []).map((item) => keyOf(item.bedNo) === keyOf(bed?.bedNo) ? { ...item, ...resultBed } : item),
      };
      if (!resultUnit.beds.some((item) => keyOf(item.bedNo) === keyOf(resultBed.bedNo))) resultUnit.beds = [...resultUnit.beds, resultBed];
      await onSaved?.({ unit: resultUnit, bed: resultBed });
    } catch (err) {
      const message = err.response?.data?.message || err.message || "Please try again.";
      setError(message);
      Alert.alert("Unable to save unit", message);
    } finally {
      setSaving(false);
    }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onClose}>
    <View style={s.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
      <View style={s.card}>
        <View style={s.header}><View style={s.headerCopy}><Text style={s.title}>Set unit details</Text><Text style={s.hint}>Complete these details once before assigning a tenant.</Text></View><Pressable onPress={onClose} disabled={saving} style={s.close}><Text style={s.closeText}>Close</Text></Pressable></View>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Field label={nameLabels[0]} required value={form.category || ""} onChange={(value) => set("category", value)} options={options.category} placeholder="Enter property name" />
          <Field label="Floor" required value={form.floorNo || ""} onChange={(value) => set("floorNo", value)} options={options.floorNo} placeholder="Example: Ground or 1" />
          <Field label="Wing or block (optional)" value={form.wingName || ""} onChange={(value) => set("wingName", value)} options={options.wingName} placeholder="Example: A" />
          {type === "room" ? <Field label="Flat type" required value={form.flatType || ""} onChange={(value) => set("flatType", value)} options={options.flatType} placeholder="Example: 1 BHK" /> : null}
          <Field label={nameLabels[1]} required value={form.roomNo || ""} onChange={(value) => set("roomNo", value)} options={options.roomNo} placeholder={type === "shop" ? "Example: S-01" : "Example: 101"} />
          {type === "bed" ? <Field label="Room category" value={form.roomCategory || ""} onChange={(value) => set("roomCategory", value)} options={options.roomCategory} normalizeOnBlur={normalizeRoomCategory} placeholder="Example: Premium" /> : null}
          {showMeter ? <><Field label="Meter number (optional)" value={form.meterNo || ""} onChange={(value) => set("meterNo", value)} options={[]} placeholder="Example: MTR-101" /><Field label="Last meter reading (optional)" value={form.lastMeterReading || ""} onChange={(value) => set("lastMeterReading", value.replace(/[^0-9.]/g, ""))} numeric placeholder="Example: 250" /><Pressable onPress={() => { set("meterNo", ""); set("lastMeterReading", ""); setShowMeter(false); }}><Text style={s.link}>Skip for now / add later</Text></Pressable></> : <Pressable onPress={() => setShowMeter(true)} style={s.addMeter}><Text style={s.addMeterText}>Add meter details</Text></Pressable>}
          {type === "bed" ? <>
            <Field label="Bed number" required value={form.bedNo || ""} onChange={(value) => set("bedNo", value)} clearOnFocus={Boolean(unit?.isPlaceholder)} placeholder="Example: B1" />
            <Field label="Bed category" required value={form.bedCategory || ""} onChange={(value) => set("bedCategory", value)} options={options.bedCategory} placeholder="Select or type category" />
            <View style={s.categoryActions}><Pressable onPress={() => { setCategoryEditor("add"); setCategoryName(""); }} style={s.categoryAction}><Text style={s.categoryActionText}>+ Add category</Text></Pressable><Pressable onPress={() => { setCategoryEditor("rename"); setCategoryName(form.bedCategory || ""); }} style={s.categoryAction}><Text style={s.categoryActionText}>Rename selected</Text></Pressable></View>
            {categoryEditor ? <View style={s.categoryEditor}><TextInput value={categoryName} onChangeText={setCategoryName} placeholder="Enter category" placeholderTextColor="#98A2B3" style={s.categoryInput} /><Pressable onPress={saveCategory} style={s.categorySave}><Text style={s.categorySaveText}>Save</Text></Pressable></View> : null}
          </> : null}
          <Field label={nameLabels[2]} required value={form.monthlyPrice || ""} onChange={(value) => set("monthlyPrice", value.replace(/[^0-9.]/g, ""))} numeric placeholder="Example: 5000" />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable onPress={save} disabled={saving} style={s.save}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Save unit details</Text>}</Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(16,31,43,.45)" },
  card: { maxHeight: "88%", borderRadius: 14, backgroundColor: "#fff", overflow: "hidden" },
  header: { padding: 18, flexDirection: "row", gap: 12, borderBottomWidth: 1, borderColor: "#D9E1E7" },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: "900", color: "#111B2A" },
  hint: { marginTop: 5, color: "#63738A", lineHeight: 18 },
  close: { alignSelf: "flex-start", padding: 8, borderRadius: 8, backgroundColor: "#E7F1F8" },
  closeText: { color: "#244F70", fontWeight: "900", fontSize: 12 },
  body: { padding: 18, paddingBottom: 22 },
  fieldWrap: { marginTop: 10 },
  label: { marginBottom: 5, fontWeight: "800", color: "#111B2A" },
  required: { color: "#C33737" },
  select: { minHeight: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D9E1E7", borderRadius: 7 },
  selectInput: { flex: 1, height: 44, paddingHorizontal: 11, color: "#111B2A" },
  selectArrow: { width: 42, height: 44, alignItems: "center", justifyContent: "center" },
  options: { borderWidth: 1, borderColor: "#D9E1E7", borderTopWidth: 0, borderRadius: 7, backgroundColor: "#fff" },
  option: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#EEF2F4" },
  optionText: { color: "#111B2A", fontWeight: "700" },
  categoryActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  categoryAction: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#4F7FA6", borderRadius: 7, backgroundColor: "#E7F1F8" },
  categoryActionText: { color: "#244F70", fontWeight: "900", fontSize: 12 },
  categoryEditor: { flexDirection: "row", gap: 8, marginTop: 8 },
  categoryInput: { flex: 1, height: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: "#D9E1E7", borderRadius: 7, color: "#111B2A" },
  categorySave: { paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#244F70" },
  categorySaveText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  addMeter: { height: 42, marginTop: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D9E1E7", borderRadius: 7, backgroundColor: "#E7F1F8" },
  addMeterText: { color: "#4F7FA6", fontWeight: "800" },
  link: { marginTop: 9, color: "#4F7FA6", textAlign: "right", fontSize: 12, fontWeight: "800" },
  error: { marginTop: 12, color: "#C33737", fontWeight: "700" },
  save: { height: 50, marginTop: 20, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#4F7FA6" },
  saveText: { color: "#fff", fontWeight: "900" },
});
