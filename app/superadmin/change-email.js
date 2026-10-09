import { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react-native";

import {
  requestSuperadminEmailChange,
  resendSuperadminEmailChangeCode,
  verifySuperadminEmailChange,
} from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { colors } from "../../src/theme/colors";
import { useResponsive } from "../../src/utils/responsive";

const COLORS = {
  bg: "#F6F8F8",
  card: "#FFFFFF",
  soft: "#EFF7FA",
  text: colors.text,
  muted: colors.muted,
  border: "#D9E8ED",
  primary: "#006D9E",
  primaryDark: "#004B76",
  danger: colors.danger,
  dangerSoft: colors.dangerSoft,
};

export default function SuperAdminChangeEmailScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const [stage, setStage] = useState("details");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function beginChange() {
    setError("");
    setNotice("");
    if (!newEmail.trim() || !password) {
      setError("Enter your new email address and current password.");
      return;
    }
    try {
      setBusy("request");
      const result = await requestSuperadminEmailChange(newEmail.trim(), password);
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email || "your new email address");
      setStage("verify");
      setNotice(`A 6-digit code was sent to ${result.email || "your new email address"}.`);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to start the email change.");
    } finally {
      setBusy("");
    }
  }

  async function verifyCode() {
    setError("");
    setNotice("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your new email inbox.");
      return;
    }
    try {
      setBusy("verify");
      await verifySuperadminEmailChange(challengeId, code.trim());
      await clearAuthSession();
      Alert.alert(
        "Email updated",
        "Your sign-in email has changed. All active sessions were signed out; sign in again with the new email.",
        [{ text: "Sign in", onPress: () => router.replace("/login") }]
      );
    } catch (err) {
      setError(err.response?.data?.message || "Unable to verify the code.");
    } finally {
      setBusy("");
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    try {
      setBusy("resend");
      const result = await resendSuperadminEmailChangeCode(challengeId);
      setMaskedEmail(result.email || maskedEmail);
      setNotice(`A new code was sent to ${result.email || maskedEmail}.`);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to resend the code.");
    } finally {
      setBusy("");
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
          <Text style={styles.headerTitle}>Change sign-in email</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.icon}>
          {stage === "details" ? <Mail size={22} color={COLORS.primary} /> : <ShieldCheck size={22} color={COLORS.primary} />}
        </View>
        <Text style={styles.title}>{stage === "details" ? "Verify your new address" : "Enter the email code"}</Text>
        <Text style={styles.description}>
          {stage === "details"
            ? "Confirm your current password, then we will send a one-time code to the new address."
            : `Enter the 6-digit code sent to ${maskedEmail}. It expires in 10 minutes.`}
        </Text>

        {stage === "details" ? (
          <>
            <Text style={styles.label}>New email address</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="name@example.com"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              editable={!busy}
            />
            <Text style={styles.label}>Current password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              secureTextEntry
              textContentType="password"
              placeholder="Enter your password"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              editable={!busy}
            />
            <ActionButton title="Send verification code" busy={busy === "request"} disabled={Boolean(busy)} onPress={beginChange} />
          </>
        ) : (
          <>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              placeholder="000000"
              placeholderTextColor={COLORS.muted}
              style={[styles.input, styles.codeInput]}
              maxLength={6}
              editable={!busy}
            />
            <ActionButton title="Verify and update email" busy={busy === "verify"} disabled={Boolean(busy)} onPress={verifyCode} />
            <Pressable disabled={Boolean(busy)} onPress={resendCode} style={styles.secondaryButton}>
              {busy === "resend" ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.secondaryButtonText}>Send a new code</Text>}
            </Pressable>
            <Pressable
              disabled={Boolean(busy)}
              onPress={() => { setStage("details"); setChallengeId(""); setCode(""); setError(""); setNotice(""); }}
              style={styles.backToDetails}
            >
              <Text style={styles.secondaryButtonText}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Text style={styles.securityNote}>After the update, all active sessions will be signed out. Sign in again with the new email.</Text>
      </View>
    </ScrollView>
  );
}

function ActionButton({ title, busy, disabled, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.buttonMuted]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingTop: 8, paddingBottom: 40 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: "900" },
  headerTitle: { marginTop: 2, color: COLORS.text, fontSize: 21, fontWeight: "900" },
  card: { padding: 18, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.card },
  icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: COLORS.soft },
  title: { marginTop: 14, color: COLORS.text, fontSize: 19, fontWeight: "900" },
  description: { marginTop: 6, marginBottom: 16, color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  label: { marginTop: 10, marginBottom: 6, color: COLORS.text, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, color: COLORS.text, backgroundColor: "#FFFFFF", fontSize: 14 },
  codeInput: { fontSize: 21, fontWeight: "800", letterSpacing: 6, textAlign: "center" },
  primaryButton: { minHeight: 48, marginTop: 18, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.primaryDark },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  buttonMuted: { opacity: 0.68 },
  secondaryButton: { minHeight: 44, marginTop: 8, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: "800" },
  backToDetails: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  error: { marginTop: 12, padding: 11, borderRadius: 10, color: COLORS.danger, backgroundColor: COLORS.dangerSoft, fontSize: 12, fontWeight: "700" },
  notice: { marginTop: 12, color: COLORS.primary, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  securityNote: { marginTop: 16, color: COLORS.muted, fontSize: 11, lineHeight: 17, fontWeight: "600" },
});
