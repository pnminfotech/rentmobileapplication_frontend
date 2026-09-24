import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown, Share2 } from "lucide-react-native";

import FormDateField from "../../src/components/FormDateField";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getCanteenSettings } from "../../src/api/canteenApi";
import { getRooms } from "../../src/api/roomApi";
import { createTenantInvite, getTenants } from "../../src/api/tenantApi";
import { ASSIGNMENT_TYPES, filterVacanciesByType, formatVacancyLabel, formatVacancyMeta, groupVacanciesByProperty, stackedPropertyLabel, unitTypeLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

const FIRST_RENT_OPTIONS = [
  { value: "NOT_PAID", label: "Normal cycle" },
  { value: "ADVANCE_PAID", label: "Advance cycle" },
];
const CANTEEN_MODE_LABELS = {
  full_package: "Full food package",
  per_meal: "Per meal pricing",
  meal_package: "Meal package monthly",
};

async function lookupIndianPincode(pincode) {
  const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
  const payload = await response.json();
  const result = Array.isArray(payload) ? payload[0] : null;
  const offices = Array.isArray(result?.PostOffice) ? result.PostOffice : [];
  const office = offices.find((item) => item?.DeliveryStatus === "Delivery") || offices[0];
  if (!office || String(result?.Status || "").toLowerCase() !== "success") {
    throw new Error("PIN code details not found.");
  }
  return {
    locality: office.Name || "",
    city: office.District || office.Name || "",
    state: office.State || "",
  };
}

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function optionalText(value) {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

function activeTenant(tenant) {
  if (!tenant.leaveDate) return true;
  const date = new Date(tenant.leaveDate);
  return Number.isNaN(date.getTime()) || date > new Date();
}

function buildVacancies(units, tenants) {
  const active = tenants.filter(activeTenant);
  const occupied = (unit, bed) => active.some((tenant) => {
    const sameUnit = tenant.roomId
      ? String(tenant.roomId) === String(unit._id)
      : String(tenant.category || "") === String(unit.category || "") && String(tenant.roomNo || "") === String(unit.roomNo || "");
    return sameUnit && (unit.propertyType !== "bed" || String(tenant.bedNo || "") === String(bed.bedNo || ""));
  });

  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    if (unit.propertyType === "bed") return beds.filter((bed) => !occupied(unit, bed)).map((bed) => ({ unit, bed }));
    return beds[0] && !occupied(unit, beds[0]) ? [{ unit, bed: beds[0] }] : [];
  });
}

function Field({ label, ...props }) {
  return <><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, props.multiline && styles.multiline]} {...props} /></>;
}

function isValidShareUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function TenantInviteScreen() {
  const router = useRouter();
  const createInFlight = useRef(false);
  const [vacancies, setVacancies] = useState([]);
  const [unitAccess, setUnitAccess] = useState(null);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [canteenSettings, setCanteenSettings] = useState(null);
  const [assignmentType, setAssignmentType] = useState("bed");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showUnits, setShowUnits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [error, setError] = useState("");
  const [pinLookupStatus, setPinLookupStatus] = useState("idle");
  const [form, setForm] = useState({
    name: "", phoneNo: "", joiningDate: localDateValue(), depositAmount: "",
    dob: "", pincode: "", city: "", state: "", address: "", houseNo: "", nearbyPlace: "",
    familyMembers: "", shopName: "", shopBusiness: "", companyAddress: "", dateOfJoiningCollege: "",
    firstRentStatus: "NOT_PAID", paymentMode: "Cash", hasCanteen: false, canteenPlanType: "",
  });

  function updateForm(values) {
    setGeneratedLink("");
    setForm((current) => ({ ...current, ...values }));
  }

  useEffect(() => {
    if (!isResidentialRoom && !isShop) {
      setPinLookupStatus("idle");
      return;
    }

    let active = true;
    const pincode = String(form.pincode || "").trim();

    if (!/^\d{6}$/.test(pincode)) {
      setPinLookupStatus("idle");
      return () => {
        active = false;
      };
    }

    setPinLookupStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const result = await lookupIndianPincode(pincode);
        if (!active) return;
        setForm((current) => {
          if (String(current.pincode || "").trim() !== pincode) return current;
          return {
            ...current,
            nearbyPlace: result.locality || current.nearbyPlace,
            city: result.city || current.city,
            state: result.state || current.state,
          };
        });
        setPinLookupStatus("success");
      } catch (_error) {
        if (!active) return;
        setPinLookupStatus("error");
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.pincode, isResidentialRoom, isShop]);

  const resetForm = useCallback(() => {
    setForm({
      name: "", phoneNo: "", joiningDate: localDateValue(), depositAmount: "",
      dob: "", pincode: "", city: "", state: "", address: "", houseNo: "", nearbyPlace: "",
      familyMembers: "", shopName: "", shopBusiness: "", companyAddress: "", dateOfJoiningCollege: "",
      firstRentStatus: "NOT_PAID", paymentMode: "Cash", hasCanteen: false, canteenPlanType: "",
    });
    setGeneratedLink("");
    setError("");
    setSelectedIndex(0);
    setShowUnits(false);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [units, tenants, dashboardData, settingsData] = await Promise.all([getRooms(), getTenants(), getSystemDashboard(), getCanteenSettings().catch(() => null)]);
      setVacancies(buildVacancies(Array.isArray(units) ? units : [], Array.isArray(tenants) ? tenants : []));
      setUnitAccess(dashboardData?.units || dashboardData);
      setCanteenEnabled(hasCanteenFeature(dashboardData));
      setCanteenSettings(settingsData);
      setAssignmentType((current) => allowedUnitTypes(dashboardData?.units || dashboardData).some((type) => type.value === current) ? current : firstAllowedType(dashboardData?.units || dashboardData));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load vacant units.");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { 
    loadData(); 
    resetForm();
  }, [loadData, resetForm]));

  const filteredVacancies = useMemo(() => filterVacanciesByType(vacancies, assignmentType), [assignmentType, vacancies]);
  const assignmentTypes = useMemo(() => ASSIGNMENT_TYPES.filter((type) => allowedUnitTypes(unitAccess).some((allowed) => allowed.value === type.value)), [unitAccess]);
  const groupedVacancies = useMemo(() => groupVacanciesByProperty(filteredVacancies), [filteredVacancies]);
  const selected = filteredVacancies[selectedIndex];
  const isResidentialRoom = assignmentType === "room";
  const isShop = assignmentType === "shop";
  const unitLabel = useMemo(() => selected ? formatVacancyLabel(selected.unit, selected.bed) : "No vacant unit available", [selected]);
  const canteenPlans = useMemo(() => (canteenSettings?.activeModes || []).filter((mode) => mode !== "guest_meal"), [canteenSettings]);
  const selectedCanteenPlan = form.canteenPlanType || canteenPlans[0] || "";
  const selectedCanteenMeta = useMemo(() => {
    if (selectedCanteenPlan === "full_package") return { amount: Number(canteenSettings?.fullPackage?.monthlyAmount || 0), meals: canteenSettings?.fullPackage?.includedMeals || [] };
    if (selectedCanteenPlan === "meal_package") return { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0), meals: canteenSettings?.mealPackage?.includedMeals || [] };
    return { amount: 0, meals: [] };
  }, [canteenSettings, selectedCanteenPlan]);

  async function shareLink(url) {
    if (!isValidShareUrl(url)) {
      throw new Error("The tenant form link returned by the server is not a valid URL.");
    }
    await Share.share({
      title: "Tenant registration form",
      message: `Please complete your tenant registration form within 10 days. This link can be submitted only once:\n${url}`,
      url,
    });
  }

  async function createAndShare() {
    if (createInFlight.current) return;
    if (!form.name.trim()) return setError("Tenant name is required.");
    if (!/^\d{10}$/.test(form.phoneNo)) return setError("Enter a valid 10-digit mobile number.");
    if (!selected) return setError("Select a vacant unit.");
    if (assignmentType === "bed" && canteenEnabled && form.hasCanteen && (!canteenSettings?.isConfigured || !selectedCanteenPlan)) return setError("Configure canteen settings and choose a canteen billing plan.");
    if (!Number.isFinite(Number(form.depositAmount)) || Number(form.depositAmount) < 0) return setError("Enter a valid deposit amount.");
    if ((isResidentialRoom || isShop) && form.pincode && !/^\d{6}$/.test(form.pincode)) return setError("Enter a valid 6-digit pincode.");
    if (isResidentialRoom && form.familyMembers && Number(form.familyMembers) < 0) return setError("Enter a valid family members count.");

    try {
      createInFlight.current = true;
      setSaving(true);
      setError("");
      const result = await createTenantInvite({
        name: form.name,
        phoneNo: form.phoneNo,
        joiningDate: form.joiningDate,
        depositAmount: Number(form.depositAmount),
        roomId: selected.unit._id,
        propertyType: assignmentType,
        category: selected.unit.category,
        hasWing: Boolean(selected.unit.hasWing && selected.unit.wingName),
        wingName: selected.unit.wingName || "",
        floorNo: selected.unit.floorNo,
        roomNo: selected.unit.roomNo,
        bedNo: selected.bed?.bedNo || selected.unit.roomNo,
        baseRent: Number(selected.bed?.price || 0),
        rentAmount: Number(selected.bed?.price || 0),
        hasCanteen: assignmentType === "bed" && canteenEnabled ? Boolean(form.hasCanteen) : false,
        canteenPlanType: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenPlan : "",
        canteenStartDate: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? form.joiningDate : undefined,
        canteenMonthlyAmount: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenMeta.amount : 0,
        canteenIncludedMeals: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenMeta.meals : [],
        pincode: isResidentialRoom || isShop ? optionalText(form.pincode) : undefined,
        city: isResidentialRoom || isShop ? optionalText(form.city) : undefined,
        state: isResidentialRoom || isShop ? optionalText(form.state) : undefined,
        address: isResidentialRoom || isShop ? optionalText(form.address) : undefined,
        houseNo: isResidentialRoom || isShop ? optionalText(form.houseNo) : undefined,
        nearbyPlace: isResidentialRoom || isShop ? optionalText(form.nearbyPlace) : undefined,
        familyMembers: isResidentialRoom && form.familyMembers ? Number(form.familyMembers) : undefined,
        shopName: isShop ? optionalText(form.shopName) : undefined,
        shopBusiness: isShop ? optionalText(form.shopBusiness) : undefined,
        companyAddress: isResidentialRoom ? optionalText(form.companyAddress) : undefined,
        dateOfJoiningCollege: isResidentialRoom ? optionalText(form.dateOfJoiningCollege) : undefined,
        dob: isResidentialRoom ? optionalText(form.dob) : undefined,
        firstRentStatus: form.firstRentStatus,
        paymentMode: form.paymentMode,
      });
      const link = result?.url;
      if (!isValidShareUrl(link)) {
        throw new Error("The tenant form link returned by the server is not a valid URL.");
      }
      setGeneratedLink(link);
      try {
        await shareLink(link);
      } catch (shareErr) {
        setError(`Link created safely, but the share sheet could not open: ${shareErr.message}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Unable to create the tenant form link.");
    } finally {
      createInFlight.current = false;
      setSaving(false);
    }
  }

  async function shareAgain() {
    try {
      setError("");
      await shareLink(generatedLink);
    } catch (err) {
      setError(err.message || "Unable to open the share sheet.");
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/tenants")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View><Text style={styles.title}>Share tenant form</Text><Text style={styles.subtitle}>Link expires in 10 days and works once</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Where are we adding this tenant?</Text>
        <View style={styles.typeSegment}>{assignmentTypes.map((type) => {
          const active = assignmentType === type.value;
          const count = filterVacanciesByType(vacancies, type.value).length;
          return <Pressable key={type.value} onPress={() => { setAssignmentType(type.value); setSelectedIndex(0); setShowUnits(false); setGeneratedLink(""); }} style={[styles.typeButton, active && styles.segmentActive]}><Text style={[styles.typeText, active && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(type.label)}</Text><Text style={[styles.typeCount, active && styles.segmentTextActive]} numberOfLines={1}>{count} vacant</Text></Pressable>;
        })}</View>
        <Text style={styles.label}>Vacant unit</Text>
        <Pressable onPress={() => setShowUnits((current) => !current)} disabled={!filteredVacancies.length} style={[styles.select, !filteredVacancies.length && styles.disabled]}><Text style={styles.selectText}>{unitLabel}</Text><ChevronDown size={19} color={colors.muted} /></Pressable>
        {showUnits ? <View style={styles.options}>{groupedVacancies.map((group) => <View key={group.propertyName}><Text style={styles.optionGroupTitle}>{group.propertyName}</Text>{group.vacancies.map(({ unit, bed }) => { const index = filteredVacancies.findIndex((vacancy) => String(vacancy.unit._id) === String(unit._id) && String(vacancy.bed?.bedNo || "") === String(bed?.bedNo || "")); return <Pressable key={`${unit._id}-${bed.bedNo}`} onPress={() => { setSelectedIndex(index); setShowUnits(false); setGeneratedLink(""); }} style={[styles.option, index === selectedIndex && styles.optionActive]}><View style={styles.optionText}><Text style={styles.optionTitle}>{unitTypeLabel(unit)}</Text><Text style={styles.optionMeta}>{formatVacancyMeta(unit, bed)}</Text></View>{index === selectedIndex ? <Check size={18} color={colors.primary} /> : null}</Pressable>; })}</View>)}</View> : null}
        <Field label="Tenant name" value={form.name} onChangeText={(name) => updateForm({ name })} placeholder="Full name" />
        {isShop ? <Field label="Shop name" value={form.shopName} onChangeText={(shopName) => updateForm({ shopName })} placeholder="Enter shop name" /> : null}
        <Field label="Mobile number" value={form.phoneNo} onChangeText={(phoneNo) => updateForm({ phoneNo: phoneNo.replace(/\D/g, "").slice(0, 10) })} keyboardType="phone-pad" placeholder="10-digit number" />
        <FormDateField label="Joining date" value={form.joiningDate} onChange={(joiningDate) => updateForm({ joiningDate })} />
        {!isResidentialRoom && !isShop && canteenEnabled ? <>
          <Text style={styles.label}>Canteen facility</Text>
          <View style={styles.segment}>
            {[[true, "Yes"], [false, "No"]].map(([value, label]) => (
              <Pressable key={label} onPress={() => updateForm({ hasCanteen: value })} style={[styles.segmentButton, form.hasCanteen === value && styles.segmentActive]}>
                <Text style={[styles.segmentText, form.hasCanteen === value && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {form.hasCanteen ? (
            <>
              {!canteenSettings?.isConfigured ? <Text style={styles.error}>Canteen settings are not configured yet. Open More {">"} Canteen settings first.</Text> : null}
              <Text style={styles.label}>Canteen billing plan</Text>
              <View style={styles.segment}>
                {canteenPlans.map((plan) => (
                  <Pressable key={plan} onPress={() => updateForm({ canteenPlanType: plan })} style={[styles.segmentButton, selectedCanteenPlan === plan && styles.segmentActive]}>
                    <Text style={[styles.segmentText, selectedCanteenPlan === plan && styles.segmentTextActive]}>{CANTEEN_MODE_LABELS[plan] || plan}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </> : null}
        {(isResidentialRoom || isShop) && selected ? <View style={styles.unitDetails}>
          <Text style={styles.unitDetailsTitle}>{isShop ? "Selected shop" : "Selected residential room"}</Text>
          <View style={styles.detailGrid}>
            <View style={styles.detailBox}><Text style={styles.detailLabel}>Building</Text><Text style={styles.detailValue}>{selected.unit.category || "-"}</Text></View>
            <View style={styles.detailBox}><Text style={styles.detailLabel}>Wing</Text><Text style={styles.detailValue}>{selected.unit.wingName || "-"}</Text></View>
            <View style={styles.detailBox}><Text style={styles.detailLabel}>Floor</Text><Text style={styles.detailValue}>{selected.unit.floorNo || "-"}</Text></View>
            <View style={styles.detailBox}><Text style={styles.detailLabel}>{isShop ? "Shop" : "Flat"}</Text><Text style={styles.detailValue}>{selected.unit.roomNo || "-"}</Text></View>
            <View style={styles.detailBoxFull}><Text style={styles.detailLabel}>{isShop ? "Shop price" : "Flat / room price"}</Text><Text style={styles.detailValue}>Rs. {Number(selected.bed?.price || 0).toLocaleString("en-IN")} monthly</Text></View>
          </View>
        </View> : null}
        {isResidentialRoom || isShop ? <>
          <Field label="Pincode" value={form.pincode} onChangeText={(pincode) => updateForm({ pincode: pincode.replace(/\D/g, "").slice(0, 6) })} keyboardType="number-pad" placeholder="6-digit pincode" />
          {pinLookupStatus === "loading" ? <Text style={styles.helperText}>Fetching city and state from PIN code...</Text> : null}
          {pinLookupStatus === "success" ? <Text style={styles.helperText}>City and state updated from PIN code. You can still edit them.</Text> : null}
          {pinLookupStatus === "error" ? <Text style={styles.error}>Could not fetch city/state for this PIN code. Please enter them manually.</Text> : null}
          <Field label="City" value={form.city} onChangeText={(city) => updateForm({ city })} />
          <Field label="State" value={form.state} onChangeText={(state) => updateForm({ state })} />
          <Field label="Local Address" value={form.address} onChangeText={(address) => updateForm({ address })} placeholder="House, Street, Area" />
          <Field label="House No" value={form.houseNo} onChangeText={(houseNo) => updateForm({ houseNo })} />
          <Field label="Nearby Place" value={form.nearbyPlace} onChangeText={(nearbyPlace) => updateForm({ nearbyPlace })} />
          {isResidentialRoom ? <>
            <Field label="No. of Family Members" value={form.familyMembers} onChangeText={(familyMembers) => updateForm({ familyMembers: familyMembers.replace(/\D/g, "").slice(0, 3) })} keyboardType="number-pad" placeholder="Enter family members count" />
            <Field label="Company Address / College" value={form.companyAddress} onChangeText={(companyAddress) => updateForm({ companyAddress })} />
            <FormDateField label="Date of Joining College / Company" value={form.dateOfJoiningCollege} onChange={(dateOfJoiningCollege) => updateForm({ dateOfJoiningCollege })} />
          </> : <Field label="What are you selling/doing in shop" value={form.shopBusiness} onChangeText={(shopBusiness) => updateForm({ shopBusiness })} multiline placeholder="Example: Grocery, mobile repair, salon, tailoring..." />}
          <FormDateField label="Date of Birth" value={form.dob} onChange={(dob) => updateForm({ dob })} maximumDate={new Date()} />
        </> : null}
        <View style={styles.rentRow}><Text style={styles.rentLabel}>Monthly rent</Text><Text style={styles.rentValue}>Rs. {selected?.bed?.price || 0}</Text></View>
        <Field label="Deposit amount" value={form.depositAmount} onChangeText={(depositAmount) => updateForm({ depositAmount })} keyboardType="numeric" placeholder="Example: 10000" />
        <Text style={styles.label}>Payment cycle</Text>
        <View style={styles.segment}>
          {FIRST_RENT_OPTIONS.map((option) => (
            <Pressable key={option.value} onPress={() => updateForm({ firstRentStatus: option.value })} style={[styles.segmentButton, form.firstRentStatus === option.value && styles.segmentActive]}>
              <Text style={[styles.segmentText, form.firstRentStatus === option.value && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.cycleHelp}><Text style={styles.cycleHelpText}>• Normal cycle: rent becomes payable after the month completes.</Text><Text style={styles.cycleHelpText}>• Advance cycle: the joining month rent is paid at joining.</Text></View>
        {form.firstRentStatus === "ADVANCE_PAID" ? <>
          <Text style={styles.label}>Payment mode</Text>
          <View style={styles.segment}>
            {["Cash", "Online"].map((value) => (
              <Pressable key={value} onPress={() => updateForm({ paymentMode: value })} style={[styles.segmentButton, form.paymentMode === value && styles.segmentActive]}>
                <Text style={[styles.segmentText, form.paymentMode === value && styles.segmentTextActive]}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {generatedLink ? <View style={styles.successBox}><Check size={20} color={colors.success} /><View style={styles.successText}><Text style={styles.successTitle}>Link created</Text><Text style={styles.successMeta}>Valid for 10 days and one submission.</Text></View></View> : null}
        <Pressable onPress={() => generatedLink ? shareAgain() : createAndShare()} disabled={saving || !selected} style={[styles.shareButton, (saving || !selected) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <><Share2 size={19} color={colors.surface} /><Text style={styles.shareText}>{generatedLink ? "Share link again" : "Create and share link"}</Text></>}</Pressable>
        {generatedLink ? <Pressable onPress={() => router.replace("/system/tenants")} style={styles.doneButton}><Text style={styles.doneText}>Done</Text></Pressable> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 14, paddingTop: 12, flexDirection: "row", alignItems: "center" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 },
  title: { color: colors.text, fontSize: 23, fontWeight: "700" }, subtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  helperText: { marginTop: 6, color: colors.muted, fontSize: 12 },
  cycleHelp: { marginTop: 8, padding: 10, borderRadius: 7, backgroundColor: colors.primarySoft },
  cycleHelpText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  multiline: { height: 84, paddingTop: 13, textAlignVertical: "top" },
  select: { minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, selectText: { flex: 1, paddingRight: 8, color: colors.text, fontWeight: "600" },
  options: { marginTop: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, overflow: "hidden" }, option: { minHeight: 56, padding: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, optionActive: { backgroundColor: colors.primarySoft }, optionText: { flex: 1 }, optionTitle: { color: colors.text, fontWeight: "600" }, optionMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  optionGroupTitle: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 12, fontWeight: "800", backgroundColor: colors.surfaceSoft },
  unitDetails: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  unitDetailsTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  detailGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailBox: { flexGrow: 1, flexBasis: "47%", minHeight: 58, padding: 10, borderRadius: 6, backgroundColor: colors.surfaceSoft },
  detailBoxFull: { flexBasis: "100%", minHeight: 58, padding: 10, borderRadius: 6, backgroundColor: colors.primarySoft },
  detailLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  detailValue: { marginTop: 4, color: colors.text, fontSize: 14, fontWeight: "700" },
  rentRow: { height: 56, marginTop: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 7, backgroundColor: colors.primarySoft }, rentLabel: { color: colors.muted, fontWeight: "600" }, rentValue: { color: colors.primaryDark, fontSize: 17, fontWeight: "700" },
  segment: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, segmentButton: { minHeight: 42, flexGrow: 1, flexBasis: "45%", paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, segmentActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, segmentText: { color: colors.muted, fontWeight: "600", textAlign: "center" }, segmentTextActive: { color: colors.primaryDark },
  typeSegment: { padding: 4, flexDirection: "row", gap: 4, borderRadius: 7, backgroundColor: colors.border }, typeButton: { flex: 1, minWidth: 0, minHeight: 68, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 }, typeText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" }, typeCount: { width: "100%", marginTop: 3, color: colors.subtle, fontSize: 10, fontWeight: "600", textAlign: "center" },
  error: { marginTop: 16, color: colors.danger }, shareButton: { height: 50, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 7, backgroundColor: colors.primary }, shareText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.5 },
  successBox: { marginTop: 18, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.successSoft, borderRadius: 7, backgroundColor: colors.successSoft }, successText: { marginLeft: 10 }, successTitle: { color: colors.success, fontWeight: "700" }, successMeta: { marginTop: 2, color: colors.success, fontSize: 12 }, doneButton: { height: 48, marginTop: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, doneText: { color: colors.primary, fontWeight: "700" },
});
