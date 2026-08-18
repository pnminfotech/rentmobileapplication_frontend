export const UNIT_TYPES = [
  { value: "bed", label: "Hostel Beds", quotaKey: "beds" },
  { value: "room", label: "Residential Rooms", quotaKey: "rooms" },
  { value: "shop", label: "Commercial Shop", quotaKey: "shops" },
];

export function getUnitLimits(source = {}) {
  const limits = source?.limits || source?.subscription?.units || source?.units || source?.unitAllocation || source || {};
  return {
    beds: Number(limits.beds || 0),
    rooms: Number(limits.rooms || 0),
    shops: Number(limits.shops || 0),
  };
}

export function allowedUnitTypes(source = {}) {
  const limits = getUnitLimits(source);
  const selected = UNIT_TYPES.filter((type) => limits[type.quotaKey] > 0);
  return selected.length ? selected : UNIT_TYPES;
}

export function firstAllowedType(source = {}) {
  return allowedUnitTypes(source)[0]?.value || "bed";
}

export function isTypeAllowed(type, source = {}) {
  return allowedUnitTypes(source).some((item) => item.value === type);
}
