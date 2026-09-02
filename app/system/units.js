import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BedDouble,
  Building2,
  Plus,
  Search,
  Store,
} from "lucide-react-native";

import { getRooms, getUnitUsage } from "../../src/api/roomApi";
import {
  allowedUnitTypes,
  firstAllowedType,
} from "../../src/utils/subscriptionAccess";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { colors } from "../../src/theme/colors";
import { systemColors, systemShadow } from "../../src/theme/systemTheme";

const S = systemColors;

function UnitIcon({ type }) {
  if (type === "shop") return <Store size={21} color={S.deep} />;
  if (type === "room") return <Building2 size={21} color={S.deep} />;
  return <BedDouble size={21} color={S.deep} />;
}

export default function UnitsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const initialType = Array.isArray(params.type)
    ? params.type[0]
    : params.type;

  const [units, setUnits] = useState([]);
  const [quota, setQuota] = useState(null);
  const [activeType, setActiveType] = useState(
    ["bed", "room", "shop"].includes(initialType) ? initialType : "bed"
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadUnits = useCallback(async () => {
    try {
      setError("");

      const [unitData, quotaData] = await Promise.all([
        getRooms(),
        getUnitUsage(),
      ]);

      setUnits(Array.isArray(unitData) ? unitData : []);
      setQuota(quotaData);

      setActiveType((current) => {
        const requested = ["bed", "room", "shop"].includes(initialType)
          ? initialType
          : current;

        return allowedUnitTypes(quotaData).some(
          (type) => type.value === requested
        )
          ? requested
          : firstAllowedType(quotaData);
      });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load units.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialType]);

  useFocusEffect(
    useCallback(() => {
      loadUnits();
    }, [loadUnits])
  );

  const availableTypes = useMemo(
    () => allowedUnitTypes(quota),
    [quota]
  );

  const currentType =
    availableTypes.find((item) => item.value === activeType) ||
    availableTypes[0];

  const quotaKey = currentType.quotaKey;
  const remaining = quota?.remaining?.[quotaKey] ?? 0;
  const limit = quota?.limits?.[quotaKey] ?? 0;
  const used = quota?.usage?.[quotaKey] ?? 0;

  /* -------------------------------------------------------
     FILTER UNITS
  ------------------------------------------------------- */

  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();

    return units.filter((unit) => {
      if ((unit.propertyType || "bed") !== activeType) return false;

      if (!query) return true;

      return [
        unit.roomNo,
        unit.category,
        unit.floorNo,
        unit.wingName,
        unit.flatType,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [activeType, search, units]);

  /* -------------------------------------------------------
     GROUP BY BUILDING / PROPERTY

     Residential Rooms:
     Building
        -> Wing
            -> Rooms

     Beds / Shops:
     Building
        -> Units
  ------------------------------------------------------- */

  const groupedUnits = useMemo(() => {
    const buildingGroups = new Map();

    filteredUnits.forEach((unit) => {
      const propertyName =
        String(unit.category || "Unassigned property").trim() ||
        "Unassigned property";

      if (!buildingGroups.has(propertyName)) {
        buildingGroups.set(propertyName, []);
      }

      buildingGroups.get(propertyName).push(unit);
    });

    return Array.from(buildingGroups.entries())
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, {
          numeric: true,
        })
      )
      .map(([propertyName, propertyUnits]) => {
        /*
         * Only Residential Rooms are grouped by Wing.
         */
    if (activeType === "room" || activeType === "shop") {
          const wingGroups = new Map();

          propertyUnits.forEach((unit) => {
            const wingName =
              String(unit.wingName || "").trim() || "No Wing";

            if (!wingGroups.has(wingName)) {
              wingGroups.set(wingName, []);
            }

            wingGroups.get(wingName).push(unit);
          });

          const wings = Array.from(wingGroups.entries())
            .sort(([left], [right]) =>
              left.localeCompare(right, undefined, {
                numeric: true,
              })
            )
            .map(([wingName, wingUnits]) => ({
              wingName,

              units: wingUnits.sort((a, b) =>
                String(a.roomNo || "").localeCompare(
                  String(b.roomNo || ""),
                  undefined,
                  {
                    numeric: true,
                  }
                )
              ),
            }));

          return {
            propertyName,
            units: propertyUnits,
            wings,
          };
        }

        /*
         * Existing behaviour for Beds / Shops
         */
        return {
          propertyName,

          units: propertyUnits.sort((a, b) =>
            String(a.roomNo || "").localeCompare(
              String(b.roomNo || ""),
              undefined,
              {
                numeric: true,
              }
            )
          ),

          wings: [],
        };
      });
  }, [filteredUnits, activeType]);

  function openCreate() {
    if (activeType === "bed") {
      router.push("/system/beds-manage");
      return;
    }

    router.push({
      pathname: "/system/unit-form",
      params: { type: activeType },
    });
  }

  /* -------------------------------------------------------
     UNIT / ROOM CARD
  ------------------------------------------------------- */

  function renderUnitCard(item) {
    const beds = Array.isArray(item.beds) ? item.beds : [];
    const primaryPrice = beds[0]?.price;

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/system/unit-details",
            params: { id: item._id },
          })
        }
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconBox}>
            <UnitIcon type={activeType} />
          </View>

          <View style={styles.cardTitleArea}>
            <Text style={styles.unitTitle}>
              {activeType === "shop" ? "Shop" : "Room"} {item.roomNo}
            </Text>

            <Text style={styles.unitMeta}>
              Floor {item.floorNo || "-"}
            </Text>
          </View>

          <Text style={styles.price}>
            {activeType === "bed"
              ? `${beds.length} beds`
              : `Rs. ${primaryPrice ?? 0}`}
          </Text>
        </View>

        {/* ---------------------------------------------
            DETAILS

            For residential rooms:
            Wing is already displayed above the cards,
            therefore don't repeat it here.

            Flat type remains inside room card.
        --------------------------------------------- */}

      <View style={styles.details}>
  {activeType === "bed" && item.wingName ? (
    <Text style={styles.detail}>
      Wing {item.wingName}
    </Text>
  ) : null}

  {item.flatType ? (
    <Text style={styles.detail}>
      {item.flatType}
    </Text>
  ) : null}

  {!item.flatType && activeType !== "bed" ? (
    <Text style={styles.detail}>
      No extra details
    </Text>
  ) : null}

  {activeType === "bed" &&
  !item.wingName &&
  !item.flatType ? (
    <Text style={styles.detail}>
      No extra details
    </Text>
  ) : null}
