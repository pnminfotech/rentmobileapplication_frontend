export const systemColors = {
  screen: "#FBF7EF",
  card: "#FFFDF8",
  text: "#172016",
  muted: "#697164",
  subtle: "#8E9688",
  deep: "#164F2E",
  deeper: "#0B3D22",
  mid: "#2C7546",
  soft: "#EAF4E6",
  pale: "#F4F8EF",
  border: "#E9DED0",
  peach: "#FFF0DE",
  orange: "#D77724",
  red: "#C43E32",
  redSoft: "#FDEDE6",
  shadow: "#321A12",
};

systemColors.background = systemColors.screen;
systemColors.surface = systemColors.card;
systemColors.surfaceSoft = systemColors.pale;
systemColors.primary = systemColors.deep;
systemColors.primaryDark = systemColors.deeper;
systemColors.primarySoft = systemColors.soft;
systemColors.danger = systemColors.red;
systemColors.dangerSoft = systemColors.redSoft;
systemColors.success = systemColors.mid;
systemColors.successSoft = systemColors.soft;
systemColors.warning = systemColors.orange;
systemColors.warningSoft = systemColors.peach;
systemColors.purple = systemColors.deep;
systemColors.purpleSoft = systemColors.soft;
systemColors.teal = systemColors.deep;
systemColors.tealSoft = systemColors.soft;

export const systemShadow = {
  shadowColor: systemColors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 13,
  shadowOffset: { width: 0, height: 7 },
  elevation: 3,
};
