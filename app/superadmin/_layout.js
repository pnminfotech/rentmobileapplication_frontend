import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../src/theme/colors";

export default function SuperAdminLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.background,
        },
      }}
    />
  );
}
