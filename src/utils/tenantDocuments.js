import { propertyTypeFromTenant } from "./unitLabels";

const RULES = {
  bed: [
    { relation: "Self Aadhaar Card", label: "Self Aadhaar" },
    { relation: "Parent Aadhaar Card", label: "Parent Aadhaar" },
    { relation: "Tenant Photo", label: "Tenant Photo" },
  ],
  room: [
    { relation: "Self Aadhaar Card", label: "Self Aadhaar" },
    { relation: "Partner Aadhaar Card", label: "Partner Aadhaar" },
    { relation: "Tenant Photograph (Selfie)", label: "Tenant Photograph" },
  ],
  shop: [
    { relation: "Self Aadhaar Card", label: "Self Aadhaar" },
    { relation: "Tenant Photograph (Selfie)", label: "Tenant Photograph" },
  ],
};

function normalizeRelation(value) {
  const relation = String(value || "").trim().toLowerCase().replace(/[.\-_]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    self: "self aadhaar card",
    aadhaar: "self aadhaar card",
    "self aadhaar": "self aadhaar card",
    "tenant aadhaar": "self aadhaar card",
    "tenant aadhaar card": "self aadhaar card",
    "parent/relative aadhaar": "parent aadhaar card",
    "parent relative aadhaar": "parent aadhaar card",
    "partner aadhaar": "partner aadhaar card",
    "tenant photograph": "tenant photo",
    photo: "tenant photo",
  };
  return aliases[relation] || relation;
}

export function requiredDocumentsForTenant(tenant) {
  const type = propertyTypeFromTenant(tenant);
  return RULES[type] || RULES.bed;
}

export function documentStatusForTenant(tenant) {
  const documents = Array.isArray(tenant?.documents) ? tenant.documents : [];
  const uploadedRelations = new Set(
    documents
      .filter((document) => document?.url || document?.filePath || document?.fileId)
      .map((document) => normalizeRelation(document.relation))
  );
  const required = requiredDocumentsForTenant(tenant).map((rule) => ({
    ...rule,
    uploaded: uploadedRelations.has(normalizeRelation(rule.relation)),
    document: documents.find((document) => normalizeRelation(document.relation) === normalizeRelation(rule.relation)) || null,
  }));
  const missing = required.filter((item) => !item.uploaded);
  return {
    required,
    missing,
    complete: missing.length === 0,
    uploadedCount: required.length - missing.length,
    requiredCount: required.length,
  };
}
