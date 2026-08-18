import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { getAppBootstrap } from "../src/api/saasApi";
import { colors } from "../src/theme/colors";
import {
  clearAuthSession,
  getAuthToken,
} from "../src/storage/authStorage";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    async function restoreSession() {
      const token = await getAuthToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const data = await getAppBootstrap();

        if (data.user.role === "superadmin") {
          router.replace("/superadmin");
        } else if (data.access?.expired || data.access?.needsPayment || !data.access?.canUseSystem) {
          router.replace("/subscription-expired");
        } else {
          router.replace("/system");
        }
      } catch {
        await clearAuthSession();
        router.replace("/login");
      }
    }

    restoreSession();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
