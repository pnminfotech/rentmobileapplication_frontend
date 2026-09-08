import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import {
  BedDouble, Building2, ChevronDown, ChevronRight,
  DoorOpen, MapPin, Plus, Search, SlidersHorizontal, Store,
} from "lucide-react-native";

import { getRooms, getUnitUsage } from "../../src/api/roomApi";
import { getTenants } from "../../src/api/tenantApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { systemColors } from "../../src/theme/systemTheme";
import { useResponsive } from "../../src/utils/responsive";

const UI = {
  screen: "#F6F8F7", card: "#FFFFFF", text: "#111B2A", muted: "#63738A",
  border: "#D9E1E7", primary: "#4F7FA6", primaryDark: "#244F70",
  primarySoft: "#E7F1F8", amber: "#A66B00", amberSoft: "#FFF2CF", track: "#E5EBEE",
};

const TYPES = [
  { value: "bed", label: "Hostel" },
  { value: "room", label: "Residential" },
  { value: "shop", label: "Commercial" },
];

function activeTenant(tenant) {
  if (!tenant?.leaveDate) return true;
  const leave = new Date(tenant.leaveDate);
  return Number.isNaN(leave.getTime()) || leave > new Date();
}

function sameUnit(tenant, unit) {
  if (tenant?.roomId) return String(tenant.roomId) === String(unit?._id);
  return (
    String(tenant?.category || "") === String(unit?.category || "") &&
    String(tenant?.roomNo || "") === String(unit?.roomNo || "")
  );
}

function unitOccupancy(unit, tenants) {
  const type = unit?.propertyType || "bed";
  const beds = Array.isArray(unit?.beds) ? unit.beds : [];
  const slots = type === "bed" ? beds : [beds[0] || { bedNo: "unit" }];
  const occupied = slots.filter((bed) =>
    tenants.some((tenant) =>
      sameUnit(tenant, unit) &&
      (type !== "bed" || String(tenant?.bedNo || "") === String(bed?.bedNo || ""))
    )
  ).length;
  return { total: slots.length, occupied, vacant: Math.max(slots.length - occupied, 0) };
}

