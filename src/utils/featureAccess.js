export function hasCanteenFeature(source = {}) {
  const organization = source?.organization || source;
  return Boolean(organization?.features?.canteenEnabled);
}
