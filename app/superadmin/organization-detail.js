import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ArrowLeft, CheckCircle2, FileDown, ShieldOff, Trash2 } from "lucide-react-native";
import { colors } from "../../src/theme/colors";
import SecurityPinModal from "../../src/components/SecurityPinModal";

import {
  getBillingTransactions,
  getOrganizations,
  getOrganizationVacantUnits,
  removeOrganizationVacantUnit,
  updateOrganizationStatus,
} from "../../src/api/saasApi";

const COLORS = {
  bg: "#F6F8F8",
  card: "#FFFFFF",
  soft: "#EFF7FA",
  text: colors.text,
  muted: colors.muted,
  subtle: colors.subtle,
  border: "#D9E8ED",
  burgundy: "#006D9E",
  burgundyDark: "#004B76",
  burgundySoft: "#E3F4FA",
  green: "#258467",
  greenSoft: "#E8F6F1",
  orange: "#00A7C9",
  orangeSoft: "#E1F7FB",
  red: colors.danger,
  redSoft: colors.dangerSoft,
};

const cardShadow = {
  shadowColor: COLORS.burgundyDark,
  shadowOpacity: 0.08,
  shadowRadius: 13,
  shadowOffset: { width: 0, height: 7 },
  elevation: 3,
};

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(value) {
  const label = String(value || "unknown").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function supportUnitLabel(unit = {}) {
  const raw = String(unit.label || "");
  const isPending = Boolean(unit.isPlaceholder) || /\bunassigned\b/i.test(raw) || /\bUNASSIGNED-/i.test(raw);
  if (!isPending) return raw;
  return unit.kind === "bed" && unit.bedNo
    ? `Unit | Bed ${unit.bedNo}`
    : "Unit";
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function safeFileName(value) {
  return String(value || "organization").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value === undefined || value === null || value === "" ? "-" : String(value)}</Text>
    </View>
  );
}

function getWalletPricing(transaction) {
  const pricing = transaction?.pricing || {};
  const walletCoinsUsed = Number(pricing.walletCoinsUsed || pricing.walletDiscountAmount || 0);
  const subtotal = Number(pricing.subtotal || pricing.originalAmount || transaction?.requestPayload?.originalAmount || 0);
  const payableAmount = Number(pricing.payableAmount ?? transaction?.amount ?? 0);
  return {
    hasWalletDiscount: walletCoinsUsed > 0,
    subtotal,
    payableAmount,
    walletCoinsUsed,
  };
}

function TransactionPricingRows({ transaction }) {
  const wallet = getWalletPricing(transaction);
  if (!wallet.hasWalletDiscount) return null;
  return (
    <>
      <Row label="Original amount" value={money(wallet.subtotal)} />
      <Row label="Wallet discount" value={`- ${money(wallet.walletCoinsUsed)}`} />
      <Row label="Payable amount" value={money(wallet.payableAmount)} />
    </>
  );
}

