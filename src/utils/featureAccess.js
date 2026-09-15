export function hasCanteenFeature(source = {}) {
  const organization = source?.organization || source;
  return Boolean(organization?.features?.canteenEnabled);
}

export function needsCanteenAttendance(settings = {}) {
  const primaryMode = (Array.isArray(settings.activeModes) ? settings.activeModes : [])
    .find((mode) => ["full_package", "per_meal", "meal_package"].includes(mode));

  if (!settings.isConfigured || !primaryMode) return false;
  if (primaryMode === "per_meal") return true;
  if (primaryMode === "full_package") return settings.fullPackage?.billingMethod !== "fixed_monthly";
  if (primaryMode === "meal_package") return settings.mealPackage?.billingMethod !== "fixed_monthly";
  return false;
}
