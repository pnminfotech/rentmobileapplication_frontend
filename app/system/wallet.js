import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  Coins,
  Copy,
  Gift,
  Info,
  PieChart,
  Share2,
  Users,
  X,
} from "lucide-react-native";

import { getWalletSummary } from "../../src/api/saasApi";
import { systemShadow } from "../../src/theme/systemTheme";

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
  amber: "#B66B00",
  amberSoft: "#FFF1D8",
  indigo: "#4653A3",
  indigoSoft: "#ECECFF",
  red: "#D84B43",
  redSoft: "#FFF0EF",
};

const FILTERS = [
  { value: "all", label: "All activity" },
  { value: "credit", label: "Coins earned" },
  { value: "debit", label: "Coins used" },
];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function entryTitle(entry) {
  if (entry.type === "referral_reward") return "Referral reward";
  if (entry.type === "manual_credit") return "Wallet credit";
  if (entry.type === "manual_debit") return "Wallet adjustment";
  if (entry.type === "renewal_discount_used") return "Subscription renewal";
  if (entry.type === "upgrade_discount_used") return "Package upgrade";
  return entry.direction === "credit" ? "Coins earned" : "Coins used";
}

function WalletEntry({ entry, last }) {
  const isCredit = entry.direction === "credit";
  const amount = Number(entry.coins || 0).toLocaleString("en-IN");
  return (
    <View style={[styles.entry, last && styles.entryLast]}>
      <Text style={[styles.entryCoins, isCredit ? styles.credit : styles.debit]}>
        {isCredit ? "+" : "-"}{amount} <Text style={styles.entryCoinLabel}>coins</Text>
      </Text>
      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>{entryTitle(entry)}</Text>
        <Text style={styles.entryMeta} numberOfLines={2}>
          {entry.description || Number(entry.balanceAfter || 0).toLocaleString("en-IN") + " coin balance"}
        </Text>
      </View>
      <Text style={styles.entryDate}>{formatDate(entry.createdAt)}</Text>
    </View>
  );
}

