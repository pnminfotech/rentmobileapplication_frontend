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
import { useLocalSearchParams, useRouter } from "expo-router";

import { resetPassword } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const [token, setToken] = useState(String(initialToken || ""));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!token.trim()) return setError("Reset token is required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    try {
      setLoading(true);
      setError("");
      setMessage("");
      const result = await resetPassword(token.trim(), password);
      setMessage(result.message || "Password reset successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>Enter the reset token and choose a new password.</Text>

        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Reset token"
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable onPress={submit} disabled={loading || Boolean(message)} style={[styles.button, (loading || message) && styles.disabled]}>
          {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Reset password</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/login")} style={styles.backLink}>
          <Text style={styles.backText}>{message ? "Go to sign in" : "Back to sign in"}</Text>
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
