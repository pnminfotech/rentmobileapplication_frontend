import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Tabs, useRouter } from "expo-router";
import {
  Building2,
  LayoutDashboard,
  Menu,
  Users,
  WalletCards,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAppBootstrap } from "../../src/api/saasApi";
import { clearAuthSession } from "../../src/storage/authStorage";
import { systemColors } from "../../src/theme/systemTheme";

const SYSTEM_GREEN = systemColors.deep;
const SYSTEM_MUTED = systemColors.muted;

export default function SystemTabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

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
        <ActivityIndicator size="large" color={SYSTEM_GREEN} />
      </View>
    );
  }
    
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: systemColors.screen,
        },
        tabBarActiveTintColor: SYSTEM_GREEN,
        tabBarInactiveTintColor: SYSTEM_MUTED,
        tabBarStyle: {
          height: 66 + Math.max(insets.bottom, 8),
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: systemColors.border,
          backgroundColor: systemColors.card,
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
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: ({ color, size }) => (
            <WalletCards color={color} size={size} />
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
        name="light-bills"
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
  );
}
