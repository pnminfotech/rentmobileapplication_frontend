import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { getRooms } from "../../src/api/roomApi";
import { getShiftRentPreview, getTenant, getTenantRentDue, getTenants, shiftTenant } from "../../src/api/tenantApi";
import { ASSIGNMENT_TYPES, filterVacanciesByType, formatTenantUnit, formatVacancyMeta, formatVacancyTitle, groupVacanciesByProperty, propertyTypeFromTenant, unitTypeLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

function isActive(tenant) {
  if (!tenant.leaveDate) return true;
  const date = new Date(tenant.leaveDate);
  return Number.isNaN(date.getTime()) || date > new Date();
}

function isCurrentAssignment(vacancyUnit, vacancyBed, currentTenant) {
  if (!currentTenant || !vacancyUnit) return false;
  const sameUnit = currentTenant.roomId
    ? String(currentTenant.roomId) === String(vacancyUnit._id)
    : String(currentTenant.category || "") === String(vacancyUnit.category || "") &&
      String(currentTenant.wingName || "") === String(vacancyUnit.wingName || "") &&
      String(currentTenant.roomNo || "") === String(vacancyUnit.roomNo || "");
  if (!sameUnit) return false;
  if (vacancyUnit.propertyType !== "bed") return true;
  return String(currentTenant.bedNo || "") === String(vacancyBed?.bedNo || "");
}

function vacanciesFor(units, tenants, currentTenant) {
  const currentTenantId = currentTenant?._id;
  const active = tenants.filter((tenant) => String(tenant._id) !== String(currentTenantId) && isActive(tenant));
  const occupied = (unit, bed) => active.some((tenant) => {
    const sameUnit = tenant.roomId
      ? String(tenant.roomId) === String(unit._id)
      : String(tenant.category || "") === String(unit.category || "") &&
        String(tenant.wingName || "") === String(unit.wingName || "") &&
        String(tenant.roomNo || "") === String(unit.roomNo || "");
    return sameUnit && (unit.propertyType !== "bed" || String(tenant.bedNo || "") === String(bed.bedNo || ""));
  });
  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    if (unit.propertyType === "bed") {
      return beds
        .filter((bed) => !occupied(unit, bed))
        .filter((bed) => !isCurrentAssignment(unit, bed, currentTenant))
        .map((bed) => ({ unit, bed }));
    }
    return beds[0] && !occupied(unit, beds[0]) && !isCurrentAssignment(unit, beds[0], currentTenant) ? [{ unit, bed: beds[0] }] : [];
  });
}

