import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export async function createShareablePdf(html, fileName = `document-${Date.now()}.pdf`) {
  const result = await Print.printToFileAsync({ html, base64: true });

  if (!result.base64) {
    throw new Error("Unable to generate PDF data.");
  }

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "-");
  const shareUri = `${FileSystem.cacheDirectory}${safeName}`;
  await FileSystem.writeAsStringAsync(shareUri, result.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return shareUri;
}

export async function shareHtmlAsPdf(html, options = {}) {
  const { fileName = `document-${Date.now()}.pdf`, dialogTitle = "Share PDF" } = options;
  const shareUri = await createShareablePdf(html, fileName);

  await Sharing.shareAsync(shareUri, {
    mimeType: "application/pdf",
    dialogTitle,
    UTI: "com.adobe.pdf",
  });
}
