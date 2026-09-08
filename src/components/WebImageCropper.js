import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_OUTPUT_WIDTH = 1200;
const MIN_CROP_SIZE = 52;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function DragHandle({ type, style, children, onDragStart, onDrag, ...props }) {
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_event, gesture) => onDrag(type, gesture.dx, gesture.dy),
  }), [onDrag, onDragStart, type]);

  return <View style={style} {...props} {...responder.panHandlers}>{children}</View>;
}

export default function WebImageCropper({ sourceUri, sourceWidth, sourceHeight, aspect, outputName = "document.jpg", onCancel, onConfirm }) {
  const suppliedSize = useMemo(() => Number(sourceWidth) > 0 && Number(sourceHeight) > 0
    ? { width: Number(sourceWidth), height: Number(sourceHeight) }
    : null, [sourceHeight, sourceWidth]);
  const [naturalSize, setNaturalSize] = useState(suppliedSize);
  const [stageSize, setStageSize] = useState(null);
  const [crop, setCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const startCrop = useRef(null);
  const cropRef = useRef(null);
  const imageRectRef = useRef(null);
  const stageSizeRef = useRef(null);
  const updateCropRef = useRef(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    if (!sourceUri) return;
    if (suppliedSize) return;
    Image.getSize(
      sourceUri,
      (width, height) => {
        if (active) setNaturalSize({ width, height });
      },
      () => {
        if (active) onCancelRef.current?.(new Error("Unable to read selected image."));
      }
    );
    return () => {
      active = false;
    };
  }, [sourceUri, suppliedSize]);

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
    imageRectRef.current = imageRect;
  }, [imageRect]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  const defaultCrop = useMemo(() => {
    if (!imageRect) return null;
    const inset = 8;
    let width = Math.max(MIN_CROP_SIZE, imageRect.width - inset * 2);
    let height = Math.max(MIN_CROP_SIZE, imageRect.height - inset * 2);
    if (Number(aspect) > 0) {
      if (width / height > Number(aspect)) width = height * Number(aspect);
      else height = width / Number(aspect);
    }
    return {
      left: imageRect.left + (imageRect.width - width) / 2,
      top: imageRect.top + (imageRect.height - height) / 2,
      width,
      height,
    };
  }, [aspect, imageRect]);
  const activeCrop = crop || defaultCrop;

  useEffect(() => {
    cropRef.current = activeCrop;
  }, [activeCrop]);

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

  useEffect(() => {
    updateCropRef.current = updateCrop;
  });

  const beginDrag = useCallback(() => {
    startCrop.current = cropRef.current;
  }, []);

  const dragCrop = useCallback((type, dx, dy) => {
    updateCropRef.current?.(type, dx, dy);
  }, []);

  function cropStyle() {
    return activeCrop ? { left: activeCrop.left, top: activeCrop.top, width: activeCrop.width, height: activeCrop.height } : null;
  }

  function handleStyle(type) {
    if (!activeCrop) return null;
    const half = 20;
    const right = activeCrop.left + activeCrop.width - half;
    const bottom = activeCrop.top + activeCrop.height - half;
    const map = {
      tl: { left: activeCrop.left - half, top: activeCrop.top - half },
      tr: { left: right, top: activeCrop.top - half },
      bl: { left: activeCrop.left - half, top: bottom },
      br: { left: right, top: bottom },
    };
    return map[type];
  }

  function edgeStyle(type) {
    if (!activeCrop) return null;
    const thickness = 34;
    const cornerGap = 18;
    const map = {
      t: {
        left: activeCrop.left + cornerGap,
        top: activeCrop.top - thickness / 2,
        width: Math.max(1, activeCrop.width - cornerGap * 2),
        height: thickness,
      },
      b: {
        left: activeCrop.left + cornerGap,
        top: activeCrop.top + activeCrop.height - thickness / 2,
        width: Math.max(1, activeCrop.width - cornerGap * 2),
        height: thickness,
      },
      l: {
        left: activeCrop.left - thickness / 2,
        top: activeCrop.top + cornerGap,
        width: thickness,
        height: Math.max(1, activeCrop.height - cornerGap * 2),
      },
      r: {
        left: activeCrop.left + activeCrop.width - thickness / 2,
        top: activeCrop.top + cornerGap,
        width: thickness,
        height: Math.max(1, activeCrop.height - cornerGap * 2),
      },
    };
    return map[type];
  }

  async function confirm() {
    const currentCrop = cropRef.current;
    if (!naturalSize || !imageRect || !currentCrop || !sourceUri || saving) return;
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

      const context = ImageManipulator.ImageManipulator.manipulate(sourceUri);
      context.crop(cropAction);
      if (cropAction.width > MAX_OUTPUT_WIDTH) context.resize({ width: MAX_OUTPUT_WIDTH });
      const renderedImage = await context.renderAsync();
      const result = await renderedImage.saveAsync({
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
              const availableHeight = Math.max(260, windowHeight - 230);
              const height = Math.min(Math.max(320, Math.round(width * 1.25)), availableHeight);
              setStageSize((current) => current?.width === width && current?.height === height ? current : { width, height });
            }}
          >
            {stageSize && imageRect && sourceUri ? (
              <View style={[styles.stage, { height: stageSize.height }]}>
                <Image pointerEvents="none" source={{ uri: sourceUri }} style={[styles.image, imageRect]} resizeMode="stretch" />
                {activeCrop ? (
                  <>
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: activeCrop.top - imageRect.top }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: activeCrop.top + activeCrop.height, width: imageRect.width, height: imageRect.top + imageRect.height - activeCrop.top - activeCrop.height }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: imageRect.left, top: activeCrop.top, width: activeCrop.left - imageRect.left, height: activeCrop.height }]} />
                    <View pointerEvents="none" style={[styles.shade, { left: activeCrop.left + activeCrop.width, top: activeCrop.top, width: imageRect.left + imageRect.width - activeCrop.left - activeCrop.width, height: activeCrop.height }]} />
                    <DragHandle type="move" style={[styles.cropSelection, cropStyle()]} onDragStart={beginDrag} onDrag={dragCrop}>
                      <View pointerEvents="none" style={styles.gridV} />
                      <View pointerEvents="none" style={[styles.gridV, { left: "66.66%" }]} />
                      <View pointerEvents="none" style={styles.gridH} />
                      <View pointerEvents="none" style={[styles.gridH, { top: "66.66%" }]} />
                    </DragHandle>
                    {["t", "b", "l", "r"].map((type) => (
                      <DragHandle key={type} type={type} style={[styles.edgeHandle, edgeStyle(type)]} onDragStart={beginDrag} onDrag={dragCrop} />
                    ))}
                    {["tl", "tr", "bl", "br"].map((type) => (
                      <DragHandle key={type} type={type} hitSlop={20} style={[styles.handleTouch, handleStyle(type)]} onDragStart={beginDrag} onDrag={dragCrop}>
                        <View style={styles.handle} />
                      </DragHandle>
                    ))}
                  </>
                ) : null}
              </View>
            ) : <View style={styles.loadingBox}><ActivityIndicator color="#ffffff" /></View>}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => onCancel?.()} style={styles.cancelButton} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={confirm} style={[styles.confirmButton, (saving || !activeCrop) && styles.disabled]} disabled={saving || !activeCrop}><Text style={styles.confirmText}>{saving ? "Preparing..." : "Confirm image"}</Text></Pressable>
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