function StatCard({ Icon, value, label, tone }) {
  const palette = tone === "red"
    ? { color: UI.red, backgroundColor: UI.redSoft, borderColor: "#F4D0CD" }
    : tone === "indigo"
      ? { color: UI.indigo, backgroundColor: UI.indigoSoft, borderColor: "#D9D9F4" }
      : { color: UI.blueDark, backgroundColor: UI.blueSoft, borderColor: "#CFE0EC" };

  return (
    <View style={[styles.statCard, { borderColor: palette.borderColor }]}>
      <View style={[styles.statIcon, { backgroundColor: palette.backgroundColor }]}>
        <Icon size={19} color={palette.color} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statValue}>{Number(value || 0).toLocaleString("en-IN")}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      setError("");
      setWallet(await getWalletSummary());
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load wallet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadWallet();
  }, [loadWallet]));

  const entries = useMemo(() => Array.isArray(wallet?.entries) ? wallet.entries : [], [wallet]);
  const earnedCoins = useMemo(
    () => entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + Number(entry.coins || 0), 0),
    [entries]
  );
  const usedCoins = useMemo(
    () => entries.filter((entry) => entry.direction === "debit").reduce((sum, entry) => sum + Number(entry.coins || 0), 0),
    [entries]
  );
  const visibleEntries = useMemo(
    () => historyFilter === "all" ? entries : entries.filter((entry) => entry.direction === historyFilter),
    [entries, historyFilter]
  );

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={UI.blue} /></View>;
  }

  const referral = wallet?.referralCode;
  const rewardCoins = Number(referral?.rewardCoins || 100);
  const activeFilterLabel = FILTERS.find((item) => item.value === historyFilter)?.label || FILTERS[0].label;

  const copyReferralCode = async () => {
    if (!referral?.code) return;
    await Clipboard.setStringAsync(referral.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const shareReferralCode = async () => {
    if (!referral?.code) return;
    await Share.share({
      message: "Join EazyRent with referral code " + referral.code + ".",
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={23} color={UI.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>REWARDS & REFERRALS</Text>
            <Text style={styles.title}>Wallet</Text>
            <Text style={styles.subtitle}>Coins, referrals and reward history</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.balanceCard}>
          <View style={styles.balanceCopy}>
            <Text style={styles.balanceLabel}>Available balance</Text>
            <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
              {Number(wallet?.balance || 0).toLocaleString("en-IN")} coins
            </Text>
            <Text style={styles.balanceHint}>Use coins when upgrading your package</Text>
          </View>
          <View style={styles.balanceAction}>
            <View style={styles.coinArt}><Coins size={34} color={UI.amber} strokeWidth={1.8} /></View>
            <Pressable onPress={() => router.push("/system/profile")} style={({ pressed }) => [styles.upgradeButton, pressed && styles.pressed]}>
              <Text style={styles.upgradeButtonText}>Upgrade package</Text>
            </Pressable>
          </View>
        </View>

        {referral?.code ? (
          <View style={styles.referralCard}>
            <Text style={styles.referralTitle}>Invite & earn</Text>
            <Text style={styles.referralText}>Earn {rewardCoins.toLocaleString("en-IN")} coins after your friend completes their first payment.</Text>
            <View style={styles.referralCodeRow}>
                <Pressable onPress={copyReferralCode} style={({ pressed }) => [styles.codeBox, pressed && styles.pressed]}>
                  <Text style={styles.referralCode} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{referral.code}</Text>
                  <Copy size={19} color={UI.muted} />
                </Pressable>
                <Pressable onPress={shareReferralCode} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
                  <Share2 size={18} color="#FFFFFF" />
                  <Text style={styles.shareButtonText}>Share code</Text>
                </Pressable>
            </View>
            {copied ? <Text style={styles.copiedText}>Copied to clipboard</Text> : null}
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard Icon={Gift} value={earnedCoins} label="Earned" tone="blue" />
          <StatCard Icon={PieChart} value={usedCoins} label="Used" tone="red" />
          <StatCard Icon={Users} value={referral?.usedCount} label="Referrals" tone="indigo" />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Reward history</Text>
          <Pressable onPress={() => setFilterOpen(true)} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
            <Text style={styles.filterText}>{activeFilterLabel}</Text>
            <ChevronDown size={17} color={UI.muted} />
          </Pressable>
        </View>

        <View style={styles.historyCard}>
          {!visibleEntries.length ? <Text style={styles.empty}>No wallet activity for this filter.</Text> : null}
          {visibleEntries.map((entry, index) => (
            <WalletEntry key={entry._id} entry={entry} last={index === visibleEntries.length - 1} />
          ))}
        </View>

        <View style={styles.disclaimer}>
          <Info size={16} color={UI.muted} />
          <Text style={styles.disclaimerText}>Coins have no cash value</Text>
        </View>
      </ScrollView>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter reward history</Text>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.closeButton}>
                <X size={20} color={UI.text} />
              </Pressable>
            </View>
            {FILTERS.map((item) => {
              const active = historyFilter === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    setHistoryFilter(item.value);
                    setFilterOpen(false);
                  }}
                  style={[styles.filterOption, active && styles.filterOptionActive]}
                >
                  <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: UI.screen },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 13 },
  backButton: { width: 40, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: UI.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0, textTransform: "uppercase" },
  title: { marginTop: 2, color: UI.text, fontSize: 28, lineHeight: 31, fontWeight: "900" },
  subtitle: { marginTop: 1, color: UI.muted, fontSize: 13, fontWeight: "600" },
  balanceCard: { minHeight: 112, paddingHorizontal: 15, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  balanceCopy: { flex: 1, minWidth: 0 },
  balanceLabel: { color: UI.muted, fontSize: 12, fontWeight: "700" },
  balanceValue: { marginTop: 5, color: UI.text, fontSize: 26, lineHeight: 31, fontWeight: "900" },
  balanceHint: { marginTop: 3, color: UI.muted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  balanceAction: { width: 112, alignItems: "center", gap: 6 },
  coinArt: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 26, backgroundColor: UI.amberSoft },
  upgradeButton: { width: "100%", minHeight: 34, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.blueDark, borderRadius: 8, backgroundColor: UI.card },
  upgradeButtonText: { color: UI.blueDark, fontSize: 11, fontWeight: "900" },
  referralCard: { marginTop: 11, padding: 14, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  referralTitle: { color: UI.text, fontSize: 19, fontWeight: "900" },
  referralText: { marginTop: 3, color: UI.muted, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  referralCodeRow: { marginTop: 10, flexDirection: "row", alignItems: "stretch", gap: 8 },
  codeBox: { flex: 1, minWidth: 0, minHeight: 43, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, borderWidth: 1, borderStyle: "dashed", borderColor: "#B7C5D2", borderRadius: 8 },
  referralCode: { flex: 1, color: UI.text, fontSize: 16, fontWeight: "900" },
  copiedText: { marginTop: 5, color: UI.blueDark, fontSize: 10, fontWeight: "800" },
  shareButton: { width: 112, minHeight: 43, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, backgroundColor: UI.blueDark },
  shareButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  statsRow: { marginTop: 10, flexDirection: "row", gap: 7 },
  statCard: { flex: 1, minWidth: 0, minHeight: 62, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, backgroundColor: UI.card },
  statIcon: { width: 32, height: 32, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  statCopy: { flex: 1, minWidth: 0 },
  statValue: { color: UI.text, fontSize: 15, fontWeight: "900" },
  statLabel: { marginTop: 2, color: UI.muted, fontSize: 10, fontWeight: "600" },
  sectionRow: { marginTop: 16, marginBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { flex: 1, color: UI.text, fontSize: 19, fontWeight: "900" },
  filterButton: { minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card },
  filterText: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  historyCard: { overflow: "hidden", paddingHorizontal: 11, borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card, ...systemShadow },
  entry: { minHeight: 62, paddingVertical: 9, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: UI.border },
  entryLast: { borderBottomWidth: 0 },
  entryCoins: { width: 82, fontSize: 14, fontWeight: "900" },
  entryCoinLabel: { fontSize: 11, fontWeight: "800" },
  credit: { color: UI.blueDark },
  debit: { color: UI.red },
  entryCopy: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  entryTitle: { color: UI.text, fontSize: 12, fontWeight: "900" },
  entryMeta: { marginTop: 3, color: UI.muted, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  entryDate: { width: 64, color: UI.muted, fontSize: 9, fontWeight: "700", textAlign: "right" },
  empty: { paddingVertical: 24, color: UI.muted, textAlign: "center", fontSize: 12, fontWeight: "700" },
  disclaimer: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  disclaimerText: { color: UI.muted, fontSize: 11, fontWeight: "600" },
  error: { marginBottom: 12, padding: 12, borderRadius: 8, color: UI.red, backgroundColor: UI.redSoft, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  modalOverlay: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  modalCard: { width: "100%", maxWidth: 380, padding: 14, borderRadius: 8, backgroundColor: UI.card },
  modalHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: UI.text, fontSize: 17, fontWeight: "900" },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  filterOption: { minHeight: 44, marginTop: 6, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: UI.border, borderRadius: 8 },
  filterOptionActive: { borderColor: UI.blue, backgroundColor: UI.blueSoft },
  filterOptionText: { color: UI.muted, fontSize: 13, fontWeight: "700" },
  filterOptionTextActive: { color: UI.blueDark, fontWeight: "900" },
});