function Section({ title, children }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

export default function OrganizationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [organization, setOrganization] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [pendingStatus, setPendingStatus] = useState("");
  const [vacantUnits, setVacantUnits] = useState([]);
  const [pendingUnitRemoval, setPendingUnitRemoval] = useState(null);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [organizations, txnData, vacantData] = await Promise.all([
        getOrganizations(),
        getBillingTransactions({ limit: 100 }),
        getOrganizationVacantUnits(id),
      ]);
      const current = (Array.isArray(organizations) ? organizations : []).find((item) => String(item._id) === String(id));
      setOrganization(current || null);
      setTransactions((Array.isArray(txnData) ? txnData : []).filter((txn) => String(txn.organizationId?._id || txn.organizationId) === String(id)));
      setVacantUnits(Array.isArray(vacantData) ? vacantData : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load organization.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const subscription = organization?.subscription || {};
  const units = subscription.units || organization?.unitAllocation || {};
  const latestTransaction = useMemo(() => transactions[0] || null, [transactions]);

  async function changeStatus(status, securityPin) {
    try {
      setAction(status);
      await updateOrganizationStatus(organization._id, status, securityPin);
      await loadData();
      setPendingStatus("");
    } catch (err) {
      Alert.alert("Unable to update status", err.response?.data?.message || "Please try again.");
    } finally {
      setAction("");
    }
  }

  async function removeVacantUnit(target, securityPin) {
    try {
      setAction(`remove-${target.id}`);
      await removeOrganizationVacantUnit(organization._id, target.unitId, {
        kind: target.kind,
        bedNo: target.bedNo || "",
        reason: "Customer requested a unit reduction through support",
        securityPin,
      });
      setPendingUnitRemoval(null);
      await loadData();
      Alert.alert("Unit removed", "The vacant unit was removed and the customer's subscription count has been updated.");
    } catch (err) {
      Alert.alert("Unable to remove unit", err.response?.data?.message || "Please try again.");
    } finally {
      setAction("");
    }
  }

  async function exportSubscriptionHistory() {
    try {
      const lines = [
        ["Subscription History", organization.name],
        [],
        ["Organization", organization.name],
        ["Owner", organization.ownerName],
        ["Email", organization.email],
        ["Current status", statusLabel(organization.status)],
        [],
        ["Current subscription"],
        ["Status", "Duration", "Amount", "Currency", "Beds", "Rooms", "Shops", "Start date", "End date"],
        [
          statusLabel(subscription.status),
          subscription.durationMonths ? `${subscription.durationMonths} months` : "",
          subscription.amount || 0,
          subscription.currency || "INR",
          units.beds || 0,
          units.rooms || 0,
          units.shops || 0,
          formatDate(subscription.startDate),
          formatDate(subscription.endDate),
        ],
        [],
        ["Payment / renewal transactions"],
        ["Created", "Paid", "Status", "Provider", "Original amount", "Wallet discount", "Payable amount", "Currency", "Subscription status", "Subscription start", "Subscription end"],
        ...transactions.map((txn) => {
          const wallet = getWalletPricing(txn);
          return [
            formatDate(txn.createdAt),
            formatDate(txn.paidAt),
            statusLabel(txn.status),
            txn.provider || "-",
            wallet.subtotal || txn.amount || 0,
            wallet.walletCoinsUsed || 0,
            wallet.payableAmount || txn.amount || 0,
            txn.currency || "INR",
            statusLabel(txn.subscriptionId?.status),
            formatDate(txn.subscriptionId?.startDate),
            formatDate(txn.subscriptionId?.endDate),
          ];
        }),
      ];
      const csv = lines.map((line) => line.map(csvCell).join(",")).join("\n");
      const fileName = `subscription-history-${safeFileName(organization.name)}.csv`;
      if (Platform.OS === "web") {
        const anchor = globalThis.document.createElement("a");
        anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        anchor.download = fileName;
        anchor.click();
        return;
      }
      const uri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: `${organization.name} subscription history` });
    } catch (err) {
      Alert.alert("Export failed", err.message || "Unable to export subscription history.");
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.burgundy} /></View>;
  if (!organization) return <View style={styles.loading}><Text style={styles.error}>{error || "Organization not found."}</Text><Pressable onPress={() => router.replace("/superadmin")}><Text style={styles.backText}>Go back</Text></Pressable></View>;

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/superadmin")} style={styles.iconButton}><ArrowLeft size={23} color={COLORS.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text>
          <Text style={styles.title}>Organization</Text>
          <Text style={styles.subtitle}>{organization.name}</Text>
        </View>
      </View>

      <View style={styles.profile}>
        <View style={styles.profileText}>
          <Text style={styles.orgName}>{organization.name}</Text>
          <Text style={styles.orgMeta}>{organization.ownerName} | {organization.email}</Text>
        </View>
        <View style={[styles.statusBadge, organization.status === "active" && styles.statusActive, organization.status === "suspended" && styles.statusSuspended]}>
          <Text style={[styles.statusText, organization.status === "active" && styles.statusActiveText, organization.status === "suspended" && styles.statusSuspendedText]}>{statusLabel(organization.status)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {organization.status === "active" ? (
          <Pressable onPress={() => setPendingStatus("suspended")} disabled={Boolean(action)} style={[styles.actionButton, styles.dangerButton]}>
            {action === "suspended" ? <ActivityIndicator size="small" color={colors.surface} /> : <ShieldOff size={17} color={colors.surface} />}
            <Text style={styles.actionText}>Suspend</Text>
          </Pressable>
        ) : organization.status === "suspended" ? (
          <Pressable onPress={() => setPendingStatus("active")} disabled={Boolean(action)} style={styles.actionButton}>
            {action === "active" ? <ActivityIndicator size="small" color={colors.surface} /> : <CheckCircle2 size={17} color={colors.surface} />}
            <Text style={styles.actionText}>Unsuspend account</Text>
          </Pressable>
        ) : null}
      </View>

      <Section title="Business information">
        <Row label="Business name" value={organization.name} />
        <Row label="Business type" value={statusLabel(organization.businessType)} />
        <Row label="Canteen" value={organization.features?.canteenEnabled ? "Enabled" : "Not enabled"} />
        <Row label="Owner" value={organization.ownerName} />
        <Row label="Email" value={organization.email} />
        <Row label="Phone" value={organization.phone} />
        <Row label="Address" value={organization.address} />
        <Row label="Created" value={formatDate(organization.createdAt)} />
        <Row label="Activated" value={formatDate(organization.activatedAt)} />
      </Section>

      <Section title="Purchased units">
        <View style={styles.unitGrid}>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.beds || 0}</Text><Text style={styles.unitLabel}>Beds</Text></View>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.rooms || 0}</Text><Text style={styles.unitLabel}>Rooms</Text></View>
          <View style={styles.unitBox}><Text style={styles.unitValue}>{units.shops || 0}</Text><Text style={styles.unitLabel}>Shops</Text></View>
        </View>
      </Section>

      <Section title="Support: reduce vacant units">
        <Text style={styles.supportHint}>Use this only after a customer asks support to reduce units. Occupied units are not shown and cannot be removed.</Text>
        {!vacantUnits.length ? <Text style={styles.empty}>No vacant units available for removal.</Text> : vacantUnits.map((unit) => (
          <View key={unit.id} style={styles.vacantRow}>
            <View style={styles.vacantCopy}><Text style={styles.vacantTitle}>{supportUnitLabel(unit)}</Text><Text style={styles.vacantMeta}>{unit.propertyType === "bed" ? "Vacant bed" : `Vacant ${unit.propertyType === "shop" ? "shop" : "room"}`}</Text></View>
            <Pressable onPress={() => setPendingUnitRemoval(unit)} disabled={Boolean(action)} style={styles.removeButton}><Trash2 size={15} color={COLORS.red} /><Text style={styles.removeButtonText}>Remove</Text></Pressable>
          </View>
        ))}
      </Section>

      <Section title="Subscription">
        <Row label="Status" value={statusLabel(subscription.status)} />
        <Row label="Duration" value={subscription.durationMonths ? `${subscription.durationMonths} months` : "-"} />
        <Row label="Amount" value={money(subscription.amount)} />
        <Row label="Currency" value={subscription.currency} />
        <Row label="Start date" value={formatDate(subscription.startDate)} />
        <Row label="End date" value={formatDate(subscription.endDate)} />
      </Section>

      <Section title="Latest transaction">
        {latestTransaction ? (
          <>
            <Row label="Status" value={statusLabel(latestTransaction.status)} />
            <Row label="Amount" value={money(latestTransaction.amount)} />
            <TransactionPricingRows transaction={latestTransaction} />
            <Row label="Provider" value={latestTransaction.provider} />
            <Row label="Created" value={formatDate(latestTransaction.createdAt)} />
            <Row label="Paid" value={formatDate(latestTransaction.paidAt)} />
          </>
        ) : <Text style={styles.empty}>No transaction found.</Text>}
      </Section>

      <Section title="Transaction history">
        {transactions.length ? (
          <Pressable onPress={exportSubscriptionHistory} style={styles.exportButton}>
            <FileDown size={17} color={COLORS.burgundy} />
            <Text style={styles.exportText}>Export subscription history</Text>
          </Pressable>
        ) : null}
        {!transactions.length ? <Text style={styles.empty}>No transactions yet.</Text> : null}
        {transactions.map((txn) => {
          const wallet = getWalletPricing(txn);
          return (
            <View key={txn._id} style={styles.transactionRow}>
              <View style={styles.transactionCopy}>
                <Text style={styles.transactionTitle}>{statusLabel(txn.status)}</Text>
                <Text style={styles.transactionMeta}>{formatDate(txn.createdAt)} | {txn.provider || "-"}</Text>
                {wallet.hasWalletDiscount ? (
                  <Text style={styles.transactionWalletMeta}>
                    Wallet discount {money(wallet.walletCoinsUsed)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.transactionAmount}>{money(txn.amount)}</Text>
            </View>
          );
        })}
      </Section>
    </ScrollView>
    <SecurityPinModal
      visible={Boolean(pendingStatus)}
      title={pendingStatus === "active" ? "Reactivate account" : "Suspend account"}
      message="Enter your security PIN to confirm this account change."
      loading={Boolean(action)}
      onClose={() => setPendingStatus("")}
      onConfirm={(pin) => changeStatus(pendingStatus, pin)}
    />
    <SecurityPinModal
      visible={Boolean(pendingUnitRemoval)}
      title="Remove vacant unit"
      message="This permanently removes the selected vacant unit and reduces the customer's subscription count. Enter your security PIN to continue."
      loading={Boolean(pendingUnitRemoval && action === `remove-${pendingUnitRemoval.id}`)}
      onClose={() => setPendingUnitRemoval(null)}
      onConfirm={(pin) => removeVacantUnit(pendingUnitRemoval, pin)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 42 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: COLORS.bg },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 10 },
  iconButton: { width: 40, height: 40, marginRight: 8, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  title: { color: COLORS.text, fontSize: 27, fontWeight: "900", letterSpacing: 0 },
  subtitle: { marginTop: 2, color: COLORS.muted, fontSize: 13, fontWeight: "800" },
  profile: { minHeight: 78, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 17, backgroundColor: COLORS.card, ...cardShadow },
  profileText: { flex: 1, minWidth: 0, paddingRight: 8 },
  orgName: { color: COLORS.text, fontSize: 18, fontWeight: "900" },
  orgMeta: { marginTop: 5, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.orangeSoft },
  statusActive: { backgroundColor: COLORS.greenSoft },
  statusSuspended: { backgroundColor: COLORS.redSoft },
  statusText: { color: COLORS.orange, fontSize: 11, fontWeight: "900" },
  statusActiveText: { color: COLORS.green },
  statusSuspendedText: { color: COLORS.red },
  actions: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { flexGrow: 1, minHeight: 46, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: COLORS.burgundy, ...cardShadow },
  dangerButton: { backgroundColor: COLORS.red },
  actionText: { color: colors.surface, fontWeight: "900" },
  upgradeCard: { marginTop: 12, padding: 13, borderWidth: 1, borderColor: COLORS.burgundy, borderRadius: 17, backgroundColor: COLORS.burgundySoft, ...cardShadow },
  upgradeTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  upgradeCopy: { flex: 1, minWidth: 0 },
  upgradeTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  upgradeMeta: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  upgradeAmount: { color: COLORS.burgundy, fontSize: 17, fontWeight: "900" },
  upgradeUnitGrid: { marginTop: 12, flexDirection: "row", gap: 8 },
  upgradeUnitBox: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.card },
  upgradeUnitValue: { color: COLORS.burgundy, fontSize: 18, fontWeight: "900" },
  upgradeUnitLabel: { marginTop: 3, color: COLORS.muted, fontSize: 10.5, fontWeight: "800", textAlign: "center" },
  approveButton: { minHeight: 44, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, backgroundColor: COLORS.burgundy },
  section: { marginTop: 12, padding: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 17, backgroundColor: COLORS.card, ...cardShadow },
  sectionTitle: { marginBottom: 8, color: COLORS.text, fontSize: 17, fontWeight: "900" },
  row: { minHeight: 38, paddingVertical: 8, flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: COLORS.soft },
  rowLabel: { width: "35%", paddingRight: 10, color: COLORS.muted, fontSize: 12.5, fontWeight: "700" },
  rowValue: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 12.5, lineHeight: 18, fontWeight: "900", textAlign: "right", flexShrink: 1 },
  unitGrid: { flexDirection: "row", gap: 9 },
  unitBox: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: COLORS.burgundySoft },
  unitValue: { color: COLORS.burgundy, fontSize: 22, fontWeight: "900" },
  unitLabel: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  supportHint: { marginBottom: 8, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  vacantRow: { minHeight: 60, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.soft },
  vacantCopy: { flex: 1, minWidth: 0 },
  vacantTitle: { color: COLORS.text, fontSize: 12.5, fontWeight: "900" },
  vacantMeta: { marginTop: 3, color: COLORS.green, fontSize: 11, fontWeight: "800" },
  removeButton: { minHeight: 36, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.red, borderRadius: 9, backgroundColor: COLORS.redSoft },
  removeButtonText: { color: COLORS.red, fontSize: 11, fontWeight: "900" },
  transactionRow: { minHeight: 58, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.soft },
  transactionCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  transactionTitle: { color: COLORS.text, fontWeight: "900" },
  transactionMeta: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  transactionAmount: { color: COLORS.burgundy, fontWeight: "900" },
  exportButton: { minHeight: 40, marginBottom: 8, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: COLORS.burgundy, borderRadius: 12, backgroundColor: COLORS.burgundySoft },
  exportText: { color: COLORS.burgundy, fontSize: 12, fontWeight: "900" },
  empty: { paddingVertical: 12, color: COLORS.muted, textAlign: "center", fontWeight: "700" },
  error: { color: COLORS.red, textAlign: "center" },
  backText: { marginTop: 12, color: COLORS.burgundy, fontWeight: "900" },
});
