import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Check, Camera, ChevronDown, ShieldCheck } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";

import FormDateField, { toDateValue } from "../src/components/FormDateField";
import {
  submitTenantInvite,
  uploadTenantInviteDocuments,
  validateTenantInvite,
} from "../src/api/tenantApi";
import { formatTenantUnit, propertyTypeFromTenant } from "../src/utils/unitLabels";
import { colors } from "../src/theme/colors";
import WebImageCropper from "../src/components/WebImageCropper";

const DOCUMENTS = [
  ["selfAadhar", "Tenant Aadhaar", "Self Aadhaar Card"],
  ["parentAadhar", "Parent/relative Aadhaar", "Parent Aadhaar Card"],
  ["photo", "Tenant photograph", "Tenant Photo"],
];
const RESIDENTIAL_DOCUMENTS = [
  ["selfAadhar", "Self Aadhaar Card", "Self Aadhaar Card"],
  ["parentAadhar", "Partner Aadhaar Card", "Partner Aadhaar Card"],
  ["photo", "Tenant Photograph (Selfie)", "Tenant Photograph (Selfie)"],
];
const SHOP_DOCUMENTS = [
  ["selfAadhar", "Self Aadhaar Card", "Self Aadhaar Card"],
  ["photo", "Tenant Photograph (Selfie)", "Tenant Photograph (Selfie)"],
];

const INITIAL_FORM = {
  dob: toDateValue(), pincode: "", city: "", state: "", address: "", houseNo: "", nearbyPlace: "",
  relativeAddress1: "", relative1Relation: "Father", relative1Name: "", relative1Phone: "",
  relative2Relation: "Mother", relative2Name: "", relative2Phone: "", companyAddress: "",
  dateOfJoiningCollege: toDateValue(), familyMembers: "", shopName: "", shopBusiness: "",
};

const RELATIONS = ["Father", "Mother", "Husband", "Sister", "Brother", "Self"];
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api";

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

function Field({ label, multiline, ...props }) {
  return <><Text style={styles.label}>{label}</Text><TextInput {...props} style={[styles.input, multiline && styles.multiline]} multiline={multiline} /></>;
}

function RelationPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen((current) => !current)} style={styles.select}>
        <Text style={styles.selectValue}>{value || "Choose relation"}</Text>
        <ChevronDown size={19} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {RELATIONS.map((relation) => (
            <Pressable key={relation} onPress={() => { onChange(relation); setOpen(false); }} style={[styles.option, relation === value && styles.optionSelected]}>
              <Text style={styles.optionText}>{relation}</Text>
              {relation === value ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function tokenFromParams(params) {
  const direct = firstValue(params.inv) || firstValue(params.token) || firstValue(params.invite);
  if (direct) return String(direct).trim();

  if (typeof window !== "undefined" && window.location) {
    const searchParams = new URLSearchParams(window.location.search || "");
    const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#\/?[^?]*\??/, ""));
    return String(
      searchParams.get("inv") ||
      searchParams.get("token") ||
      searchParams.get("invite") ||
      hashParams.get("inv") ||
      hashParams.get("token") ||
      hashParams.get("invite") ||
      ""
    ).trim();
  }

  return "";
}

function normalizeDocumentRelation(value) {
  const relation = String(value || "").trim().toLowerCase().replace(/[.\-_]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    self: "self aadhaar card",
    aadhaar: "self aadhaar card",
    "self aadhaar": "self aadhaar card",
    "tenant aadhaar": "self aadhaar card",
    "tenant aadhaar card": "self aadhaar card",
    "parent/relative aadhaar": "parent aadhaar card",
    "parent relative aadhaar": "parent aadhaar card",
    "partner aadhaar": "partner aadhaar card",
    "tenant photograph": "tenant photo",
    photo: "tenant photo",
  };
  return aliases[relation] || relation;
}

export default function TenantIntakeScreen() {
  const params = useLocalSearchParams();
  const token = tokenFromParams(params);
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [documents, setDocuments] = useState({});
  const [cropRequest, setCropRequest] = useState(null);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [pinLookupStatus, setPinLookupStatus] = useState("idle");

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      if (!token) {
        setError("This tenant link is invalid. Please ask the property manager for a new link.");
        setLoading(false);
        return;
      }
      try {
        const result = await validateTenantInvite(token);
        if (active) {
          setInvite(result);
          const prefill = result.prefill || {};
          setForm((current) => ({
            ...current,
            dob: prefill.dob ? toDateValue(prefill.dob) : current.dob,
            pincode: prefill.pincode ? String(prefill.pincode) : current.pincode,
            city: prefill.city || current.city,
            state: prefill.state || current.state,
            address: prefill.address || current.address,
            houseNo: prefill.houseNo || current.houseNo,
            nearbyPlace: prefill.nearbyPlace || current.nearbyPlace,
            relativeAddress1: prefill.relativeAddress1 || current.relativeAddress1,
            relative1Relation: prefill.relative1Relation || current.relative1Relation || "Father",
            relative1Name: prefill.relative1Name || current.relative1Name,
            relative1Phone: prefill.relative1Phone ? String(prefill.relative1Phone) : current.relative1Phone,
            relative2Relation: prefill.relative2Relation || current.relative2Relation || "Mother",
            relative2Name: prefill.relative2Name || current.relative2Name,
            relative2Phone: prefill.relative2Phone ? String(prefill.relative2Phone) : current.relative2Phone,
            companyAddress: prefill.companyAddress || current.companyAddress,
            dateOfJoiningCollege: prefill.dateOfJoiningCollege ? toDateValue(prefill.dateOfJoiningCollege) : current.dateOfJoiningCollege,
            familyMembers: prefill.familyMembers !== undefined && prefill.familyMembers !== null ? String(prefill.familyMembers) : current.familyMembers,
            shopName: prefill.shopName || current.shopName,
            shopBusiness: prefill.shopBusiness || current.shopBusiness,
          }));
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || "This link is invalid, expired, or already used.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInvite();
    return () => { active = false; };
  }, [token]);

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

  async function chooseDocument(key) {
    setError("");
    const isSelfie = key === "photo";
    const options = {
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: isSelfie ? [1, 1] : [4, 3],
      quality: 0.8,
    };
    const permission = isSelfie
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(isSelfie ? "Camera permission is required for tenant selfie." : "Photo permission is required to attach documents.");
    const result = isSelfie
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType?.front || "front" })
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const selectedImage = result.assets[0];
    if (Platform.OS === "web") {
      setCropRequest({ key, uri: selectedImage.uri, width: selectedImage.width, height: selectedImage.height, aspect: isSelfie ? 1 : 4 / 3 });
      return;
    }
    setCropRequest({ key, uri: selectedImage.uri, width: selectedImage.width, height: selectedImage.height, aspect: isSelfie ? 1 : 4 / 3 });
  }

  function validate() {
    const prefill = invite?.prefill || {};
    const propertyType = propertyTypeFromTenant(prefill);
    const isResidentialRoom = propertyType === "room";
    const isShop = propertyType === "shop";
    const required = [
      ...(isShop ? [] : [["dob", "Date of birth"]]),
      ["pincode", "Pincode"], ["city", "City"], ["state", "State"],
      ["address", "Address"], ["houseNo", "House number"], ["nearbyPlace", "Nearby place"],
      ...(isResidentialRoom
        ? [["familyMembers", "No. of family members"]]
        : isShop
        ? [["shopBusiness", "Shop work/business"]]
        : [
            ["relativeAddress1", "Relative address"], ["relative1Relation", "First contact relation"],
            ["relative1Name", "First contact name"], ["relative1Phone", "First contact phone"],
            ["relative2Relation", "Second contact relation"], ["relative2Name", "Second contact name"],
            ["relative2Phone", "Second contact phone"], ["companyAddress", "Company or college"],
            ["dateOfJoiningCollege", "Company or college joining date"],
          ]),
    ];
    const missing = required.find(([key]) => !String(form[key] || "").trim());
    if (missing) return `${missing[1]} is required.`;
    if (!/^\d{6}$/.test(form.pincode)) return "Pincode must be 6 digits.";
    if (!isResidentialRoom && !isShop && (!/^\d{10}$/.test(form.relative1Phone) || !/^\d{10}$/.test(form.relative2Phone))) return "Contact phone numbers must be 10 digits.";
    const existingDocuments = Array.isArray(invite?.existingDocuments) ? invite.existingDocuments : [];
    const hasDocument = (relation) => existingDocuments.some((document) =>
      Boolean(document?.url || document?.filePath || document?.fileId) &&
      normalizeDocumentRelation(document?.relation) === normalizeDocumentRelation(relation)
    );
    const requiredDocuments = isShop ? SHOP_DOCUMENTS : isResidentialRoom ? RESIDENTIAL_DOCUMENTS : DOCUMENTS;
    if (requiredDocuments.some(([key, , relation]) => !documents[key] && !hasDocument(relation))) return `All ${requiredDocuments.length} required tenant documents are required.`;
    return "";
  }

  async function submit() {
    if (submittingRef.current) return;
    const validationError = validate();
    if (validationError) return setError(validationError);

    try {
      submittingRef.current = true;
      setSaving(true);
      setError("");
      const prefill = invite?.prefill || {};
      const propertyType = propertyTypeFromTenant(prefill);
      const selectedDocumentList = propertyType === "shop" ? SHOP_DOCUMENTS : propertyType === "room" ? RESIDENTIAL_DOCUMENTS : DOCUMENTS;
      const selectedDocuments = selectedDocumentList.filter(([key]) => documents[key]).map(([key, , relation]) => ({ ...documents[key], relation }));
      const uploaded = selectedDocuments.length ? await uploadTenantInviteDocuments(selectedDocuments, token) : [];
      if (selectedDocuments.length !== uploaded.length) {
        throw new Error("One or more documents could not be uploaded. Please select them again and retry.");
      }
      const uploadedDocuments = selectedDocuments.map((selectedDocument, index) => {
        const file = uploaded[index] || {};
        const url = file.url || file.path || file.location || file.secure_url;
        if (!url) throw new Error("The document upload did not return a file URL. Please try again.");
        return {
          fileName: selectedDocument.fileName || selectedDocument.name || file.filename || `document-${index + 1}.jpg`,
          relation: selectedDocument.relation,
          url,
        };
      });
      await submitTenantInvite(token, { ...form, ...(uploadedDocuments.length ? { documents: uploadedDocuments } : {}) });
      setComplete(true);
    } catch (err) {
      const serverMessage = err.response?.data?.message;
      const networkMessage = err.request
        ? `Cannot reach the server at ${API_URL}. Check that the backend is running and your phone is on the same Wi-Fi.`
        : "";
      setError(serverMessage || networkMessage || err.message || "Unable to submit the tenant form.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Checking secure link…</Text></View>;
  if (complete) return <View style={styles.center}><View style={styles.successIcon}><Check size={34} color={colors.success} /></View><Text style={styles.completeTitle}>Form submitted</Text><Text style={styles.completeText}>Your information was saved successfully. This secure link cannot be used again.</Text></View>;
  if (!invite) return <View style={styles.center}><Text style={styles.invalidTitle}>Link unavailable</Text><Text style={styles.completeText}>{error}</Text></View>;

  const prefill = invite.prefill || {};
  const propertyType = propertyTypeFromTenant(prefill);
  const isResidentialRoom = propertyType === "room";
  const isShop = propertyType === "shop";
  const documentList = isShop ? SHOP_DOCUMENTS : isResidentialRoom ? RESIDENTIAL_DOCUMENTS : DOCUMENTS;
  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}><ShieldCheck size={30} color={colors.primary} /><View style={styles.headerText}><Text style={styles.title}>Tenant registration</Text><Text style={styles.subtitle}>Secure one-time form</Text></View></View>
      <View style={styles.allocation}>
        <Text style={styles.allocationName}>{prefill.name || "Tenant"}</Text>
        <Text style={styles.allocationMeta}>{prefill.category} · {formatTenantUnit(prefill)}</Text>
        <Text style={styles.allocationMeta}>Joining: {String(prefill.joiningDate || "").slice(0, 10)} · Rent: Rs. {prefill.baseRent || prefill.rentAmount || 0}</Text>
        {!isResidentialRoom && !isShop ? (
          <Text style={styles.allocationMeta}>Canteen: {prefill.hasCanteen ? "Taken" : "Not taken"}</Text>
        ) : null}
      </View>

      <Text style={styles.section}>Personal and address</Text>
      <FormDateField label="Date of birth" value={form.dob || toDateValue()} onChange={(v) => setValue("dob", v)} maximumDate={new Date()} />
      {isShop ? <Field label="Shop name" value={form.shopName} onChangeText={(v) => setValue("shopName", v)} /> : null}
      <Field label="Pincode" value={form.pincode} onChangeText={(v) => setValue("pincode", v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" />
      {pinLookupStatus === "loading" ? <Text style={styles.helperText}>Fetching city and state from PIN code...</Text> : null}
      {pinLookupStatus === "success" ? <Text style={styles.helperText}>City and state updated from PIN code. You can still edit them.</Text> : null}
      {pinLookupStatus === "error" ? <Text style={styles.errorInline}>Could not fetch city/state for this PIN code. Please enter them manually.</Text> : null}
      <Field label="City" value={form.city} onChangeText={(v) => setValue("city", v)} />
      <Field label="State" value={form.state} onChangeText={(v) => setValue("state", v)} />
      <Field label="Full address" value={form.address} onChangeText={(v) => setValue("address", v)} multiline />
      <Field label="House number" value={form.houseNo} onChangeText={(v) => setValue("houseNo", v)} />
      <Field label="Nearby place" value={form.nearbyPlace} onChangeText={(v) => setValue("nearbyPlace", v)} />

      {!isResidentialRoom && !isShop ? <>
        <Field label="Relative address" value={form.relativeAddress1} onChangeText={(v) => setValue("relativeAddress1", v)} multiline />

        <Text style={styles.section}>Emergency contacts</Text>
        <RelationPicker label="First contact relation" value={form.relative1Relation} onChange={(v) => setValue("relative1Relation", v)} />
        <Field label="First contact name" value={form.relative1Name} onChangeText={(v) => setValue("relative1Name", v)} />
        <Field label="First contact phone" value={form.relative1Phone} onChangeText={(v) => setValue("relative1Phone", v.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
        <RelationPicker label="Second contact relation" value={form.relative2Relation} onChange={(v) => setValue("relative2Relation", v)} />
        <Field label="Second contact name" value={form.relative2Name} onChangeText={(v) => setValue("relative2Name", v)} />
        <Field label="Second contact phone" value={form.relative2Phone} onChangeText={(v) => setValue("relative2Phone", v.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
      </> : null}

      <Text style={styles.section}>{isResidentialRoom ? "Family and work" : isShop ? "Shop work" : "Work or education"}</Text>
      {isResidentialRoom ? <Field label="No. of family members" value={form.familyMembers} onChangeText={(v) => setValue("familyMembers", v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" /> : null}
      {isShop ? <Field label="What are you selling/doing in shop" value={form.shopBusiness} onChangeText={(v) => setValue("shopBusiness", v)} multiline /> : <>
        <Field label={isResidentialRoom ? "Company Address / College" : "Company or college name and address"} value={form.companyAddress} onChangeText={(v) => setValue("companyAddress", v)} multiline />
        <FormDateField label="Joining date at company/college" value={form.dateOfJoiningCollege || toDateValue()} onChange={(v) => setValue("dateOfJoiningCollege", v)} />
      </>}

      <Text style={styles.section}>Required documents</Text>
      <Text style={styles.documentHint}>Adjust the crop after selecting or taking a photo. Tap Cancel to discard or Done/Choose to use it.</Text>
      {documentList.map(([key, label, relation]) => {
        const existingDocuments = Array.isArray(invite?.existingDocuments) ? invite.existingDocuments : [];
        const alreadyUploaded = existingDocuments.some((document) =>
          Boolean(document?.url || document?.filePath || document?.fileId) &&
          normalizeDocumentRelation(document?.relation) === normalizeDocumentRelation(relation)
        );
        const ready = Boolean(documents[key] || alreadyUploaded);
        return (
          <View key={key}>
            <Text style={styles.label}>{label}</Text>
            <Pressable onPress={() => chooseDocument(key)} style={[styles.documentButton, ready && styles.documentReady]}>
              {ready ? <Check size={20} color={colors.success} /> : <Camera size={20} color={colors.primary} />}
              <Text style={[styles.documentText, ready && styles.documentReadyText]}>{documents[key] ? "Selected" : alreadyUploaded ? "Already uploaded - tap to replace" : "Choose image"}</Text>
            </Pressable>
          </View>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={submit} disabled={saving} style={[styles.submit, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>Submit registration</Text>}</Pressable>
      <Text style={styles.securityNote}>Your link is valid for one successful submission only.</Text>
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
            if (cropError) setError(cropError.message || "Unable to crop image.");
          }}
          onConfirm={async (image) => {
            setDocuments((current) => ({ ...current, [cropRequest.key]: image }));
            setCropRequest(null);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 50 },
  center: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }, loadingText: { marginTop: 12, color: colors.muted },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 18, backgroundColor: colors.background }, headerText: { marginLeft: 10 }, title: { color: colors.text, fontSize: 25, fontWeight: "700" }, subtitle: { color: colors.muted, marginTop: 2 },
  allocation: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.primarySoft }, allocationName: { color: colors.primaryDark, fontSize: 18, fontWeight: "700" }, allocationMeta: { marginTop: 5, color: colors.primaryDark },
  section: { marginTop: 26, color: colors.text, fontSize: 18, fontWeight: "700" }, label: { marginTop: 15, marginBottom: 7, color: colors.muted, fontWeight: "600" },
  helperText: { marginTop: 6, color: colors.muted, fontSize: 12 },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 }, multiline: { height: 82, paddingTop: 13, textAlignVertical: "top" },
  select: { height: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, selectValue: { flex: 1, color: colors.text, fontSize: 16 },
  options: { marginTop: 5, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, option: { height: 46, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft }, optionSelected: { backgroundColor: colors.primarySoft }, optionText: { flex: 1, color: colors.muted, fontWeight: "600" },
  documentButton: { height: 50, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }, documentReady: { borderColor: colors.successSoft, backgroundColor: colors.successSoft }, documentText: { color: colors.primary, fontWeight: "700" }, documentReadyText: { color: colors.success }, documentHint: { marginTop: -2, marginBottom: 8, color: colors.muted, fontSize: 12, lineHeight: 17 },
  errorInline: { marginTop: 6, color: colors.danger, fontSize: 12 },
  error: { marginTop: 18, color: colors.danger, textAlign: "center" }, submit: { height: 52, marginTop: 22, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary }, submitText: { color: colors.surface, fontWeight: "700" }, disabled: { opacity: 0.55 }, securityNote: { marginTop: 12, color: colors.muted, fontSize: 12, textAlign: "center" },
  successIcon: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: colors.successSoft }, completeTitle: { marginTop: 18, color: colors.success, fontSize: 24, fontWeight: "700" }, invalidTitle: { color: colors.danger, fontSize: 24, fontWeight: "700" }, completeText: { maxWidth: 430, marginTop: 10, color: colors.muted, lineHeight: 22, textAlign: "center" },
});
