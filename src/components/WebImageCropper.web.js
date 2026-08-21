import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Cropper from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

function cropImage(image, crop, outputName) {
  return new Promise((resolve, reject) => {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.width * scaleX));
    canvas.height = Math.max(1, Math.round(crop.height * scaleY));
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Unable to prepare the cropped image."));
      return;
    }
    context.drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create the cropped image."));
        return;
      }
      resolve({
        uri: URL.createObjectURL(blob),
        name: outputName,
        mimeType: "image/jpeg",
        file: new File([blob], outputName, { type: "image/jpeg" }),
      });
    }, "image/jpeg", 0.85);
  });
}

export default function WebImageCropper({ sourceUri, outputName, onCancel, onConfirm }) {
  const imageRef = useRef(null);
  const [crop, setCrop] = useState(undefined);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCrop(undefined);
    setCompletedCrop(null);
  }, [sourceUri]);

  async function confirm() {
    if (!imageRef.current || !completedCrop?.width || !completedCrop?.height || saving) return;
    try {
      setSaving(true);
      const result = await cropImage(imageRef.current, completedCrop, outputName);
      await onConfirm(result);
    } catch (error) {
      onCancel(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>Crop image</Text>
        <Text style={styles.hint}>Drag the selection and resize it from any edge or corner to include the full document.</Text>
        <View style={styles.cropArea}>
          <Cropper crop={crop} onChange={setCrop} onComplete={setCompletedCrop} keepSelection ruleOfThirds>
            <img
              ref={imageRef}
              src={sourceUri}
              alt="Selected document"
              style={styles.image}
              onLoad={(event) => {
                const image = event.currentTarget;
                setCrop({ x: 4, y: 4, width: Math.max(10, image.width - 8), height: Math.max(10, image.height - 8), unit: "px" });
              }}
            />
          </Cropper>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => onCancel()} style={styles.cancelButton} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable onPress={confirm} style={[styles.confirmButton, saving && styles.disabled]} disabled={saving || !completedCrop}><Text style={styles.confirmText}>{saving ? "Preparing..." : "Confirm image"}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "fixed", zIndex: 1000, inset: 0, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.72)" },
  dialog: { width: "min(94vw, 720px)", padding: 18, borderRadius: 12, backgroundColor: "#ffffff", boxShadow: "0 18px 50px rgba(0,0,0,0.28)" },
  title: { color: "#172033", fontSize: 20, fontWeight: "800" },
  hint: { marginTop: 5, color: "#64748b", fontSize: 13 },
  cropArea: { maxHeight: "68vh", marginTop: 14, overflow: "auto", borderRadius: 8, backgroundColor: "#111827" },
  image: { display: "block", maxWidth: "100%", maxHeight: "64vh", objectFit: "contain" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancelButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8 },
  cancelText: { color: "#475569", fontWeight: "800" },
  confirmButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#2563eb" },
  confirmText: { color: "#ffffff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
