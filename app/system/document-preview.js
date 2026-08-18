import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Download, ExternalLink, Share2 } from "lucide-react-native";
import { systemColors as colors } from "../../src/theme/systemTheme";

function safeFileName(value) {
  return String(value || "tenant-document")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extensionFromUrl(url) {
  const clean = String(url || "").split("?")[0];
  const match = /\.([a-z0-9]+)$/i.exec(clean);
  return match ? match[1].toLowerCase() : "jpg";
}

export default function DocumentPreviewScreen() {
  const router = useRouter();
  const { url, title = "Document", fileName, returnTo = "/system/tenants" } = useLocalSearchParams();
  const [downloading, setDownloading] = useState(false);
  const documentUrl = String(Array.isArray(url) ? url[0] : url || "");
  const documentTitle = String(Array.isArray(title) ? title[0] : title || "Document");

  async function openExternal() {
    if (!documentUrl) return;
    const supported = await Linking.canOpenURL(documentUrl);
    if (!supported) return Alert.alert("Cannot open", "This document link cannot be opened on this device.");
    await Linking.openURL(documentUrl);
  }

  async function shareDocument() {
    if (!documentUrl) return;
    try {
      setDownloading(true);
      if (Platform.OS === "web") {
        await openExternal();
        return;
      }
      const ext = extensionFromUrl(documentUrl);
      const name = safeFileName(fileName || documentTitle || `document.${ext}`);
      const finalName = name.includes(".") ? name : `${name}.${ext}`;
      const target = `${FileSystem.cacheDirectory}${finalName}`;
      const downloaded = await FileSystem.downloadAsync(documentUrl, target);
      if (!(await Sharing.isAvailableAsync())) {
        return Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
      }
      await Sharing.shareAsync(downloaded.uri, {
        dialogTitle: documentTitle,
        mimeType: ext === "png" ? "image/png" : "image/jpeg",
      });
    } catch (err) {
      Alert.alert("Unable to share", err.message || "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace(String(returnTo))} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{documentTitle}</Text>
          <Text style={styles.subtitle}>Tenant document preview</Text>
        </View>
      </View>

      <View style={styles.preview}>
        {documentUrl ? (
          <Image source={{ uri: documentUrl }} style={styles.image} contentFit="contain" transition={150} />
        ) : (
          <Text style={styles.error}>Document URL is missing.</Text>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={openExternal} disabled={!documentUrl} style={styles.actionButton}>
          <ExternalLink size={18} color={colors.primary} />
          <Text style={styles.actionText}>Open</Text>
        </Pressable>
        <Pressable onPress={shareDocument} disabled={!documentUrl || downloading} style={[styles.actionButton, downloading && styles.disabled]}>
          {downloading ? <ActivityIndicator size="small" color={colors.primary} /> : <Share2 size={18} color={colors.primary} />}
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        <Pressable onPress={shareDocument} disabled={!documentUrl || downloading} style={[styles.primaryButton, downloading && styles.disabled]}>
          {downloading ? <ActivityIndicator size="small" color={colors.surface} /> : <Download size={18} color={colors.surface} />}
          <Text style={styles.primaryText}>Download</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, marginLeft: 5 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  preview: { flex: 1, padding: 12, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  error: { color: colors.surface, textAlign: "center" },
  actions: { padding: 14, flexDirection: "row", gap: 9, backgroundColor: colors.surface },
  actionButton: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  actionText: { color: colors.primary, fontWeight: "800" },
  primaryButton: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 7, backgroundColor: colors.primary },
  primaryText: { color: colors.surface, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
