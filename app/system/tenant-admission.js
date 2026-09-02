import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";

import FormDateField from "../../src/components/FormDateField";
import WebImageCropper from "../../src/components/WebImageCropper";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getCanteenSettings } from "../../src/api/canteenApi";
import { getRooms } from "../../src/api/roomApi";
import { createTenantWithDocuments, getTenants } from "../../src/api/tenantApi";
import { ASSIGNMENT_TYPES, filterVacanciesByType, formatVacancyMeta, formatVacancyTitle, groupVacanciesByProperty, stackedPropertyLabel, unitTypeLabel } from "../../src/utils/unitLabels";
import { allowedUnitTypes, firstAllowedType } from "../../src/utils/subscriptionAccess";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

const STEPS = ["Personal", "Address", "Contacts", "Work", "Payment & docs"];
const RELATIONS = ["Father", "Mother", "Husband", "Sister", "Brother", "Self"];
const CANTEEN_MODE_LABELS = {
  full_package: "Full food package",
  per_meal: "Per meal pricing",
  meal_package: "Meal package monthly",
};
let preferredAssignmentType = "bed";

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

function blankForm() {
  return {
    name: "", phoneNo: "", dob: localDateValue(), joiningDate: localDateValue(),
    pincode: "", city: "", state: "", address: "", houseNo: "", nearbyPlace: "",
    relative1Relation: "Father", relative1Name: "", relative1Phone: "",
    relative2Relation: "Mother", relative2Name: "", relative2Phone: "",
    familyMembers: "", shopName: "", shopBusiness: "", companyAddress: "", dateOfJoiningCollege: localDateValue(), depositAmount: "",
    firstRentStatus: "NOT_PAID", paymentMode: "Cash", hasCanteen: false, canteenPlanType: "",
  };
}

function blankDocuments() {
  return { selfAadhar: null, parentAadhar: null, photo: null };
}

function activeTenant(tenant) {
  if (!tenant.leaveDate) return true;
  const date = new Date(tenant.leaveDate);
  return Number.isNaN(date.getTime()) || date > new Date();
}

function buildVacancies(units, tenants) {
  const active = tenants.filter(activeTenant);
  const isOccupied = (unit, bed) => active.some((tenant) => {
    const sameUnit = tenant.roomId
      ? String(tenant.roomId) === String(unit._id)
      : String(tenant.category || "") === String(unit.category || "") && String(tenant.roomNo || "") === String(unit.roomNo || "");
    if (!sameUnit) return false;
    return unit.propertyType === "bed" ? String(tenant.bedNo || "") === String(bed.bedNo || "") : true;
  });

  return units.flatMap((unit) => {
    const beds = Array.isArray(unit.beds) ? unit.beds : [];
    if (unit.propertyType === "bed") return beds.filter((bed) => !isOccupied(unit, bed)).map((bed) => ({ unit, bed }));
    return beds[0] && !isOccupied(unit, beds[0]) ? [{ unit, bed: beds[0] }] : [];
  });
}

function Field({ label, ...props }) {
  return <><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, props.multiline && styles.multiline]} {...props} /></>;
}

function RelationPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen((current) => !current)} style={styles.select}><Text style={styles.selectValue}>{value}</Text><ChevronDown size={19} color={colors.muted} /></Pressable>
      {open ? <View style={styles.options}>{RELATIONS.map((relation) => <Pressable key={relation} onPress={() => { onChange(relation); setOpen(false); }} style={[styles.option, relation === value && styles.optionSelected]}><Text style={styles.optionTitle}>{relation}</Text>{relation === value ? <Check size={18} color={colors.primary} /> : null}</Pressable>)}</View> : null}
    </>
  );
}

