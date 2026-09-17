import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { getRooms, updateBed, updateUnit } from "../../src/api/roomApi";
import { createTenant, getTenants } from "../../src/api/tenantApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { ASSIGNMENT_TYPES, filterVacanciesByType, formatVacancyMeta, formatVacancyTitle, groupVacanciesByProperty, stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

function todayValue() {
  return toDateValue();
}

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function emptyUnitDraft(type = "bed") {
  return {
    category: "",
    floorNo: "",
    roomNo: "",
    wingName: "",
    flatType: "",
    meterNo: "",
    lastMeterReading: "",
    monthlyPrice: "",
    bedCategory: type === "bed" ? "Standard" : "",
  };
}

function unitDetailLabels(type) {
  if (type === "shop") {
    return {
      category: "Market or building",
      number: "Shop number",
      numberPlaceholder: "Example: S-12",
      price: "Monthly shop rent",
    };
  }
  if (type === "room") {
    return {
      category: "Property or building",
      number: "Room or unit number",
      numberPlaceholder: "Example: A-101",
      price: "Monthly room rent",
    };
  }
  return {
    category: "Hostel or building",
    number: "Room number",
    numberPlaceholder: "Example: 101",
    price: "Monthly price per bed",
  };
}

function isActive(tenant) {
  if (!tenant.leaveDate) return true;
  const value = new Date(tenant.leaveDate);
  return Number.isNaN(value.getTime()) || value > new Date();
}

function buildVacancies(units, tenants) {
  const active = tenants.filter(isActive);
  const occupied = (unit, bed) => active.some((tenant) => {
    const sameRoom = tenant.roomId
      ? String(tenant.roomId) === String(unit._id)
      : String(tenant.category || "") === String(unit.category || "") &&
        String(tenant.wingName || "") === String(unit.wingName || "") &&
        String(tenant.roomNo || "") === String(unit.roomNo || "");
    if (!sameRoom) return false;
    return unit.propertyType === "bed" ? String(tenant.bedNo || "") === String(bed.bedNo || "") : true;
  });

  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    if (unit.propertyType === "bed") {
      return beds.filter((bed) => !occupied(unit, bed)).map((bed) => ({ unit, bed }));
    }
    const slot = beds[0];
    return slot && !occupied(unit, slot) ? [{ unit, bed: slot }] : [];
  });
}

