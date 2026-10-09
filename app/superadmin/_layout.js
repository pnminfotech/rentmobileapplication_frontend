import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAppBootstrap } from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { colors } from "../../src/theme/colors";

export default function SuperAdminLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function checkSuperadminAccess() {
        try {
          const data = await getAppBootstrap();
          if (!active) return;

          if (data.user?.role !== "superadmin") {
            router.replace("/system");
            return;
          }

          setAuthorized(true);
        } catch {
          await clearAuthSession();
          if (active) router.replace("/login");
        } finally {
          if (active) setCheckingAccess(false);
        }
      }

      checkSuperadminAccess();
      return () => {
        active = false;
      };
    }, [router])
  );

  if (checkingAccess) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!authorized) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          // Keep headings clear of the status bar while the background fills
          // the complete screen.
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.background,
        },
      }}
    />
  );
}
