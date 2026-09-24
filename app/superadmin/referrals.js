import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, LogOut, Tags } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getReferralCodes } from "../../src/api/saasApi";
import { colors } from "../../src/theme/colors";
import { useResponsive } from "../../src/utils/responsive";

const COLORS = {
  bg: "#F6F8F8",
  card: "#FFFFFF",
  text: colors.text,
  muted: colors.muted,
  border: "#D9E8ED",
  burgundy: "#006D9E",
  burgundySoft: "#E3F4FA",
  green: "#258467",
  greenSoft: "#E8F6F1",
  red: colors.danger,
  orange: "#00A7C9",
};

function formatDate(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No expiry";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ownerName(item) {
  const owner = item.ownerOrganizationId;
  if (!owner) return "Not assigned";
  if (typeof owner === "string") return owner;
  return owner.name || owner.ownerName || owner.email || "Assigned";
}

function ReferralCard({ item }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconBox}><Tags size={22} color={COLORS.burgundy} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.title}>{ownerName(item)}</Text>
        </View>
        <View style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusInactive]}>
          <Text style={[styles.statusText, item.isActive ? styles.statusTextActive : styles.statusTextInactive]}>{item.isActive ? "Active" : "Inactive"}</Text>
        </View>
      </View>
      <View style={styles.metaGrid}>
        <View style={styles.metaItem}><Text style={styles.metaLabel}>Buyer discount</Text><Text style={styles.metaValue}>{Number(item.discountPercent || 0)}%</Text></View>
        <View style={styles.metaItem}><Text style={styles.metaLabel}>Reward</Text><Text style={styles.metaValue}>{Number(item.rewardCoins || 0)} coins</Text></View>
        <View style={styles.metaItem}><Text style={styles.metaLabel}>Earned</Text><Text style={styles.metaValue}>{Number(item.earnedCoins || 0)}</Text></View>
      </View>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Successful referrals: {Number(item.usedCount || 0)}</Text>
        <Text style={styles.footerText}>Valid until: {formatDate(item.validUntil)}</Text>
      </View>
    </View>
  );
}

export default function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const data = await getReferralCodes();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load referral codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.burgundy} /></View>;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding, paddingTop: 5, paddingBottom: Math.max(insets.bottom + 36, 48) }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.menuButton}><ArrowLeft size={24} color={COLORS.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
          <Text style={styles.titlePage}>Referral Codes</Text>
        </View>
        <Pressable onPress={() => router.push("/superadmin/notifications")} style={styles.topAction}><Bell size={23} color={COLORS.text} /></Pressable>
        <Pressable onPress={() => router.back()} style={styles.topAction}><LogOut size={24} color={COLORS.red} /></Pressable>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}><Tags size={24} color={COLORS.burgundy} /></View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Auto-generated referrals</Text>
          <Text style={styles.infoText}>A code is created automatically when a system admin becomes active after payment. Earned referral coins can be used from wallet during renewal or package upgrade.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>All referral codes</Text>
        <Text style={styles.listCount}>{items.length} shown</Text>
      </View>
      {!items.length ? <Text style={styles.empty}>No referral codes generated yet.</Text> : null}
      {items.map((item) => <ReferralCard key={item._id} item={item} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  menuButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  titlePage: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  topAction: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.card },
  infoCard: { padding: 13, flexDirection: "row", gap: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card },
  infoIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.burgundySoft },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  infoText: { marginTop: 5, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  error: { marginTop: 12, padding: 10, color: COLORS.red, borderRadius: 10, backgroundColor: colors.dangerSoft, fontWeight: "800" },
  listHeader: { marginTop: 20, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  listCount: { color: COLORS.burgundy, fontSize: 12, fontWeight: "900" },
  empty: { paddingVertical: 22, color: COLORS.muted, textAlign: "center", fontWeight: "700" },
  card: { marginBottom: 11, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: COLORS.burgundySoft },
  cardCopy: { flex: 1, minWidth: 0 },
  code: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  title: { marginTop: 3, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  statusBadge: { minHeight: 28, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  statusActive: { backgroundColor: COLORS.greenSoft },
  statusInactive: { backgroundColor: colors.dangerSoft },
  statusText: { fontSize: 11.5, fontWeight: "900" },
  statusTextActive: { color: COLORS.green },
  statusTextInactive: { color: COLORS.red },
  metaGrid: { marginTop: 12, paddingVertical: 10, flexDirection: "row", borderRadius: 11, backgroundColor: COLORS.burgundySoft },
  metaItem: { flex: 1, alignItems: "center" },
  metaLabel: { color: COLORS.muted, fontSize: 10.5, fontWeight: "800", textAlign: "center" },
  metaValue: { marginTop: 4, color: COLORS.burgundy, fontSize: 13, fontWeight: "900", textAlign: "center" },
  footerRow: { marginTop: 10, gap: 4 },
  footerText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
});
