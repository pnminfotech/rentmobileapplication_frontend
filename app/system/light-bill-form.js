import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";

import FormDateField, { toDateValue } from "../../src/components/FormDateField";
import { createLightBill, getLightBillSettings, getLightBills, updateLightBill } from "../../src/api/lightBillApi";
import { getRooms } from "../../src/api/roomApi";
import { useSystemAccess } from "../../src/context/SystemAccessContext";
import { stackedPropertyLabel } from "../../src/utils/unitLabels";
import { systemColors as colors } from "../../src/theme/systemTheme";

const PROPERTY_TYPES = [
  { label: "Hostel Beds", value: "bed" },
  { label: "Residential Rooms", value: "room" },
  { label: "Commercial Shop", value: "shop" },
];
const STATUSES = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
];

const MODE_LABELS = {
  none: "No light bill flow",
  owner_only: "Owner pays the bill",
  tenant_unit_manual: "Enter amount manually",
  tenant_unit_meter: "Use meter reading",
  tenant_direct: "Owner pays the bill",
  fixed_monthly: "Fixed amount every month",
  room_meter_split: "Meter rate",
  room_meter_rate: "Meter rate",
  room_meter_actual_bill: "Actual bill split",
  fixed_per_tenant: "Same fixed amount for every tenant",
  common_owner_bill: "One common hostel bill",
  included_extra_split: "Each room has a meter",
  common_meter_split: "One common hostel bill",
  record_only: "Owner pays the bill",
};

const LEGACY_MODE_ALIASES = {
  record_only: "owner_only",
  tenant_direct: "owner_only",
  included_extra_split: "room_meter_rate",
  room_meter_split: "room_meter_rate",
};
const OWNER_STYLE_MODES = new Set(["owner_only", "record_only", "common_owner_bill", "common_meter_split"]);
const METER_MODES = new Set(["tenant_unit_meter", "room_meter_split", "room_meter_rate", "room_meter_actual_bill"]);
const ROOM_METER_MODES = new Set(["room_meter_split", "room_meter_rate", "room_meter_actual_bill"]);
const MANUAL_MODES = new Set(["tenant_unit_manual"]);
const FIXED_MODES = new Set(["fixed_monthly", "fixed_per_tenant"]);
const NO_ENTRY_MODES = new Set(["fixed_monthly", "fixed_per_tenant"]);
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function billingMonthFromDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTH_NAMES[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

function billingMonthLabel(value) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  if (!match) return "Select month";
  return `${match[1]} 20${match[2]}`;
}

function shiftBillingMonth(value, offset) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/.exec(String(value || ""));
  const current = match ? new Date(2000 + Number(match[2]), MONTH_NAMES.indexOf(match[1]), 1) : new Date();
  return billingMonthFromDate(new Date(current.getFullYear(), current.getMonth() + offset, 1));
}

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizePropertyType(value) {
  if (value === "room" || value === "shop") return value;
  return "bed";
}

function normalizeMode(value) {
  return LEGACY_MODE_ALIASES[value] || value || "none";
}

function propertyLabel(value) {
  const type = normalizePropertyType(value);
  if (type === "room") return "Room";
  if (type === "shop") return "Shop";
  return "Room";
}

function propertyGroupLabel(value) {
  const type = normalizePropertyType(value);
  if (type === "room") return "Building";
  if (type === "shop") return "Market/building";
  return "Hostel/building";
}

function unitTitle(unit) {
  const type = normalizePropertyType(unit?.propertyType);
  const number = unit?.roomNo || "-";
  if (type === "room") return `Room ${number}`;
  if (type === "shop") return `Shop ${number}`;
  return `Hostel room ${number}`;
}

function unitMeta(unit) {
  const parts = [
    unit?.category,
    unit?.hasWing && unit?.wingName ? `Wing ${unit.wingName}` : "",
    unit?.floorNo ? `Floor ${unit.floorNo}` : "",
    unit?.flatType,
  ].filter(Boolean);

  const bedCount = Array.isArray(unit?.beds) ? unit.beds.length : 0;
  if (normalizePropertyType(unit?.propertyType) === "bed" && bedCount) {
    parts.push(`${bedCount} bed${bedCount === 1 ? "" : "s"}`);
  }
  return parts.join(" | ") || propertyLabel(unit?.propertyType);
}

