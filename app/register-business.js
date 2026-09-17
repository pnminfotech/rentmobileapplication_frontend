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
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { registerBusiness } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";

function Field({ label, ...props }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} />
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

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
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

    if (!form.businessName.trim() || !form.ownerName.trim()) {
      return setError("Business name and owner name are required.");
    }
    if (!loginId) return setError("Create a login ID.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("Enter a valid email address or leave email blank.");
    }
    if (phone && phone.length !== 10) return setError("Enter a valid 10-digit phone number.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");

    try {
      setSaving(true);
      setError("");
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 12, 24),
            paddingBottom: Math.max(insets.bottom + 32, 42),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Create trial account</Text>
            <Text style={styles.subtitle}>Register now. Purchase a plan after 15 days.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Business details</Text>
          <Field label="Business name" value={form.businessName} onChangeText={(value) => setValue("businessName", value)} placeholder="Example: Demo Hostel" />
          <Field label="Owner name" value={form.ownerName} onChangeText={(value) => setValue("ownerName", value)} placeholder="Owner full name" />

          <Text style={styles.sectionTitle}>Login details</Text>
          <Field
            label="Login ID"
            value={form.loginId}
            onChangeText={(value) => setValue("loginId", cleanLoginId(value))}
            autoCapitalize="none"
            placeholder="example_owner"
          />
          <Field
            label="Email optional"
            value={form.email}
            onChangeText={(value) => setValue("email", value)}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="owner@example.com"
          />
          <Field
            label="Phone optional"
            value={form.phone}
            onChangeText={(value) => setValue("phone", value.replace(/\D/g, "").slice(0, 10))}
            keyboardType="phone-pad"
            placeholder="10-digit number"
          />
          <Field
            label="Password"
            value={form.password}
            onChangeText={(value) => setValue("password", value)}
            secureTextEntry
            placeholder="Minimum 8 characters"
          />

          <View style={styles.trialBox}>
            <Text style={styles.trialTitle}>15-day free access</Text>
            <Text style={styles.trialText}>After login, you will set beds, rooms, and shops once. After the trial ends, the app will ask you to purchase a plan.</Text>
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
  input: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  trialBox: { marginTop: 18, padding: 13, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: 8, backgroundColor: colors.primarySoft },
  trialTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  trialText: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  error: { marginTop: 14, color: colors.danger, fontWeight: "700" },
  primaryButton: { marginTop: 18, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
