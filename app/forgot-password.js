import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { requestPasswordReset } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim()) {
      setError("Enter your registered email.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message || "Password reset instructions sent.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to request password reset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>Works for superadmin and property-owner accounts.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="registered@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable onPress={submit} disabled={loading} style={[styles.button, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Send reset link</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/login")} style={styles.backLink}>
          <Text style={styles.backText}>Back to sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.background },
  form: { width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { color: colors.text, fontSize: 30, fontWeight: "700" },
  subtitle: { marginTop: 6, marginBottom: 28, color: colors.muted, fontSize: 15 },
  input: { height: 50, marginBottom: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, fontSize: 16 },
  error: { marginBottom: 12, color: colors.danger },
  message: { marginBottom: 12, color: colors.success, lineHeight: 20 },
  button: { height: 50, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: colors.primary },
  disabled: { opacity: 0.65 },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  backLink: { marginTop: 18, alignItems: "center" },
  backText: { color: colors.muted, fontWeight: "700" },
});
