import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BedDouble, Building2, ChevronRight,
  DoorOpen, MapPin, Plus, Search, Store,Check,
Pencil,
X,
} from "lucide-react-native";
import {
  getRooms,
  getUnitUsage,
  renameProperty,
} from "../../src/api/roomApi";
import { getTenants } from "../../src/api/tenantApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import UnitDetailsSetupModal from "../../src/components/UnitDetailsSetupModal";
import { systemColors } from "../../src/theme/systemTheme";
import { useResponsive } from "../../src/utils/responsive";

const UI = {
  screen: "#F6F8F7", card: "#FFFFFF", text: "#111B2A", muted: "#63738A",
  border: "#D9E1E7", primary: "#4F7FA6", primaryDark: "#244F70",
  primarySoft: "#E7F1F8", amber: "#A66B00", amberSoft: "#FFF2CF", track: "#E5EBEE",
};

const TYPES = [
  { value: "all", label: "All" },
  { value: "bed", label: "Hostel" },
  { value: "room", label: "Residential" },
  { value: "shop", label: "Commercial" },
];

const TYPE_LABELS = {
  bed: "Hostel",
  room: "Residential",
  shop: "Commercial",
};

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
    const building = unit.isPlaceholder
      ? "Units to set up"
      : String(unit.category || "Property not named").trim();
    const wing = unit.isPlaceholder ? "Details pending" : String(unit.wingName || "Main Block").trim();
    const floor = unit.isPlaceholder ? "Details pending" : String(unit.floorNo || "Floor not set").trim();
    if (!grouped.has(building)) grouped.set(building, new Map());
    if (!grouped.get(building).has(wing)) grouped.get(building).set(wing, new Map());
    if (!grouped.get(building).get(wing).has(floor)) grouped.get(building).get(wing).set(floor, []);
    grouped.get(building).get(wing).get(floor).push({ ...unit, occupancy: unitOccupancy(unit, tenants) });
  });
  return Array.from(grouped, ([name, wings]) => ({
    name,
    isReserved: Array.from(wings.values()).flatMap((floors) => Array.from(floors.values()).flat()).every((unit) => unit.isPlaceholder),
    location: Array.from(wings.values()).flatMap((floors) => Array.from(floors.values()).flat())[0]?.address ||
      Array.from(wings.values()).flatMap((floors) => Array.from(floors.values()).flat())[0]?.location || (name === "Units to set up" ? "Tap a unit to add its details" : "Property"),
    wings: Array.from(wings, ([name, floors]) => {
      const floorList = Array.from(floors, ([floorName, rooms]) => ({
        name: floorName,
        rooms: rooms.sort((a, b) => {
          if (Boolean(a.isPlaceholder) !== Boolean(b.isPlaceholder)) return a.isPlaceholder ? 1 : -1;
          return String(a.roomNo || "").localeCompare(String(b.roomNo || ""), undefined, { numeric: true });
        }),
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      return {
        name,
        floors: floorList,
        rooms: floorList.flatMap((floor) => floor.rooms),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  })).sort((a, b) => {
    if (Boolean(a.isReserved) !== Boolean(b.isReserved)) return a.isReserved ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
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
  if (type === "all") {
    const rate = stats.total ? Math.round((stats.occupied / stats.total) * 100) : 0;
    const limits = quota?.limits || {};
    const usage = quota?.usage || {};
    const remaining = quota?.remaining || {};
    const totalLimit = ["beds", "rooms", "shops"].reduce((sum, key) => sum + Number(limits[key] || 0), 0);
    const totalUsed = ["beds", "rooms", "shops"].reduce((sum, key) => sum + Number(usage[key] || 0), 0) || stats.total;
    const totalRemaining = ["beds", "rooms", "shops"].reduce((sum, key) => sum + Number(remaining[key] || 0), 0);
    return (
      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text style={styles.summaryTitle}>
            {totalLimit ? `${totalUsed} of ${totalLimit} units added` : `${totalUsed} units added`}
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
            <View><Text style={styles.summaryValue}>{totalLimit ? totalRemaining : "-"}</Text><Text style={styles.summaryLabel}>can add</Text></View>
          </View>
        </View>
      </View>
    );
  }

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

function RoomRow({ room, type, onPress, last, index }) {
  const { occupied, total, vacant } = room.occupancy;
  const rate = total ? Math.round((occupied / total) * 100) : 0;
  const rowType = type === "all" ? room.propertyType || "bed" : type;
  const label = rowType === "bed" ? "beds" : rowType === "room" ? "room" : "shop";
  const Icon = rowType === "bed" ? BedDouble : rowType === "shop" ? Store : DoorOpen;
  const roomTitle = room.isPlaceholder
    ? `Unit ${index + 1}`
    : `${rowType === "shop" ? "Shop" : "Room"} ${room.roomNo}`;
  const roomMeta = room.isPlaceholder
    ? "Details pending"
    : rowType === "room" && room.flatType
      ? `${room.flatType} · ${total} ${label}${total === 1 ? "" : "s"}`
      : `${total} ${label}${total === 1 ? "" : "s"}`;
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.roomRow, !last && styles.rowBorder, pressed && styles.pressed]}>
      <View style={styles.roomIcon}><Icon size={18} color="#40566D" /></View>
      <View style={styles.roomNameWrap}>
        <Text style={styles.roomName}>{roomTitle}</Text>
        <Text style={styles.roomMeta}>{roomMeta}</Text>
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

function BuildingCard({
  building,
  type,
  activeWing,
  onWingChange,
  onRoomPress,
  onPendingWingPress,
  onRename,
}) {
  const selectedWing = building.wings.find((wing) => wing.name === activeWing) || building.wings[0];
  return (
    <View style={styles.buildingCard}>
      <View style={styles.buildingHeader}>
        <View style={styles.buildingIcon}><Building2 size={19} color="#40566D" /></View>
        <View style={styles.buildingCopy}>
     <View style={styles.buildingNameRow}>

  <Text
    style={styles.buildingName}
    numberOfLines={1}
  >
    {building.name}
  </Text>

  {!building.isReserved && type !== "all" ? (
    <Pressable
      onPress={() => onRename(building)}
      style={styles.renamePropertyButton}
    >
      <Pencil
        size={14}
        color={UI.primaryDark}
      />
    </Pressable>
  ) : null}

</View>
          <View style={styles.locationRow}><MapPin size={11} color={UI.muted} /><Text style={styles.location} numberOfLines={1}>{building.location}</Text></View>
        </View>
        <View style={styles.activeStatus}><View style={styles.activeDot} /><Text style={styles.activeText}>{building.isReserved ? "Pending" : "Active"}</Text></View>
      </View>

      {building.wings.length > 1 || building.wings[0]?.name !== "Main Block" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wingTabs}>
          {building.wings.map((wing) => (
            <Pressable key={wing.name} onPress={() => {
              onWingChange(wing.name);
              if (wing.rooms.some((room) => room.isPlaceholder)) {
                onPendingWingPress(wing.rooms.find((room) => room.isPlaceholder));
              }
            }}
              style={[styles.wingTab, selectedWing?.name === wing.name && styles.wingTabActive]}>
              <Text style={[styles.wingText, selectedWing?.name === wing.name && styles.wingTextActive]}>
                {wing.name === "Details pending" ? "Set details" : wing.name === "Main Block" ? "Main Block" : `Wing ${wing.name}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.rooms}>
        {(selectedWing?.floors || []).map((floor, floorIndex) => (
          <View key={floor.name} style={floorIndex > 0 && styles.floorSection}>
            {!building.isReserved ? (
              <View style={styles.floorHeader}>
                <Text style={styles.floorText}>
                  {floor.name === "Floor not set" ? "Floor not set" : `Floor ${floor.name}`}
                </Text>
                <Text style={styles.floorCount}>
                  {floor.rooms.length} {floor.rooms.length === 1 ? "unit" : "units"}
                </Text>
              </View>
            ) : null}
            {floor.rooms.map((room, index, list) => (
              <RoomRow key={room._id} room={room} type={type}
                index={index}
                last={index === list.length - 1 && floorIndex === (selectedWing?.floors || []).length - 1}
                onPress={() => onRoomPress(room)} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function UnitsModernScreen() {
  const router = useRouter();
  const { openUnitId } = useLocalSearchParams();
  const openedUnitRef = useRef("");
  const responsive = useResponsive();
  const { unitTypes, firstUnitType } = useSystemAccess();
  const visibleTypes = useMemo(
    () => {
      const allowed = TYPES.filter((type) => type.value !== "all" && unitTypes.some((item) => item.value === type.value));
      return allowed.length > 1 ? [TYPES[0], ...allowed] : allowed;
    },
    [unitTypes]
  );
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [quota, setQuota] = useState(null);
  const [type, setType] = useState(() => unitTypes.length > 1 ? "all" : firstUnitType);
  const [query, setQuery] = useState("");
  const [wingByBuilding, setWingByBuilding] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [propertyName, setPropertyName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [unitDetailsTarget, setUnitDetailsTarget] = useState(null);
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
  useEffect(() => {
    const targetId = String(openUnitId || "");
    if (!targetId || openedUnitRef.current === targetId || !units.length) return;
    const unit = units.find((item) => String(item?._id) === targetId);
    if (!unit) return;
    openedUnitRef.current = targetId;
    openUnitDetails(unit);
  }, [openUnitId, units]);
function openRenameProperty(building) {
  setRenameTarget(building);
  setPropertyName(building?.name || "");
}

function closeRenameProperty() {
  if (renaming) return;

  setRenameTarget(null);
  setPropertyName("");
}

function openUnitDetails(unit) {
  setUnitDetailsTarget(unit);
}

function closeUnitDetails() {
  setUnitDetailsTarget(null);
}

async function savePropertyName() {
  const nextName = String(propertyName || "")
    .trim()
    .replace(/\s+/g, " ");

  const oldName = String(renameTarget?.name || "").trim();

  if (!nextName) {
    Alert.alert(
      "Property name required",
      "Please enter a property name."
    );
    return;
  }

  if (!oldName || nextName === oldName) {
    closeRenameProperty();
    return;
  }

  try {
    setRenaming(true);

    await renameProperty({
      propertyType: type,
      oldName,
      newName: nextName,
    });

    // Preserve selected wing after rename
    setWingByBuilding((current) => {
      const next = { ...current };

      if (
        Object.prototype.hasOwnProperty.call(next, oldName)
      ) {
        next[nextName] = next[oldName];
        delete next[oldName];
      }

      return next;
    });

    setRenameTarget(null);
    setPropertyName("");

    // Reload all units
    await load();

    Alert.alert(
      "Property updated",
      `"${oldName}" has been renamed to "${nextName}".`
    );
  } catch (err) {
    Alert.alert(
      "Unable to rename property",
      err.response?.data?.message ||
        err.message ||
        "Please try again."
    );
  } finally {
    setRenaming(false);
  }
}
  const filteredUnits = useMemo(() => {
    const term = query.trim().toLowerCase();
    return units.filter((unit) => {
      const unitType = unit.propertyType || "bed";
      if (type !== "all" && unitType !== type) return false;
      if (!term) return true;
      return [unit.category, unit.wingName, unit.roomNo, unit.floorNo]
        .some((value) => String(value || "").toLowerCase().includes(term)) ||
        (unit.beds || []).some((bed) => String(bed.bedNo || "").toLowerCase().includes(term));
    });
  }, [units, type, query]);

  const buildings = useMemo(() => groupUnits(filteredUnits, tenants), [filteredUnits, tenants]);
  const propertySections = useMemo(() => {
    if (type !== "all") return [];
    return visibleTypes
      .filter((item) => item.value !== "all")
      .map((item) => {
        const sectionUnits = filteredUnits.filter((unit) => (unit.propertyType || "bed") === item.value);
        return {
          key: item.value,
          title: TYPE_LABELS[item.value] || item.label,
          buildings: groupUnits(sectionUnits, tenants),
          unitCount: sectionUnits.length,
        };
      })
      .filter((section) => section.buildings.length);
  }, [filteredUnits, tenants, type, visibleTypes]);
  const stats = useMemo(() => filteredUnits.reduce((sum, unit) => {
    const value = unitOccupancy(unit, tenants);
    return { total: sum.total + value.total, occupied: sum.occupied + value.occupied, vacant: sum.vacant + value.vacant };
  }, { total: 0, occupied: 0, vacant: 0 }), [filteredUnits, tenants]);

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
        {/* Search and Add Unit header actions are intentionally hidden. */}
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
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Properties</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && !buildings.length ? (
        <View style={styles.empty}><Building2 size={30} color={UI.muted} /><Text style={styles.emptyTitle}>No units found</Text><Text style={styles.emptyText}>Add a unit or change the selected property type.</Text></View>
      ) : null}

      <View style={styles.list}>
        {type === "all" ? (
          propertySections.map((section) => (
            <View key={section.key} style={styles.propertyTypeSection}>
              <View style={styles.propertyTypeHeader}>
                <Text style={styles.propertyTypeTitle}>{section.title}</Text>
                <Text style={styles.propertyTypeCount}>{section.unitCount} {section.unitCount === 1 ? "unit" : "units"}</Text>
              </View>
              {section.buildings.map((building) => (
                <BuildingCard
                  key={`${section.key}-${building.name}`}
                  building={building}
                  type={section.key}
                  activeWing={
                    wingByBuilding[`${section.key}-${building.name}`] ||
                    building.wings[0]?.name
                  }
                  onWingChange={(wing) =>
                    setWingByBuilding((current) => ({
                      ...current,
                      [`${section.key}-${building.name}`]: wing,
                    }))
                  }
                  onRoomPress={(room) => {
                    if (room.isPlaceholder) {
                      openUnitDetails(room);
                      return;
                    }
                    router.push({
                      pathname: "/system/unit-details",
                      params: { id: room._id },
                    });
                  }}
                  onPendingWingPress={openUnitDetails}
                  onRename={openRenameProperty}
                />
              ))}
            </View>
          ))
        ) : (
          buildings.map((building) => (
            <BuildingCard
              key={building.name}
              building={building}
              type={type}
              activeWing={
                wingByBuilding[building.name] ||
                building.wings[0]?.name
              }
              onWingChange={(wing) =>
                setWingByBuilding((current) => ({
                  ...current,
                  [building.name]: wing,
                }))
              }
              onRoomPress={(room) => {
                if (room.isPlaceholder) {
                  openUnitDetails(room);
                  return;
                }
                router.push({
                  pathname: "/system/unit-details",
                  params: { id: room._id },
                });
              }}
              onPendingWingPress={openUnitDetails}
              onRename={openRenameProperty}
            />
          ))
        )}
      </View>

      {/* Initial units are created during registration; the redundant Add Unit action is intentionally hidden. */}


      <Modal
  visible={Boolean(renameTarget)}
  transparent
  animationType="fade"
  onRequestClose={closeRenameProperty}
>
  <View style={styles.renameOverlay}>

    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={closeRenameProperty}
    />

    <View style={styles.renameModal}>

      <View style={styles.renameHeader}>

        <View style={styles.renameHeaderIcon}>
          <Building2
            size={19}
            color={UI.primaryDark}
          />
        </View>

        <View style={styles.renameHeaderCopy}>

          <Text style={styles.renameTitle}>
            Rename property
          </Text>

          <Text style={styles.renameSubtitle}>
            This will update the property name for
            all units and tenants inside it.
          </Text>

        </View>

        <Pressable
          onPress={closeRenameProperty}
          style={styles.renameClose}
        >
          <X
            size={18}
            color={UI.primaryDark}
          />
        </Pressable>

      </View>

      <Text style={styles.renameLabel}>
        Property name
      </Text>

      <TextInput
        value={propertyName}
        onChangeText={setPropertyName}
        autoFocus
        placeholder="Enter property name"
        placeholderTextColor="#98A2B3"
        style={styles.renameInput}
        editable={!renaming}
        returnKeyType="done"
        onSubmitEditing={savePropertyName}
      />

      <View style={styles.renameActions}>

        <Pressable
          disabled={renaming}
          onPress={closeRenameProperty}
          style={styles.renameCancel}
        >
          <Text style={styles.renameCancelText}>
            Cancel
          </Text>
        </Pressable>

        <Pressable
          disabled={renaming}
          onPress={savePropertyName}
          style={[
            styles.renameSave,
            renaming && styles.disabledAction,
          ]}
        >
          {renaming ? (
            <ActivityIndicator
              size="small"
              color="#FFF"
            />
          ) : (
            <>
              <Check size={16} color="#FFF" />

              <Text style={styles.renameSaveText}>
                Update name
              </Text>
            </>
          )}
        </Pressable>

      </View>

    </View>

  </View>
</Modal>
      <UnitDetailsSetupModal visible={Boolean(unitDetailsTarget)} unit={unitDetailsTarget} bed={unitDetailsTarget?.beds?.[0]} savedUnits={units} onClose={closeUnitDetails} onSaved={async () => { setUnitDetailsTarget(null); await load(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.screen },
  content: { paddingTop: 4, paddingBottom: 92 },
  categoryAction: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: UI.primary, borderRadius: 7, backgroundColor: UI.blueSoft },
  categoryActionText: { color: UI.primaryDark, fontSize: 11, fontWeight: "800" },
  requiredMark: { color: systemColors.danger, fontWeight: "900" },
  optionalText: { color: UI.muted, fontSize: 11, fontWeight: "600" },
  fieldError: { marginTop: 4, color: systemColors.danger, fontSize: 11, fontWeight: "700" },
  addMeterButton: { minHeight: 42, marginTop: 12, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: UI.primary, borderRadius: 8, backgroundColor: UI.primarySoft },
  addMeterText: { color: UI.primaryDark, fontSize: 12, fontWeight: "900" },
  skipMeterButton: { alignSelf: "flex-start", marginTop: 7, paddingVertical: 5 },
  skipMeterText: { color: UI.primaryDark, fontSize: 11, fontWeight: "800" },
  categoryDropdownButton: { minHeight: 48, marginBottom: 7, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: UI.border, borderRadius: 7, backgroundColor: UI.card },
  categoryDropdownText: { color: UI.text, fontSize: 15, fontWeight: "800" },
  categoryDropdownChevron: { color: UI.primaryDark, fontSize: 12, fontWeight: "900" },
  categoryMenu: { marginTop: -4, marginBottom: 7, overflow: "hidden", borderWidth: 1, borderColor: UI.border, borderRadius: 7, backgroundColor: UI.card },
  categoryMenuItem: { minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: UI.border },
  categoryMenuItemSelected: { backgroundColor: UI.blueSoft },
  categoryMenuText: { color: UI.text, fontSize: 14, fontWeight: "700" },
  categoryMenuTextSelected: { color: UI.primaryDark, fontWeight: "900" },
  customCategoryRow: { marginTop: 8, flexDirection: "row", gap: 8, alignItems: "center" },
  customCategoryInput: { flex: 1, marginBottom: 0 },
  customCategorySave: { minHeight: 46, paddingHorizontal: 13, justifyContent: "center", borderRadius: 7, backgroundColor: UI.primaryDark },
  customCategorySaveText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
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
  propertyTypeSection: { gap: 9 },
  propertyTypeHeader: { minHeight: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, backgroundColor: UI.primarySoft },
  propertyTypeTitle: { color: UI.primaryDark, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  propertyTypeCount: { color: UI.muted, fontSize: 11, fontWeight: "900" },
  buildingCard: { overflow: "hidden", borderRadius: 9, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card },
  buildingHeader: { minHeight: 58, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  buildingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: UI.primarySoft },
  buildingCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
 buildingNameRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 7,
},

buildingName: {
  flexShrink: 1,
  color: UI.text,
  fontSize: 16,
  fontWeight: "900",
},

renamePropertyButton: {
  width: 28,
  height: 28,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.primarySoft,
},
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
  floorSection: { borderTopWidth: 1, borderTopColor: UI.border },
  floorHeader: { minHeight: 30, paddingTop: 9, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  floorText: { color: UI.primaryDark, fontSize: 12, fontWeight: "900" },
  floorCount: { color: UI.muted, fontSize: 10, fontWeight: "800" },
  roomRow: { minHeight: 56, flexDirection: "row", alignItems: "center" },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: UI.border },
  roomIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: UI.primarySoft },
  roomNameWrap: { width: 98, marginLeft: 7 },
  roomTypeLabel: { marginBottom: 1, color: UI.primaryDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  roomName: { color: UI.text, fontSize: 13, fontWeight: "900" },
  roomMeta: { marginTop: 2, color: UI.muted, fontSize: 10, fontWeight: "700" },
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
  renameOverlay: {
  flex: 1,
  padding: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(17, 27, 42, 0.52)",
},

renameModal: {
  width: "100%",
  maxWidth: 480,
  padding: 15,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.card,
},

renameHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
},

renameHeaderIcon: {
  width: 38,
  height: 38,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: UI.primarySoft,
},

renameHeaderCopy: {
  flex: 1,
  minWidth: 0,
},

renameTitle: {
  color: UI.text,
  fontSize: 18,
  fontWeight: "900",
},

renameSubtitle: {
  marginTop: 3,
  color: UI.muted,
  fontSize: 11,
  lineHeight: 16,
  fontWeight: "600",
},

renameClose: {
  width: 34,
  height: 34,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.card,
},

renameLabel: {
  marginTop: 16,
  marginBottom: 6,
  color: UI.muted,
  fontSize: 11,
  fontWeight: "800",
},

renameInput: {
  height: 44,
  paddingHorizontal: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.card,
  color: UI.text,
  fontSize: 14,
  fontWeight: "700",
},

renameActions: {
  marginTop: 14,
  flexDirection: "row",
  justifyContent: "flex-end",
  gap: 8,
},

renameCancel: {
  minWidth: 86,
  height: 40,
  paddingHorizontal: 12,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.card,
},

renameCancelText: {
  color: UI.muted,
  fontSize: 12,
  fontWeight: "800",
},

renameSave: {
  minWidth: 128,
  height: 40,
  paddingHorizontal: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  backgroundColor: UI.primaryDark,
},

renameSaveText: {
  color: "#FFF",
  fontSize: 12,
  fontWeight: "900",
},

unitDetailsScroll: {
  maxHeight: 420,
  marginTop: 4,
},

unitDetailsError: {
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  color: systemColors.danger,
  backgroundColor: systemColors.dangerSoft,
  fontSize: 12,
  fontWeight: "700",
},

optionHelper: {
  marginTop: 7,
  color: UI.muted,
  fontSize: 11,
  fontWeight: "700",
},

optionWrap: {
  marginTop: 8,
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 7,
},

savedDropdownWrap: { marginTop: 8 },
savedDropdownButton: { minHeight: 40, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card },
savedDropdownText: { flex: 1, color: UI.text, fontSize: 12, fontWeight: "700" },
savedDropdownArrow: { marginLeft: 10, color: UI.primaryDark, fontSize: 11, fontWeight: "900" },
savedDropdownMenu: { overflow: "hidden", borderWidth: 1, borderColor: UI.border, borderRadius: 8, backgroundColor: UI.card },
savedDropdownItem: { minHeight: 39, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: UI.border },
savedDropdownItemActive: { backgroundColor: UI.primarySoft },
savedDropdownItemText: { color: UI.text, fontSize: 12, fontWeight: "700" },
savedDropdownItemTextActive: { color: UI.primaryDark, fontWeight: "900" },

optionChip: {
  minHeight: 30,
  maxWidth: 170,
  paddingHorizontal: 10,
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: UI.border,
  backgroundColor: UI.card,
},

optionChipActive: {
  borderColor: UI.primary,
  backgroundColor: UI.primarySoft,
},

optionText: {
  flexShrink: 1,
  color: UI.muted,
  fontSize: 11,
  fontWeight: "800",
},

optionTextActive: {
  color: UI.primaryDark,
  fontWeight: "900",
},
});
