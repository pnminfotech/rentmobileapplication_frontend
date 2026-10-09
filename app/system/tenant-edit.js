import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, Check, ChevronDown, Eye, MoveRight, X } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import WebImageCropper from "../../src/components/WebImageCropper";
import { getSystemDashboard } from "../../src/api/saasApi";
import { getCanteenSettings } from "../../src/api/canteenApi";
import { getTenant, updateTenantDocuments, updateTenantProfile } from "../../src/api/tenantApi";
import { formatTenantUnit, propertyTypeFromTenant } from "../../src/utils/unitLabels";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

function Field({ label, multiline, ...props }) {
  return <><Text style={styles.label}>{label}</Text><TextInput {...props} multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></>;
}

const RELATIONS = ["Father", "Mother", "Husband", "Sister", "Brother", "Self"];
const DOCUMENTS = [
  { key: "selfAadhar", relation: "Self Aadhaar Card", label: "Tenant Aadhaar" },
  { key: "parentAadhar", relation: "Parent Aadhaar Card", label: "Parent Aadhaar" },
  { key: "photo", relation: "Tenant Photo", label: "Tenant photo" },
];
const RESIDENTIAL_DOCUMENTS = [
  { key: "selfAadhar", relation: "Self Aadhaar Card", label: "Self Aadhaar Card" },
  { key: "parentAadhar", relation: "Partner Aadhaar Card", label: "Partner Aadhaar Card" },
  { key: "photo", relation: "Tenant Photograph (Selfie)", label: "Tenant Photograph (Selfie)" },
];
const SHOP_DOCUMENTS = [
  { key: "selfAadhar", relation: "Self Aadhaar Card", label: "Self Aadhaar Card" },
  { key: "photo", relation: "Tenant Photograph (Selfie)", label: "Tenant Photograph (Selfie)" },
];
const CANTEEN_MODE_LABELS = {
  per_meal: "Per meal pricing",
  meal_package: "Meal package monthly",
};

function documentKeyForRelation(relation = "") {
  const value = String(relation).toLowerCase();
  if (value.includes("self") && value.includes("aadhaar")) return "selfAadhar";
  if ((value.includes("parent") || value.includes("partner") || value.includes("relative")) && value.includes("aadhaar")) return "parentAadhar";
  if (value.includes("photo") || value.includes("photograph") || value.includes("selfie")) return "photo";
  return null;
}

function documentRelationForKey(key, type) {
  if (key === "selfAadhar") return "Self Aadhaar Card";
  if (key === "parentAadhar") return type === "room" ? "Partner Aadhaar Card" : "Parent Aadhaar Card";
  return type === "bed" ? "Tenant Photo" : "Tenant Photograph (Selfie)";
}

function RelationPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return <><Text style={styles.label}>{label}</Text><Pressable onPress={() => setOpen((current) => !current)} style={styles.select}><Text style={styles.selectValue}>{value}</Text><ChevronDown size={19} color={colors.muted} /></Pressable>{open ? <View style={styles.options}>{RELATIONS.map((relation) => <Pressable key={relation} onPress={() => { onChange(relation); setOpen(false); }} style={[styles.option, relation === value && styles.optionSelected]}><Text style={styles.optionText}>{relation}</Text>{relation === value ? <Check size={18} color={colors.primary} /> : null}</Pressable>)}</View> : null}</>;
}

function Toggle({ value, onChange }) {
  return <View style={styles.toggle}>{[["NOT_PAID", "Normal cycle"], ["ADVANCE_PAID", "Advance cycle"]].map(([key, label]) => <Pressable key={key} onPress={() => onChange(key)} style={[styles.toggleOption, value === key && styles.toggleSelected]}><Text style={[styles.toggleText, value === key && styles.toggleTextSelected]}>{label}</Text></Pressable>)}</View>;
}