export default function TenantShiftScreen() {
  const router = useRouter();
  const { id, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [tenant, setTenant] = useState(null);
  const [vacancies, setVacancies] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(toDateValue());
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [tenantData, units, tenants, dueData] = await Promise.all([getTenant(id), getRooms(), getTenants(), getTenantRentDue(id)]);
      setTenant(tenantData);
      setSelectedIndex(0);
      setVacancies(vacanciesFor(Array.isArray(units) ? units : [], Array.isArray(tenants) ? tenants : [], tenantData));
      setDue(Number(dueData.totalDue || 0));
    } catch (err) { setError(err.response?.data?.message || "Unable to load shift options."); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const tenantType = useMemo(() => propertyTypeFromTenant(tenant || {}), [tenant]);
  const filteredVacancies = useMemo(() => filterVacanciesByType(vacancies, tenantType), [tenantType, vacancies]);
  const groupedVacancies = useMemo(() => groupVacanciesByProperty(filteredVacancies), [filteredVacancies]);
  const selected = filteredVacancies[selectedIndex];
  const typeInfo = ASSIGNMENT_TYPES.find((type) => type.value === tenantType) || ASSIGNMENT_TYPES[0];
  useEffect(() => {
    if (!selected || !effectiveDate) { setPreview(null); return; }
    let active = true;
    setPreviewing(true);
    getShiftRentPreview(id, { targetUnitId: selected.unit._id, targetBedNo: selected.bed.bedNo, effectiveDate })
      .then((data) => { if (active) setPreview(data); })
      .catch(() => { if (active) setPreview(null); })
      .finally(() => { if (active) setPreviewing(false); });
    return () => { active = false; };
  }, [effectiveDate, id, selected]);

  function shortDate(value) {
    const date = new Date(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  async function saveShift() {
    if (!selected) return setError("Select a vacant destination.");
    try {
      setSaving(true); setError("");
      await shiftTenant(id, { targetUnitId: selected.unit._id, targetBedNo: selected.bed.bedNo, effectiveDate });
      router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to shift tenant."); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} stickyHeaderIndices={[0]}>
      <View style={styles.header}><Pressable onPress={() => router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } })} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Shift tenant</Text><Text style={styles.subtitle}>{tenant?.name}</Text></View></View>
      <View style={styles.current}><Text style={styles.currentLabel}>Current assignment</Text><Text style={styles.currentValue}>{tenant?.category} | Floor {tenant?.floorNo} | {formatTenantUnit(tenant || {})}</Text><Text style={styles.currentRent}>Rent: Rs. {Number(tenant?.baseRent || 0).toLocaleString("en-IN")}</Text></View>
      {due > 0 ? <View style={styles.warning}><Text style={styles.warningTitle}>Rent remains due</Text><Text style={styles.warningText}>Rs. {due.toLocaleString("en-IN")} remains linked to this tenant after shifting.</Text></View> : null}

      <Text style={styles.label}>Shift tenant to</Text>
      <View style={styles.lockedType}><Text style={styles.lockedTypeLabel}>{typeInfo.label}</Text><Text style={styles.lockedTypeMeta}>{filteredVacancies.length} vacant destination{filteredVacancies.length === 1 ? "" : "s"} available</Text></View>
      <Text style={styles.label}>Vacant destination</Text>
      <Pressable onPress={() => setShowOptions((value) => !value)} disabled={!filteredVacancies.length} style={[styles.select, !filteredVacancies.length && styles.disabled]}><Text style={styles.selectValue}>{selected ? `${formatVacancyTitle(selected.unit)} | ${formatVacancyMeta(selected.unit, selected.bed)}` : "No vacant destination"}</Text><ChevronDown size={19} color={colors.muted} /></Pressable>
      {showOptions ? <View style={styles.options}>{groupedVacancies.map((group) => <View key={group.propertyName}><Text style={styles.optionGroupTitle}>{group.propertyName}</Text>{group.vacancies.map(({ unit, bed }) => { const index = filteredVacancies.findIndex((vacancy) => String(vacancy.unit._id) === String(unit._id) && String(vacancy.bed?.bedNo || "") === String(bed?.bedNo || "")); return <Pressable key={`${unit._id}-${bed.bedNo}`} onPress={() => { setSelectedIndex(index); setShowOptions(false); }} style={[styles.option, index === selectedIndex && styles.optionSelected]}><View style={styles.optionText}><Text style={styles.optionTitle}>{unitTypeLabel(unit)}</Text><Text style={styles.optionMeta}>{formatVacancyMeta(unit, bed)}</Text></View>{index === selectedIndex ? <Check size={18} color={colors.primary} /> : null}</Pressable>; })}</View>)}</View> : null}
      {!filteredVacancies.length ? <Text style={styles.emptyText}>No vacant {typeInfo.label.toLowerCase()} available right now.</Text> : null}

      {selected ? <View style={styles.newRent}><Text style={styles.currentLabel}>New monthly rent</Text><Text style={styles.newRentValue}>Rs. {Number(selected.bed.price || 0).toLocaleString("en-IN")}</Text></View> : null}
      <FormDateField label="Shift effective date" value={effectiveDate} onChange={setEffectiveDate} minimumDate={tenant?.joiningDate ? new Date(tenant.joiningDate) : undefined} maximumDate={new Date()} />
      {previewing ? <View style={styles.previewLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.previewLoadingText}>Calculating prorated rent...</Text></View> : preview ? <View style={styles.preview}><View style={styles.previewHeader}><View><Text style={styles.previewTitle}>Prorated cycle rent</Text><Text style={styles.previewCycle}>{preview.month} | {shortDate(preview.cycleStart)} to {shortDate(new Date(new Date(preview.cycleEnd).getTime() - 86400000))}</Text></View><Text style={styles.previewTotal}>Rs. {Number(preview.expected).toLocaleString("en-IN")}</Text></View>{preview.segments.map((segment, index) => <View key={`${segment.from}-${index}`} style={styles.segmentRow}><View><Text style={styles.segmentDays}>{segment.days} day{segment.days === 1 ? "" : "s"} at Rs. {Number(segment.monthlyRate).toLocaleString("en-IN")}</Text><Text style={styles.segmentDates}>{shortDate(segment.from)} to {shortDate(new Date(new Date(segment.to).getTime() - 86400000))}</Text></View><Text style={styles.segmentAmount}>Rs. {Math.round(segment.amount).toLocaleString("en-IN")}</Text></View>)}</View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={saveShift} disabled={saving || !selected} style={[styles.saveButton, (saving || !selected) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Confirm shift</Text>}</Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16, backgroundColor: colors.background }, iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 24, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  current: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, currentLabel: { color: colors.muted, fontSize: 11 }, currentValue: { marginTop: 6, color: colors.text, fontWeight: "700" }, currentRent: { marginTop: 5, color: colors.primary, fontSize: 12, fontWeight: "600" },
  warning: { marginTop: 10, padding: 12, borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 7, backgroundColor: colors.dangerSoft }, warningTitle: { color: colors.danger, fontWeight: "700" }, warningText: { marginTop: 4, color: colors.muted, fontSize: 11 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" }, select: { minHeight: 54, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, selectValue: { flex: 1, paddingRight: 8, color: colors.text, fontWeight: "600" },
  lockedType: { minHeight: 58, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft }, lockedTypeLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: "800" }, lockedTypeMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  options: { marginTop: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, option: { minHeight: 60, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, optionSelected: { backgroundColor: colors.primarySoft }, optionText: { flex: 1 }, optionTitle: { color: colors.text, fontWeight: "700" }, optionMeta: { marginTop: 4, color: colors.muted, fontSize: 11 },
  optionGroupTitle: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 12, fontWeight: "800", backgroundColor: colors.surfaceSoft },
  newRent: { minHeight: 58, marginTop: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 7, backgroundColor: colors.primarySoft }, newRentValue: { color: colors.primaryDark, fontSize: 17, fontWeight: "700" },
  previewLoading: { minHeight: 56, marginTop: 12, paddingHorizontal: 14, flexDirection: "row", gap: 9, alignItems: "center", borderRadius: 7, backgroundColor: colors.primarySoft }, previewLoadingText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  preview: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.primarySoft }, previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, previewTitle: { color: colors.primaryDark, fontWeight: "700" }, previewCycle: { marginTop: 4, color: colors.muted, fontSize: 11 }, previewTotal: { color: colors.primaryDark, fontSize: 18, fontWeight: "700" }, segmentRow: { minHeight: 50, marginTop: 10, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border }, segmentDays: { color: colors.muted, fontSize: 12, fontWeight: "600" }, segmentDates: { marginTop: 3, color: colors.muted, fontSize: 10 }, segmentAmount: { color: colors.primaryDark, fontWeight: "700" },
  error: { marginTop: 14, color: colors.danger }, saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, saveText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.5 },
});