export default function LightBillFormScreen() {
  const router = useRouter();
  const { unitTypes, firstUnitType, isUnitTypeAllowed } = useSystemAccess();
  const visiblePropertyTypes = useMemo(
    () => PROPERTY_TYPES.filter((item) => unitTypes.some((allowed) => allowed.value === item.value)),
    [unitTypes]
  );
  const {
    id,
    billingMonth: initialBillingMonth,
    unitId: requestedUnitId,
    propertyType: requestedPropertyType,
    returnTo,
    tenantId,
    rentReturnTo,
  } = useLocalSearchParams();
  const editing = Boolean(id);
  const type = "meter";
  const [propertyType, setPropertyType] = useState(firstUnitType);
  const [roomNo, setRoomNo] = useState("");
  const [meterNo, setMeterNo] = useState("");
  const [entryPreviousReading, setEntryPreviousReading] = useState(null);
  const [totalReading, setTotalReading] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("pending");
  const [billingMonth, setBillingMonth] = useState(() => {
    const value = Array.isArray(initialBillingMonth) ? initialBillingMonth[0] : initialBillingMonth;
    return /^\w{3}-\d{2}$/.test(String(value || "")) ? String(value) : billingMonthFromDate(new Date());
  });
  const [date, setDate] = useState(toDateValue());
  const [lightSettings, setLightSettings] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedPropertyName, setSelectedPropertyName] = useState("");
  const [showProperties, setShowProperties] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title = editing ? "Edit light bill" : "Add light bill";

  const loadBill = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [roomData, settings, bills] = await Promise.all([
        getRooms(),
        getLightBillSettings(),
        editing ? getLightBills() : Promise.resolve([]),
      ]);
      const unitList = (Array.isArray(roomData) ? roomData : [])
        .filter((unit) => isUnitTypeAllowed(normalizePropertyType(unit.propertyType)));
      setUnits(unitList);
      setLightSettings(settings);
      if (!editing) {
        const unitId = Array.isArray(requestedUnitId) ? requestedUnitId[0] : requestedUnitId;
        const requestedUnit = unitList.find((unit) => String(unit._id) === String(unitId || ""));
        if (requestedUnit) {
          setPropertyType(normalizePropertyType(requestedUnit.propertyType));
          setSelectedUnitId(String(requestedUnit._id));
          setSelectedPropertyName(requestedUnit.category || "");
          setRoomNo(requestedUnit.roomNo || "");
          setMeterNo(requestedUnit.meterNo || "");
          setEntryPreviousReading(requestedUnit.lastMeterReading ?? null);
        } else {
          const typeValue = Array.isArray(requestedPropertyType) ? requestedPropertyType[0] : requestedPropertyType;
          const normalizedType = normalizePropertyType(typeValue);
          setPropertyType(isUnitTypeAllowed(normalizedType) ? normalizedType : firstUnitType);
        }
        return;
      }

      const bill = (Array.isArray(bills) ? bills : []).find((item) => String(item._id) === String(id));
      if (!bill) {
        setError("Light bill not found.");
        return;
      }
      if (!isUnitTypeAllowed(normalizePropertyType(bill.propertyType))) {
        setError("This property type is not included in the current subscription.");
        return;
      }
      setPropertyType(bill.propertyType || "bed");
      setRoomNo(bill.roomNo || "");
      setMeterNo(bill.meterNo || "");
      setEntryPreviousReading(bill.previousReading ?? null);
      setTotalReading(String(bill.totalReading ?? ""));
      setAmount(String(bill.amount ?? bill.salary ?? ""));
      setStatus(bill.status || "pending");
      setBillingMonth(bill.billingMonth || billingMonthFromDate(bill.date));
      setDate(toDateValue(bill.date));
      const matchedUnit = unitList.find((unit) => String(unit._id) === String(bill.roomId))
        || unitList.find((unit) =>
          unit.propertyType === bill.propertyType &&
          unit.roomNo === bill.roomNo &&
          (!bill.category || unit.category === bill.category) &&
          (!bill.wingName || unit.wingName === bill.wingName) &&
          (!bill.floorNo || unit.floorNo === bill.floorNo)
        );
      setSelectedUnitId(matchedUnit?._id || "");
      setSelectedPropertyName(matchedUnit?.category || "");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load light bill.");
    } finally {
      setLoading(false);
    }
  }, [editing, firstUnitType, id, isUnitTypeAllowed, requestedPropertyType, requestedUnitId]);

  useFocusEffect(useCallback(() => { loadBill(); }, [loadBill]));

  const selectedUnit = useMemo(
    () => units.find((unit) => String(unit._id) === String(selectedUnitId)),
    [selectedUnitId, units]
  );
  const filteredUnits = useMemo(
    () => units.filter((unit) => normalizePropertyType(unit.propertyType) === propertyType),
    [propertyType, units]
  );
  const propertyOptions = useMemo(() => {
    const names = new Set(filteredUnits.map((unit) => String(unit.category || "").trim()).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [filteredUnits]);
  const unitOptions = useMemo(
    () => filteredUnits.filter((unit) => String(unit.category || "").trim() === selectedPropertyName),
    [filteredUnits, selectedPropertyName]
  );
  const propertySettings = lightSettings?.[propertyType] || {};
  const activeMode = propertySettings.enabled ? normalizeMode(propertySettings.mode) : "none";
  const ownerStyleMode = OWNER_STYLE_MODES.has(activeMode);
  const meterMode = METER_MODES.has(activeMode);
  const manualMode = MANUAL_MODES.has(activeMode);
  const fixedMode = FIXED_MODES.has(activeMode);
  const entryNotNeeded = !editing && NO_ENTRY_MODES.has(activeMode);
  // Owner-paid bills still need a unit so the record identifies which room's
  // electricity bill was paid; they simply never create a tenant charge.
  const requiresUnit = activeMode !== "none" && !["common_owner_bill", "common_meter_split"].includes(activeMode);
  const ratePerUnit = Number(propertySettings.ratePerUnit || 0);
  const fixedAmount = Number(propertySettings.fixedAmount || 0);
  const includedAmount = Number(propertySettings.includedAmount || 0);
  const includedUnits = Number(propertySettings.includedUnits || 0);
  const effectiveBillPayer = ownerStyleMode ? "owner" : "tenant";
  const previousReading = editing && Number.isFinite(Number(entryPreviousReading))
    ? Number(entryPreviousReading)
    : Number(selectedUnit?.lastMeterReading || 0);
  const currentReading = Number(totalReading || 0);
  const consumedUnits = meterMode && Number.isFinite(currentReading) && currentReading >= previousReading ? currentReading - previousReading : 0;
  const roomMeterRateMode = activeMode === "room_meter_rate" || activeMode === "room_meter_split";
  const roomMeterActualBillMode = activeMode === "room_meter_actual_bill";
  const usesCalculatedMeterAmount = meterMode && !roomMeterActualBillMode;
  const calculatedAmount = meterMode && ratePerUnit > 0 ? Math.max(consumedUnits * ratePerUnit, 0) : 0;
  const extraUnits = meterMode ? Math.max(consumedUnits - includedUnits, 0) : 0;
  const tenantCharge = roomMeterActualBillMode
    ? (consumedUnits > 0 ? Math.max(Number(amount || 0) * extraUnits / consumedUnits, 0) : 0)
    : meterMode && ratePerUnit > 0
      ? Math.max(extraUnits * ratePerUnit, 0)
      : 0;

  useEffect(() => {
    if (editing) return;
    if (fixedMode && fixedAmount > 0) setAmount(String(fixedAmount));
  }, [editing, fixedAmount, fixedMode]);

  useEffect(() => {
    if (editing || !usesCalculatedMeterAmount || !totalReading || ratePerUnit <= 0) return;
    setAmount((current) => current === "" ? String(Math.round(calculatedAmount)) : current);
  }, [calculatedAmount, editing, ratePerUnit, totalReading, usesCalculatedMeterAmount]);

  function selectPropertyType(value) {
    setPropertyType(value);
    setSelectedPropertyName("");
    setShowProperties(false);
    setShowUnits(false);
    setSelectedUnitId("");
    setRoomNo("");
    setMeterNo("");
    setAmount("");
    setTotalReading("");
  }

  function selectPropertyName(value) {
    setSelectedPropertyName(value);
    setSelectedUnitId("");
    setRoomNo("");
    setMeterNo("");
    setTotalReading("");
    if (fixedMode && fixedAmount > 0) setAmount(String(fixedAmount));
    setShowProperties(false);
    setShowUnits(false);
  }

  function selectUnit(unit) {
    setSelectedUnitId(unit._id);
    setPropertyType(normalizePropertyType(unit.propertyType));
    setSelectedPropertyName(unit.category || "");
    setRoomNo(unit.roomNo || "");
    setMeterNo(unit.meterNo || "");
    setShowUnits(false);
    if (!totalReading && unit.lastMeterReading !== null && unit.lastMeterReading !== undefined) {
      setTotalReading(String(unit.lastMeterReading));
    }
  }

  const generatedName = useMemo(() => {
    if (effectiveBillPayer === "owner") {
      if (["common_owner_bill", "common_meter_split"].includes(activeMode)) return `Common hostel light bill ${date || ""}`.trim();
      return selectedUnit ? `Owner paid - ${unitTitle(selectedUnit)}` : "Owner paid light bill";
    }
    if (fixedMode) return `Fixed light ${roomNo || propertyLabel(propertyType)}`.trim();
    if (manualMode) return `Light bill ${roomNo || propertyLabel(propertyType)}`.trim();
    return `Meter ${roomNo || meterNo || ""}`.trim();
  }, [activeMode, date, effectiveBillPayer, fixedMode, manualMode, meterNo, propertyType, roomNo, selectedUnit]);

  function validate() {
    const numericAmount = Number(amount);
    const reading = totalReading ? Number(totalReading) : undefined;
    if (activeMode === "none") return "Choose a light bill scenario in Light bill settings first.";
    if (entryNotNeeded) return "No bill entry is needed for fixed monthly light bill. It will appear automatically while adding rent.";
    if (requiresUnit) {
      if (!selectedPropertyName) return `Select ${propertyGroupLabel(propertyType).toLowerCase()}.`;
      if (!selectedUnitId) return `Select ${propertyLabel(propertyType).toLowerCase()} unit.`;
      if (meterMode && !meterNo.trim()) return "Enter the meter number.";
      if (meterMode && (!Number.isFinite(reading) || reading < 0)) return "Enter a valid meter reading.";
      if (meterMode && selectedUnit && Number(reading) < previousReading) return "Current reading cannot be less than previous reading.";
    } else if (totalReading && (!Number.isFinite(reading) || reading < 0)) {
      return "Enter a valid meter reading.";
    }
    const allowsZeroAmount = usesCalculatedMeterAmount;
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || (!allowsZeroAmount && numericAmount <= 0)) {
      return allowsZeroAmount ? "Enter zero or a valid bill amount." : "Enter a valid amount.";
    }
    if (!date) return "Select a date.";
    if (!billingMonth) return "Select a billing month.";
    return "";
  }

  async function saveBill() {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    const numericAmount = usesCalculatedMeterAmount ? Math.round(calculatedAmount) : Number(amount);
    const payload = {
      name: generatedName,
      type,
      billPayer: effectiveBillPayer,
      billingMode: activeMode,
      isUnitLinked: requiresUnit,
      roomId: requiresUnit ? selectedUnitId || undefined : undefined,
      propertyType,
      category: requiresUnit ? selectedUnit?.category || "" : "",
      wingName: requiresUnit ? selectedUnit?.wingName || "" : "",
      floorNo: requiresUnit ? selectedUnit?.floorNo || "" : "",
      roomNo: requiresUnit ? normalizeIdentifier(roomNo) : "",
      meterNo: normalizeIdentifier(meterNo),
      previousReading: meterMode ? previousReading : undefined,
      totalReading: totalReading === "" ? undefined : Number(totalReading),
      consumedUnits: meterMode ? consumedUnits : undefined,
      includedUnits: ROOM_METER_MODES.has(activeMode) ? includedUnits : undefined,
      ratePerUnit: roomMeterRateMode ? ratePerUnit : undefined,
      fixedCharge: 0,
      amount: numericAmount,
      salary: undefined,
      customLabel: "",
      status,
      billingMonth,
      date,
    };

    try {
      setSaving(true);
      setError("");
      if (editing) await updateLightBill(id, payload);
      else await createLightBill(payload);
      const target = Array.isArray(returnTo) ? returnTo[0] : returnTo;
      const targetTenantId = Array.isArray(tenantId) ? tenantId[0] : tenantId;
      const targetRentReturnTo = Array.isArray(rentReturnTo) ? rentReturnTo[0] : rentReturnTo;
      if (target === "/system/rent-form" && targetTenantId) {
        router.replace({
          pathname: "/system/rent-form",
          params: { id: targetTenantId, month: billingMonth, returnTo: targetRentReturnTo || "/system/tenants" },
        });
      } else {
        router.replace({ pathname: "/system/light-bills", params: { billingMonth } });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save light bill.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/system/light-bills")} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>

      <Text style={styles.label}>Property type</Text>
      <View style={styles.segmented}>
        {visiblePropertyTypes.map((item) => <Pressable key={item.value} onPress={() => selectPropertyType(item.value)} style={[styles.segment, propertyType === item.value && styles.segmentActive]}><Text style={[styles.segmentText, propertyType === item.value && styles.segmentTextActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{stackedPropertyLabel(item.label)}</Text></Pressable>)}
      </View>

      <View style={[styles.scenarioBox, activeMode === "none" && styles.scenarioBoxWarning]}>
        <Text style={styles.scenarioLabel}>Selected scenario</Text>
        <Text style={styles.scenarioTitle}>{MODE_LABELS[activeMode] || "Not configured"}</Text>
        <Text style={styles.scenarioText}>
          {activeMode === "none"
            ? "Open settings once and choose how light bill should work for this property type."
            : entryNotNeeded
              ? "No monthly bill entry is needed. This fixed amount will be added automatically in Add Rent."
            : activeMode === "common_owner_bill"
              ? "Record one bill for the whole hostel. It will not be added to tenant rent."
              : activeMode === "common_meter_split"
                ? "Record one bill for the whole hostel. The amount will be divided equally across all active hostel tenants."
            : ownerStyleMode
              ? "Select the unit this bill belongs to. It will be recorded for that unit, but not added to tenant rent."
              : meterMode
                ? ROOM_METER_MODES.has(activeMode) && includedUnits > 0
                  ? "Select the unit and enter this month's reading. The app will calculate and split only usage above the included limit."
                  : "Select the unit, enter the current reading, and the app will calculate the amount."
                : fixedMode
                  ? "The fixed monthly amount from settings will be used."
                  : "Select the unit and enter the bill amount."}
        </Text>
        {activeMode === "none" ? (
          <Pressable onPress={() => router.push("/system/light-bill-settings")} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Open settings</Text>
          </Pressable>
        ) : null}
      </View>

      {entryNotNeeded ? (
        <View style={styles.noEntryBox}>
          <Text style={styles.noEntryTitle}>Nothing to save here</Text>
          <Text style={styles.noEntryText}>
            {MODE_LABELS[activeMode]} is calculated from settings. Open any tenant Add Rent screen for this month and the light bill amount will be included there.
          </Text>
          <Pressable onPress={() => router.replace("/system/light-bill-settings")} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Change settings</Text>
          </Pressable>
        </View>
      ) : requiresUnit ? (
        <>
          <Text style={styles.label}>{propertyGroupLabel(propertyType)}</Text>
          <Pressable onPress={() => setShowProperties((value) => !value)} style={styles.select}>
            <View style={styles.selectText}>
              <Text style={styles.selectTitle}>{selectedPropertyName || `Select ${propertyGroupLabel(propertyType).toLowerCase()}`}</Text>
              <Text style={styles.selectMeta}>{propertyOptions.length} available</Text>
            </View>
            <ChevronDown size={20} color={colors.muted} />
          </Pressable>

          {showProperties ? (
            <View style={styles.options}>
              {!propertyOptions.length ? <Text style={styles.emptyOption}>No {propertyGroupLabel(propertyType).toLowerCase()} found.</Text> : null}
              {propertyOptions.map((name) => {
                const active = name === selectedPropertyName;
                const count = filteredUnits.filter((unit) => String(unit.category || "").trim() === name).length;
                return (
                  <Pressable key={name} onPress={() => selectPropertyName(name)} style={[styles.option, active && styles.optionSelected]}>
                    <View style={styles.selectText}>
                      <Text style={styles.optionTitle}>{name}</Text>
                      <Text style={styles.selectMeta}>{count} {propertyLabel(propertyType).toLowerCase()}{count === 1 ? "" : "s"}</Text>
                    </View>
                    {active ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>{propertyLabel(propertyType)}</Text>
          <Pressable disabled={!selectedPropertyName} onPress={() => setShowUnits((value) => !value)} style={[styles.select, !selectedPropertyName && styles.selectDisabled]}>
            <View style={styles.selectText}>
              <Text style={styles.selectTitle}>{selectedUnit ? unitTitle(selectedUnit) : `Select ${propertyLabel(propertyType).toLowerCase()}`}</Text>
              <Text style={styles.selectMeta}>
                {selectedUnit
                  ? `${unitMeta(selectedUnit)} | Meter ${selectedUnit.meterNo || "not set"} | Last reading ${selectedUnit.lastMeterReading ?? "not set"}`
                  : selectedPropertyName ? `${selectedPropertyName} units only` : `Select ${propertyGroupLabel(propertyType).toLowerCase()} first`}
              </Text>
            </View>
            <ChevronDown size={20} color={colors.muted} />
          </Pressable>

          {showUnits ? (
            <View style={styles.options}>
              {!unitOptions.length ? <Text style={styles.emptyOption}>No {propertyLabel(propertyType).toLowerCase()} units found.</Text> : null}
              {unitOptions.map((unit) => {
                const active = String(unit._id) === String(selectedUnitId);
                return (
                  <Pressable key={unit._id} onPress={() => selectUnit(unit)} style={[styles.option, active && styles.optionSelected]}>
                    <View style={styles.selectText}>
                      <Text style={styles.optionTitle}>{unitTitle(unit)}</Text>
                      <Text style={styles.selectMeta}>{unitMeta(unit)}</Text>
                      <Text style={styles.selectMeta}>Meter {unit.meterNo || "not set"} | Last reading {unit.lastMeterReading ?? "not set"}</Text>
                    </View>
                    {active ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>Selected room or unit number</Text>
          <View style={styles.readOnly}><Text style={styles.readOnlyText}>{roomNo || "Select unit above"}</Text></View>

          {meterMode ? (
            <>
              <Text style={styles.label}>Meter number</Text>
              <TextInput value={meterNo} onChangeText={setMeterNo} placeholder="Example: MTR-101" style={styles.input} />

              {selectedUnit ? <Text style={styles.label}>Previous reading</Text> : null}
              {selectedUnit ? <View style={styles.readOnly}><Text style={styles.readOnlyText}>{selectedUnit.lastMeterReading ?? "Not set"}</Text></View> : null}

              <Text style={styles.label}>Current reading</Text>
              <TextInput value={totalReading} onChangeText={setTotalReading} keyboardType="numeric" placeholder="Example: 250" style={styles.input} />
              <Text style={styles.helper}>Units consumed: {consumedUnits}{roomMeterRateMode ? ` | Rate Rs. ${ratePerUnit || 0}` : ""}</Text>
              {ROOM_METER_MODES.has(activeMode) && includedUnits > 0 ? (
                <Text style={styles.helper}>Included units: {includedUnits} | Extra units: {extraUnits} | Tenant charge: Rs. {Math.round(tenantCharge).toLocaleString("en-IN")}</Text>
              ) : null}
            </>
          ) : null}
        </>
      ) : meterMode ? (
        <>
          {meterMode ? (
            <>
              <Text style={styles.label}>Meter number (optional)</Text>
              <TextInput value={meterNo} onChangeText={setMeterNo} placeholder="Example: MTR-OFFICE" style={styles.input} />

              <Text style={styles.label}>Current reading (optional)</Text>
              <TextInput value={totalReading} onChangeText={setTotalReading} keyboardType="numeric" placeholder="Example: 250" style={styles.input} />
            </>
          ) : null}
        </>
      ) : null}

      {fixedMode && fixedAmount > 0 ? <Text style={styles.helper}>Fixed amount from settings: Rs. {fixedAmount.toLocaleString("en-IN")}</Text> : null}
      {activeMode === "included_extra_split" ? <Text style={styles.helper}>Included amount per tenant: Rs. {includedAmount.toLocaleString("en-IN")}</Text> : null}
      {roomMeterRateMode && calculatedAmount >= 0 ? <Text style={styles.helper}>Calculated meter amount: Rs. {Math.round(calculatedAmount).toLocaleString("en-IN")}</Text> : null}
      {ROOM_METER_MODES.has(activeMode) && includedUnits > 0 && meterMode ? <Text style={styles.helper}>The reading is saved even when it is within the included limit. In that case, Rs. 0 is added to rent.</Text> : null}

      {!entryNotNeeded && !roomMeterRateMode ? (
        <>
          <Text style={styles.label}>{roomMeterActualBillMode ? "Actual bill amount" : "Bill amount"}</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Example: 1500" style={styles.input} />
        </>
      ) : null}

      {!entryNotNeeded ? (
        <>
          <Text style={styles.label}>Billing month</Text>
          <View style={styles.monthPicker}>
            <Pressable onPress={() => setBillingMonth((current) => shiftBillingMonth(current, -1))} style={styles.monthButton} accessibilityLabel="Previous billing month">
              <ChevronLeft size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthText}>{billingMonthLabel(billingMonth)}</Text>
            <Pressable onPress={() => setBillingMonth((current) => shiftBillingMonth(current, 1))} style={styles.monthButton} accessibilityLabel="Next billing month">
              <ChevronRight size={20} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.helper}>This month decides where the light bill is added in tenant rent.</Text>
          <FormDateField label="Bill date (reference)" value={date} onChange={setDate} maximumDate={new Date()} />
        </>
      ) : null}

      {!entryNotNeeded ? (
        <>
          <Text style={styles.label}>Status</Text>
          <View style={styles.segmented}>
            {STATUSES.map((item) => <Pressable key={item.value} onPress={() => setStatus(item.value)} style={[styles.segment, status === item.value && styles.segmentActive]}><Text style={[styles.segmentText, status === item.value && styles.segmentTextActive]} numberOfLines={1}>{item.label}</Text></Pressable>)}
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={saveBill} disabled={saving || entryNotNeeded} style={[styles.saveButton, (saving || entryNotNeeded) && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>{editing ? "Update bill" : "Save bill"}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 18, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, marginRight: 8, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.text, fontSize: 24, fontWeight: "700" },
  scenarioBox: { marginTop: 14, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  scenarioBoxWarning: { borderColor: colors.warning, backgroundColor: colors.warningSoft || colors.surfaceSoft },
  scenarioLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  scenarioTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: "900" },
  scenarioText: { marginTop: 5, color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  settingsLink: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
  settingsLinkText: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  label: { marginTop: 15, marginBottom: 7, color: colors.muted, fontSize: 14, fontWeight: "600" },
  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, fontSize: 16 },
  monthPicker: { height: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  monthButton: { width: 50, height: 48, alignItems: "center", justifyContent: "center" },
  monthText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  select: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface },
  selectDisabled: { opacity: 0.6 },
  selectText: { flex: 1, minWidth: 0 },
  selectTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  selectMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  options: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, overflow: "hidden", backgroundColor: colors.surface },
  option: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.text, fontSize: 14, fontWeight: "800", textTransform: "capitalize" },
  emptyOption: { padding: 14, color: colors.muted, fontSize: 13, fontWeight: "600" },
  readOnly: { minHeight: 50, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surfaceSoft },
  readOnlyText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  noEntryBox: { marginTop: 16, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  noEntryTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  noEntryText: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  helper: { marginTop: 8, color: colors.muted, fontSize: 12 },
  segmented: { minHeight: 68, flexDirection: "row", gap: 4, padding: 4, borderRadius: 7, backgroundColor: colors.border },
  segment: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 3, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { width: "100%", color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  segmentTextActive: { color: colors.primary },
  error: { marginTop: 18, color: colors.danger },
  saveButton: { height: 50, marginTop: 26, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.primary },
  disabled: { opacity: 0.65 },
  saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
});
