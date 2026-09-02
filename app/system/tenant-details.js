import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Archive, ArrowLeft, ArrowRightLeft, CheckCircle2, ExternalLink, FileDown, FileText, LogOut, Pencil, Plus, Trash2, UserRound, XCircle } from "lucide-react-native";

import { getSystemDashboard } from "../../src/api/saasApi";
import { archiveTenant, deleteTenant, getRentSummary, getTenant, getTenantRentDue } from "../../src/api/tenantApi";
import { formatTenantUnit, isPrimaryUnitSlot, propertyTypeFromTenant } from "../../src/utils/unitLabels";
import { documentStatusForTenant } from "../../src/utils/tenantDocuments";
import { useResponsive } from "../../src/utils/responsive";
import { hasCanteenFeature } from "../../src/utils/featureAccess";
import { systemColors as colors } from "../../src/theme/systemTheme";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function monthTime(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  if (!match) return 0;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]);
  return new Date(2000 + Number(match[2]), month, 1).getTime();
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value === undefined || value === null || value === "" ? "-" : String(value)}</Text>
    </View>
  );
}

function canteenPlanLabel(value) {
  if (value === "full_package") return "Full food package";
  if (value === "per_meal") return "Per meal pricing";
  if (value === "meal_package") return "Meal package monthly";
  return "-";
}

