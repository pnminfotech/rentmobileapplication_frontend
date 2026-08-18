import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export default function StatCard({ label, value, onPress }) {
  const content = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? 0}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.clickable, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    minHeight: 100,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  clickable: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.82,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
  },
  value: {
    marginTop: 10,
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
  },
});
