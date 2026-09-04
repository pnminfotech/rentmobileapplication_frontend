export const systemColors = {
  screen: "#FBF7EF",
  card: "#FFFDF8",
  text: "#172033",
  muted: "#667085",
  subtle: "#8A94AD",
  deep: "#0D5C32",
  deeper: "#074525",
  mid: "#178D55",
  soft: "#E8F5E9",
  pale: "#F4FAF1",
  border: "#E9DED0",
  peach: "#FFF0DE",
  orange: "#D77724",
  red: "#C43E32",
  redSoft: "#FDEDE6",
  shadow: "#233C2B",
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
