import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { loginSaas } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.registered !== "trial") return;
    Alert.alert(
      "Trial account created",
      "Login with your Login ID and password to set up your property units."
    );
  }, [params.registered]);

  useEffect(() => {
    if (params.payment !== "submitted") return;
    Alert.alert(
      "Payment submitted",
      "Your payment has been submitted. Please sign in to confirm activation. If payment is successful, your dashboard will open automatically."
    );
  }, [params.payment]);

  useEffect(() => {
    if (params.subscription !== "active") return;
    Alert.alert(
      "Subscription activated",
      "Your payment was successful and your subscription is active. Please login to start your system."
    );
  }, [params.subscription]);

  async function handleLogin() {
    if (!loginId.trim() || !password) {
      setError("Enter your Login ID and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await loginSaas(loginId.trim(), password);

      if (data.user.role === "superadmin") {
        router.replace("/superadmin");
      } else {
        router.replace("/system");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to login. Please check your Login ID, password, or connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Rent Management</Text>
        <Text style={styles.subtitle}>
          Sign in to manage your property
        </Text>

        <TextInput
          value={loginId}
          onChangeText={setLoginId}
          placeholder="Login ID or email"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={() => router.push("/forgot-password")} style={styles.forgotLink}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/register-business")} style={styles.registerLink}>
          <Text style={styles.registerText}>Register your property business</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
  form: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 28,
    fontSize: 15,
    color: colors.muted,
  },
  input: {
    height: 50,
    marginBottom: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  error: {
    marginBottom: 14,
    color: colors.danger,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -6,
    marginBottom: 16,
  },
  forgotText: {
    color: colors.primary,
    fontWeight: "700",
  },
  registerLink: {
    marginTop: 18,
    alignItems: "center",
  },
  registerText: {
    color: colors.primary,
    fontWeight: "700",
  },
  button: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
});
