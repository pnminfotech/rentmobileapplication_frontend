import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { Tabs, useRouter } from "expo-router";
import {
  Building2,
  LayoutDashboard,
  Menu,
  Users,
  Zap,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAppBootstrap } from "../../src/api/saasApi";
import { SystemAccessProvider } from "../../src/context/SystemAccessContext";
import { clearAuthSession } from "../../src/storage/authStorage";
import { systemColors } from "../../src/theme/systemTheme";

const SYSTEM_PRIMARY = systemColors.deep;
const SYSTEM_MUTED = systemColors.muted;
const SYSTEM_TAB_BLUE = "#2C6386";
const SYSTEM_TAB_BLUE_SOFT = "#E4EFF7";

export default function SystemTabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [unitAccess, setUnitAccess] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function guardSystemAccess() {
        try {
          const data = await getAppBootstrap();
          if (!active) return;

          if (data.user?.role === "superadmin") {
            router.replace("/superadmin");
            return;
          }

          if (data.access?.expired || data.access?.needsPayment || !data.access?.canUseSystem) {
            router.replace("/subscription-expired");
            return;
          }

          setUnitAccess(data);
        } catch (_err) {
          await clearAuthSession();
          if (active) router.replace("/login");
          return;
        } finally {
          if (active) setCheckingAccess(false);
        }
      }

      guardSystemAccess();
      return () => {
        active = false;
      };
    }, [router])
  );

  if (checkingAccess) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: systemColors.screen }}>
        <ActivityIndicator size="large" color={SYSTEM_PRIMARY} />
      </View>
    );
  }
    
  return (
    <SystemAccessProvider source={unitAccess}>
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          paddingTop: Math.max(insets.top, 12),
          backgroundColor: systemColors.screen,
        },
        tabBarActiveTintColor: SYSTEM_TAB_BLUE,
        tabBarInactiveTintColor: SYSTEM_MUTED,
        tabBarActiveBackgroundColor: SYSTEM_TAB_BLUE_SOFT,
        tabBarStyle: {
          marginHorizontal: 14,
          marginBottom: 8,
          height: 62 + Math.max(insets.bottom, 4),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingHorizontal: 6,
          borderTopWidth: 1,
          borderTopColor: systemColors.border,
          borderRadius: 26,
          backgroundColor: systemColors.card,
          elevation: 8,
          shadowColor: systemColors.shadow,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        tabBarItemStyle: {
          marginHorizontal: 2,
          borderRadius: 20,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="units"
        options={{
          title: "Units",
          tabBarIcon: ({ color, size }) => (
            <Building2 color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="tenants"
        options={{
          title: "Tenants",
          tabBarIcon: ({ color, size }) => (
            <Users color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="light-bills"
        options={{
          title: "Light bills",
          tabBarActiveTintColor: "#FFFFFF",
          tabBarActiveBackgroundColor: SYSTEM_TAB_BLUE,
          tabBarIcon: ({ color, size }) => (
            <Zap color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Menu color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="rooms"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="room-form"




        
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="unit-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="unit-details"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="add-bed"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-admission"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-invite"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-details"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="rent-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="payment-edit"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="payment-receipt"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-edit"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-shift"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="tenant-leave"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="former-tenants"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="reports"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="custom-reports"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="backup-export"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="audit-history"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="payments"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="light-bill-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="light-bill-settings"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="staff-expenses"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="staff-expense-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="expense-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="bed-form"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="beds-manage"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="canteen-attendance"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="canteen-settings"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="document-preview"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
    </Tabs>
    </SystemAccessProvider>
  );
}
