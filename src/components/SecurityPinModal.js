import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SecurityPinModal({ visible, title = "Confirm security PIN", message, loading, onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  const submit = () => {
    if (/^\d{4,8}$/.test(pin)) onConfirm(pin, () => setPin(""));
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message || "Enter your PIN to continue."}</Text>
          <TextInput value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 8))} keyboardType="number-pad" secureTextEntry maxLength={8} autoFocus placeholder="4 to 8 digit PIN" style={styles.input} />
          <View style={styles.actions}>
            <Pressable disabled={loading} onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable disabled={loading || !/^\d{4,8}$/.test(pin)} onPress={submit} style={styles.confirm}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm</Text>}</Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(10, 28, 42, 0.48)" },
  card: { width: "100%", maxWidth: 390, padding: 20, borderRadius: 18, backgroundColor: "#fff" },
  title: { color: "#101828", fontSize: 20, fontWeight: "900" },
  message: { marginTop: 7, color: "#667085", fontSize: 14, lineHeight: 20 },
  input: { height: 52, marginTop: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: "#B8D5DF", borderRadius: 12, color: "#101828", fontSize: 18, fontWeight: "800", letterSpacing: 4 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancel: { minWidth: 92, alignItems: "center", padding: 13, borderWidth: 1, borderColor: "#D9E8ED", borderRadius: 10 },
  cancelText: { color: "#344054", fontWeight: "800" },
  confirm: { minWidth: 104, alignItems: "center", justifyContent: "center", padding: 13, borderRadius: 10, backgroundColor: "#006D9E" },
  confirmText: { color: "#fff", fontWeight: "900" },
});
