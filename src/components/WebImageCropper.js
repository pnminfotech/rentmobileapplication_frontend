import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_OUTPUT_WIDTH = 1200;
const MIN_CROP_SIZE = 52;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function WebImageCropper({ sourceUri, outputName = "document.jpg", onCancel, onConfirm }) {
  const [workingUri, setWorkingUri] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [stageSize, setStageSize] = useState(null);
  const [crop, setCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const startCrop = useRef(null);
  const cropRef = useRef(null);
  const imageRectRef = useRef(null);
  const stageSizeRef = useRef(null);
  const respondersRef = useRef(null);

  useEffect(() => {
    let active = true;
    setWorkingUri(null);
    setNaturalSize(null);
    setStageSize(null);
    setCrop(null);
    if (!sourceUri) return;
    ImageManipulator.manipulateAsync(sourceUri, [], {
      compress: 0.95,
      format: ImageManipulator.SaveFormat.JPEG,
    })
      .then((result) => {
        if (!active) return;
        setWorkingUri(result.uri);
        setNaturalSize({ width: result.width, height: result.height });
      })
      .catch(() => {
        if (!active) return;
        Image.getSize(
          sourceUri,
          (width, height) => {
            setWorkingUri(sourceUri);
            setNaturalSize({ width, height });
          },
          () => onCancel?.(new Error("Unable to read selected image."))
        );
      });
    return () => {
      active = false;
    };
  }, [onCancel, sourceUri]);

  const imageRect = useMemo(() => {
    if (!naturalSize || !stageSize) return null;
    const fit = Math.min(stageSize.width / naturalSize.width, stageSize.height / naturalSize.height);
    const width = naturalSize.width * fit;
    const height = naturalSize.height * fit;
    return {
      left: (stageSize.width - width) / 2,
      top: (stageSize.height - height) / 2,
      width,
      height,
    };
  }, [naturalSize, stageSize]);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    imageRectRef.current = imageRect;
  }, [imageRect]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  useEffect(() => {
    if (!imageRect || crop) return;
    const inset = 8;
    setCrop({
      left: imageRect.left + inset,
      top: imageRect.top + inset,
      width: Math.max(MIN_CROP_SIZE, imageRect.width - inset * 2),
      height: Math.max(MIN_CROP_SIZE, imageRect.height - inset * 2),
    });
  }, [crop, imageRect]);

  function updateCrop(type, dx, dy) {
    const currentImageRect = imageRectRef.current;
    const currentStageSize = stageSizeRef.current;
    if (!startCrop.current || !currentImageRect) return;
    const start = startCrop.current;
    const right = start.left + start.width;
    const bottom = start.top + start.height;
    const imageRight = currentImageRect.left + currentImageRect.width;
    const imageBottom = currentImageRect.top + currentImageRect.height;
    const minLeft = Math.max(0, currentImageRect.left);
    const minTop = Math.max(0, currentImageRect.top);
    const maxRight = Math.min(currentStageSize?.width || imageRight, imageRight);
    const maxBottom = Math.min(currentStageSize?.height || imageBottom, imageBottom);
    const next = { ...start };

    if (type === "move") {
      next.left = clamp(start.left + dx, minLeft, maxRight - start.width);
      next.top = clamp(start.top + dy, minTop, maxBottom - start.height);
    }
    if (type.includes("l")) {
      next.left = clamp(start.left + dx, minLeft, right - MIN_CROP_SIZE);
      next.width = right - next.left;
    }
    if (type.includes("r")) {
      next.width = clamp(start.width + dx, MIN_CROP_SIZE, maxRight - start.left);
    }
    if (type.includes("t")) {
      next.top = clamp(start.top + dy, minTop, bottom - MIN_CROP_SIZE);
      next.height = bottom - next.top;
    }
    if (type.includes("b")) {
      next.height = clamp(start.height + dy, MIN_CROP_SIZE, maxBottom - start.top);
    }
    setCrop(next);
  }

  function createResponder(type) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        startCrop.current = cropRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        updateCrop(type, gesture.dx, gesture.dy);
      },
    }).panHandlers;
  }

  if (!respondersRef.current) {
    respondersRef.current = {
      move: createResponder("move"),
      t: createResponder("t"),
      b: createResponder("b"),
      l: createResponder("l"),
      r: createResponder("r"),
      tl: createResponder("tl"),
      tr: createResponder("tr"),
      bl: createResponder("bl"),
      br: createResponder("br"),
    };
  }
  const responders = respondersRef.current;

  function cropStyle() {
    return crop ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height } : null;
  }

  function handleStyle(type) {
    if (!crop) return null;
    const half = 20;
    const right = crop.left + crop.width - half;
    const bottom = crop.top + crop.height - half;
    const map = {
      tl: { left: crop.left - half, top: crop.top - half },
      tr: { left: right, top: crop.top - half },
      bl: { left: crop.left - half, top: bottom },
      br: { left: right, top: bottom },
    };
    return map[type];
  }

  function edgeStyle(type) {
    if (!crop) return null;
    const thickness = 34;
    const cornerGap = 18;
    const map = {
      t: {
        left: crop.left + cornerGap,
        top: crop.top - thickness / 2,
        width: Math.max(1, crop.width - cornerGap * 2),
        height: thickness,
      },
      b: {
        left: crop.left + cornerGap,
        top: crop.top + crop.height - thickness / 2,
        width: Math.max(1, crop.width - cornerGap * 2),
        height: thickness,
      },
      l: {
        left: crop.left - thickness / 2,
        top: crop.top + cornerGap,
        width: thickness,
        height: Math.max(1, crop.height - cornerGap * 2),
      },
      r: {
        left: crop.left + crop.width - thickness / 2,
        top: crop.top + cornerGap,
        width: thickness,
        height: Math.max(1, crop.height - cornerGap * 2),
      },
    };
    return map[type];
  }

  async function confirm() {
    const currentCrop = cropRef.current;
    if (!naturalSize || !imageRect || !currentCrop || !workingUri || saving) return;
    try {
      setSaving(true);
      const ratioX = naturalSize.width / imageRect.width;
      const ratioY = naturalSize.height / imageRect.height;
      const cropAction = {
        originX: Math.round((currentCrop.left - imageRect.left) * ratioX),
        originY: Math.round((currentCrop.top - imageRect.top) * ratioY),
        width: Math.round(currentCrop.width * ratioX),
        height: Math.round(currentCrop.height * ratioY),
      };
      cropAction.originX = clamp(cropAction.originX, 0, naturalSize.width - 1);
      cropAction.originY = clamp(cropAction.originY, 0, naturalSize.height - 1);
      cropAction.width = clamp(cropAction.width, 1, naturalSize.width - cropAction.originX);
      cropAction.height = clamp(cropAction.height, 1, naturalSize.height - cropAction.originY);

      const actions = [{ crop: cropAction }];
      if (cropAction.width > MAX_OUTPUT_WIDTH) actions.push({ resize: { width: MAX_OUTPUT_WIDTH } });
      const result = await ImageManipulator.manipulateAsync(workingUri, actions, {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      await onConfirm?.({ uri: result.uri, name: outputName, mimeType: "image/jpeg" });
    } catch (error) {
      onCancel?.(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onCancel?.()}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Crop image</Text>
          <Text style={styles.hint}>Drag the selection and resize it from any edge or corner to include the full document.</Text>
          <View
            style={styles.cropArea}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setStageSize({ width, height: Math.max(430, Math.round(width * 1.6)) });
            }}
          >
            {stageSize && imageRect && workingUri ? (
              <View style={[styles.stage, { height: stageSize.height }]}>
                <Image pointerEvents="none" source={{ uri: workingUri }} style={[styles.image, imageRect]} resizeMode="stretch" />
                {crop ? (
                  <>
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: crop.top - imageRect.top }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: crop.top + crop.height, width: imageRect.width, height: imageRect.top + imageRect.height - crop.top - crop.height }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: crop.top, width: crop.left - imageRect.left, height: crop.height }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: crop.left + crop.width, top: crop.top, width: imageRect.left + imageRect.width - crop.left - crop.width, height: crop.height }]} />
                    <View style={[styles.cropSelection, cropStyle()]} {...responders.move}>
                      <View pointerEvents="none" style={styles.gridV} />
                      <View pointerEvents="none" style={[styles.gridV, { left: "66.66%" }]} />
                      <View pointerEvents="none" style={styles.gridH} />
                      <View pointerEvents="none" style={[styles.gridH, { top: "66.66%" }]} />
                    </View>
                    {["t", "b", "l", "r"].map((type) => (
                      <View key={type} style={[styles.edgeHandle, edgeStyle(type)]} {...responders[type]} />
                    ))}
                    {["tl", "tr", "bl", "br"].map((type) => (
                      <View key={type} hitSlop={20} style={[styles.handleTouch, handleStyle(type)]} {...responders[type]}>
                        <View style={styles.handle} />
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : <View style={styles.loadingBox}><ActivityIndicator color="#ffffff" /></View>}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => onCancel?.()} style={styles.cancelButton} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={confirm} style={[styles.confirmButton, (saving || !crop) && styles.disabled]} disabled={saving || !crop}><Text style={styles.confirmText}>{saving ? "Preparing..." : "Confirm image"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.72)" },
  dialog: { width: "100%", maxWidth: 720, padding: 18, borderRadius: 12, backgroundColor: "#ffffff" },
  title: { color: "#172033", fontSize: 20, fontWeight: "800" },
  hint: { marginTop: 5, color: "#64748b", fontSize: 13 },
  cropArea: { width: "100%", marginTop: 14, overflow: "hidden", borderRadius: 8, backgroundColor: "#111827" },
  stage: { width: "100%" },
  loadingBox: { height: 430, alignItems: "center", justifyContent: "center" },
  image: { position: "absolute" },
  shade: { position: "absolute", backgroundColor: "rgba(0,0,0,0.52)" },
  cropSelection: { position: "absolute", zIndex: 3, borderWidth: 2, borderStyle: "dashed", borderColor: "#ffffff" },
  gridV: { position: "absolute", top: 0, bottom: 0, left: "33.33%", width: 1, backgroundColor: "rgba(255,255,255,0.65)" },
  gridH: { position: "absolute", left: 0, right: 0, top: "33.33%", height: 1, backgroundColor: "rgba(255,255,255,0.65)" },
  edgeHandle: { position: "absolute", zIndex: 8, elevation: 8, backgroundColor: "rgba(255,255,255,0.01)" },
  handleTouch: { position: "absolute", zIndex: 9, elevation: 9, width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.01)" },
  handle: { width: 30, height: 30, borderWidth: 2, borderColor: "#ffffff", backgroundColor: "rgba(17,24,39,0.1)" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancelButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8 },
  cancelText: { color: "#475569", fontWeight: "800" },
  confirmButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#2563eb" },
  confirmText: { color: "#ffffff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