export default function TenantAdmissionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestedType = Array.isArray(params.type) ? params.type[0] : params.type;
  const requestedRoomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const requestedRoomNo = Array.isArray(params.roomNo) ? params.roomNo[0] : params.roomNo;
  const requestedBedNo = Array.isArray(params.bedNo) ? params.bedNo[0] : params.bedNo;
  const initialAssignmentType = ["bed", "room", "shop"].includes(requestedType) ? requestedType : preferredAssignmentType;
  const [step, setStep] = useState(0);
  const [vacancies, setVacancies] = useState([]);
  const [unitAccess, setUnitAccess] = useState(null);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [canteenSettings, setCanteenSettings] = useState(null);
  const [assignmentType, setAssignmentType] = useState(initialAssignmentType);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showUnits, setShowUnits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pinLookupStatus, setPinLookupStatus] = useState("idle");
  const [form, setForm] = useState(blankForm);
  const [documents, setDocuments] = useState(blankDocuments);
  const [cropRequest, setCropRequest] = useState(null);

  useEffect(() => {
    preferredAssignmentType = assignmentType;
  }, [assignmentType]);

  useEffect(() => {
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
  }, [form.pincode]);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const loadData = useCallback(async () => {
    try {
      const [units, tenants, dashboardData, settingsData] = await Promise.all([getRooms(), getTenants(), getSystemDashboard(), getCanteenSettings().catch(() => null)]);
      setVacancies(buildVacancies(Array.isArray(units) ? units : [], Array.isArray(tenants) ? tenants : []));
      setUnitAccess(dashboardData?.units || dashboardData);
      setCanteenEnabled(hasCanteenFeature(dashboardData));
      setCanteenSettings(settingsData);
      setAssignmentType((current) => {
        const allowed = allowedUnitTypes(dashboardData?.units || dashboardData);
        const requested = ["bed", "room", "shop"].includes(requestedType) ? requestedType : null;
        if (requested && allowed.some((type) => type.value === requested)) return requested;
        if (allowed.some((type) => type.value === current)) return current;
        if (allowed.some((type) => type.value === preferredAssignmentType)) return preferredAssignmentType;
        return firstAllowedType(dashboardData?.units || dashboardData);
      });
    } catch (err) { setError(err.response?.data?.message || "Unable to load vacant units."); }
    finally { setLoading(false); }
  }, [requestedType]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filteredVacancies = useMemo(() => filterVacanciesByType(vacancies, assignmentType), [assignmentType, vacancies]);
  const assignmentTypes = useMemo(() => ASSIGNMENT_TYPES.filter((type) => allowedUnitTypes(unitAccess).some((allowed) => allowed.value === type.value)), [unitAccess]);
  const groupedVacancies = useMemo(() => groupVacanciesByProperty(filteredVacancies), [filteredVacancies]);
  const selected = filteredVacancies[selectedIndex];
  const isResidentialRoom = assignmentType === "room";
  const isShop = assignmentType === "shop";
  const unitLabel = useMemo(() => selected ? `${formatVacancyTitle(selected.unit)} | ${formatVacancyMeta(selected.unit, selected.bed)}` : "No vacant unit available", [selected]);
  const canteenPlans = useMemo(() => (canteenSettings?.activeModes || []).filter((mode) => mode !== "guest_meal"), [canteenSettings]);
  const selectedCanteenPlan = form.canteenPlanType || canteenPlans[0] || "";
  const selectedCanteenMeta = useMemo(() => {
    if (selectedCanteenPlan === "full_package") return { amount: Number(canteenSettings?.fullPackage?.monthlyAmount || 0), meals: canteenSettings?.fullPackage?.includedMeals || [] };
    if (selectedCanteenPlan === "meal_package") return { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0), meals: canteenSettings?.mealPackage?.includedMeals || [] };
    return { amount: 0, meals: [] };
  }, [canteenSettings, selectedCanteenPlan]);

  useEffect(() => {
    if (!filteredVacancies.length) return;
    const matchedIndex = filteredVacancies.findIndex((vacancy) => {
      const sameRoomId = requestedRoomId ? String(vacancy.unit?._id || "") === String(requestedRoomId) : true;
      const sameRoomNo = requestedRoomNo ? String(vacancy.unit?.roomNo || "") === String(requestedRoomNo) : true;
      const sameBedNo = requestedBedNo ? String(vacancy.bed?.bedNo || "") === String(requestedBedNo) : true;
      return sameRoomId && sameRoomNo && sameBedNo;
    });
    if (matchedIndex >= 0) {
      setSelectedIndex(matchedIndex);
      setShowUnits(false);
    } else {
      setSelectedIndex(0);
    }
  }, [filteredVacancies, requestedBedNo, requestedRoomId, requestedRoomNo]);

  async function chooseImage(key) {
    setError("");
    const isSelfie = key === "photo";
    const options = {
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: isSelfie ? [1, 1] : [4, 3],
      quality: 0.85,
    };
    const permission = isSelfie
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(isSelfie ? "Camera permission is required for tenant selfie." : "Photo library permission is required.");
    const result = isSelfie
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType?.front || "front" })
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    if (Platform.OS === "web") {
      setCropRequest({ key, uri: result.assets[0].uri, aspect: isSelfie ? 1 : 4 / 3 });
      return;
    }
    const image = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    setCropRequest({ key, uri: image.uri, aspect: isSelfie ? 1 : 4 / 3 });
  }

  function validateStep() {
    if (step === 0 && (!form.name.trim() || !/^\d{10}$/.test(form.phoneNo) || !selected)) return "Enter name, a valid phone number and select a vacant unit.";
    if (step === 0 && assignmentType === "bed" && canteenEnabled && form.hasCanteen && (!canteenSettings?.isConfigured || !selectedCanteenPlan)) return "Configure canteen settings and choose a canteen billing plan.";
    if (!isShop && step === 1 && (!/^\d{6}$/.test(form.pincode) || !form.city.trim() || !form.state.trim() || !form.address.trim())) return "Enter a 6-digit pincode, city, state and address.";
    if (isShop && step === 1 && form.pincode && !/^\d{6}$/.test(form.pincode)) return "Enter a valid 6-digit pincode.";
    if (isResidentialRoom && step === 2) return "";
    if (isShop && step === 2) return "";
    if (isResidentialRoom && step === 3 && form.familyMembers && Number(form.familyMembers) < 0) return "Enter a valid family members count.";
    if (!isResidentialRoom && !isShop && step === 2 && (!form.relative1Name.trim() || !/^\d{10}$/.test(form.relative1Phone) || !form.relative2Name.trim() || !/^\d{10}$/.test(form.relative2Phone))) return "Complete both emergency contacts with valid phone numbers.";
    if (!isResidentialRoom && !isShop && step === 3 && !form.companyAddress.trim()) return "Enter the company or college details.";
    if (isShop && step === 3 && !form.shopBusiness.trim()) return "Enter what is being sold or done in the shop.";
    if (step === 4 && ((!Number.isFinite(Number(form.depositAmount)) || Number(form.depositAmount) < 0) || !documents.selfAadhar || !documents.photo || (!isShop && !documents.parentAadhar))) return isShop ? "Enter the deposit and add Aadhaar plus tenant photograph." : "Enter the deposit and add all three required images.";
    return "";
  }

  function nextStep() {
    const message = validateStep();
    if (message) return setError(message);
    setError(""); setStep((current) => current + 1);
  }

  async function submit() {
    const message = validateStep();
    if (message) return setError(message);
    try {
      setSaving(true); setError("");
      await createTenantWithDocuments({
        ...form,
        roomId: selected.unit._id, propertyType: assignmentType, category: selected.unit.category || "", hasWing: Boolean(selected.unit.hasWing && selected.unit.wingName), wingName: selected.unit.wingName || "", floorNo: selected.unit.floorNo || "",
        roomNo: selected.unit.roomNo || "", bedNo: selected.bed.bedNo || "", baseRent: Number(selected.bed.price || 0),
        familyMembers: form.familyMembers ? Number(form.familyMembers) : 0,
        hasCanteen: assignmentType === "bed" && canteenEnabled ? Boolean(form.hasCanteen) : false,
        canteenPlanType: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenPlan : "",
        canteenStartDate: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? form.joiningDate : undefined,
        canteenMonthlyAmount: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenMeta.amount : 0,
        canteenIncludedMeals: assignmentType === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenMeta.meals : [],
        shopName: form.shopName.trim(),
        shopBusiness: form.shopBusiness.trim(),
      }, [
        { ...documents.selfAadhar, relation: "Self Aadhaar Card" },
        ...(isShop ? [] : [{ ...documents.parentAadhar, relation: isResidentialRoom ? "Partner Aadhaar Card" : "Parent Aadhaar Card" }]),
        { ...documents.photo, relation: isResidentialRoom || isShop ? "Tenant Photograph (Selfie)" : "Tenant Photo" },
      ]);
      setForm(blankForm());
      setDocuments(blankDocuments());
      setStep(0);
      setSelectedIndex(0);
      setShowUnits(false);
      router.replace("/system/tenants");
    } catch (err) { setError(err.response?.data?.message || "Unable to save tenant admission."); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <>
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => step ? setStep(step - 1) : router.replace("/system/tenants")} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View style={styles.topTitle}><Text style={styles.title}>Tenant admission</Text><Text style={styles.subtitle}>Step {step + 1} of {STEPS.length} | {STEPS[step]}</Text></View>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} /></View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? <>
          <Text style={styles.sectionTitle}>Personal and unit</Text>
          <Text style={styles.label}>Where are we adding this tenant?</Text>
          <View style={styles.typeSegment}>{assignmentTypes.map((type) => {
            const active = assignmentType === type.value;
            const count = filterVacanciesByType(vacancies, type.value).length;
            return <Pressable key={type.value} onPress={() => { setAssignmentType(type.value); setSelectedIndex(0); setShowUnits(false); }} style={[styles.typeButton, active && styles.segmentActive]}><Text style={[styles.typeText, active && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(type.label)}</Text><Text style={[styles.typeCount, active && styles.segmentTextActive]} numberOfLines={1}>{count} vacant</Text></Pressable>;
          })}</View>
          <Text style={styles.label}>Vacant unit</Text>
          <Pressable onPress={() => setShowUnits((current) => !current)} disabled={!filteredVacancies.length} style={[styles.select, !filteredVacancies.length && styles.disabled]}><Text style={styles.selectValue} numberOfLines={2}>{unitLabel}</Text><ChevronDown size={19} color={colors.muted} /></Pressable>
          {showUnits ? <View style={styles.options}>{groupedVacancies.map((group) => <View key={group.propertyName}><Text style={styles.optionGroupTitle}>{group.propertyName}</Text>{group.vacancies.map(({ unit, bed }) => { const index = filteredVacancies.findIndex((vacancy) => String(vacancy.unit._id) === String(unit._id) && String(vacancy.bed?.bedNo || "") === String(bed?.bedNo || "")); return <Pressable key={`${unit._id}-${bed.bedNo}`} onPress={() => { setSelectedIndex(index); setShowUnits(false); }} style={[styles.option, index === selectedIndex && styles.optionSelected]}><View style={styles.optionText}><Text style={styles.optionTitle}>{unitTypeLabel(unit)}</Text><Text style={styles.optionMeta}>{formatVacancyMeta(unit, bed)}</Text></View>{index === selectedIndex ? <Check size={18} color={colors.primary} /> : null}</Pressable>; })}</View>)}</View> : null}
          <Field label="Full name" value={form.name} onChangeText={(value) => setValue("name", value)} placeholder="Tenant name" />
          {isShop ? <Field label="Shop name" value={form.shopName} onChangeText={(value) => setValue("shopName", value)} placeholder="Enter shop name" /> : null}
          <Field label="Phone number" value={form.phoneNo} onChangeText={(value) => setValue("phoneNo", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" placeholder="10-digit mobile number" />
          <FormDateField label="Date of birth" value={form.dob} onChange={(value) => setValue("dob", value)} maximumDate={new Date()} />
          <FormDateField label="Joining date" value={form.joiningDate} onChange={(value) => setValue("joiningDate", value)} />
          {!isResidentialRoom && !isShop && canteenEnabled ? <>
            <Text style={styles.label}>Canteen facility</Text>
            <View style={styles.segment}>
              {[[true, "Yes"], [false, "No"]].map(([value, label]) => (
                <Pressable key={label} onPress={() => setValue("hasCanteen", value)} style={[styles.segmentButton, form.hasCanteen === value && styles.segmentActive]}>
                  <Text style={[styles.segmentText, form.hasCanteen === value && styles.segmentTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {form.hasCanteen ? (
              <>
                {!canteenSettings?.isConfigured ? (
                  <View style={styles.configWarning}>
                    <Text style={styles.configWarningText}>Canteen settings are not configured yet.</Text>
                    <Pressable onPress={() => router.push("/system/canteen-settings")} style={styles.configButton}>
                      <Text style={styles.configButtonText}>Open canteen settings</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Text style={styles.label}>Canteen billing plan</Text>
                <View style={styles.segment}>
                  {canteenPlans.map((plan) => (
                    <Pressable key={plan} onPress={() => setValue("canteenPlanType", plan)} style={[styles.segmentButton, selectedCanteenPlan === plan && styles.segmentActive]}>
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
        </> : null}

        {step === 1 ? <>
          <Text style={styles.sectionTitle}>Permanent address</Text>
          <Field label="Pincode" value={form.pincode} onChangeText={(value) => setValue("pincode", value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" />
          {pinLookupStatus === "loading" ? <Text style={styles.helperText}>Fetching city and state from PIN code...</Text> : null}
          {pinLookupStatus === "success" ? <Text style={styles.helperText}>City and state updated from PIN code. You can still edit them.</Text> : null}
          {pinLookupStatus === "error" ? <Text style={styles.error}>Could not fetch city/state for this PIN code. Please enter them manually.</Text> : null}
          <Field label="City" value={form.city} onChangeText={(value) => setValue("city", value)} />
          <Field label="State" value={form.state} onChangeText={(value) => setValue("state", value)} />
          <Field label="Address" value={form.address} onChangeText={(value) => setValue("address", value)} multiline placeholder="Street and locality" />
          <Field label="House number (optional)" value={form.houseNo} onChangeText={(value) => setValue("houseNo", value)} />
          <Field label="Nearby place (optional)" value={form.nearbyPlace} onChangeText={(value) => setValue("nearbyPlace", value)} />
        </> : null}

        {step === 2 && !isResidentialRoom && !isShop ? <>
          <Text style={styles.sectionTitle}>Emergency contacts</Text>
          <RelationPicker label="First contact relation" value={form.relative1Relation} onChange={(value) => setValue("relative1Relation", value)} />
          <Field label="First contact name" value={form.relative1Name} onChangeText={(value) => setValue("relative1Name", value)} />
          <Field label="First contact phone" value={form.relative1Phone} onChangeText={(value) => setValue("relative1Phone", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
          <RelationPicker label="Second contact relation" value={form.relative2Relation} onChange={(value) => setValue("relative2Relation", value)} />
          <Field label="Second contact name" value={form.relative2Name} onChangeText={(value) => setValue("relative2Name", value)} />
          <Field label="Second contact phone" value={form.relative2Phone} onChangeText={(value) => setValue("relative2Phone", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
        </> : null}

        {step === 2 && isResidentialRoom ? <>
          <Text style={styles.sectionTitle}>Residential details</Text>
          <View style={styles.summary}><Text style={styles.summaryLabel}>Flat / room price</Text><Text style={styles.summaryValue}>Rs. {selected?.bed?.price || 0}</Text></View>
          <Text style={styles.helperText}>Building, wing, floor and flat are taken from the vacant room you selected. Change the selected unit in step 1 if needed.</Text>
        </> : null}

        {step === 2 && isShop ? <>
          <Text style={styles.sectionTitle}>Shop details</Text>
          <View style={styles.summary}><Text style={styles.summaryLabel}>Shop price</Text><Text style={styles.summaryValue}>Rs. {selected?.bed?.price || 0}</Text></View>
          <Text style={styles.helperText}>Building, floor and shop are taken from the vacant shop you selected. Change the selected unit in step 1 if needed.</Text>
        </> : null}

        {step === 3 ? <>
          <Text style={styles.sectionTitle}>{isResidentialRoom ? "Family and work" : isShop ? "Shop work" : "Work or education"}</Text>
          {isResidentialRoom ? <Field label="No. of family members" value={form.familyMembers} onChangeText={(value) => setValue("familyMembers", value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" placeholder="Enter family members count" /> : null}
          {isShop ? <Field label="What are you selling/doing in shop" value={form.shopBusiness} onChangeText={(value) => setValue("shopBusiness", value)} multiline placeholder="Example: Grocery, mobile repair, salon, tailoring..." /> : <>
            <Field label={isResidentialRoom ? "Company Address / College" : "Company or college"} value={form.companyAddress} onChangeText={(value) => setValue("companyAddress", value)} multiline placeholder="Name and address" />
            <FormDateField label="Joining date at company/college" value={form.dateOfJoiningCollege} onChange={(value) => setValue("dateOfJoiningCollege", value)} />
          </>}
        </> : null}

        {step === 4 ? <>
          <Text style={styles.sectionTitle}>Payment and documents</Text>
          <Text style={styles.helperText}>After choosing an image, adjust the crop, then tap Cancel to discard or Done/Choose to use it. Selfies use a square crop.</Text>
          <View style={styles.summary}><Text style={styles.summaryLabel}>Monthly rent</Text><Text style={styles.summaryValue}>Rs. {selected?.bed?.price || 0}</Text></View>
          <Field label="Deposit amount" value={form.depositAmount} onChangeText={(value) => setValue("depositAmount", value)} keyboardType="numeric" placeholder="Example: 10000" />
          <Text style={styles.label}>Payment cycle</Text>
          <View style={styles.segment}>{[["NOT_PAID", "Normal cycle - payable after month completes"], ["ADVANCE_PAID", "Advance paid - joining cycle paid"]].map(([value, label]) => <Pressable key={value} onPress={() => setValue("firstRentStatus", value)} style={[styles.segmentButton, form.firstRentStatus === value && styles.segmentActive]}><Text style={[styles.segmentText, form.firstRentStatus === value && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View>
          {form.firstRentStatus === "ADVANCE_PAID" ? <><Text style={styles.label}>Payment mode</Text><View style={styles.segment}>{["Cash", "Online"].map((value) => <Pressable key={value} onPress={() => setValue("paymentMode", value)} style={[styles.segmentButton, form.paymentMode === value && styles.segmentActive]}><Text style={[styles.segmentText, form.paymentMode === value && styles.segmentTextActive]}>{value}</Text></Pressable>)}</View></> : null}
          {(isShop ? [["selfAadhar", "Self Aadhaar Card"], ["photo", "Tenant Photograph (Selfie)"]] : isResidentialRoom ? [["selfAadhar", "Self Aadhaar Card"], ["parentAadhar", "Partner Aadhaar Card"], ["photo", "Tenant Photograph (Selfie)"]] : [["selfAadhar", "Tenant Aadhaar"], ["parentAadhar", "Parent/relative Aadhaar"], ["photo", "Tenant photograph"]]).map(([key, label]) => <View key={key}><Text style={styles.label}>{label}</Text><Pressable onPress={() => chooseImage(key)} style={[styles.documentButton, documents[key] && styles.documentReady]}>{documents[key] ? <Check size={19} color={colors.success} /> : <Camera size={19} color={colors.primary} />}<Text style={[styles.documentText, documents[key] && styles.documentReadyText]}>{documents[key] ? "Image selected" : "Choose image"}</Text></Pressable></View>)}
        </> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? <Pressable onPress={() => { setError(""); setStep(step - 1); }} style={styles.backButton}><ChevronLeft size={20} color={colors.primary} /><Text style={styles.backButtonText}>Back</Text></Pressable> : <View />}
        {step < STEPS.length - 1 ? <Pressable onPress={nextStep} style={styles.nextButton}><Text style={styles.nextText}>Continue</Text><ChevronRight size={20} color={colors.surface} /></Pressable> : <Pressable onPress={submit} disabled={saving} style={[styles.nextButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.nextText}>Save tenant</Text>}</Pressable>}
      </View>
    </View>
    {cropRequest ? (
      <WebImageCropper
        sourceUri={cropRequest.uri}
        aspect={cropRequest.aspect}
        outputName={`${cropRequest.key}.jpg`}
        onCancel={(cropError) => {
          setCropRequest(null);
          if (cropError) setError(cropError.message || "Unable to crop image.");
        }}
        onConfirm={(image) => {
          setDocuments((current) => ({ ...current, [cropRequest.key]: image }));
          setCropRequest(null);
        }}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 14, paddingTop: 12, flexDirection: "row", alignItems: "center" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, marginLeft: 4 },
  title: { color: colors.text, fontSize: 23, fontWeight: "700" },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  progress: { height: 3, marginTop: 10, backgroundColor: colors.border },
  progressFill: { height: 3, backgroundColor: colors.primary },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 30 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 2 },
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  multiline: { height: 82, paddingTop: 13, textAlignVertical: "top" },
  select: { minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectValue: { flex: 1, paddingRight: 8, color: colors.text, fontWeight: "600" },
  options: { marginTop: 5, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  option: { minHeight: 52, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1 },
  optionGroupTitle: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 12, fontWeight: "800", backgroundColor: colors.surfaceSoft },
  optionTitle: { color: colors.text, fontWeight: "600" },
  optionMeta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  unitDetails: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  unitDetailsTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  detailGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailBox: { flexGrow: 1, flexBasis: "47%", minHeight: 58, padding: 10, borderRadius: 6, backgroundColor: colors.surfaceSoft },
  detailBoxFull: { flexBasis: "100%", minHeight: 58, padding: 10, borderRadius: 6, backgroundColor: colors.primarySoft },
  detailLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  detailValue: { marginTop: 4, color: colors.text, fontSize: 14, fontWeight: "700" },
  summary: { height: 56, marginTop: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 7, backgroundColor: colors.primarySoft },
  summaryLabel: { color: colors.muted, fontWeight: "600" },
  summaryValue: { color: colors.primaryDark, fontSize: 17, fontWeight: "700" },
  helperText: { marginTop: 10, color: colors.muted, fontSize: 13, lineHeight: 19 },
  configWarning: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.warningSoft, borderRadius: 8, backgroundColor: colors.peach },
  configWarningText: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  configButton: { height: 42, marginTop: 10, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  configButtonText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  segment: { height: 48, padding: 3, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border },
  typeSegment: { padding: 4, flexDirection: "row", gap: 4, borderRadius: 7, backgroundColor: colors.border },
  typeButton: { flex: 1, minWidth: 0, minHeight: 68, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  typeText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  typeCount: { width: "100%", marginTop: 3, color: colors.subtle, fontSize: 10, fontWeight: "600", textAlign: "center" },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: colors.primary },
  documentButton: { height: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  documentReady: { borderColor: colors.successSoft, backgroundColor: colors.successSoft },
  documentText: { color: colors.primary, fontWeight: "700" },
  documentReadyText: { color: colors.success },
  error: { marginTop: 16, color: colors.danger },
  footer: { minHeight: 68, paddingHorizontal: 20, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  backButton: { height: 48, minWidth: 100, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 7 },
  backButtonText: { color: colors.primary, fontWeight: "700" },
  nextButton: { height: 48, minWidth: 135, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 7, backgroundColor: colors.primary },
  nextText: { color: colors.surface, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
