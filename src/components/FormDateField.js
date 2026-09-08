import { createElement, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { colors } from "../theme/colors";

export function toDateValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default function FormDateField({ label, value, onChange, minimumDate, maximumDate, placeholder = "Select date" }) {
  const [open, setOpen] = useState(false);
  const webInputRef = useRef(null);
  const hasValue = Boolean(value);
  const date = hasValue ? parseDate(value) : new Date();

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === "web" ? (
        <View style={styles.webDateWrap}>
          {createElement("input", {
            ref: webInputRef,
            type: "date",
            value: value || "",
            min: minimumDate ? toDateValue(minimumDate) : undefined,
            max: maximumDate ? toDateValue(maximumDate) : undefined,
            onChange: (event) => onChange(event.target.value),
            style: webInputStyle,
          })}
          <Pressable
            onPress={() => {
              if (typeof webInputRef.current?.showPicker === "function") webInputRef.current.showPicker();
              else webInputRef.current?.focus();
            }}
            style={styles.webDateButton}
          >
            <CalendarDays size={19} color={colors.primary} />
            <Text style={[styles.text, !hasValue && styles.placeholder]}>
              {hasValue ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : placeholder}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable onPress={() => setOpen(true)} style={styles.button}>
            <CalendarDays size={19} color={colors.primary} />
            <Text style={[styles.text, !hasValue && styles.placeholder]}>{hasValue ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : placeholder}</Text>
          </Pressable>
          {open ? (
            <DateTimePicker
              value={date}
              mode="date"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              display={Platform.OS === "ios" ? "inline" : "calendar"}
              onValueChange={(_event, selected) => {
                if (Platform.OS === "android") setOpen(false);
                if (selected) onChange(toDateValue(selected));
              }}
              onDismiss={() => setOpen(false)}
            />
          ) : null}
          {open && Platform.OS === "ios" ? <Pressable onPress={() => setOpen(false)} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable> : null}
        </>
      )}
    </View>
  );
}

const webInputStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  borderStyle: "none",
  outline: "none",
};

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  webDateWrap: { position: "relative" },
  webDateButton: { height: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  button: { height: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  text: { color: colors.text, fontSize: 16, fontWeight: "600" },
  placeholder: { color: colors.subtle },
  done: { height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  doneText: { color: colors.primary, fontWeight: "700" },
});