function groupUnits(units, tenants) {
  const grouped = new Map();
  units.forEach((unit) => {
    const building = String(unit.category || "Unassigned Property").trim();
    const wing = String(unit.wingName || "Main").trim();
    if (!grouped.has(building)) grouped.set(building, new Map());
    if (!grouped.get(building).has(wing)) grouped.get(building).set(wing, []);
    grouped.get(building).get(wing).push({ ...unit, occupancy: unitOccupancy(unit, tenants) });
  });
  return Array.from(grouped, ([name, wings]) => ({
    name,
    location: Array.from(wings.values()).flat()[0]?.address ||
      Array.from(wings.values()).flat()[0]?.location || "Property",
    wings: Array.from(wings, ([name, rooms]) => ({
      name,
      rooms: rooms.sort((a, b) =>
        String(a.roomNo || "").localeCompare(String(b.roomNo || ""), undefined, { numeric: true })
      ),
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function TypeTabs({ value, onChange, types }) {
  return (
    <View style={styles.typeTabs}>
      {types.map((type) => (
        <Pressable key={type.value} onPress={() => onChange(type.value)}
          style={[styles.typeTab, value === type.value && styles.typeTabActive]}>
          <Text style={[styles.typeTabText, value === type.value && styles.typeTabTextActive]}>
            {type.label}
          </Text>
          {value === type.value ? <View style={styles.activeLine} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

function SummaryCard({ stats, type, quota }) {
  const noun = type === "bed" ? "beds" : type === "room" ? "rooms" : "shops";
  const rate = stats.total ? Math.round((stats.occupied / stats.total) * 100) : 0;
  const quotaKey = type === "bed" ? "beds" : type === "room" ? "rooms" : "shops";
  const limit = quota?.limits?.[quotaKey];
  const used = quota?.usage?.[quotaKey] ?? stats.total;
  const remaining = quota?.remaining?.[quotaKey];
  return (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        <Text style={styles.summaryTitle}>
          {limit == null ? `${used} ${noun} added` : `${used} of ${limit} ${noun} added`}
        </Text>
        <Text style={styles.summaryRate}>{rate}% <Text style={styles.summaryRateLabel}>occupancy</Text></Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${rate}%` }]} />
      </View>
      <View style={styles.summaryBottom}>
        <View style={styles.summaryMetric}>
          <View style={styles.neutralIcon}><BedDouble size={16} color="#40566D" /></View>
          <View><Text style={styles.summaryValue}>{stats.occupied}</Text><Text style={styles.summaryLabel}>occupied</Text></View>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <View style={styles.neutralIcon}><Building2 size={16} color="#40566D" /></View>
          <View><Text style={styles.summaryValue}>{stats.vacant}</Text><Text style={styles.summaryLabel}>vacant</Text></View>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <View style={styles.neutralIcon}><Plus size={16} color="#40566D" /></View>
          <View><Text style={styles.summaryValue}>{remaining ?? "-"}</Text><Text style={styles.summaryLabel}>can add</Text></View>
        </View>
      </View>
    </View>
  );
}

function RoomRow({ room, type, onPress, last }) {
  const { occupied, total, vacant } = room.occupancy;
  const rate = total ? Math.round((occupied / total) * 100) : 0;
  const label = type === "bed" ? "beds" : type === "room" ? "room" : "shop";
  const Icon = type === "shop" ? Store : DoorOpen;
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.roomRow, !last && styles.rowBorder, pressed && styles.pressed]}>
      <View style={styles.roomIcon}><Icon size={18} color="#40566D" /></View>
      <View style={styles.roomNameWrap}>
        <Text style={styles.roomName}>{type === "shop" ? "Shop" : "Room"} {room.roomNo}</Text>
        <Text style={styles.roomMeta}>{total} {label}{total === 1 ? "" : "s"}</Text>
      </View>
      <View style={styles.occupancyWrap}>
        <Text style={styles.occupancyText}>{occupied}/{total} occupied</Text>
        <View style={styles.roomTrack}><View style={[styles.roomFill, { width: `${rate}%` }]} /></View>
      </View>
      <View style={[styles.statusPill, vacant ? styles.vacantPill : styles.fullPill]}>
        <Text style={[styles.statusText, vacant ? styles.vacantText : styles.fullText]}>
          {vacant ? `${vacant} Vacant` : "Full"}
        </Text>
      </View>
      <ChevronRight size={17} color="#667085" />
    </Pressable>
  );
}

function BuildingCard({ building, type, activeWing, onWingChange, onRoomPress }) {
  const selectedWing = building.wings.find((wing) => wing.name === activeWing) || building.wings[0];
  return (
    <View style={styles.buildingCard}>
      <View style={styles.buildingHeader}>
        <View style={styles.buildingIcon}><Building2 size={19} color="#40566D" /></View>
        <View style={styles.buildingCopy}>
          <Text style={styles.buildingName}>{building.name}</Text>
          <View style={styles.locationRow}><MapPin size={11} color={UI.muted} /><Text style={styles.location} numberOfLines={1}>{building.location}</Text></View>
        </View>
        <View style={styles.activeStatus}><View style={styles.activeDot} /><Text style={styles.activeText}>Active</Text></View>
      </View>

      {building.wings.length > 1 || building.wings[0]?.name !== "Main" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wingTabs}>
          {building.wings.map((wing) => (
            <Pressable key={wing.name} onPress={() => onWingChange(wing.name)}
              style={[styles.wingTab, selectedWing?.name === wing.name && styles.wingTabActive]}>
              <Text style={[styles.wingText, selectedWing?.name === wing.name && styles.wingTextActive]}>
                {wing.name === "Main" ? "Main" : `Wing ${wing.name}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.rooms}>
        {(selectedWing?.rooms || []).map((room, index, list) => (
          <RoomRow key={room._id} room={room} type={type}
            last={index === list.length - 1} onPress={() => onRoomPress(room)} />
        ))}
      </View>
    </View>
  );
}

export default function UnitsModernScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { unitTypes, firstUnitType } = useSystemAccess();
  const visibleTypes = useMemo(
    () => TYPES.filter((type) => unitTypes.some((allowed) => allowed.value === type.value)),
    [unitTypes]
  );
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [quota, setQuota] = useState(null);
  const [type, setType] = useState(firstUnitType);
  const [query, setQuery] = useState("");
  const [wingByBuilding, setWingByBuilding] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setError("");
      const [unitData, tenantData, quotaData] = await Promise.all([
        getRooms(),
        getTenants(),
        getUnitUsage().catch(() => null),
      ]);
      setUnits(Array.isArray(unitData) ? unitData : []);
      setTenants((Array.isArray(tenantData) ? tenantData : []).filter(activeTenant));
      setQuota(quotaData);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load units.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredUnits = useMemo(() => {
    const term = query.trim().toLowerCase();
    return units.filter((unit) => {
      const unitType = unit.propertyType || "bed";
      if (unitType !== type) return false;
      if (!term) return true;
      return [unit.category, unit.wingName, unit.roomNo, unit.floorNo]
        .some((value) => String(value || "").toLowerCase().includes(term)) ||
        (unit.beds || []).some((bed) => String(bed.bedNo || "").toLowerCase().includes(term));
    });
  }, [units, type, query]);

  const buildings = useMemo(() => groupUnits(filteredUnits, tenants), [filteredUnits, tenants]);
  const stats = useMemo(() => filteredUnits.reduce((sum, unit) => {
    const value = unitOccupancy(unit, tenants);
    return { total: sum.total + value.total, occupied: sum.occupied + value.occupied, vacant: sum.vacant + value.vacant };
  }, { total: 0, occupied: 0, vacant: 0 }), [filteredUnits, tenants]);
  const quotaKey = type === "bed" ? "beds" : type === "room" ? "rooms" : "shops";
  const limitReached = quota?.remaining?.[quotaKey] === 0;

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={UI.primary} /></View>;
  }

  return (
    <ScrollView style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.pagePadding }]}
      showsVerticalScrollIndicator={false} refreshing={refreshing} onRefresh={load}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Units</Text>
          <Text style={styles.subtitle}>Manage buildings, rooms & beds</Text>
        </View>
        <Pressable style={styles.circleButton} onPress={() => setQuery("")}><Search size={19} color={UI.text} /></Pressable>
        <Pressable disabled={limitReached} style={[styles.addCircle, limitReached && styles.disabledAction]} onPress={() => router.push({ pathname: "/system/unit-form", params: { type } })}><Plus size={20} color={UI.primary} /></Pressable>
      </View>

      <TypeTabs value={type} onChange={setType} types={visibleTypes} />
      <SummaryCard stats={stats} type={type} quota={quota} />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={19} color={UI.muted} />
          <TextInput value={query} onChangeText={setQuery}
            placeholder="Search building, room or bed" placeholderTextColor="#98A2B3"
            style={styles.searchInput} />
        </View>
        <Pressable style={styles.filterButton}><SlidersHorizontal size={19} color={UI.text} /></Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Properties</Text>
        <Pressable style={styles.sortButton}><Text style={styles.sortText}>A – Z</Text><ChevronDown size={18} color={UI.text} /></Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && !buildings.length ? (
        <View style={styles.empty}><Building2 size={30} color={UI.muted} /><Text style={styles.emptyTitle}>No units found</Text><Text style={styles.emptyText}>Add a unit or change the selected property type.</Text></View>
      ) : null}

      <View style={styles.list}>
        {buildings.map((building) => (
          <BuildingCard key={building.name} building={building} type={type}
            activeWing={wingByBuilding[building.name] || building.wings[0]?.name}
            onWingChange={(wing) => setWingByBuilding((current) => ({ ...current, [building.name]: wing }))}
            onRoomPress={(room) => router.push({ pathname: "/system/unit-details", params: { id: room._id } })}
          />
        ))}
      </View>

      <Pressable disabled={limitReached} style={[styles.floatingButton, limitReached && styles.disabledAction]}
        onPress={() => type === "bed"
          ? router.push("/system/beds-manage")
          : router.push({ pathname: "/system/unit-form", params: { type } })}>
        <Plus size={19} color="#FFF" /><Text style={styles.floatingText}>{limitReached ? "Limit reached" : "Add Unit"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { paddingTop: 4, paddingBottom: 92 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: UI.screen },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headerCopy: { flex: 1 },
  title: { color: UI.text, fontSize: 26, fontWeight: "900" },
  subtitle: { marginTop: 2, color: UI.muted, fontSize: 12, fontWeight: "600" },
  circleButton: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  addCircle: { width: 36, height: 36, marginLeft: 7, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UI.primary, backgroundColor: UI.card },
  typeTabs: { height: 34, padding: 2, flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  typeTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  typeTabActive: { borderWidth: 1, borderColor: UI.primaryDark, backgroundColor: UI.card },
  typeTabText: { color: UI.muted, fontSize: 12, fontWeight: "700" },
  typeTabTextActive: { color: UI.text, fontWeight: "900" },
  activeLine: { position: "absolute", bottom: -3, width: 42, height: 2, borderRadius: 1, backgroundColor: UI.primary },
  summary: { marginTop: 9, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTitle: { flex: 1, color: UI.text, fontSize: 16, fontWeight: "900" },
  summaryRate: { color: UI.primary, fontSize: 16, fontWeight: "900" },
  summaryRateLabel: { color: UI.muted, fontSize: 11, fontWeight: "600" },
  progressTrack: { height: 6, marginTop: 8, overflow: "hidden", borderRadius: 3, backgroundColor: UI.track },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: UI.primary },
  summaryBottom: { marginTop: 9, paddingTop: 9, flexDirection: "row", borderTopWidth: 1, borderTopColor: UI.border },
  summaryMetric: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  neutralIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: UI.primarySoft },
  summaryValue: { color: UI.text, fontSize: 16, fontWeight: "900" },
  summaryLabel: { color: UI.muted, fontSize: 10, fontWeight: "600" },
  summaryDivider: { width: 1, height: 32, backgroundColor: UI.border },
  searchRow: { marginTop: 9, flexDirection: "row", gap: 7 },
  searchBox: { flex: 1, height: 42, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  searchInput: { flex: 1, height: "100%", marginLeft: 8, color: UI.text, fontSize: 13 },
  filterButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  sectionHeader: { marginTop: 13, marginBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: UI.text, fontSize: 18, fontWeight: "900" },
  sortButton: { height: 32, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  sortText: { color: UI.text, fontSize: 11, fontWeight: "700" },
  list: { gap: 8 },
  buildingCard: { overflow: "hidden", borderRadius: 9, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  buildingHeader: { height: 58, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  buildingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: UI.primarySoft },
  buildingCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
  buildingName: { color: UI.text, fontSize: 16, fontWeight: "900" },
  locationRow: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 3 },
  location: { flex: 1, color: UI.muted, fontSize: 10, fontWeight: "600" },
  activeStatus: { marginRight: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: UI.primary },
  activeText: { color: UI.primary, fontSize: 10, fontWeight: "700" },
  wingTabs: { paddingHorizontal: 10, paddingBottom: 7, gap: 6 },
  wingTab: { minWidth: 82, height: 30, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#F0F3F5" },
  wingTabActive: { borderWidth: 1, borderColor: UI.primary, backgroundColor: UI.primarySoft },
  wingText: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  wingTextActive: { color: UI.primaryDark, fontWeight: "900" },
  rooms: { marginHorizontal: 10, borderTopWidth: 1, borderTopColor: UI.border },
  roomRow: { minHeight: 60, flexDirection: "row", alignItems: "center" },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: UI.border },
  roomIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: UI.primarySoft },
  roomNameWrap: { width: 72, marginLeft: 7 },
  roomName: { color: UI.text, fontSize: 13, fontWeight: "900" },
  roomMeta: { marginTop: 2, color: UI.muted, fontSize: 10, fontWeight: "600" },
  occupancyWrap: { flex: 1, minWidth: 68, marginRight: 6 },
  occupancyText: { color: UI.muted, fontSize: 10, fontWeight: "700" },
  roomTrack: { height: 5, marginTop: 4, overflow: "hidden", borderRadius: 3, backgroundColor: UI.track },
  roomFill: { height: "100%", borderRadius: 3, backgroundColor: UI.primary },
  statusPill: { minWidth: 55, paddingHorizontal: 6, paddingVertical: 5, alignItems: "center", borderRadius: 8, marginRight: 3 },
  fullPill: { backgroundColor: UI.primarySoft },
  vacantPill: { backgroundColor: UI.amberSoft },
  statusText: { fontSize: 9, fontWeight: "900" },
  fullText: { color: UI.primaryDark },
  vacantText: { color: UI.amber },
  floatingButton: { alignSelf: "flex-end", marginTop: 12, minHeight: 44, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 9, backgroundColor: UI.primary },
  floatingText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  disabledAction: { opacity: 0.45 },
  empty: { minHeight: 120, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  emptyTitle: { marginTop: 10, color: UI.text, fontSize: 15, fontWeight: "900" },
  emptyText: { marginTop: 4, color: UI.muted, fontSize: 11 },
  error: { marginBottom: 10, padding: 12, borderRadius: 12, color: systemColors.danger, backgroundColor: systemColors.dangerSoft },
  pressed: { opacity: 0.82 },
});
