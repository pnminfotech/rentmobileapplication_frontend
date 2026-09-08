import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  DatabaseBackup,
  Lightbulb,
  ReceiptText,
  UserCircle,
  Users,
  Utensils,
  WalletCards,
} from "lucide-react-native";

import { getAppBootstrap, getWalletSummary } from "../../src/api/saasApi";
import { systemShadow } from "../../src/theme/systemTheme";
import { hasCanteenFeature } from "../../src/utils/featureAccess";

const UI = {
  screen: "#F6F8F7",
  card: "#FFFFFF",
  text: "#111B2A",
  muted: "#63738A",
  subtle: "#8A94AD",
  border: "#D9E1E7",
  blue: "#4F7FA6",
  blueDark: "#244F70",
  blueSoft: "#E7F1F8",
  slateSoft: "#EEF2F6",
  amber: "#B26B00",
  amberSoft: "#FFF1D8",
  indigo: "#4653A3",
  indigoSoft: "#ECECFF",
};

const TONES = {
  blue: { foreground: UI.blueDark, background: UI.blueSoft },
  amber: { foreground: UI.amber, background: UI.amberSoft },
  slate: { foreground: "#53627A", background: UI.slateSoft },
  indigo: { foreground: UI.indigo, background: UI.indigoSoft },
};

function ToolIcon({ Icon, tone = "blue", compact = false }) {
  const colors = TONES[tone] || TONES.blue;
  return (
    <View style={[styles.iconTile, compact && styles.compactIconTile, { backgroundColor: colors.background }]}>
      <Icon size={compact ? 20 : 22} color={colors.foreground} strokeWidth={2} />
    </View>
  );
}

function SummaryCard({ Icon, title, subtitle, value, tone, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}>
      <View style={styles.summaryTop}>
        <ToolIcon Icon={Icon} tone={tone} />
        {value !== undefined ? <Text style={styles.summaryValue}>{value}</Text> : null}
      </View>
      <View style={styles.summaryBottom}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.summarySubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <ChevronRight size={18} color={UI.muted} />
      </View>
    </Pressable>
  );
}

function MenuRow({ Icon, title, subtitle, tone, last = false, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, last && styles.menuRowLast, pressed && styles.pressed]}>
      <ToolIcon Icon={Icon} tone={tone} compact />
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={UI.muted} />
    </Pressable>
  );
}

