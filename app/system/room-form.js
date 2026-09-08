import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";



import {
  addBed,
  createRoom,
  updateBed,
} from "../../src/api/roomApi";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { systemColors as colors } from "../../src/theme/systemTheme";

const PROPERTY_TYPES = [
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];

export default function RoomFormScreen() {
  const router = useRouter();
  const { unitTypes, firstUnitType } = useSystemAccess();
  const visiblePropertyTypes = useMemo(
    () => PROPERTY_TYPES.filter((item) => unitTypes.some((allowed) => allowed.value === item.value)),
    [unitTypes]
  );

  const [propertyType, setPropertyType] = useState(firstUnitType);
  const [category, setCategory] = useState("");
  const [floorNo, setFloorNo] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [hasWing, setHasWing] = useState(false);
  const [wingName, setWingName] = useState("");
  const [flatType, setFlatType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
const [monthlyPrice, setMonthlyPrice] = useState("");
const [bedCount, setBedCount] = useState("1");
const [bedCategory, setBedCategory] = useState("Standard");
 async function saveRoom() {
  const price = Number(monthlyPrice);
  const numberOfBeds = Number(bedCount);

  if (!category.trim() || !floorNo.trim() || !roomNo.trim()) {
    setError("Category, floor and room number are required.");
    return;
  }

  if (!Number.isFinite(price) || price <= 0) {
    setError("Enter a valid monthly price.");
    return;
  }

  if (
    propertyType === "bed" &&
    (!Number.isInteger(numberOfBeds) || numberOfBeds < 1)
  ) {
    setError("Enter a valid number of beds.");
    return;
  }

  if (propertyType === "room" && !flatType.trim()) {
    setError("Enter the flat type.");
    return;
  }

  if (hasWing && !wingName.trim()) {
    setError("Enter the wing name.");
    return;
  }

  try {
    setLoading(true);
    setError("");

    const room = await createRoom({
      propertyType,
      category: category.trim(),
      floorNo: floorNo.trim(),
      roomNo: roomNo.trim(),
      hasWing,
      wingName: hasWing ? wingName.trim() : "",
      flatType: propertyType === "room" ? flatType.trim() : "",
    });

    if (propertyType === "bed") {
      for (let index = 1; index <= numberOfBeds; index += 1) {
        await addBed(room._id, {
          bedNo: `B${index}`,
          bedCategory: bedCategory.trim() || "Standard",
          price,
        });
      }
    } else {
      const primaryBed = propertyType === "shop" ? "SHOP-1" : "ROOM-1";

      await updateBed(room._id, primaryBed, {
        bedCategory: "Primary",
        price,
      });
    }

    router.replace("/system/units");
  } catch (err) {
    setError(err.response?.data?.message || "Unable to create room.");
  } finally {
    setLoading(false);
  }
}
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/units")} style={styles.backButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>

        <Text style={styles.title}>Add Room</Text>
      </View>

      <Text style={styles.label}>Property type</Text>

      <View style={styles.segmented}>
        {visiblePropertyTypes.map((item) => {
          const active = propertyType === item.value;

          return (
            <Pressable
              key={item.value}
              onPress={() => setPropertyType(item.value)}
              style={[
                styles.segment,
                active && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  active && styles.segmentTextActive,
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {stackedPropertyLabel(item.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Category</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder="Example: Boys Hostel"
        style={styles.input}
      />

      <Text style={styles.label}>Floor</Text>
      <TextInput
        value={floorNo}
        onChangeText={setFloorNo}
        placeholder="Example: 1"
        style={styles.input}
      />

      <Text style={styles.label}>Room or unit number</Text>
      <TextInput
        value={roomNo}
        onChangeText={setRoomNo}
        placeholder="Example: 101"
        style={styles.input}
      />

      <View style={styles.switchRow}>
        <Text style={styles.labelNoMargin}>Has wing</Text>

        <Switch
          value={hasWing}
          onValueChange={setHasWing}
          trackColor={{ false: colors.border, true: colors.border }}
          thumbColor={hasWing ? colors.primary : colors.surfaceSoft}
        />
      </View>

      {hasWing ? (
        <>
          <Text style={styles.label}>Wing name</Text>
          <TextInput
            value={wingName}
            onChangeText={setWingName}
            placeholder="Example: A"
            style={styles.input}
          />
        </>
      ) : null}

      {propertyType === "room" ? (
        <>
          <Text style={styles.label}>Flat type</Text>
          <TextInput
            value={flatType}
            onChangeText={setFlatType}
            placeholder="Example: 1 RK or 1 BHK"
            style={styles.input}
          />
        </>
      ) : null}
{propertyType === "bed" ? (
  <>
    <Text style={styles.label}>Number of beds</Text>
    <TextInput
      value={bedCount}
      onChangeText={setBedCount}
      keyboardType="number-pad"
      placeholder="Example: 3"
      style={styles.input}
    />

    <Text style={styles.label}>Bed category</Text>
    <TextInput
      value={bedCategory}
      onChangeText={setBedCategory}
      placeholder="Example: Standard"
      style={styles.input}
    />
  </>
) : null}

<Text style={styles.label}>
  Monthly {propertyType === "bed" ? "price per bed" : "rent"}
</Text>

<TextInput
  value={monthlyPrice}
  onChangeText={setMonthlyPrice}
  keyboardType="numeric"
  placeholder="Example: 5000"
  style={styles.input}
/>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={saveRoom}
        disabled={loading}
        style={[styles.saveButton, loading && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.saveButtonText}>Save room</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 20,
  },
  header: {
    marginBottom: 26,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  backButton: {
    width: 44,
    height: 44,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
  },
  label: {
    marginTop: 15,
    marginBottom: 7,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  labelNoMargin: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    height: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  segmented: {
    minHeight: 68,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 7,
    backgroundColor: colors.border,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    paddingHorizontal: 3,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    width: "100%",
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  segmentTextActive: {
    color: colors.primary,
  },
  switchRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  error: {
    marginTop: 18,
    color: colors.danger,
  },
  saveButton: {
    height: 50,
    marginTop: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
});
