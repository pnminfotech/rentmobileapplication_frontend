import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";


import { getRooms } from "../../src/api/roomApi";
import { useRouter } from "expo-router";
import { BedDouble, Building2, Plus, Search } from "lucide-react-native";
import { systemColors as colors } from "../../src/theme/systemTheme";

function RoomIcon({ type }) {
  return type === "bed" ? (
    <BedDouble size={21} color={colors.primary} />
  ) : (
    <Building2 size={21} color={colors.primary} />
  );
}

export default function RoomsScreen() {
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
const router = useRouter();
  const loadRooms = useCallback(async () => {
    try {
      setError("");
      const data = await getRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load rooms.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms])
  );

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rooms;

    return rooms.filter((room) =>
      [
        room.roomNo,
        room.category,
        room.floorNo,
        room.wingName,
        room.propertyType,
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [rooms, search]);

  function refresh() {
    setRefreshing(true);
    loadRooms();
  }

  function renderRoom({ item }) {
    const beds = Array.isArray(item.beds) ? item.beds : [];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBox}><RoomIcon type={item.propertyType} /></View>
          <View style={styles.cardTitleArea}>
            <Text style={styles.roomNumber}>Room {item.roomNo || "-"}</Text>
            <Text style={styles.propertyType}>{item.propertyType || "room"}</Text>
          </View>
          <Text style={styles.bedCount}>{beds.length} beds</Text>
        </View>

        <View style={styles.details}>
          <Text style={styles.detailText}>{item.category}</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.detailText}>Floor {item.floorNo}</Text>

          {item.wingName ? (
            <>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.detailText}>Wing {item.wingName}</Text>
            </>
          ) : null}
        </View>

        {beds.length ? (
          <View style={styles.beds}>
            {beds.map((bed) => (
              <View key={bed.bedNo} style={styles.bed}>
                <Text style={styles.bedName}>{bed.bedNo}</Text>
                <Text style={styles.bedPrice}>
                  {bed.price != null ? `₹${bed.price}` : "No price"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Rooms</Text>
            <Text style={styles.subtitle}>{rooms.length} total rooms</Text>
          </View>

          <Pressable
            onPress={() => router.push("/system/room-form")}
            style={styles.addButton}
          >
            <Plus size={22} color={colors.surface} />
          </Pressable>
        </View>

        <View style={styles.search}>
          <Search size={19} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search room, floor or category"
            style={styles.searchInput}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderRoom}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No rooms found</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  addButton: {
    width: 44,
    height: 44,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
  },
  search: {
    height: 48,
    marginTop: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  error: {
    marginTop: 14,
    color: colors.danger,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
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
    borderRadius: 7,
    backgroundColor: colors.primarySoft,
  },
  cardTitleArea: {
    flex: 1,
    marginLeft: 12,
  },
  roomNumber: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  propertyType: {
    marginTop: 3,
    fontSize: 11,
    color: colors.muted,
  },
  bedCount: {
    color: colors.muted,
    fontWeight: "600",
  },
  details: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  detailText: {
    color: colors.muted,
  },
  dot: {
    color: colors.subtle,
  },
  beds: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bed: {
    minWidth: 74,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceSoft,
  },
  bedName: {
    fontWeight: "700",
    color: colors.muted,
  },
  bedPrice: {
    marginTop: 3,
    fontSize: 11,
    color: colors.muted,
  },
  empty: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.muted,
    fontSize: 16,
  },
});
