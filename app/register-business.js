import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { registerBusiness } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";

function Field({ label, required = false, error, note, right, ...props }) {
  return (
    <View>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <View style={[styles.inputWrap, error && styles.inputWrapError]}>
        <TextInput {...props} style={[styles.input, right && styles.inputWithRight]} />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && note ? <Text style={styles.fieldError}>{note}</Text> : null}
    </View>
  );
}

function cleanLoginId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}

export default function RegisterBusinessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    loginId: "",
    email: "",
    phone: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loginIdNote, setLoginIdNote] = useState("");

  const setValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/login");
  };

  async function submit() {
    const loginId = cleanLoginId(form.loginId);
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, "");

    const nextErrors = {};
    if (!form.ownerName.trim()) nextErrors.ownerName = "Owner name is required.";
    if (!loginId) nextErrors.loginId = "Login ID is required.";
    if (!email) nextErrors.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Enter a valid email address, for example owner@gmail.com.";
    if (!phone) nextErrors.phone = "Phone number is required.";
    else if (phone.length !== 10) nextErrors.phone = `Phone number must be 10 digits. You entered ${phone.length}.`;
    if (!form.password) nextErrors.password = "Password is required.";
    else if (form.password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return setError("Please correct the highlighted fields.");

    try {
      setSaving(true);
      setError("");
      setFieldErrors({});
      await registerBusiness({
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        loginId,
        email,
        phone,
        password: form.password,
      });
      Alert.alert(
        "Trial account created",
        "Your 15-day trial is active. Login with your Login ID and password, then set your property unit counts.",
        [{ text: "Go to login", onPress: () => router.replace({ pathname: "/login", params: { registered: "trial" } }) }]
      );
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create trial account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 12, 24),
            paddingBottom: Math.max(insets.bottom + 32, 42),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Create trial account</Text>
            <Text style={styles.subtitle}>Start your 15-day free trial. No payment required.</Text>
          </View>
        </View>

        <View style={styles.card}>
          {/* <Text style={styles.sectionTitle}>Business details</Text> */}
          <Field label="Business name " value={form.businessName} onChangeText={(value) => setValue("businessName", value)} placeholder="Property Name" />
          <Field label="Owner name" required error={fieldErrors.ownerName} value={form.ownerName} onChangeText={(value) => setValue("ownerName", value)} placeholder=" Full Name" />

          {/* <Text style={styles.sectionTitle}>Login details</Text> */}
          <Field
            label="Login ID"
            required
            error={fieldErrors.loginId}
            note={loginIdNote}
            value={form.loginId}
            onChangeText={(value) => {
              const cleaned = cleanLoginId(value);
              setLoginIdNote(/[^a-zA-Z0-9._-]/.test(value) ? "Only letters, numbers, dot, underscore and hyphen are allowed." : "");
              setValue("loginId", cleaned);
            }}
            autoCapitalize="none"
            placeholder="Create a login ID"
          />
          <Field
            label="Email"
            required
            error={fieldErrors.email}
            value={form.email}
            onChangeText={(value) => setValue("email", value)}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email address"
          />
          <Field
            label="Phone"
            required
            error={fieldErrors.phone}
            value={form.phone}
            onChangeText={(value) => setValue("phone", value.replace(/\D/g, "").slice(0, 10))}
            keyboardType="phone-pad"
            placeholder="10-digit number"
          />
          <Field
            label="Password"
            required
            error={fieldErrors.password}
            value={form.password}
            onChangeText={(value) => setValue("password", value)}
            secureTextEntry={!showPassword}
            placeholder="Minimum 8 characters"
            right={<Pressable onPress={() => setShowPassword((value) => !value)} style={styles.eyeButton} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}</Pressable>}
          />

          <View style={styles.trialBox}>
            <Text style={styles.trialTitle}>15-day free access</Text>
            <Text style={styles.trialText}>Try all features free for 15 days.
No payment is required now. Choose a plan after your trial to continue.</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={submit} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Create trial account</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 42, height: 42, marginRight: 8, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: { padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  sectionTitle: { marginTop: 10, color: colors.text, fontSize: 17, fontWeight: "800" },
  label: { marginTop: 14, marginBottom: 7, color: colors.muted, fontSize: 13, fontWeight: "800" },
  inputWrap: { minHeight: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  inputWrapError: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 13, color: colors.text, fontSize: 15 },
  inputWithRight: { paddingRight: 4 },
  eyeButton: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  required: { color: colors.danger },
  fieldError: { marginTop: 5, color: colors.danger, fontSize: 12, fontWeight: "700" },
  trialBox: { marginTop: 18, padding: 13, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: 8, backgroundColor: colors.primarySoft },
  trialTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  trialText: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  error: { marginTop: 14, color: colors.danger, fontWeight: "700" },
  primaryButton: { marginTop: 18, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