export default function TenantFormScreen() {
  const router = useRouter();
  const { unitTypes, firstUnitType, isUnitTypeAllowed } = useSystemAccess();
  const visibleAssignmentTypes = useMemo(
    () => ASSIGNMENT_TYPES.filter((item) => unitTypes.some((allowed) => allowed.value === item.value)),
    [unitTypes]
  );
  const [vacancies, setVacancies] = useState([]);
  const [assignmentType, setAssignmentType] = useState(firstUnitType);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showUnits, setShowUnits] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joiningDate, setJoiningDate] = useState(todayValue());
  const [deposit, setDeposit] = useState("");
  const [address, setAddress] = useState("");
  const [hasCanteen, setHasCanteen] = useState(false);
  const [unitDraft, setUnitDraft] = useState(() => emptyUnitDraft(firstUnitType));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [units, tenants] = await Promise.all([getRooms(), getTenants()]);
      const allowedUnits = (Array.isArray(units) ? units : [])
        .filter((unit) => isUnitTypeAllowed(unit.propertyType || "bed"));
      setVacancies(buildVacancies(allowedUnits, Array.isArray(tenants) ? tenants : []));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load vacant units.");
    } finally {
      setLoading(false);
    }
  }, [isUnitTypeAllowed]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useEffect(() => {
    if (!isUnitTypeAllowed(assignmentType)) setAssignmentType(firstUnitType);
  }, [assignmentType, firstUnitType, isUnitTypeAllowed]);
  const filteredVacancies = useMemo(() => filterVacanciesByType(vacancies, assignmentType), [assignmentType, vacancies]);
  const groupedVacancies = useMemo(() => groupVacanciesByProperty(filteredVacancies), [filteredVacancies]);
  const selected = filteredVacancies[selectedIndex];
  const needsUnitDetails = Boolean(selected?.unit?.isPlaceholder);
  const draftRent = Number(unitDraft.monthlyPrice || 0);
  const rent = needsUnitDetails ? draftRent : Number(selected?.bed?.price || 0);
  const detailLabels = useMemo(() => unitDetailLabels(assignmentType), [assignmentType]);
  const selectionLabel = useMemo(() => {
    if (!selected) return "Select a vacant unit";
    return `${formatVacancyTitle(selected.unit)} | ${formatVacancyMeta(selected.unit, selected.bed)}`;
  }, [selected]);

  function updateDraft(key, value) {
    setUnitDraft((current) => ({ ...current, [key]: value }));
  }

  function selectAssignmentType(value) {
    setAssignmentType(value);
    setSelectedIndex(0);
    setShowUnits(false);
    setUnitDraft(emptyUnitDraft(value));
    setError("");
  }

  function selectVacancy(index) {
    setSelectedIndex(index);
    setShowUnits(false);
    setUnitDraft(emptyUnitDraft(assignmentType));
    setError("");
  }

  async function saveTenant() {
    const depositAmount = Number(deposit);
    if (!name.trim()) return setError("Enter the tenant name.");
    if (!/^\d{10}$/.test(phone.trim())) return setError("Enter a valid 10-digit phone number.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate.trim())) return setError("Use YYYY-MM-DD for joining date.");
    if (!Number.isFinite(depositAmount) || depositAmount < 0) return setError("Enter a valid deposit amount.");
    if (!selected) return setError("Select a vacant unit.");

    const unitRent = Number(unitDraft.monthlyPrice);
    const meterReading =
      unitDraft.lastMeterReading === "" ? null : Number(unitDraft.lastMeterReading);
    if (needsUnitDetails) {
      if (!unitDraft.category.trim() || !unitDraft.floorNo.trim() || !unitDraft.roomNo.trim()) {
        return setError(`${detailLabels.category}, floor and ${detailLabels.number.toLowerCase()} are required.`);
      }
      if (assignmentType === "room" && !unitDraft.flatType.trim()) {
        return setError("Enter the flat type.");
      }
      if (!Number.isFinite(unitRent) || unitRent <= 0) {
        return setError("Enter a valid monthly rent.");
      }
      if (unitDraft.lastMeterReading !== "" && (!Number.isFinite(meterReading) || meterReading < 0)) {
        return setError("Enter a valid last meter reading.");
      }
    }

    try {
      setSaving(true);
      setError("");
      let unitForTenant = selected.unit;
      let bedForTenant = selected.bed;
      let rentForTenant = rent;

      if (needsUnitDetails) {
        await updateBed(selected.unit._id, selected.bed.bedNo, {
          price: unitRent,
          bedCategory:
            assignmentType === "shop"
              ? "Shop"
              : assignmentType === "room"
                ? "Rental Room"
                : unitDraft.bedCategory.trim() || "Standard",
        });
        const updatedUnit = await updateUnit(selected.unit._id, {
          category: unitDraft.category.trim(),
          floorNo: unitDraft.floorNo.trim(),
          roomNo: normalizeIdentifier(unitDraft.roomNo),
          hasWing: Boolean(unitDraft.wingName.trim()),
          wingName: unitDraft.wingName.trim(),
          flatType: assignmentType === "room" ? unitDraft.flatType.trim() : "",
          meterNo: normalizeIdentifier(unitDraft.meterNo),
          lastMeterReading: meterReading,
        });
        unitForTenant = updatedUnit;
        bedForTenant = {
          ...selected.bed,
          price: unitRent,
          bedCategory: unitDraft.bedCategory.trim() || selected.bed.bedCategory,
        };
        rentForTenant = unitRent;
      }

      await createTenant({
        name: name.trim(),
        phoneNo: Number(phone),
        joiningDate: joiningDate.trim(),
        depositAmount,
        address: address.trim(),
        category: unitForTenant.category || "",
        roomId: unitForTenant._id,
        hasWing: Boolean(unitForTenant.hasWing && unitForTenant.wingName),
        wingName: unitForTenant.wingName || "",
        floorNo: unitForTenant.floorNo || "",
        roomNo: unitForTenant.roomNo || "",
        bedNo: bedForTenant.bedNo || "",
        baseRent: rentForTenant,
        hasCanteen: assignmentType === "bed" ? hasCanteen : false,
      });
      router.replace("/system/tenants");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to add tenant.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/tenants")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View><Text style={styles.title}>Add tenant</Text><Text style={styles.subtitle}>{vacancies.length} vacant units available</Text></View>
      </View>

      <Text style={styles.label}>Where are we adding this tenant?</Text>
      <View style={styles.typeSegment}>{visibleAssignmentTypes.map((type) => {
        const active = assignmentType === type.value;
        const count = filterVacanciesByType(vacancies, type.value).length;
        return <Pressable key={type.value} onPress={() => selectAssignmentType(type.value)} style={[styles.typeButton, active && styles.segmentActive]}><Text style={[styles.typeText, active && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(type.label)}</Text><Text style={[styles.typeCount, active && styles.segmentTextActive]} numberOfLines={1}>{count} vacant</Text></Pressable>;
      })}</View>
      <Text style={styles.label}>Vacant unit</Text>
      <Pressable onPress={() => setShowUnits((value) => !value)} disabled={!filteredVacancies.length} style={[styles.select, !filteredVacancies.length && styles.disabled]}>
        <Text style={styles.selectText} numberOfLines={2}>{selectionLabel}</Text>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      {showUnits ? (
        <View style={styles.options}>
          {groupedVacancies.map((group) => <View key={group.propertyName}><Text style={styles.optionGroupTitle}>{group.propertyName}</Text>{group.vacancies.map(({ unit, bed }) => {
            const index = filteredVacancies.findIndex((vacancy) => String(vacancy.unit._id) === String(unit._id) && String(vacancy.bed?.bedNo || "") === String(bed?.bedNo || ""));
            return <Pressable key={`${unit._id}-${bed.bedNo}`} onPress={() => selectVacancy(index)} style={[styles.option, index === selectedIndex && styles.optionSelected]}><View style={styles.optionText}><Text style={styles.optionTitle}>{formatVacancyTitle(unit)}</Text><Text style={styles.optionMeta}>{formatVacancyMeta(unit, bed)}</Text></View>{index === selectedIndex ? <Check size={18} color={colors.primary} /> : null}</Pressable>;
          })}</View>)}
        </View>
      ) : null}

      {needsUnitDetails ? (
        <View style={styles.unitDetailsPanel}>
          <Text style={styles.panelTitle}>Set unit details first</Text>
          <Text style={styles.panelHint}>This unit is already added, but room or unit details are not set yet. Set them here first, then save the tenant.</Text>

          <Text style={styles.label}>{detailLabels.category}</Text>
          <TextInput value={unitDraft.category} onChangeText={(value) => updateDraft("category", value)} placeholder={`Enter ${detailLabels.category.toLowerCase()}`} style={styles.input} />

          <Text style={styles.label}>Floor</Text>
          <TextInput value={unitDraft.floorNo} onChangeText={(value) => updateDraft("floorNo", value)} placeholder="Example: Ground or 1" style={styles.input} />

          <Text style={styles.label}>Wing or block (optional)</Text>
          <TextInput value={unitDraft.wingName} onChangeText={(value) => updateDraft("wingName", value)} placeholder="Example: A" style={styles.input} />

          {assignmentType === "room" ? (
            <>
              <Text style={styles.label}>Flat type</Text>
              <TextInput value={unitDraft.flatType} onChangeText={(value) => updateDraft("flatType", value)} placeholder="Example: 1 RK or 1 BHK" style={styles.input} />
            </>
          ) : null}

          <Text style={styles.label}>{detailLabels.number}</Text>
          <TextInput value={unitDraft.roomNo} onChangeText={(value) => updateDraft("roomNo", value)} placeholder={detailLabels.numberPlaceholder} style={styles.input} />

          <Text style={styles.label}>Meter number (optional)</Text>
          <TextInput value={unitDraft.meterNo} onChangeText={(value) => updateDraft("meterNo", value)} placeholder="Example: MTR-101" style={styles.input} />

          <Text style={styles.label}>Last meter reading (optional)</Text>
          <TextInput value={unitDraft.lastMeterReading} onChangeText={(value) => updateDraft("lastMeterReading", value)} keyboardType="numeric" placeholder="Example: 250" style={styles.input} />

          {assignmentType === "bed" ? (
            <>
              <Text style={styles.label}>Bed category</Text>
              <TextInput value={unitDraft.bedCategory} onChangeText={(value) => updateDraft("bedCategory", value)} placeholder="Example: Standard" style={styles.input} />
            </>
          ) : null}

          <Text style={styles.label}>{detailLabels.price}</Text>
          <TextInput value={unitDraft.monthlyPrice} onChangeText={(value) => updateDraft("monthlyPrice", value)} keyboardType="numeric" placeholder="Example: 5000" style={styles.input} />
        </View>
      ) : null}

      <Text style={styles.label}>Full name</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Tenant name" style={styles.input} />
      <Text style={styles.label}>Phone number</Text>
      <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} placeholder="10-digit mobile number" style={styles.input} />
      <FormDateField label="Joining date" value={joiningDate} onChange={setJoiningDate} maximumDate={new Date()} />
      {assignmentType === "bed" ? <>
        <Text style={styles.label}>Canteen facility</Text>
        <View style={styles.segment}>
          {[[true, "Yes"], [false, "No"]].map(([value, label]) => (
            <Pressable key={label} onPress={() => setHasCanteen(value)} style={[styles.segmentButton, hasCanteen === value && styles.segmentActive]}>
              <Text style={[styles.segmentText, hasCanteen === value && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </> : null}
      <Text style={styles.label}>Deposit amount</Text>
      <TextInput value={deposit} onChangeText={setDeposit} keyboardType="numeric" placeholder="Example: 10000" style={styles.input} />
      <Text style={styles.label}>Monthly rent</Text>
      <View style={styles.readOnly}><Text style={styles.readOnlyText}>Rs. {rent}</Text></View>
      <Text style={styles.label}>Address (optional)</Text>
      <TextInput value={address} onChangeText={setAddress} placeholder="Tenant address" multiline style={[styles.input, styles.addressInput]} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={saveTenant} disabled={saving || !selected} style={[styles.saveButton, (saving || !selected) && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Save tenant</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  addressInput: { height: 82, paddingTop: 13, textAlignVertical: "top" },
  select: { minHeight: 58, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectText: { flex: 1, paddingRight: 8, color: colors.text, fontWeight: "600" },
  options: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  optionGroupTitle: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 12, fontWeight: "800", backgroundColor: colors.surfaceSoft },
  option: { minHeight: 62, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1 },
  optionTitle: { color: colors.text, fontWeight: "700" },
  optionMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  unitDetailsPanel: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: 8, backgroundColor: colors.surface },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  panelHint: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 17 },
  typeSegment: { padding: 4, flexDirection: "row", gap: 4, borderRadius: 7, backgroundColor: colors.border },
  typeButton: { flex: 1, minWidth: 0, minHeight: 68, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  typeText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  typeCount: { width: "100%", marginTop: 3, color: colors.subtle, fontSize: 10, fontWeight: "600", textAlign: "center" },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segmentTextActive: { color: colors.primaryDark },
  segment: { height: 48, padding: 3, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  readOnly: { height: 50, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surfaceSoft },
  readOnlyText: { color: colors.muted, fontSize: 16, fontWeight: "700" },
  error: { marginTop: 14, color: colors.danger },
  saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  saveButtonText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
