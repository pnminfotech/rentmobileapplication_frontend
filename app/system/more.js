import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { BarChart3, CalendarRange, ChevronRight, DatabaseBackup, ReceiptText, UserCircle, Users, Utensils, WalletCards, Zap } from "lucide-react-native";
import { getAppBootstrap } from "../../src/api/saasApi";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

function MoreItem({ Icon, title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={styles.icon}><Icon size={22} color={S.deep} /></View>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color={S.muted} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getAppBootstrap()
      .then((data) => { if (active) setBootstrap(data); })
      .catch(() => { if (active) setBootstrap(null); });
    return () => { active = false; };
  }, []));

  const canteenEnabled = hasCanteenFeature(bootstrap);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SYSTEM CONTROL CENTER</Text>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Reports and management tools</Text>
      </View>
      <View style={styles.panel}>
        <MoreItem Icon={UserCircle} title="Profile Settings" subtitle="Account, business and subscription details" onPress={() => router.push("/system/profile")} />
        <MoreItem Icon={WalletCards} title="Wallet" subtitle="Referral coins and reward history" onPress={() => router.push("/system/wallet")} />
        <MoreItem Icon={BarChart3} title="Monthly reports" subtitle="Rent, dues and occupancy by month" onPress={() => router.push("/system/reports")} />
        <MoreItem Icon={CalendarRange} title="Custom date report" subtitle="Select a start and end date" onPress={() => router.push("/system/custom-reports")} />
        <MoreItem Icon={DatabaseBackup} title="Backup / export data" subtitle="Download tenants, rent, bills and expenses" onPress={() => router.push("/system/backup-export")} />
        {canteenEnabled ? <MoreItem Icon={Utensils} title="Canteen settings" subtitle="Plans, meal prices and guest meal charges" onPress={() => router.push("/system/canteen-settings")} /> : null}
        {canteenEnabled ? <MoreItem Icon={Utensils} title="Canteen attendance" subtitle="Mark hostel meals for canteen tenants" onPress={() => router.push("/system/canteen-attendance")} /> : null}
        <MoreItem Icon={Zap} title="Light bill settings" subtitle="Choose electricity billing scenario" onPress={() => router.push("/system/light-bill-settings")} />
        <MoreItem Icon={Zap} title="Light bills" subtitle="Meter bills by unit and month" onPress={() => router.push("/system/light-bills")} />
        <MoreItem Icon={Users} title="Staff expenses" subtitle="Salary and staff payment records" onPress={() => router.push("/system/staff-expenses")} />
        <MoreItem Icon={ReceiptText} title="Other expenses" subtitle="Repairs, supplies and general expenses" onPress={() => router.push("/system/expenses")} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: S.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 40 },
  header: { marginBottom: 12, backgroundColor: S.screen },
  eyebrow: { color: S.deep, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 2, color: S.text, fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, color: S.muted, fontWeight: "700" },
  panel: { marginTop: 8, gap: 10 },
  item: { minHeight: 76, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 15, backgroundColor: S.card, ...systemShadow },
  icon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: S.soft },
  itemText: { flex: 1, marginLeft: 12 },
  itemTitle: { color: S.text, fontSize: 16, fontWeight: "900" },
  itemSubtitle: { marginTop: 4, color: S.muted, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
});
