export const systemColors = {
  screen: "#FBF7EF",
  card: "#FFFDF8",
  text: "#172033",
  muted: "#667085",
  subtle: "#8A94AD",
  deep: "#244F70",
  deeper: "#193B56",
  mid: "#4F7FA6",
  soft: "#E7F1F8",
  pale: "#F4F8FB",
  border: "#E9DED0",
  peach: "#FFF0DE",
  orange: "#D77724",
  red: "#C43E32",
  redSoft: "#FDEDE6",
  shadow: "#263B4D",
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