function Section({ title, children }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function tenantPhotoUrl(tenant) {
  const documents = Array.isArray(tenant?.documents) ? tenant.documents : [];
  const photo = documents.find((document) => {
    const label = `${document?.relation || ""} ${document?.fileName || ""} ${document?.storedName || ""}`.toLowerCase();
    return (document?.url || document?.filePath) && (label.includes("photo") || label.includes("selfie") || label.includes("photograph"));
  });
  return photo?.url || photo?.filePath || "";
}

function currentMonthKey() {
  const date = new Date();
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function rentHistoryEntries(tenant) {
  const rents = Array.isArray(tenant?.rents) ? tenant.rents : [];
  return rents.flatMap((rent) => {
    const payments = Array.isArray(rent.payments) && rent.payments.length
      ? rent.payments
      : [{ amount: rent.rentAmount, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
    return payments.map((payment, index) => ({
      key: `${rent.month || "month"}-${index}-${payment.date || ""}`,
      month: rent.month || "-",
      date: formatDate(payment.date),
      amount: money(payment.amount),
      mode: payment.paymentMode || rent.paymentMode || "-",
      utr: payment.utr || "-",
      note: payment.note || "-",
      rentAmount: money(payment.rentAmount || rent.rentAmount || 0),
      canteenAmount: Number(payment.canteenAmount || rent.canteenAmount || 0) > 0 ? money(payment.canteenAmount || rent.canteenAmount || 0) : "",
      totalAmount: money(payment.amount || rent.totalAmount || rent.rentAmount || 0),
    }));
  }).sort((a, b) => monthTime(b.month) - monthTime(a.month));
}

function movementHistoryEntries(tenant) {
  const history = Array.isArray(tenant?.rentHistory) ? tenant.rentHistory : [];
  return [...history]
    .sort((a, b) => new Date(b.effectiveFrom || 0).getTime() - new Date(a.effectiveFrom || 0).getTime())
    .map((entry, index) => ({
      key: `${entry.effectiveFrom || "move"}-${index}`,
      effectiveFrom: formatDate(entry.effectiveFrom),
      previousUnit: `${entry.previousRoomNo || "-"}${entry.previousBedNo ? ` / ${entry.previousBedNo}` : ""}`,
      newUnit: `${entry.roomNo || "-"}${entry.bedNo ? ` / ${entry.bedNo}` : ""}`,
      rent: money(entry.baseRent || entry.rentAmount || 0),
      source: entry.source || "-",
    }));
}

export default function TenantDetailsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { id, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [tenant, setTenant] = useState(null);
  const [canteenEnabled, setCanteenEnabled] = useState(false);
  const [due, setDue] = useState({ totalDue: 0, dueMonths: [] });
  const [rentSummary, setRentSummary] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);

  const loadTenant = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const tenantData = await getTenant(id);
      const months = [...new Set((tenantData.rents || []).map((rent) => rent.month).filter(Boolean))];
      const [dueData, summaries, dashboardData] = await Promise.all([
        getTenantRentDue(id),
        Promise.all(months.map((month) => getRentSummary(month).then((data) => [month, data]).catch(() => [month, null]))),
        getSystemDashboard(),
      ]);
      const summaryMap = new Map();
      summaries.forEach(([month, summary]) => {
        const row = (summary?.rows || []).find((item) => String(item.tenantId) === String(id));
        if (row) summaryMap.set(month, row);
      });
      setTenant(tenantData);
      setCanteenEnabled(hasCanteenFeature(dashboardData));
      setDue(dueData);
      setRentSummary(summaryMap);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load tenant details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadTenant(); }, [loadTenant]));

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!tenant) return <View style={styles.loading}><Text style={styles.error}>{error || "Tenant not found."}</Text><Pressable onPress={() => router.replace(String(returnTo))}><Text style={styles.backText}>Go back</Text></Pressable></View>;

  const address = [tenant.houseNo, tenant.address, tenant.nearbyPlace, tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ");
  const documents = Array.isArray(tenant.documents) ? tenant.documents : [];
  const isActive = !tenant.leaveDate || new Date(tenant.leaveDate) > new Date();
  const canArchive = tenant.leaveDate && new Date(tenant.leaveDate) <= new Date();
  const propertyType = propertyTypeFromTenant(tenant);
  const isResidentialRoom = propertyType === "room";
  const isShop = propertyType === "shop";
  const typeLabel = isShop ? "Commercial Shop" : isResidentialRoom ? "Residential Room" : "Hostel Bed";
  const documentStatus = documentStatusForTenant(tenant);
  const photoUrl = tenantPhotoUrl(tenant);
  const paidTotal = Array.isArray(tenant.rents)
    ? tenant.rents.reduce((sum, rent) => sum + Number(rent.totalAmount || rent.rentAmount || 0), 0)
    : 0;
  const currentMonthSummary = rentSummary.get(currentMonthKey());
  const currentMonthBalance = Math.max(Number(currentMonthSummary?.totalBalance || 0), 0);
  const currentPending = currentMonthBalance + Number(due.totalDue || 0);
  const paymentHistory = rentHistoryEntries(tenant);
  const movementHistory = movementHistoryEntries(tenant);

  function confirmArchive() {
    Alert.alert(
      "Archive tenant",
      "This removes the tenant from active records and keeps them in Former Tenants.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: async () => {
          try {
            await archiveTenant(tenant._id);
            router.replace("/system/tenants");
          } catch (err) {
            Alert.alert("Unable to archive", err.response?.data?.message || "Please try again.");
          }
        } },
      ]
    );
  }

  async function confirmDeleteTenant() {
    if (!deletePassword.trim()) {
      Alert.alert("Password required", "Enter the delete password to continue.");
      return;
    }

    try {
      setDeleting(true);
      const result = await deleteTenant(tenant._id, deletePassword.trim());
      if (!result?.ok || String(result.deletedTenantId) !== String(tenant._id)) {
        throw new Error("The server did not confirm this tenant was deleted.");
      }
      setDeleteModalVisible(false);
      setDeletePassword("");
      Alert.alert("Tenant deleted", result.message || "Tenant deleted successfully.", [
        { text: "OK", onPress: () => router.replace(String(returnTo)) },
      ]);
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message ||
        (err.request ? "Cannot reach the backend. Check that the backend is running and the phone is on the same Wi-Fi." : err.message) ||
        "Please check the password and try again.";
      Alert.alert("Unable to delete", status ? `${message} (HTTP ${status})` : message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace(String(returnTo))} style={styles.iconButton}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tenant details</Text>
          <Text style={styles.subtitle}>Admission #{tenant.srNo || "-"}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: "/system/rent-form", params: { id: tenant._id, returnTo: `/system/tenant-details?id=${tenant._id}&returnTo=${encodeURIComponent(String(returnTo))}` } })} style={styles.headerAction}>
          <Plus size={18} color={colors.surface} /><Text style={styles.headerActionText}>Add rent</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { padding: responsive.pagePadding }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIdentity}>
              <View style={styles.heroAvatar}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.heroAvatarImage} contentFit="cover" />
                ) : (
                  <View style={styles.heroAvatarFallback}><UserRound size={30} color={colors.surface} /></View>
                )}
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroName}>{tenant.name}</Text>
                <View style={styles.heroBadgeRow}>
                  <Text style={styles.heroCycleBadge}>{tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid" : "Normal cycle"}</Text>
                  {!isShop && !isResidentialRoom && canteenEnabled && tenant.hasCanteen ? (
                    <Text style={styles.heroCanteenBadge}>Canteen taken</Text>
                  ) : null}
                </View>
                <Text style={styles.heroUnit}>{formatTenantUnit(tenant)}</Text>
                <Text style={styles.heroPhone}>{tenant.phoneNo || "No phone number"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Deposit</Text>
              <Text style={styles.metricValue}>{money(tenant.depositAmount)}</Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Paid</Text>
              <Text style={styles.metricValue}>{money(paidTotal)}</Text>
            </View>
            <View style={styles.metricCellWide}>
              <Text style={styles.metricLabel}>Final due amount</Text>
              <Text style={styles.metricValueAccent}>{money(currentPending)}</Text>
            </View>
            {!isShop && !isResidentialRoom && canteenEnabled ? (
              <View style={styles.metricTagRow}>
                {!tenant.hasCanteen ? <Text style={styles.metricTag}>Canteen: Not taken</Text> : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => setHistoryVisible(true)} style={styles.action}>
            <FileText size={17} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>History</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/system/tenant-edit", params: { id: tenant._id, returnTo } })} style={styles.action}>
            <Pencil size={17} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/system/tenant-shift", params: { id: tenant._id, returnTo } })} disabled={!isActive} style={[styles.action, !isActive && styles.actionDisabled]}>
            <ArrowRightLeft size={17} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Shift</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/system/tenant-leave", params: { id: tenant._id, returnTo } })} style={styles.action}>
            <LogOut size={17} color={colors.warning} />
            <Text style={[styles.actionText, styles.leaveText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tenant.leaveDate ? "Leaving" : "Leaving"}</Text>
          </Pressable>
          <Pressable onPress={() => setDeleteModalVisible(true)} style={styles.action}>
            <Trash2 size={17} color={colors.danger} />
            <Text style={[styles.actionText, styles.archiveText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Delete</Text>
          </Pressable>
        </View>

        {canArchive ? (
          <Pressable onPress={confirmArchive} style={styles.archiveButton}>
            <Archive size={16} color={colors.danger} />
            <Text style={styles.archiveButtonText}>Move to former tenants</Text>
          </Pressable>
        ) : null}

        <View style={[styles.dueSection, !due.totalDue && styles.dueClear]}>
          <View style={styles.dueHeader}>
            <View><Text style={[styles.dueLabel, !due.totalDue && styles.dueClearText]}>{due.totalDue ? "Overdue rent" : "Rent status"}</Text><Text style={styles.dueHint}>{due.totalDue ? `${due.dueMonths.length} billing cycle${due.dueMonths.length === 1 ? "" : "s"} pending` : "No completed rent cycle is overdue"}</Text></View>
            <Text style={[styles.dueAmount, !due.totalDue && styles.dueClearText]}>{due.totalDue ? money(due.totalDue) : "Clear"}</Text>
          </View>
          {due.dueMonths.map((month) => (
            <View key={month.month} style={styles.dueMonthRow}>
              <View style={styles.dueMonthInfo}>
                <Text style={styles.dueMonthName}>{month.month}</Text>
                <Text style={styles.dueMonthMeta}>{money(month.paid)} paid of {money(month.expected)}</Text>
              </View>
              <Text style={styles.dueMonthAmount}>{money(month.outstanding)}</Text>
            </View>
          ))}
        </View>

        <Section title="Personal information">
          <Row label="Full name" value={tenant.name} />
          <Row label="Phone number" value={tenant.phoneNo} />
          <Row label="Date of birth" value={formatDate(tenant.dob)} />
          <Row label="Joining date" value={formatDate(tenant.joiningDate)} />
          {tenant.leaveDate ? <Row label="Leave date" value={formatDate(tenant.leaveDate)} /> : null}
        </Section>

        <Section title="Unit assignment">
          <Row label="Type" value={typeLabel} />
          <Row label={isShop || isResidentialRoom ? "Building" : "Hostel/building"} value={tenant.category} />
          <Row label="Floor" value={tenant.floorNo} />
          <Row label={isShop ? "Shop" : isResidentialRoom ? "Flat/room" : "Room"} value={tenant.roomNo} />
          {!isShop && !isResidentialRoom && !isPrimaryUnitSlot(tenant.bedNo) ? <Row label="Bed number" value={tenant.bedNo} /> : null}
          {!isShop && !isResidentialRoom && canteenEnabled ? <Row label="Canteen" value={tenant.hasCanteen ? "Taken" : "Not taken"} /> : null}
          {!isShop && !isResidentialRoom && canteenEnabled && tenant.hasCanteen ? <Row label="Canteen plan" value={canteenPlanLabel(tenant.canteenPlanType)} /> : null}
          {!isShop && !isResidentialRoom && canteenEnabled && tenant.hasCanteen && tenant.canteenMonthlyAmount ? <Row label="Canteen monthly" value={money(tenant.canteenMonthlyAmount)} /> : null}
          <Row label="Display unit" value={formatTenantUnit(tenant)} />
        </Section>

        <Section title="Financial information">
          <Row label="Monthly rent" value={money(tenant.baseRent)} />
          <Row label="Deposit" value={money(tenant.depositAmount)} />
          <Row label="Payment cycle" value={tenant.firstRentStatus === "ADVANCE_PAID" ? "Advance paid - joining cycle paid" : "Normal cycle - payable after month completes"} />
          <Row label="First rent month" value={tenant.firstRentMonth} />
          <Row label="Recorded payments" value={Array.isArray(tenant.rents) ? tenant.rents.length : 0} />
        </Section>

        <Section title="Rent history">
          {!tenant.rents?.length ? <Text style={styles.noDocuments}>No rent payments recorded.</Text> : null}
          {[...(tenant.rents || [])].sort((a, b) => monthTime(b.month) - monthTime(a.month)).map((rent) => {
            const dueMonth = (due.dueMonths || []).find((month) => month.month === rent.month);
            const summary = rentSummary.get(rent.month);
            const expected = Number(dueMonth?.expected ?? summary?.expected ?? rent.rentAmount ?? tenant.baseRent ?? 0);
            const paid = Number(summary?.paid ?? rent.rentAmount ?? 0);
            const canteenExpected = Number(summary?.canteenExpected || 0);
            const canteenPaid = Number(summary?.canteenPaid ?? rent.canteenAmount ?? 0);
            const totalExpected = Number(summary?.totalExpected ?? expected + canteenExpected);
            const totalPaid = Number(summary?.totalPaid ?? rent.totalAmount ?? paid + canteenPaid);
            const mealCounts = summary?.canteenMealCounts || {};
            const status = totalPaid >= totalExpected ? "Paid" : totalPaid > 0 ? "Partial" : "Pending";
            const transactions = Array.isArray(rent.payments) && rent.payments.length ? rent.payments : [{ amount: paid, date: rent.date, paymentMode: rent.paymentMode, utr: rent.utr, note: rent.note }];
            return (
              <View key={rent._id || rent.month} style={styles.rentMonth}>
                <View style={styles.rentHeader}>
                  <View style={styles.rentHeaderText}><Text style={styles.rentMonthName} numberOfLines={1}>{rent.month}</Text><Text style={styles.rentBalance} numberOfLines={2}>Rent {money(paid)}{canteenPaid || canteenExpected ? ` | Canteen ${money(canteenPaid)}` : ""} | Balance {money(Math.max(totalExpected - totalPaid, 0))}</Text></View>
                  <View style={[styles.rentStatus, status === "Partial" && styles.rentPartial]}><Text style={[styles.rentStatusText, status === "Partial" && styles.rentPartialText]}>{status}</Text></View>
                </View>
                {canteenExpected ? (
                  <Text style={styles.canteenHistoryMeta}>
                    Canteen charge {money(canteenExpected)} | Breakfast {mealCounts.breakfast || 0}, Lunch {mealCounts.lunch || 0}, Dinner {mealCounts.dinner || 0}
                    {summary?.canteenPresentDays ? ` | Charged ${summary.canteenPresentDays}/${summary.canteenDaysInMonth} days` : ""}
                  </Text>
                ) : null}
                {transactions.map((payment, index) => (
                  <View key={payment._id || `${rent.month}-${index}`} style={styles.transaction}>
                    <View style={styles.transactionMain}>
                      <Text style={styles.transactionAmount}>{money(payment.amount)}</Text>
                      <Text style={styles.transactionMeta}>{formatDate(payment.date)} | {payment.paymentMode || "Cash"}</Text>
                      {Number(payment.canteenAmount || 0) > 0 ? <Text style={styles.transactionMeta}>Rent {money(payment.rentAmount)} + Canteen {money(payment.canteenAmount)}</Text> : null}
                    </View>
                  <View style={styles.transactionActions}><Pressable accessibilityLabel="Payment receipt" onPress={() => router.push({ pathname: "/system/payment-receipt", params: { id: tenant._id, rentId: rent._id, paymentIndex: index, returnTo } })} style={[styles.editPayment, responsive.isTiny && styles.editPaymentTiny]}><FileDown size={15} color={colors.primary} /><Text style={styles.editPaymentText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Receipt</Text></Pressable><Pressable accessibilityLabel="Edit payment" onPress={() => router.push({ pathname: "/system/payment-edit", params: { id: tenant._id, rentId: rent._id, paymentIndex: index, returnTo } })} style={[styles.editPayment, responsive.isTiny && styles.editPaymentTiny]}><Pencil size={15} color={colors.primary} /><Text style={styles.editPaymentText} numberOfLines={1}>Edit</Text></Pressable></View>
                    {payment.utr ? <Text style={styles.transactionRef}>UTR: {payment.utr}</Text> : null}
                    {payment.note ? <Text style={styles.transactionNote}>{payment.note}</Text> : null}
                  </View>
                ))}
              </View>
            );
          })}
        </Section>

        <Section title="Permanent address">
          <Row label="Complete address" value={address} />
          <Row label="House number" value={tenant.houseNo} />
          <Row label="Nearby place" value={tenant.nearbyPlace} />
          <Row label="City" value={tenant.city} />
          <Row label="State" value={tenant.state} />
          <Row label="Pincode" value={tenant.pincode} />
        </Section>

        {!isResidentialRoom && !isShop ? (
          <Section title="Emergency contacts">
            <Text style={styles.contactTitle}>First contact</Text>
            <Row label="Relation" value={tenant.relative1Relation} />
            <Row label="Name" value={tenant.relative1Name} />
            <Row label="Phone" value={tenant.relative1Phone} />
            <Text style={styles.contactTitle}>Second contact</Text>
            <Row label="Relation" value={tenant.relative2Relation} />
            <Row label="Name" value={tenant.relative2Name} />
            <Row label="Phone" value={tenant.relative2Phone} />
          </Section>
        ) : null}

        {isResidentialRoom ? (
          <Section title="Family and work">
            <Row label="Family members" value={tenant.familyMembers} />
            <Row label="Company/college" value={tenant.companyAddress} />
            <Row label="Joining date" value={formatDate(tenant.dateOfJoiningCollege)} />
          </Section>
        ) : isShop ? (
          <Section title="Shop details">
            <Row label="Shop name" value={tenant.shopName} />
            <Row label="Shop work/business" value={tenant.shopBusiness} />
          </Section>
        ) : (
          <Section title="Work or education">
            <Row label="Company/college" value={tenant.companyAddress} />
            <Row label="Joining date" value={formatDate(tenant.dateOfJoiningCollege)} />
          </Section>
        )}

        <Section title="Documents">
          <View style={[styles.documentSummary, documentStatus.complete ? styles.documentSummaryComplete : styles.documentSummaryMissing]}>
            <View>
              <Text style={[styles.documentSummaryTitle, documentStatus.complete ? styles.documentSummaryTitleComplete : styles.documentSummaryTitleMissing]}>
                {documentStatus.complete ? "Required documents complete" : `${documentStatus.missing.length} required document${documentStatus.missing.length === 1 ? "" : "s"} missing`}
              </Text>
              <Text style={styles.documentSummaryMeta}>{documentStatus.uploadedCount} of {documentStatus.requiredCount} required documents uploaded</Text>
            </View>
            <Pressable onPress={() => router.push({ pathname: "/system/tenant-edit", params: { id: tenant._id, returnTo } })} style={styles.documentEditButton}>
              <Text style={styles.documentEditText}>{documentStatus.complete ? "Replace" : "Add"}</Text>
            </Pressable>
          </View>
          <View style={styles.requiredDocuments}>
            {documentStatus.required.map((item) => (
              <View key={item.relation} style={styles.requiredDocumentRow}>
                {item.uploaded ? <CheckCircle2 size={16} color={colors.success} /> : <XCircle size={16} color={colors.danger} />}
                <Text style={[styles.requiredDocumentText, !item.uploaded && styles.requiredDocumentMissing]}>{item.label}</Text>
              </View>
            ))}
          </View>
          {!documents.length ? <Text style={styles.noDocuments}>No documents uploaded.</Text> : null}
          <View style={styles.documentGrid}>
            {documents.map((document, index) => (
              <Pressable
                key={document._id || `${document.relation}-${index}`}
                onPress={() => (document.url || document.filePath) && router.push({
                  pathname: "/system/document-preview",
                  params: {
                    url: document.url || document.filePath,
                    title: document.relation || "Document",
                    fileName: document.fileName || document.storedName || document.relation || "document",
                    returnTo: `/system/tenant-details?id=${tenant._id}&returnTo=${encodeURIComponent(String(returnTo))}`,
                  },
                })}
                disabled={!document.url && !document.filePath}
                style={styles.document}
              >
                {document.url || document.filePath ? <Image source={{ uri: document.url || document.filePath }} style={styles.documentImage} contentFit="cover" transition={150} /> : <View style={styles.documentPlaceholder}><FileText size={27} color={colors.muted} /></View>}
                <View style={styles.documentFooter}>
                  <View style={styles.documentText}>
                    <Text style={styles.documentTitle} numberOfLines={1}>{document.relation || "Document"}</Text>
                    <Text style={styles.documentMeta} numberOfLines={1}>{document.fileName || document.storedName || (document.url ? "Tap to preview" : "Missing file")}</Text>
                  </View>
                  {document.url || document.filePath ? <ExternalLink size={15} color={colors.primary} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </Section>
      </ScrollView>
      <Modal transparent visible={historyVisible} animationType="fade" onRequestClose={() => setHistoryVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.historyModalCard}>
            <Text style={styles.modalTitle}>Tenant history</Text>
            <Text style={styles.modalText}>
              {tenant.name} | {formatTenantUnit(tenant)} | Joined {formatDate(tenant.joiningDate)}
            </Text>
            <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyContent} showsVerticalScrollIndicator={false}>
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Rent payment history</Text>
                {paymentHistory.length ? (
                  <View style={styles.historyTable}>
                    <View style={styles.historyTableHeader}>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderMonth]}>Month</Text>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderDate]}>Date / Mode</Text>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderAmount]}>Amount</Text>
                    </View>
                    {paymentHistory.map((entry) => (
                      <View key={entry.key} style={styles.historyTableRow}>
                        <View style={styles.historyMonthCell}>
                          <Text style={styles.historyCellPrimary}>{entry.month}</Text>
                          <Text style={styles.historyCellSecondary} numberOfLines={1}>UTR: {entry.utr}</Text>
                        </View>
                        <View style={styles.historyDateCell}>
                          <Text style={styles.historyCellPrimary}>{entry.date}</Text>
                          <Text style={styles.historyCellSecondary}>{entry.mode}</Text>
                        </View>
                        <View style={styles.historyAmountCell}>
                          <Text style={styles.historyCellAmount}>{entry.amount}</Text>
                          {entry.canteenAmount ? <Text style={styles.historyCellSecondary}>Canteen: {entry.canteenAmount}</Text> : null}
                        </View>
                        {entry.note !== "-" ? <Text style={styles.historyRowNote}>Note: {entry.note}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : <Text style={styles.historyEmpty}>No rent history found.</Text>}
              </View>
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Room / rent movement history</Text>
                {movementHistory.length ? (
                  <View style={styles.historyTable}>
                    <View style={styles.historyTableHeader}>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderDate]}>Date</Text>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderMove]}>Shift details</Text>
                      <Text style={[styles.historyHeaderCell, styles.historyHeaderAmount]}>Rent</Text>
                    </View>
                    {movementHistory.map((entry) => (
                      <View key={entry.key} style={styles.historyTableRow}>
                        <View style={styles.historyDateCell}>
                          <Text style={styles.historyCellPrimary}>{entry.effectiveFrom}</Text>
                          <Text style={styles.historyCellSecondary}>{entry.source}</Text>
                        </View>
                        <View style={styles.historyMoveCell}>
                          <Text style={styles.historyCellPrimary}>From: {entry.previousUnit}</Text>
                          <Text style={styles.historyCellSecondary}>To: {entry.newUnit}</Text>
                        </View>
                        <View style={styles.historyAmountCell}>
                          <Text style={styles.historyCellAmount}>{entry.rent}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : <Text style={styles.historyEmpty}>No room or rent movement recorded yet.</Text>}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setHistoryVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={deleteModalVisible} animationType="fade" onRequestClose={() => !deleting && setDeleteModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete tenant?</Text>
            <Text style={styles.modalText}>This permanently removes {tenant.name}. A backup copy is kept in deleted records.</Text>
            <Text style={styles.modalLabel}>Delete password</Text>
            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Enter password"
              style={styles.passwordInput}
              editable={!deleting}
            />
            <View style={styles.modalActions}>
              <Pressable disabled={deleting} onPress={() => { setDeleteModalVisible(false); setDeletePassword(""); }} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={deleting} onPress={confirmDeleteTenant} style={[styles.deleteButton, deleting && styles.actionDisabled]}>
                {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.deleteText}>Delete tenant</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  header: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, marginLeft: 4 },
  title: { color: colors.text, fontSize: 23, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  headerAction: { height: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 14, backgroundColor: colors.primary },
  headerActionText: { color: colors.surface, fontSize: 13, fontWeight: "700" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 18, paddingBottom: 40, gap: 12 },
  heroCard: { padding: 16, borderRadius: 22, backgroundColor: colors.deep, ...colors.shadow ? {} : {} },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  heroIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  heroAvatar: { width: 84, height: 84, borderRadius: 26, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.18)" },
  heroAvatarImage: { width: "100%", height: "100%" },
  heroAvatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, minWidth: 0, marginLeft: 14 },
  heroName: { color: colors.surface, fontSize: 18, fontWeight: "900" },
  heroBadgeRow: { marginTop: 6, flexDirection: "row", gap: 6 },
  heroCycleBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden", backgroundColor: colors.soft, color: colors.mid, fontSize: 11, fontWeight: "900" },
  heroCanteenBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden", backgroundColor: "#DDF3E5", color: colors.mid, fontSize: 11, fontWeight: "900" },
  heroUnit: { marginTop: 8, color: "#F4F8EF", fontSize: 15, fontWeight: "700" },
  heroPhone: { marginTop: 8, color: "#E4EFE6", fontSize: 14, fontWeight: "700" },
  metricCard: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  metricGrid: { gap: 12 },
  metricCell: { width: "48%" },
  metricCellWide: { width: "100%" },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  metricValue: { marginTop: 5, color: colors.text, fontSize: 16, fontWeight: "900" },
  metricValueAccent: { marginTop: 5, color: colors.warning, fontSize: 16, fontWeight: "900" },
  metricTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden", backgroundColor: colors.soft, color: colors.mid, fontSize: 12, fontWeight: "800" },
  avatar: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.primarySoft },
  profileText: { flex: 1, minWidth: 0, marginLeft: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: "700" },
  phone: { marginTop: 4, color: colors.muted, fontSize: 13 },
  status: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.successSoft },
  statusText: { color: colors.success, fontSize: 12, fontWeight: "700" },
  statusInactive: { backgroundColor: colors.dangerSoft },
  statusInactiveText: { color: colors.danger },
  actions: { minHeight: 62, flexDirection: "row", flexWrap: "nowrap", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  action: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", gap: 5, borderRightWidth: 1, borderRightColor: colors.surfaceSoft },
  actionText: { width: "100%", color: colors.primary, fontSize: 10, fontWeight: "700", textAlign: "center" },
  leaveText: { color: colors.warning },
  archiveText: { color: colors.danger },
  archiveButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 8, backgroundColor: colors.dangerSoft },
  archiveButtonText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
  actionDisabled: { opacity: 0.4 },
  dueSection: { padding: 14, borderWidth: 1, borderColor: colors.dangerSoft, borderRadius: 18, backgroundColor: colors.dangerSoft },
  dueClear: { borderColor: colors.successSoft, backgroundColor: colors.successSoft },
  dueHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  dueLabel: { color: colors.danger, fontSize: 15, fontWeight: "700" },
  dueHint: { marginTop: 3, color: colors.muted, fontSize: 11 },
  dueAmount: { color: colors.danger, fontSize: 18, fontWeight: "700", flexShrink: 0 },
  dueClearText: { color: colors.success },
  dueMonthRow: { minHeight: 48, marginTop: 9, paddingTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: 1, borderTopColor: colors.dangerSoft },
  dueMonthInfo: { flex: 1, minWidth: 0 },
  dueMonthName: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  dueMonthMeta: { marginTop: 3, color: colors.muted, fontSize: 11 },
  dueMonthAmount: { flexShrink: 0, maxWidth: "42%", color: colors.danger, fontSize: 12, fontWeight: "700", textAlign: "right" },
  section: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  sectionTitle: { marginBottom: 9, color: colors.text, fontSize: 18, fontWeight: "800" },
  row: { minHeight: 39, paddingVertical: 8, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  rowLabel: { flexBasis: "42%", minWidth: 112, paddingRight: 10, color: colors.muted, fontSize: 13 },
  rowValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600", textAlign: "right" },
  contactTitle: { marginTop: 12, color: colors.primary, fontSize: 13, fontWeight: "700" },
  rentMonth: { marginTop: 9, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card },
  rentHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  rentHeaderText: { flex: 1, minWidth: 0 },
  rentMonthName: { color: colors.text, fontWeight: "700" },
  rentBalance: { marginTop: 4, color: colors.muted, fontSize: 12 },
  rentStatus: { flexShrink: 0, maxWidth: 76, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: colors.successSoft },
  rentStatusText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  rentPartial: { backgroundColor: colors.warningSoft },
  rentPartialText: { color: colors.warning },
  canteenHistoryMeta: { marginTop: 8, color: colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 16 },
  transaction: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.surfaceSoft },
  transactionMain: { alignItems: "flex-start", gap: 4 },
  transactionActions: { width: "100%", marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  editPayment: { flex: 1, minWidth: 82, minHeight: 36, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 6, backgroundColor: colors.primarySoft },
  editPaymentTiny: { flexBasis: "31%" },
  editPaymentText: { flexShrink: 1, color: colors.primary, fontSize: 10, fontWeight: "700", textAlign: "center" },
  transactionAmount: { color: colors.muted, fontWeight: "700" },
  transactionMeta: { color: colors.muted, fontSize: 11 },
  transactionRef: { marginTop: 4, color: colors.primary, fontSize: 11 },
  transactionNote: { marginTop: 4, color: colors.muted, fontSize: 11 },
  noDocuments: { paddingVertical: 15, color: colors.muted, textAlign: "center" },
  historyModalCard: { width: "100%", maxWidth: 520, maxHeight: "85%", padding: 18, borderRadius: 10, backgroundColor: colors.surface },
  historyScroll: { maxHeight: 560 },
  historyContent: { paddingBottom: 8 },
  historySection: { marginTop: 14 },
  historyTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  historyTable: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  historyTableHeader: { minHeight: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.primarySoft, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyHeaderCell: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  historyHeaderMonth: { flex: 1.05 },
  historyHeaderDate: { flex: 1.05 },
  historyHeaderMove: { flex: 1.4 },
  historyHeaderAmount: { width: 96, textAlign: "right" },
  historyTableRow: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.surfaceSoft },
  historyMonthCell: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  historyDateCell: { marginTop: 8 },
  historyMoveCell: { marginTop: 8 },
  historyAmountCell: { marginTop: 8, alignItems: "flex-end" },
  historyCellPrimary: { color: colors.text, fontSize: 13, fontWeight: "700" },
  historyCellSecondary: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: "600" },
  historyCellAmount: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  historyRowNote: { marginTop: 8, color: colors.muted, fontSize: 11, lineHeight: 16 },
  historyEmpty: { color: colors.muted, fontSize: 13 },
  documentSummary: { minHeight: 66, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 14 },
  documentSummaryComplete: { borderColor: colors.successSoft, backgroundColor: colors.successSoft },
  documentSummaryMissing: { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  documentSummaryTitle: { fontSize: 14, fontWeight: "800" },
  documentSummaryTitleComplete: { color: colors.success },
  documentSummaryTitleMissing: { color: colors.danger },
  documentSummaryMeta: { marginTop: 4, color: colors.muted, fontSize: 11, fontWeight: "600" },
  documentEditButton: { minHeight: 36, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: colors.primary },
  documentEditText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  requiredDocuments: { marginTop: 10, gap: 7 },
  requiredDocumentRow: { minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 7, backgroundColor: colors.surfaceSoft },
  requiredDocumentText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  requiredDocumentMissing: { color: colors.danger },
  documentGrid: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  document: { flexGrow: 1, flexBasis: 150, minWidth: 140, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  documentImage: { width: "100%", aspectRatio: 1.45, backgroundColor: colors.surfaceSoft },
  documentPlaceholder: { width: "100%", aspectRatio: 1.45, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft },
  documentFooter: { minHeight: 52, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  documentText: { flex: 1, minWidth: 0 },
  documentTitle: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  documentMeta: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: "600" },
  modalBackdrop: { flex: 1, padding: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  modalCard: { width: "100%", maxWidth: 420, padding: 18, borderRadius: 10, backgroundColor: colors.surface },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  modalText: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 19 },
  modalLabel: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 13, fontWeight: "700" },
  passwordInput: { height: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  modalActions: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelButton: { height: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  cancelText: { color: colors.muted, fontWeight: "700" },
  deleteButton: { height: 44, minWidth: 132, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.danger },
  deleteText: { color: colors.surface, fontWeight: "700" },
  error: { color: colors.danger, textAlign: "center" },
  backText: { marginTop: 12, color: colors.primary, fontWeight: "700" },
});
