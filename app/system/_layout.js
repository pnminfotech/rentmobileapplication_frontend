import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  View,
} from "react-native";

import { useFocusEffect } from "expo-router/react-navigation";
import { Tabs, useRouter } from "expo-router";

import {
  Building2,
  LayoutDashboard,
  Menu,
  Users,
  Zap, Lightbulb,
} from "lucide-react-native";

import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  getAppBootstrap,
} from "../../src/api/saasApi";

import {
  SystemAccessProvider,
} from "../../src/context/SystemAccessContext";

import {
  clearAuthSession,
} from "../../src/storage/authStorage";

import {
  systemColors,
} from "../../src/theme/systemTheme";

/* ============================================================
   COLORS
============================================================ */

const SYSTEM_PRIMARY =
  systemColors.deep;

const SYSTEM_MUTED =
  systemColors.muted;

/*
  Footer active color.
  Slight green tone like your reference image.
*/

const SYSTEM_TAB_ACTIVE =
  "#244f70";

const SYSTEM_TAB_INACTIVE =
  "#68758D";

const SYSTEM_TAB_BORDER =
  "#E4E8ED";

const SYSTEM_TAB_BACKGROUND =
  "#FFFFFF";

/* ============================================================
   MAIN LAYOUT
============================================================ */

export default function SystemTabsLayout() {
  const insets =
    useSafeAreaInsets();

  const router =
    useRouter();

  const [
    checkingAccess,
    setCheckingAccess,
  ] = useState(true);

  const [
    unitAccess,
    setUnitAccess,
  ] = useState(null);

  /* ========================================================
     SYSTEM ACCESS GUARD
  ======================================================== */

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function guardSystemAccess() {
        try {
          const data =
            await getAppBootstrap();

          if (!active) {
            return;
          }

          /* SUPERADMIN */

          if (
            data.user?.role ===
            "superadmin"
          ) {
            router.replace(
              "/superadmin"
            );

            return;
          }

          /* SUBSCRIPTION / ACCESS */

          if (
            data.access?.expired ||
            data.access?.needsPayment ||
            !data.access?.canUseSystem
          ) {
            router.replace(
              "/subscription-expired"
            );

            return;
          }

          setUnitAccess(data);
        } catch (_err) {
          await clearAuthSession();

          if (active) {
            router.replace(
              "/login"
            );
          }

          return;
        } finally {
          if (active) {
            setCheckingAccess(
              false
            );
          }
        }
      }

      guardSystemAccess();

      return () => {
        active = false;
      };
    }, [router])
  );

  /* ========================================================
     LOADING
  ======================================================== */

  if (checkingAccess) {
    return (
      <View
        style={{
          flex: 1,

          alignItems: "center",
          justifyContent:
            "center",

          backgroundColor:
            systemColors.screen,
        }}
      >
        <ActivityIndicator
          size="large"
          color={
            SYSTEM_PRIMARY
          }
        />
      </View>
    );
  }

  /* ========================================================
     TABS
  ======================================================== */

  return (
    <SystemAccessProvider
      source={unitAccess}
    >
      <Tabs
        screenOptions={{
          /* HEADER */

          headerShown: false,

          /* PAGE */

          sceneStyle: {
            paddingTop:
              Math.max(
                insets.top,
                12
              ),

            backgroundColor:
              systemColors.screen,
          },

          /* COLORS */

          tabBarActiveTintColor:
            SYSTEM_TAB_ACTIVE,

          tabBarInactiveTintColor:
            SYSTEM_TAB_INACTIVE,

          /* ==================================================
             FIXED PLAIN FOOTER
          ================================================== */

          tabBarStyle: {
            /*
              Sticky to bottom.
              No floating card.
            */

            position:
              "absolute",

            left: 0,
            right: 0,
            bottom: 0,

            /*
              Full width.
            */

            marginHorizontal: 0,
            marginBottom: 0,

            /*
              Footer height includes
              phone safe area.
            */

            height:
              64 +
              Math.max(
                insets.bottom,
                4
              ),

            paddingTop: 7,

            paddingBottom:
              Math.max(
                insets.bottom,
                7
              ),

            paddingHorizontal: 8,

            /*
              Plain footer.
            */

            borderRadius: 0,

            borderTopWidth: 1,

            borderTopColor:
              SYSTEM_TAB_BORDER,

            backgroundColor:
              SYSTEM_TAB_BACKGROUND,

            /*
              Remove floating-card effect.
            */

            elevation:
              Platform.OS ===
              "android"
                ? 2
                : 0,

            shadowColor:
              "#000000",

            shadowOpacity:
              0.04,

            shadowRadius:
              5,

            shadowOffset: {
              width: 0,
              height: -2,
            },
          },

          /* TAB ITEM */

          tabBarItemStyle: {
            marginHorizontal: 0,

            paddingVertical: 0,

            borderRadius: 0,

            backgroundColor:
              "transparent",
          },

          /* LABEL */

          tabBarLabelStyle: {
            marginTop: 2,

            fontSize: 11,

            fontWeight: "600",
          },

          /* ICON */

          tabBarIconStyle: {
            marginTop: 1,
          },

          /*
            IMPORTANT:
            No active background.
            Only icon + text color change.
          */

          tabBarActiveBackgroundColor:
            "transparent",
        }}
      >

        {/* ===================================================
            MAIN NAVIGATION
        =================================================== */}

        <Tabs.Screen
          name="index"
          options={{
            title:
              "Dashboard",

            tabBarIcon: ({
              color,
              size,
            }) => (
              <LayoutDashboard
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="units"
          options={{
            title: "Units",

            tabBarIcon: ({
              color,
              size,
            }) => (
              <Building2
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="tenants"
          options={{
            title:
              "Tenants",

            tabBarIcon: ({
              color,
              size,
            }) => (
              <Users
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />

     <Tabs.Screen
  name="light-bills"
  options={{
    title: "Light Bills",

    tabBarIcon: ({ color, size }) => (
      <Lightbulb
        color={color}
        size={size}
        strokeWidth={2}
      />
    ),
  }}
/>

        <Tabs.Screen
          name="more"
          options={{
            title: "More",

            tabBarIcon: ({
              color,
              size,
            }) => (
              <Menu
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />

        {/* ===================================================
            HIDDEN ROUTES
        =================================================== */}

        <Tabs.Screen
          name="rooms"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="room-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="unit-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="unit-details"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="add-bed"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-admission"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-invite"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-details"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="rent-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="payment-edit"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="payment-receipt"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-edit"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-shift"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="tenant-leave"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="former-tenants"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="reports"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="custom-reports"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="backup-export"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="audit-history"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="payments"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="light-bill-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="light-bill-settings"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="staff-expenses"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="staff-expense-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="expenses"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="expense-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="bed-form"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="beds-manage"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="notifications"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="wallet"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="canteen-attendance"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="canteen-settings"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

        <Tabs.Screen
          name="document-preview"
          options={{
            href: null,

            tabBarStyle: {
              display:
                "none",
            },
          }}
        />

      </Tabs>
    </SystemAccessProvider>
  );
}