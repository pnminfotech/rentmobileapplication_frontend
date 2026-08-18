import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Copy, Gift, RefreshCw, WalletCards } from "lucide-react-native";

import { getWalletSummary } from "../../src/api/saasApi";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function entryTitle(entry) {
  if (entry.type === "referral_reward") return "Referral reward";
  if (entry.type === "manual_credit") return "Manual credit";
  if (entry.type === "manual_debit") return "Manual debit";
  if (entry.type === "renewal_discount_used") return "Used on renewal";
  if (entry.type === "upgrade_discount_used") return "Used on upgrade";
  return "Wallet entry";
}

function WalletEntry({ entry }) {
  const isCredit = entry.direction === "credit";
  return (
    <View style={styles.entry}>
      <View style={[styles.entryIcon, { backgroundColor: isCredit ? S.soft : "#FFF1E5" }]}>
        <Gift size={20} color={isCredit ? S.deep : S.orange} />
      </View>
      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>{entryTitle(entry)}</Text>
        <Text style={styles.entryMeta}>{formatDate(entry.createdAt)} {entry.description ? `• ${entry.description}` : ""}</Text>
      </View>
      <View style={styles.entryRight}>
        <Text style={[styles.entryCoins, { color: isCredit ? S.deep : S.orange }]}>
          {isCredit ? "+" : "-"}{Number(entry.coins || 0)}
        </Text>
        <Text style={styles.entryBalance}>{Number(entry.balanceAfter || 0)} bal.</Text>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      setError("");
      const data = await getWalletSummary();
      setWallet(data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load wallet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadWallet(); }, [loadWallet]));

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={S.deep} /></View>;

  const entries = Array.isArray(wallet?.entries) ? wallet.entries : [];
  const referral = wallet?.referralCode;
  const copyReferralCode = async () => {
    if (!referral?.code) return;
    await Clipboard.setStringAsync(referral.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><ArrowLeft size={23} color={S.text} /></Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SYSTEM WALLET</Text>
          <Text style={styles.title}>Wallet</Text>
        </View>
        <Pressable onPress={() => { setRefreshing(true); loadWallet(); }} style={styles.refreshButton}>
          {refreshing ? <ActivityIndicator size="small" color={S.deep} /> : <RefreshCw size={20} color={S.deep} />}
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.balanceCard}>
        <View style={styles.walletIcon}><WalletCards size={28} color="#FFFFFF" /></View>
        <Text style={styles.balanceLabel}>Available coins</Text>
        <Text style={styles.balanceValue}>{Number(wallet?.balance || 0).toLocaleString("en-IN")}</Text>
        <Text style={styles.balanceHint}>Coins can be used during subscription renewal or package upgrade.</Text>
      </View>

      {referral?.code ? (
        <View style={styles.referralCard}>
          <View style={styles.referralTop}>
            <View>
              <Text style={styles.referralLabel}>Your referral code</Text>
              <Text style={styles.referralCode}>{referral.code}</Text>
            </View>
            <Pressable onPress={copyReferralCode} style={({ pressed }) => [styles.copyIcon, pressed && styles.pressed]}>
              <Copy size={20} color={S.deep} />
            </Pressable>
          </View>
          {copied ? <Text style={styles.copiedText}>Copied to clipboard</Text> : null}
          <Text style={styles.referralText}>Share this code. You earn {Number(referral.rewardCoins || 100)} coins after your friend completes payment.</Text>
          <View style={styles.referralStats}>
            <Text style={styles.statText}>Successful referrals: {Number(referral.usedCount || 0)}</Text>
            <Text style={styles.statText}>Earned: {Number(referral.earnedCoins || 0)} coins</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Wallet history</Text>
        <Text style={styles.sectionCount}>{entries.length} entries</Text>
      </View>
      {!entries.length ? <Text style={styles.empty}>No wallet entries yet.</Text> : null}
      {entries.map((entry) => <WalletEntry key={entry._id} entry={entry} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: S.screen },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: S.screen },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: S.deep, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 2, color: S.text, fontSize: 28, fontWeight: "900" },
  refreshButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: S.card, ...systemShadow },
  balanceCard: { padding: 16, borderRadius: 18, backgroundColor: S.deep, ...systemShadow },
  walletIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "rgba(255,255,255,0.16)" },
  balanceLabel: { marginTop: 18, color: "#DDEBD3", fontSize: 13, fontWeight: "800" },
  balanceValue: { marginTop: 6, color: "#FFFFFF", fontSize: 38, fontWeight: "900" },
  balanceHint: { marginTop: 8, color: "#DCE8D1", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  referralCard: { marginTop: 14, padding: 13, borderWidth: 1, borderColor: S.border, borderRadius: 15, backgroundColor: S.card, ...systemShadow },
  referralTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  referralLabel: { color: S.muted, fontSize: 12, fontWeight: "800" },
  referralCode: { marginTop: 4, color: S.deep, fontSize: 22, fontWeight: "900" },
  copyIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: S.soft },
  copiedText: { marginTop: 8, color: S.deep, fontSize: 12, fontWeight: "900" },
  referralText: { marginTop: 9, color: S.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  referralStats: { marginTop: 12, padding: 10, gap: 4, borderRadius: 12, backgroundColor: S.soft },
  statText: { color: S.deep, fontSize: 12, fontWeight: "900" },
  sectionRow: { marginTop: 18, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: S.text, fontSize: 18, fontWeight: "900" },
  sectionCount: { color: S.muted, fontSize: 12, fontWeight: "800" },
  entry: { minHeight: 72, marginBottom: 9, padding: 11, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.border, borderRadius: 14, backgroundColor: S.card, ...systemShadow },
  entryIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  entryCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  entryTitle: { color: S.text, fontSize: 14, fontWeight: "900" },
  entryMeta: { marginTop: 3, color: S.muted, fontSize: 11, fontWeight: "700" },
  entryRight: { alignItems: "flex-end", marginLeft: 8 },
  entryCoins: { fontSize: 15, fontWeight: "900" },
  entryBalance: { marginTop: 3, color: S.muted, fontSize: 10, fontWeight: "800" },
  empty: { paddingVertical: 24, color: S.muted, textAlign: "center", fontWeight: "800" },
  error: { marginBottom: 12, padding: 12, borderRadius: 12, color: "#C83E38", backgroundColor: "#FFE8E6", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