export default function TenantEditScreen() {
  const router = useRouter();
  const { id, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [tenant, setTenant] = useState(null);
  const [form, setForm] = useState(null);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [canteenSettings, setCanteenSettings] = useState(null);
  const [documentUpdates, setDocumentUpdates] = useState({ selfAadhar: [], parentAadhar: [], photo: [] });
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cropRequest, setCropRequest] = useState(null);
  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadTenant = useCallback(async () => {
    try {
      const [tenant, dashboardData, settingsData] = await Promise.all([getTenant(id), getSystemDashboard(), getCanteenSettings().catch(() => null)]);
      setCanteenEnabled(hasCanteenFeature(dashboardData));
      setCanteenSettings(settingsData);
      setTenant(tenant);
      setForm({
        name: tenant.name || "", phoneNo: String(tenant.phoneNo || ""), dob: toDateValue(tenant.dob || new Date()),
        joiningDate: toDateValue(tenant.joiningDate || new Date()), depositAmount: String(tenant.depositAmount ?? ""),
        firstRentStatus: tenant.firstRentStatus || "NOT_PAID", firstRentMonth: tenant.firstRentMonth || "",
        address: tenant.address || "", pincode: tenant.pincode || "", city: tenant.city || "", state: tenant.state || "",
        houseNo: tenant.houseNo || "", nearbyPlace: tenant.nearbyPlace || "",
        relative1Relation: tenant.relative1Relation || "Father", relative1Name: tenant.relative1Name || "", relative1Phone: tenant.relative1Phone || "",
        relative2Relation: tenant.relative2Relation || "Mother", relative2Name: tenant.relative2Name || "", relative2Phone: tenant.relative2Phone || "",
        familyMembers: tenant.familyMembers != null ? String(tenant.familyMembers) : "",
        hasCanteen: Boolean(tenant.hasCanteen),
        canteenPlanType: tenant.canteenPlanType || "",
        canteenMonthlyAmount: tenant.canteenMonthlyAmount ? String(tenant.canteenMonthlyAmount) : "",
        canteenMealPrices: {
          breakfast: tenant.canteenMealPrices?.breakfast ? String(tenant.canteenMealPrices.breakfast) : "",
          lunch: tenant.canteenMealPrices?.lunch ? String(tenant.canteenMealPrices.lunch) : "",
          dinner: tenant.canteenMealPrices?.dinner ? String(tenant.canteenMealPrices.dinner) : "",
        },
        canteenStatusEffectiveFrom: new Date(),
        shopName: tenant.shopName || "",
        shopBusiness: tenant.shopBusiness || "",
        companyAddress: tenant.companyAddress || "", dateOfJoiningCollege: toDateValue(tenant.dateOfJoiningCollege || new Date()),
      });
    } catch (err) { setError(err.response?.data?.message || "Unable to load tenant."); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { loadTenant(); }, [loadTenant]));

  async function chooseImage(key) {
    const isSelfie = key === "photo";
    const options = {
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: isSelfie ? [1, 1] : [4, 3],
      quality: 0.85,
    };
    const source = Platform.OS === "web"
      ? "library"
      : await new Promise((resolve) => Alert.alert(
          "Add document",
          "Choose how to add this document",
          [
            { text: "Camera", onPress: () => resolve("camera") },
            { text: "Upload / Gallery", onPress: () => resolve("library") },
            { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
          ]
        ));
    if (!source) return;

    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert(
        "Permission needed",
        source === "camera" ? "Allow camera access to take this document photo." : "Allow photo access to select this document."
      );
    }

    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({
          ...options,
          cameraType: isSelfie ? ImagePicker.CameraType?.front || "front" : ImagePicker.CameraType?.back || "back",
        })
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const selectedImage = result.assets[0];
    if (Platform.OS === "web") {
      setCropRequest({ key, index: documentUpdates[key].length, uri: selectedImage.uri, width: selectedImage.width, height: selectedImage.height, aspect: isSelfie ? 1 : 4 / 3 });
      return;
    }
    setCropRequest({ key, index: documentUpdates[key].length, uri: selectedImage.uri, width: selectedImage.width, height: selectedImage.height, aspect: isSelfie ? 1 : 4 / 3 });
  }

  function removeSelectedDocument(key, index) {
    setDocumentUpdates((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function removeExistingDocument(document) {
    const identity = String(document?.fileId || document?._id || "");
    if (identity) setRemovedDocumentIds((current) => current.includes(identity) ? current : [...current, identity]);
  }

  function openDocumentPreview(document) {
    if (!document?.url) {
      Alert.alert("Document unavailable", "This document does not have a file URL.");
      return;
    }
    setPreviewError(false);
    setPreviewDocument(document);
  }

  async function save(confirmedDateChange = false) {
    const deposit = Number(form.depositAmount);
    if (!form.name.trim() || !/^\d{10}$/.test(form.phoneNo)) return setError("Enter a name and valid 10-digit phone number.");
    if (!Number.isFinite(deposit) || deposit < 0) return setError("Enter a valid deposit amount.");
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) return setError("Enter a valid 6-digit pincode.");
    const type = propertyTypeFromTenant(tenant || {});
    if (type === "bed" && form.relative1Phone && !/^\d{10}$/.test(form.relative1Phone)) return setError("Enter a valid first contact phone number.");
    if (type === "bed" && form.relative2Phone && !/^\d{10}$/.test(form.relative2Phone)) return setError("Enter a valid second contact phone number.");
    const canteenPlans = (canteenSettings?.activeModes || []).filter((mode) => mode !== "guest_meal");
    const selectedCanteenPlan = form.canteenPlanType || canteenPlans[0] || "";
    if (type === "bed" && canteenEnabled && form.hasCanteen && (!canteenSettings?.isConfigured || !selectedCanteenPlan)) return setError("Configure canteen settings and choose a canteen billing plan.");
    const selectedCanteenMeta = selectedCanteenPlan === "meal_package"
      ? { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0), meals: canteenSettings?.mealPackage?.includedMeals || [] }
      : selectedCanteenPlan === "meal_package"
        ? { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0), meals: canteenSettings?.mealPackage?.includedMeals || [] }
        : { amount: 0, meals: [] };
    if (type === "room" && form.familyMembers && Number(form.familyMembers) < 0) return setError("Enter a valid family members count.");
    const joiningDateChanged = toDateValue(tenant?.joiningDate) !== form.joiningDate;
    if (joiningDateChanged && !tenant?.joiningDateChangeUsed && !confirmedDateChange) {
      Alert.alert(
        "Confirm joining date",
        "Please select the correct joining date. After you save this change, the joining date cannot be changed again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm date", onPress: () => save(true) },
        ]
      );
      return;
    }
    try {
      setSaving(true); setError("");
      await updateTenantProfile(id, {
        ...form,
        propertyType: type,
        name: form.name.trim(),
        phoneNo: Number(form.phoneNo),
        depositAmount: deposit,
        familyMembers: form.familyMembers ? Number(form.familyMembers) : 0,
        hasCanteen: type === "bed" && canteenEnabled ? Boolean(form.hasCanteen) : false,
        canteenPlanType: type === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenPlan : "",
        canteenStatusEffectiveFrom: form.canteenStatusEffectiveFrom,
        canteenStartDate: type === "bed" && canteenEnabled && form.hasCanteen ? form.joiningDate : undefined,
        canteenMonthlyAmount: type === "bed" && canteenEnabled && form.hasCanteen ? Number(form.canteenMonthlyAmount || selectedCanteenMeta.amount || 0) : 0,
        canteenMealPrices: type === "bed" && canteenEnabled && form.hasCanteen ? {
          breakfast: Number(form.canteenMealPrices.breakfast || 0),
          lunch: Number(form.canteenMealPrices.lunch || 0),
          dinner: Number(form.canteenMealPrices.dinner || 0),
        } : { breakfast: 0, lunch: 0, dinner: 0 },
        canteenIncludedMeals: type === "bed" && canteenEnabled && form.hasCanteen ? selectedCanteenMeta.meals : [],
      });
      const pendingDocuments = Object.entries(documentUpdates).flatMap(([key, items]) =>
        items.map((document) => ({ ...document, relation: documentRelationForKey(key, type) }))
      );
      if (pendingDocuments.length || removedDocumentIds.length) {
        await updateTenantDocuments(id, pendingDocuments, removedDocumentIds);
      }
      router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } });
    } catch (err) { setError(err.response?.data?.message || "Unable to update tenant."); }
    finally { setSaving(false); }
  }

  if (loading || !form) return <View style={styles.loading}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Text style={styles.error}>{error}</Text>}</View>;
  const propertyType = propertyTypeFromTenant(tenant || {});
  const isResidentialRoom = propertyType === "room";
  const isShop = propertyType === "shop";
  const documentList = isShop ? SHOP_DOCUMENTS : isResidentialRoom ? RESIDENTIAL_DOCUMENTS : DOCUMENTS;
  const canteenPlans = (canteenSettings?.activeModes || []).filter((mode) => mode !== "guest_meal");
  const selectedCanteenPlan = form.canteenPlanType || canteenPlans[0] || "";
  const selectedCanteenMeta = selectedCanteenPlan === "meal_package"
    ? { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0) }
    : selectedCanteenPlan === "meal_package"
      ? { amount: Number(canteenSettings?.mealPackage?.monthlyAmount || 0) }
      : { amount: 0 };

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable onPress={() => router.replace({ pathname: "/system/tenant-details", params: { id, returnTo } })} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable><View style={styles.headerText}><Text style={styles.title}>Edit tenant</Text><Text style={styles.subtitle}>Update admission and profile details</Text></View></View>
        <Text style={styles.sectionTitle}>Room Details</Text>
        <View style={styles.assignment}><View style={styles.assignmentText}><Text style={styles.assignmentTitle}>
          {tenant.category || "Property"} | Floor {tenant.floorNo || "-"} | {formatTenantUnit(tenant)}</Text>
          <Text style={styles.assignmentMeta}>Monthly rent: Rs. {tenant.baseRent || tenant.rentAmount || 0}
            </Text></View>
          {/* <Pressable accessibilityLabel="Shift tenant" onPress={() => router.push({ pathname: "/system/tenant-shift", params: { id, returnTo } })} style={styles.shiftButton}>
            <MoveRight size={20} color={colors.primary} />
            
            </Pressable> */}
            </View>

        <Text style={styles.sectionTitle}>Personal</Text>
        <Field label="Full name" value={form.name} onChangeText={(value) => setValue("name", value)} />
        <Field label="Phone number" value={form.phoneNo} onChangeText={(value) => setValue("phoneNo", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
        {!isShop ? <FormDateField label="Date of birth" value={form.dob} onChange={(value) => setValue("dob", value)} maximumDate={new Date()} /> : null}
        <FormDateField label="Tenant joining date" value={form.joiningDate} onChange={(value) => setValue("joiningDate", value)} maximumDate={new Date()} disabled={Boolean(tenant?.joiningDateChangeUsed)} />
        {tenant?.joiningDateChangeUsed ? <Text style={styles.dateChangeHint}>Joining date has already been changed once and is now locked.</Text> : null}

        <Text style={styles.sectionTitle}>Financial</Text>
        <Field label="Deposit amount" value={form.depositAmount} onChangeText={(value) => setValue("depositAmount", value.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
        {!isResidentialRoom && !isShop && canteenEnabled ? <>
          <Text style={styles.label}>Canteen facility</Text>
          <View style={styles.toggle}>
            {[[true, "Yes"], [false, "No"]].map(([value, label]) => (
              <Pressable key={label} onPress={() => setValue("hasCanteen", value)} style={[styles.toggleOption, form.hasCanteen === value && styles.toggleSelected]}>
                <Text style={[styles.toggleText, form.hasCanteen === value && styles.toggleTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <FormDateField label="Canteen status effective from" value={form.canteenStatusEffectiveFrom} onChange={(value) => setValue("canteenStatusEffectiveFrom", value)} />
          {form.hasCanteen ? (
            <>
              {!canteenSettings?.isConfigured ? <Text style={styles.error}>Canteen settings are not configured yet. Open More {">"} Canteen settings first.</Text> : null}
              <Text style={styles.label}>Canteen billing plan</Text>
              <View style={styles.toggle}>
                {canteenPlans.map((plan) => (
                  <Pressable key={plan} onPress={() => setValue("canteenPlanType", plan)} style={[styles.toggleOption, selectedCanteenPlan === plan && styles.toggleSelected]}>
                    <Text style={[styles.toggleText, selectedCanteenPlan === plan && styles.toggleTextSelected]}>{CANTEEN_MODE_LABELS[plan] || plan}</Text>
                  </Pressable>
                ))}
              </View>
              {selectedCanteenPlan === "per_meal" ? (
                <>
                  <Text style={styles.label}>Individual meal prices (optional)</Text>
                  <Text style={styles.helperText}>Leave blank to use common canteen prices.</Text>
                  {[["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"]].map(([key, label]) => (
                    <Field key={key} label={`${label} price`} value={form.canteenMealPrices[key]} onChangeText={(value) => setValue("canteenMealPrices", { ...form.canteenMealPrices, [key]: value.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" placeholder={`Common ${label.toLowerCase()} price`} />
                  ))}
                </>
              ) : (
                <Field label="Individual monthly canteen amount (optional)" value={form.canteenMonthlyAmount} onChangeText={(value) => setValue("canteenMonthlyAmount", value.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" placeholder={`Common amount: ${selectedCanteenMeta.amount || 0}`} />
              )}
            </>
          ) : null}
        </> : null}
        <Text style={styles.label}>Payment cycle</Text>
        <Toggle value={form.firstRentStatus} onChange={(value) => setValue("firstRentStatus", value)} />
        <View style={styles.cycleHelp}><Text style={styles.cycleHelpText}>• Normal cycle: rent becomes payable after the month completes.</Text><Text style={styles.cycleHelpText}>• Advance cycle: the joining month rent is paid at joining.</Text></View>
        <Field label="First rent month" value={form.firstRentMonth} onChangeText={(value) => setValue("firstRentMonth", value)} placeholder="Example: Jun-26" autoCapitalize="words" />

        <Text style={styles.sectionTitle}>Address</Text>
        <Field label="Pincode" value={form.pincode} onChangeText={(value) => setValue("pincode", value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" />
        <Field label="City" value={form.city} onChangeText={(value) => setValue("city", value)} />
        <Field label="State" value={form.state} onChangeText={(value) => setValue("state", value)} />
        <Field label="Address" value={form.address} onChangeText={(value) => setValue("address", value)} multiline />
        <Field label="House number" value={form.houseNo} onChangeText={(value) => setValue("houseNo", value)} />
        <Field label="Nearby place" value={form.nearbyPlace} onChangeText={(value) => setValue("nearbyPlace", value)} />

        {!isResidentialRoom && !isShop ? <>
          <Text style={styles.sectionTitle}>Emergency contacts</Text>
          <RelationPicker label="First relation" value={form.relative1Relation} onChange={(value) => setValue("relative1Relation", value)} />
          <Field label="First contact name" value={form.relative1Name} onChangeText={(value) => setValue("relative1Name", value)} />
          <Field label="First contact phone" value={form.relative1Phone} onChangeText={(value) => setValue("relative1Phone", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
          <RelationPicker label="Second relation" value={form.relative2Relation} onChange={(value) => setValue("relative2Relation", value)} />
          <Field label="Second contact name" value={form.relative2Name} onChangeText={(value) => setValue("relative2Name", value)} />
          <Field label="Second contact phone" value={form.relative2Phone} onChangeText={(value) => setValue("relative2Phone", value.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
        </> : null}

        {isResidentialRoom ? <>
          <Text style={styles.sectionTitle}>Family and work</Text>
          <Field label="No. of family members" value={form.familyMembers} onChangeText={(value) => setValue("familyMembers", value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
          <Field label="Company Address / College" value={form.companyAddress} onChangeText={(value) => setValue("companyAddress", value)} multiline />
          <FormDateField label="Joining date at company/college" value={form.dateOfJoiningCollege} onChange={(value) => setValue("dateOfJoiningCollege", value)} />
        </> : isShop ? <>
          <Text style={styles.sectionTitle}>Shop details</Text>
          <Field label="Shop name" value={form.shopName} onChangeText={(value) => setValue("shopName", value)} />
          <Field label="What are you selling/doing in shop" value={form.shopBusiness} onChangeText={(value) => setValue("shopBusiness", value)} multiline />
        </> : <>
          <Text style={styles.sectionTitle}>Work or education</Text>
          <Field label="Company or college" value={form.companyAddress} onChangeText={(value) => setValue("companyAddress", value)} multiline />
          <FormDateField label="Company or college joining date" value={form.dateOfJoiningCollege} onChange={(value) => setValue("dateOfJoiningCollege", value)} />
        </>}

        <Text style={styles.sectionTitle}>Documents</Text>
        <Text style={styles.documentHint}>Add multiple documents from your gallery or camera. Adjust the crop, then tap Done to use each image. Remove any file you no longer need.</Text>
        {documentList.map((document) => {
          const existing = (tenant.documents || []).filter((item) => documentKeyForRelation(item.relation) === document.key);
          const visibleExisting = existing.filter((item) => !removedDocumentIds.includes(String(item.fileId || item._id || "")));
          const pending = documentUpdates[document.key] || [];
          return <View key={document.key} style={styles.documentGroup}>
            <Text style={styles.documentGroupTitle}>{document.label}</Text>
            {visibleExisting.map((item, index) => <View key={String(item.fileId || item._id || index)} style={styles.documentRow}>
              <View style={styles.documentText}><Text style={styles.documentTitle} numberOfLines={1}>{item.fileName || `${document.label} ${index + 1}`}</Text><Text style={styles.documentMeta}>Currently uploaded</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${item.fileName || document.label}`} onPress={() => openDocumentPreview(item)} style={styles.previewDocumentButton}><Eye size={18} color={colors.primary} /></Pressable>
              <Pressable onPress={() => removeExistingDocument(item)} style={styles.removeDocumentButton}><Text style={styles.removeDocumentText}>Remove</Text></Pressable>
            </View>)}
            {pending.map((item, index) => <View key={`${document.key}-new-${index}`} style={styles.documentRow}>
              <View style={styles.documentText}><Text style={styles.documentTitle} numberOfLines={1}>{item.name || `${document.label} ${visibleExisting.length + index + 1}`}</Text><Text style={styles.documentMeta}>New image selected</Text></View>
              <Pressable onPress={() => removeSelectedDocument(document.key, index)} style={styles.removeDocumentButton}><Text style={styles.removeDocumentText}>Remove</Text></Pressable>
            </View>)}
            <Pressable onPress={() => chooseImage(document.key)} style={styles.addDocumentButton}><Camera size={17} color={colors.primary} /><Text style={styles.addDocumentText}>+ Add another {document.label.toLowerCase()}</Text></Pressable>
          </View>;
        })}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={save} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save all changes</Text>}</Pressable>
      </ScrollView>
      {cropRequest ? (
        <WebImageCropper
          sourceUri={cropRequest.uri}
          sourceWidth={cropRequest.width}
          sourceHeight={cropRequest.height}
          aspect={cropRequest.aspect}
          outputName={`${cropRequest.key}.jpg`}
          onCancel={(cropError) => {
            setCropRequest(null);
            if (cropError) Alert.alert("Unable to crop image", cropError.message || "Please try again.");
          }}
          onConfirm={(image) => {
            setDocumentUpdates((current) => {
              const next = [...current[cropRequest.key]];
              next[cropRequest.index] = image;
              return { ...current, [cropRequest.key]: next };
            });
            setCropRequest(null);
          }}
        />
      ) : null}
      <Modal visible={Boolean(previewDocument)} transparent animationType="fade" onRequestClose={() => setPreviewDocument(null)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1}>{previewDocument?.fileName || previewDocument?.relation || "Tenant document"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={() => setPreviewDocument(null)} style={styles.previewClose}><X size={21} color={colors.text} /></Pressable>
            </View>
            {previewDocument?.url && !previewError ? (
              <Image source={{ uri: previewDocument.url }} style={styles.previewImage} contentFit="contain" onError={() => setPreviewError(true)} />
            ) : (
              <View style={styles.previewUnavailable}><Text style={styles.previewUnavailableText}>This document could not be loaded. It may have been removed from ImageKit.</Text></View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" }, header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8, backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" }, headerText: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontSize: 24, fontWeight: "700" }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  sectionTitle: { marginTop: 20, color: colors.text, fontSize: 17, fontWeight: "700" }, label: { marginTop: 14, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 }, multiline: { height: 78, paddingTop: 13, textAlignVertical: "top" },
  select: { height: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, selectValue: { flex: 1, color: colors.text, fontSize: 16 },
  options: { marginTop: 5, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, option: { height: 46, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, optionSelected: { backgroundColor: colors.primarySoft }, optionText: { flex: 1, color: colors.muted, fontWeight: "600" },
  assignment: { minHeight: 70, marginTop: 10, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, assignmentText: { flex: 1, paddingRight: 8 }, assignmentTitle: { color: colors.text, fontWeight: "700" }, assignmentMeta: { marginTop: 5, color: colors.muted, fontSize: 13 }, shiftButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primarySoft },
  toggle: { height: 48, padding: 3, flexDirection: "row", borderRadius: 7, backgroundColor: colors.border }, toggleOption: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 5 }, toggleSelected: { backgroundColor: colors.surface }, toggleText: { color: colors.muted, fontWeight: "600" }, toggleTextSelected: { color: colors.primary },
  documentGroup: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceSoft }, documentGroupTitle: { color: colors.text, fontWeight: "700" },
  documentRow: { minHeight: 62, marginTop: 9, padding: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, documentText: { flex: 1, minWidth: 0, paddingRight: 8 }, documentTitle: { color: colors.text, fontWeight: "700" }, documentMeta: { marginTop: 4, color: colors.muted, fontSize: 12 }, previewDocumentButton: { width: 36, height: 36, marginRight: 8, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: colors.primarySoft }, removeDocumentButton: { minHeight: 36, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: colors.dangerSoft }, removeDocumentText: { color: colors.danger, fontSize: 12, fontWeight: "700" }, addDocumentButton: { minHeight: 42, marginTop: 9, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 7, backgroundColor: colors.primarySoft }, addDocumentText: { color: colors.primary, fontWeight: "700" },
  previewOverlay: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.72)" }, previewCard: { width: "100%", maxWidth: 640, height: "82%", overflow: "hidden", borderRadius: 12, backgroundColor: colors.surface }, previewHeader: { minHeight: 54, paddingLeft: 15, paddingRight: 8, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }, previewTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "700" }, previewClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, previewImage: { flex: 1, width: "100%", backgroundColor: colors.screen }, previewUnavailable: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center" }, previewUnavailableText: { color: colors.muted, textAlign: "center", lineHeight: 21 },
  dateChangeHint: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 17 }, error: { marginTop: 14, color: colors.danger }, saveButton: { height: 50, marginTop: 24, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, saveText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.5 },
  documentHint: { marginTop: -2, marginBottom: 8, color: colors.muted, fontSize: 12, lineHeight: 17 },
  helperText: { marginTop: -4, marginBottom: 8, color: colors.muted, fontSize: 11 },
  cycleHelp: { marginTop: 8, padding: 10, borderRadius: 7, backgroundColor: colors.primarySoft },
  cycleHelpText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
});
