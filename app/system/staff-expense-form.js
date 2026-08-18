import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { createStaffExpense, getStaffExpenses, updateStaffExpense } from "../../src/api/staffExpenseApi";
import { systemColors as colors } from "../../src/theme/systemTheme";

const STATUSES = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
];
const EXPENSE_TYPES = [
  "Employee Salary",
  "Maushi",
  "Security",
  "Maintenance",
  "Other",
];

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function canonicalKey(value) {
  return normalizeText(value).toLowerCase();
}

export default function StaffExpenseFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const editing = Boolean(id);
  const [type, setType] = useState("Maushi");
  const [showTypes, setShowTypes] = useState(false);
  const [name, setName] = useState("");
  const [showNames, setShowNames] = useState(false);
  const [items, setItems] = useState([]);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("pending");
  const [date, setDate] = useState(toDateValue());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadItem = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const list = await getStaffExpenses();
      const records = Array.isArray(list) ? list : [];
      setItems(records);
      if (!editing) return;
      const item = records.find((entry) => String(entry._id) === String(id));
      if (!item) {
        setError("Staff expense not found.");
        return;
      }
      setType(item.type || "Maushi");
      setName(item.name || "");
      setAmount(String(item.amount ?? ""));
      setNotes(item.notes || "");
      setStatus(item.status || "pending");
      setDate(toDateValue(item.date));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load staff expense.");
    } finally {
      setLoading(false);
    }
  }, [editing, id]);

  useFocusEffect(useCallback(() => { loadItem(); }, [loadItem]));

  const existingNames = useMemo(() => {
    const names = new Map();
    items
      .filter((item) => canonicalKey(item.type) === canonicalKey(type))
      .forEach((item) => {
        const clean = normalizeText(item.name);
        if (clean && !names.has(canonicalKey(clean))) names.set(canonicalKey(clean), clean);
      });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [items, type]);

  function selectType(value) {
    setType(value);
    setShowTypes(false);
    setShowNames(false);
    if (!items.some((item) => canonicalKey(item.type) === canonicalKey(value) && canonicalKey(item.name) === canonicalKey(name))) {
      setName("");
    }
  }

  async function saveItem() {
    const numericAmount = Number(amount);
    if (!type.trim()) return setError("Select expense type.");
    if (!name.trim()) return setError("Enter staff name.");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid amount.");
    if (!date) return setError("Select a date.");

    try {
      setSaving(true);
      setError("");
      const matchedName = existingNames.find((item) => canonicalKey(item) === canonicalKey(name));
      const payload = { type: normalizeText(type), name: matchedName || normalizeText(name), amount: numericAmount, notes: notes.trim(), status, date };
      if (editing) await updateStaffExpense(id, payload);
      else await createStaffExpense(payload);
      router.replace("/system/staff-expenses");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save staff expense.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}><Pressable onPress={() => router.replace("/system/staff-expenses")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><Text style={styles.title}>{editing ? "Edit staff expense" : "Add staff expense"}</Text></View>
      <Text style={styles.label}>Expense type</Text>
      <Pressable onPress={() => setShowTypes((value) => !value)} style={styles.select}>
        <Text style={styles.selectValue}>{type}</Text>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showTypes ? (
        <View style={styles.options}>
          {EXPENSE_TYPES.map((item) => (
            <Pressable key={item} onPress={() => selectType(item)} style={[styles.option, type === item && styles.optionSelected]}>
              <Text style={[styles.optionText, type === item && styles.optionTextActive]}>{item}</Text>
              {type === item ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.label}>Name (Employee / Cleaning Lady)</Text>
      <Pressable onPress={() => setShowNames((value) => !value)} style={styles.select}>
        <View style={styles.selectText}>
          <Text style={styles.selectValue}>{name || `Select existing ${type.toLowerCase()} name`}</Text>
          <Text style={styles.selectMeta}>{existingNames.length ? `${existingNames.length} existing name${existingNames.length === 1 ? "" : "s"}` : "No existing names yet"}</Text>
        </View>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showNames ? (
        <View style={styles.options}>
          {!existingNames.length ? <Text style={styles.emptyOption}>No previous names for {type}. Type a new name below.</Text> : null}
          {existingNames.map((item) => (
            <Pressable key={item} onPress={() => { setName(item); setShowNames(false); }} style={[styles.option, canonicalKey(name) === canonicalKey(item) && styles.optionSelected]}>
              <Text style={[styles.optionText, canonicalKey(name) === canonicalKey(item) && styles.optionTextActive]}>{item}</Text>
              {canonicalKey(name) === canonicalKey(item) ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.helper}>Use an existing name when possible. Type below only for a new staff member.</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Sunita (Cleaning Lady)" style={styles.input} />
      <FormDateField label="Month" value={date} onChange={setDate} maximumDate={new Date()} />
      <Text style={styles.label}>Amount (Rs.)</Text>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Example: 10000" style={styles.input} />
      <Text style={styles.label}>Notes / Details</Text>
      <TextInput value={notes} onChangeText={setNotes} placeholder="e.g. Monthly salary, extra cleaning on weekend, etc." multiline style={[styles.input, styles.textArea]} />
      <Text style={styles.label}>Status</Text>
      <View style={styles.segmented}>{STATUSES.map((item) => <Pressable key={item.value} onPress={() => setStatus(item.value)} style={[styles.segment, status === item.value && styles.segmentActive]}><Text style={[styles.segmentText, status === item.value && styles.segmentTextActive]}>{item.label}</Text></Pressable>)}</View>
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
  textArea: { minHeight: 86, paddingTop: 12, paddingBottom: 12, textAlignVertical: "top" },
  select: { minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectText: { flex: 1, minWidth: 0 },
  selectValue: { color: colors.text, fontSize: 16 },
  selectMeta: { marginTop: 3, color: colors.muted, fontSize: 11 },
  options: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  option: { minHeight: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, color: colors.text, fontSize: 14 },
  optionTextActive: { color: colors.primary, fontWeight: "800" },
  emptyOption: { padding: 14, color: colors.muted, fontSize: 13, fontWeight: "600" },
  helper: { marginTop: 8, color: colors.muted, fontSize: 12 },
  segmented: { flexDirection: "row", padding: 4, borderRadius: 7, backgroundColor: colors.border },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
  error: { marginTop: 18, color: colors.danger },
  saveButton: { height: 50, marginTop: 26, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  disabled: { opacity: 0.65 },
  saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
});
