import { useWindowDimensions } from "react-native";

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTiny = width < 360;
  const isSmall = width < 400;
  const isTablet = width >= 768;

  return {
    width,
    height,
    isTiny,
    isSmall,
    isTablet,
    pagePadding: isTiny ? 12 : 16,
    formPadding: isTiny ? 14 : 20,
    twoColumnWidth: isTiny ? "100%" : "48%",
    twoColumnWideWidth: isTiny ? "100%" : "48.4%",
    compactFontScale: isTiny ? 0.7 : 0.78,
  };
}

export function responsiveTextProps(minimumFontScale = 0.72) {
  return {
    adjustsFontSizeToFit: true,
    minimumFontScale,
  };
}