</View>
        {/* BED CHIPS */}

        {activeType === "bed" ? (
          <View style={styles.beds}>
            {beds.map((bed) => (
              <View
                key={bed.bedNo}
                style={styles.bedChip}
              >
                <Text style={styles.bedName}>
                  {bed.bedNo}
                </Text>

                <Text style={styles.bedPrice}>
                  Rs. {bed.price ?? 0}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  }

  /* -------------------------------------------------------
     PROPERTY / BUILDING GROUP
  ------------------------------------------------------- */

  function renderPropertyGroup({ item }) {
    return (
      <View style={styles.propertySection}>
        {/* BUILDING NAME */}

    <View style={styles.propertyHeader}>
  <View style={styles.propertyLine} />

  <Text style={styles.propertyName}>
    {item.propertyName}
  </Text>

  <View style={styles.propertyLine} />
</View>

        {/* -------------------------------------------
            RESIDENTIAL ROOMS

            BUILDING
                WING
                    ROOM
                    ROOM

                WING
                    ROOM
                    ROOM
        ------------------------------------------- */}

     {(activeType === "room" || activeType === "shop") ? (
          <View style={styles.wingsContainer}>
            {item.wings.map((wing) => (
              <View
                key={`${item.propertyName}-${wing.wingName}`}
                style={styles.wingSection}
              >
                {/* WING HEADER */}

                <View style={styles.wingHeader}>
                  <View style={styles.wingTitleRow}>
                    <Building2
                      size={17}
                      color={S.deep}
                    />

                    <Text style={styles.wingName}>
                      {wing.wingName === "No Wing"
                        ? "No Wing"
                        : `Wing ${wing.wingName}`}
                    </Text>
                  </View>

                 <Text style={styles.wingCount}>
  {wing.units.length}{" "}
  {activeType === "shop"
    ? wing.units.length === 1
      ? "shop"
      : "shops"
    : wing.units.length === 1
      ? "room"
      : "rooms"}
</Text>
                </View>

                {/* ROOMS INSIDE THIS WING */}

                <View style={styles.propertyUnits}>
                  {wing.units.map((unit) => (
                    <View key={String(unit._id)}>
                      {renderUnitCard(unit)}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Existing Beds / Shops */
          <View style={styles.propertyUnits}>
            {item.units.map((unit) => (
              <View key={String(unit._id)}>
                {renderUnitCard(unit)}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
          color={S.deep}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Units
            </Text>

            <Text style={styles.subtitle}>
              {used} of {limit}{" "}
              {currentType.label.toLowerCase()} used
            </Text>
          </View>

          <Pressable
            onPress={openCreate}
            disabled={remaining < 1}
            style={[
              styles.addButton,
              remaining < 1 &&
                styles.addDisabled,
            ]}
          >
            <Plus
              size={22}
              color={colors.surface}
            />
          </Pressable>
        </View>

        {/* TYPE SELECTOR */}

        <View style={styles.segmented}>
          {availableTypes.map((item) => {
            const active =
              item.value === activeType;

            const itemUsed =
              quota?.usage?.[item.quotaKey] ?? 0;

            const itemLimit =
              quota?.limits?.[item.quotaKey] ?? 0;

            return (
              <Pressable
                key={item.value}
                onPress={() =>
                  setActiveType(item.value)
                }
                style={[
                  styles.segment,
                  active &&
                    styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    active &&
                      styles.segmentTextActive,
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {stackedPropertyLabel(
                    item.label
                  )}
                </Text>

                <Text
                  style={[
                    styles.segmentCount,
                    active &&
                      styles.segmentTextActive,
                  ]}
                >
                  {itemUsed}/{itemLimit}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* LIST */}

        <FlatList
          data={groupedUnits}
          keyExtractor={(item) =>
            item.propertyName
          }
          renderItem={renderPropertyGroup}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {/* SEARCH */}

              <View style={styles.searchBox}>
                <Search
                  size={18}
                  color={S.muted}
                />

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={`Search ${currentType.label.toLowerCase()}`}
                  style={styles.searchInput}
                />
              </View>

              {remaining < 1 ? (
                <Text style={styles.limitText}>
                  Your purchased{" "}
                  {currentType.label.toLowerCase()}{" "}
                  limit is fully used.
                </Text>
              ) : null}

              {error ? (
                <Text style={styles.error}>
                  {error}
                </Text>
              ) : null}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadUnits();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No{" "}
                {currentType.label.toLowerCase()}{" "}
                found
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: S.screen,
  },

  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.screen,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: S.screen,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    color: S.text,
  },

  subtitle: {
    marginTop: 4,
    color: S.muted,
    fontWeight: "700",
  },

  addButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: S.deep,
    ...systemShadow,
  },

  addDisabled: {
    opacity: 0.4,
  },

  segmented: {
    minHeight: 68,
    marginTop: 18,
    flexDirection: "row",
    gap: 6,
    padding: 5,
    borderRadius: 14,
    backgroundColor: "#F2E8DA",
  },

  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    paddingHorizontal: 3,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },

  segmentActive: {
    backgroundColor: S.card,
    ...systemShadow,
  },

  segmentText: {
    width: "100%",
    color: S.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  segmentTextActive: {
    color: S.deep,
  },

  segmentCount: {
    width: "100%",
    marginTop: 2,
    color: S.subtle,
    fontSize: 11,
    textAlign: "center",
    fontWeight: "800",
  },

  searchBox: {
    height: 50,
    marginTop: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: S.border,
    borderRadius: 14,
    backgroundColor: S.card,
    ...systemShadow,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  limitText: {
    marginTop: 12,
    color: S.orange,
    fontWeight: "800",
  },

  error: {
    marginTop: 12,
    color: S.red,
  },

  list: {
    paddingTop: 14,
    paddingBottom: 24,
    gap: 18,
  },

  /* BUILDING */

  propertySection: {
    gap: 10,
  },

 propertyHeader: {
  flexDirection: "row",
  alignItems: "center",
  width: "100%",
  gap: 10,
},

propertyLine: {
  flex: 1,
  height: 1,
  backgroundColor: "#164f2e",
},

propertyName: {
  color: S.deep,
  fontSize: 14,
  fontWeight: "900",
  backgroundColor: "#eaf4e6",
  borderWidth: 1,
  borderColor: "#164f2e",
  borderRadius: 999,
  paddingVertical: 5,
  paddingHorizontal: 12,
},
  propertyMeta: {
    marginTop: 3,
    color: S.muted,
    fontSize: 12,
    fontWeight: "800",
  },

  propertyUnits: {
    gap: 8,
  },

  /* WINGS */

  wingsContainer: {
    gap: 16,
  },

  wingSection: {
    gap: 8,
  },

  wingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: S.border,
  },

  wingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  wingName: {
    color: S.deep,
    fontSize: 15,
    fontWeight: "900",
  },

  wingCount: {
    color: S.muted,
    fontSize: 11,
    fontWeight: "800",
  },

  /* UNIT CARD */

  card: {
    padding: 15,
    borderWidth: 1,
    borderColor: S.border,
    borderRadius: 15,
    backgroundColor: S.card,
    ...systemShadow,
  },

  cardPressed: {
    opacity: 0.75,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  iconBox: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: S.soft,
  },

  cardTitleArea: {
    flex: 1,
    marginLeft: 11,
  },

  unitTitle: {
    color: S.text,
    fontSize: 16,
    fontWeight: "900",
  },

  unitMeta: {
    marginTop: 2,
    color: S.muted,
    fontSize: 12,
    fontWeight: "700",
  },

  price: {
    color: S.deep,
    fontWeight: "900",
  },

  details: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  detail: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: S.pale,
    color: S.muted,
    fontSize: 12,
    fontWeight: "700",
  },

  beds: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  bedChip: {
    minWidth: 70,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: S.pale,
  },

  bedName: {
    color: S.deep,
    fontWeight: "900",
  },

  bedPrice: {
    marginTop: 2,
    color: S.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  empty: {
    paddingVertical: 55,
    alignItems: "center",
  },

  emptyText: {
    color: S.muted,
    fontWeight: "800",
  },
});