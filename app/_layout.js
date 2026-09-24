import { useEffect } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    function handlePaymentUrl(url) {
      if (!String(url || "").includes("payment-result")) return;
      WebBrowser.dismissBrowser().catch(() => {});
      try {
        const parsed = new URL(url);
        router.replace({
          pathname: "/payment-result",
          params: {
            transactionId: parsed.searchParams.get("transactionId") || "",
            payment: parsed.searchParams.get("payment") || "",
          },
        });
      } catch (_err) {
        router.replace("/payment-result");
      }
    }

    Linking.getInitialURL().then(handlePaymentUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handlePaymentUrl(url));
    return () => subscription.remove();
  }, [router]);

  return (
    <SafeAreaProvider>
      {/* Match the system canvas behind the status icons. This removes the
          visible cream strip without placing page content under the status bar. */}
      <StatusBar style="dark" backgroundColor="#F6F8F7" />




      
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}



