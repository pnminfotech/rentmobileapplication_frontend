export function normalizePropertyType(value) {
  return ["room", "shop"].includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "bed";
}

export const ASSIGNMENT_TYPES = [
  { value: "bed", label: "Hostel Beds" },
  { value: "room", label: "Residential Rooms" },
  { value: "shop", label: "Commercial Shop" },
];

export function stackedPropertyLabel(label) {
  return String(label || "").trim().replace(/\s+/, "\n");
}

export function propertyTypeFromTenant(tenant = {}) {
  const explicit = normalizePropertyType(tenant.propertyType);
  if (explicit !== "bed") return explicit;
  const bedNo = String(tenant.bedNo || "").toUpperCase();
  if (bedNo === "SHOP-1") return "shop";
  if (bedNo === "ROOM-1") return "room";
  return "bed";
}

export function unitTypeLabel(unitOrTenant = {}) {
  const type = unitOrTenant.propertyType ? normalizePropertyType(unitOrTenant.propertyType) : propertyTypeFromTenant(unitOrTenant);
  if (type === "shop") return "Shop";
  if (type === "room") return "Rental room";
  return "Bed";
}

export function isPrimaryUnitSlot(bedNo) {
  return ["ROOM-1", "SHOP-1"].includes(String(bedNo || "").toUpperCase());
}

export function formatTenantUnit(tenant = {}) {
  const type = propertyTypeFromTenant(tenant);
  const unitNo = tenant.roomNo || "-";
  const wing = String(tenant.wingName || "").trim();
  const prefix = wing ? `Wing ${wing} | ` : "";
  if (type === "shop") return `${prefix}Shop ${unitNo}`;
  if (type === "room") return `${prefix}Rental room ${unitNo}`;
  return `${prefix}Room ${unitNo}${tenant.bedNo ? ` | Bed ${tenant.bedNo}` : ""}`;
}

export function formatVacancyTitle(unit = {}) {
  return `${unitTypeLabel(unit)} | ${unit.category || "-"}`;
}

export function formatVacancyMeta(unit = {}, bed = {}) {
  const type = normalizePropertyType(unit.propertyType);
  const rent = Number(bed?.price || 0).toLocaleString("en-IN");
  const prefix = `Floor ${unit.floorNo || "-"} | `;
  if (type === "shop") return `${prefix}Shop ${unit.roomNo || "-"} | Rs. ${rent}`;
  if (type === "room") return `${prefix}Rental room ${unit.roomNo || "-"} | Rs. ${rent}`;
  return `${prefix}Room ${unit.roomNo || "-"}${bed?.bedNo ? ` | Bed ${bed.bedNo}` : ""} | Rs. ${rent}`;
}

export function formatVacancyLabel(unit = {}, bed = {}) {
  return `${formatVacancyTitle(unit)} | ${formatVacancyMeta(unit, bed)}`;
}

export function filterVacanciesByType(vacancies = [], propertyType = "bed") {
  const type = normalizePropertyType(propertyType);
  return vacancies.filter(({ unit }) => normalizePropertyType(unit?.propertyType) === type);
}

export function groupVacanciesByProperty(vacancies = []) {
  const groups = new Map();
  vacancies.forEach((vacancy) => {
    const propertyName = String(vacancy?.unit?.category || "Unassigned property").trim() || "Unassigned property";
    if (!groups.has(propertyName)) groups.set(propertyName, []);
    groups.get(propertyName).push(vacancy);
  });
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([propertyName, items]) => ({
      propertyName,
      vacancies: items.sort((a, b) => {
        const roomCompare = String(a?.unit?.roomNo || "").localeCompare(String(b?.unit?.roomNo || ""), undefined, { numeric: true });
        if (roomCompare) return roomCompare;
        return String(a?.bed?.bedNo || "").localeCompare(String(b?.bed?.bedNo || ""), undefined, { numeric: true });
      }),
    }));
}