function CompactCard({ Icon, title, subtitle, tone, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}>
      <ToolIcon Icon={Icon} tone={tone} compact />
      <View style={styles.compactCopy}>
        <Text style={styles.compactTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{title}</Text>
        <Text style={styles.compactSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{subtitle}</Text>
      </View>
      <ChevronRight size={17} color={UI.muted} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);

  useFocusEffect(useCallback(() => {
    let active = true;

    Promise.allSettled([getAppBootstrap(), getWalletSummary()]).then(([bootstrapResult, walletResult]) => {
      if (!active) return;
      setBootstrap(bootstrapResult.status === "fulfilled" ? bootstrapResult.value : null);
      setWalletBalance(walletResult.status === "fulfilled" ? Number(walletResult.value?.balance || 0) : null);
    });

    return () => {
      active = false;
    };
  }, []));

  const canteenEnabled = hasCanteenFeature(bootstrap);
  const walletValue = walletBalance === null ? undefined : walletBalance.toLocaleString("en-IN");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SYSTEM CONTROL CENTER</Text>
          <Text style={styles.title}>More</Text>
          <Text style={styles.subtitle}>Reports and management tools</Text>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            Icon={UserCircle}
            title="Profile Settings"
            subtitle="Account & subscription"
            tone="blue"
            onPress={() => router.push("/system/profile")}
          />
          <SummaryCard
            Icon={WalletCards}
            title="Wallet"
            subtitle="Coins & rewards"
            value={walletValue}
            tone="amber"
            onPress={() => router.push("/system/wallet")}
          />
        </View>

        <Text style={styles.sectionTitle}>Reports & Data</Text>
        <View style={styles.sectionCard}>
          <MenuRow Icon={BarChart3} title="Monthly reports" subtitle="Rent, dues and occupancy" tone="blue" onPress={() => router.push("/system/reports")} />
          <MenuRow Icon={CalendarRange} title="Custom date report" subtitle="Choose start and end date" tone="slate" onPress={() => router.push("/system/custom-reports")} />
          <MenuRow Icon={DatabaseBackup} title="Backup / export data" subtitle="Tenants, rent, bills and expenses" tone="indigo" last onPress={() => router.push("/system/backup-export")} />
        </View>

        {canteenEnabled ? (
          <>
            <Text style={styles.sectionTitle}>Canteen</Text>
            <View style={styles.compactGrid}>
              <CompactCard Icon={Utensils} title="Canteen settings" subtitle="Plans & meal prices" tone="amber" onPress={() => router.push("/system/canteen-settings")} />
              <CompactCard Icon={Users} title="Canteen attendance" subtitle="Mark hostel meals" tone="indigo" onPress={() => router.push("/system/canteen-attendance")} />
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Billing & Expenses</Text>
        <View style={styles.sectionCard}>
          <MenuRow Icon={Lightbulb} title="Light bill settings" subtitle="Electricity billing scenario" tone="amber" onPress={() => router.push("/system/light-bill-settings")} />
          <MenuRow Icon={WalletCards} title="Payments" subtitle="Rent collection status" tone="blue" onPress={() => router.push("/system/payments")} />
          <MenuRow Icon={Users} title="Staff expenses" subtitle="Salary and staff payments" tone="indigo" onPress={() => router.push("/system/staff-expenses")} />
          <MenuRow Icon={ReceiptText} title="Other expenses" subtitle="Repairs, supplies and general" tone="amber" last onPress={() => router.push("/system/expenses")} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 108 },
  header: { paddingHorizontal: 2, paddingBottom: 14 },
  eyebrow: { color: UI.subtle, fontSize: 10, fontWeight: "900", letterSpacing: 0, textTransform: "uppercase" },
  title: { marginTop: 3, color: UI.text, fontSize: 30, lineHeight: 34, fontWeight: "900" },
  subtitle: { marginTop: 2, color: UI.muted, fontSize: 14, fontWeight: "600" },
  summaryGrid: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, minWidth: 0, minHeight: 108, paddingHorizontal: 12, paddingVertical: 14, alignItems: "flex-start", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  summaryTop: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryBottom: { width: "100%", marginTop: 8, flexDirection: "row", alignItems: "center" },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: UI.text, fontSize: 14, fontWeight: "900" },
  summarySubtitle: { marginTop: 2, color: UI.muted, fontSize: 11, fontWeight: "600" },
  summaryValue: { color: UI.amber, fontSize: 17, fontWeight: "900" },
  sectionTitle: { marginTop: 17, marginBottom: 7, paddingHorizontal: 2, color: UI.text, fontSize: 17, fontWeight: "900" },
  sectionCard: { overflow: "hidden", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  menuRow: { minHeight: 62, marginHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: UI.border },
  menuRowLast: { borderBottomWidth: 0 },
  iconTile: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  compactIconTile: { width: 38, height: 38 },
  menuCopy: { flex: 1, minWidth: 0, marginLeft: 11, paddingRight: 8 },
  menuTitle: { color: UI.text, fontSize: 14, fontWeight: "900" },
  menuSubtitle: { marginTop: 2, color: UI.muted, fontSize: 11, fontWeight: "600" },
  compactGrid: { flexDirection: "row", gap: 8 },
  compactCard: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  compactCopy: { flex: 1, minWidth: 0, marginLeft: 9, paddingRight: 3 },
  compactTitle: { color: UI.text, fontSize: 12, fontWeight: "900" },
  compactSubtitle: { marginTop: 3, color: UI.muted, fontSize: 10, fontWeight: "600" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
