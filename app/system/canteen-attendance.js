import { useCallback, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";

import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  Search,
  Utensils,
  UsersRound,
  X,
} from "lucide-react-native";

import {
  getCanteenSettings,
  getCanteenAttendance,
  getCanteenAttendanceRange,
  markAllCanteenAttendance,
  markCanteenAttendance,
} from "../../src/api/canteenApi";

import { formatTenantUnit } from "../../src/utils/unitLabels";

import { needsCanteenAttendance } from "../../src/utils/featureAccess";

import { useResponsive } from "../../src/utils/responsive";

import {
  systemShadow,
} from "../../src/theme/systemTheme";

/* ============================================================
   UI
============================================================ */

const UI = {
  screen: "#F6F8F7",
  card: "#FFFFFF",

  navy: "#111B2A",
  text: "#111B2A",
  muted: "#63738A",
  subtle: "#94A3B8",

  border: "#D9E1E7",

  blue: "#4F7FA6",
  blueDark: "#244F70",
  blueSoft: "#E7F1F8",

  green: "#2E7D5B",
  greenSoft: "#EAF5EF",

  red: "#C94B4B",
  redSoft: "#FCEEEE",

  orange: "#B7791F",
  orangeSoft: "#FFF6E5",

  neutralSoft: "#F4F6F7",
};

/* ============================================================
   MEALS
============================================================ */

const MEALS = [
  {
    label: "Breakfast",
    value: "breakfast",
  },
  {
    label: "Lunch",
    value: "lunch",
  },
  {
    label: "Dinner",
    value: "dinner",
  },
];

/* ============================================================
   DATE HELPERS
============================================================ */

function toDateKey(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shiftDay(date, amount) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount
  );
}

function formatDate(date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function monthRange(date) {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );

  const end = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  );

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

/* ============================================================
   ATTENDANCE HELPERS
============================================================ */

function statusLabel(status) {
  if (status === "present") {
    return "Present";
  }

  if (status === "absent") {
    return "Absent";
  }

  return "Pending";
}

function summarizeRows(rows = []) {
  return rows.reduce(
    (result, row) => {
      result.total += 1;

      if (row.status === "present") {
        result.present += 1;
      } else if (row.status === "absent") {
        result.absent += 1;
      } else {
        result.unmarked += 1;
      }

      return result;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      unmarked: 0,
    }
  );
}

function tenantInitial(name) {
  return String(name || "T")
    .trim()
    .charAt(0)
    .toUpperCase();
}

/* ============================================================
   ENABLED MEALS
============================================================ */

function enabledMealsFromSettings(settings) {
  const primaryMode = (
    settings?.activeModes || []
  ).find((mode) =>
    [
      "full_package",
      "per_meal",
      "meal_package",
    ].includes(mode)
  );

  if (
    !settings?.isConfigured ||
    !primaryMode
  ) {
    return MEALS;
  }

  if (primaryMode === "per_meal") {
    const pricedMeals = MEALS.filter(
      (item) =>
        Number(
          settings?.perMeal?.[
            item.value
          ] || 0
        ) > 0
    );

    return pricedMeals.length
      ? pricedMeals
      : MEALS;
  }

  if (primaryMode === "meal_package") {
    const allowed = new Set(
      settings?.mealPackage
        ?.includedMeals || []
    );

    const result = MEALS.filter(
      (item) =>
        allowed.has(item.value)
    );

    return result.length
      ? result
      : MEALS;
  }

  const allowed = new Set(
    settings?.fullPackage
      ?.includedMeals || []
  );

  const result = MEALS.filter(
    (item) =>
      allowed.has(item.value)
  );

  return result.length
    ? result
    : MEALS;
}

/* ============================================================
   EXPORT HELPERS
============================================================ */

function csvCell(value) {
  return `"${String(
    value ?? ""
  ).replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[character])
  );
}

function attendanceStatus(value) {
  const raw = String(
    value || ""
  ).toLowerCase();

  if (raw === "present") {
    return "Present";
  }

  if (raw === "absent") {
    return "Absent";
  }

  return "";
}

/* ============================================================
   MONTHLY DATA
============================================================ */

function pivotMonthlyAttendance(items = []) {
  const grouped = new Map();

  items.forEach((item) => {
    const key = `${
      item.tenantId ||
      item.tenantName
    }-${item.dateKey}`;

    const existing =
      grouped.get(key) || {
        tenantId:
          item.tenantId,

        tenantName:
          item.tenantName,

        phoneNo:
          item.phoneNo,

        category:
          item.category || "",

        unit: [
          item.category,

          item.roomNo
            ? `Room ${item.roomNo}`
            : "",

          item.bedNo
            ? `Bed ${item.bedNo}`
            : "",
        ]
          .filter(Boolean)
          .join(" | "),

        dateKey:
          item.dateKey,

        breakfast: "",
        lunch: "",
        dinner: "",
      };

    if (item.meal === "breakfast") {
      existing.breakfast =
        attendanceStatus(
          item.status
        );
    }

    if (item.meal === "lunch") {
      existing.lunch =
        attendanceStatus(
          item.status
        );
    }

    if (item.meal === "dinner") {
      existing.dinner =
        attendanceStatus(
          item.status
        );
    }

    grouped.set(key, existing);
  });

  return Array.from(
    grouped.values()
  ).sort(
    (a, b) =>
      String(a.dateKey).localeCompare(
        String(b.dateKey)
      ) ||
      String(
        a.tenantName
      ).localeCompare(
        String(b.tenantName)
      )
  );
}

/* ============================================================
   SAVE FILE
============================================================ */

async function saveFileToAndroidFolder({
  uri,
  filename,
  mimeType,
  textContent,
}) {
  const saf =
    FileSystem.StorageAccessFramework;

  if (
    Platform.OS !== "android" ||
    !saf
  ) {
    Alert.alert(
      "Download unavailable",
      "Direct file download is available on Android. Please use Share to save this file."
    );

    return;
  }

  const permission =
    await saf.requestDirectoryPermissionsAsync();

  if (!permission.granted) {
    return;
  }

  const targetUri =
    await saf.createFileAsync(
      permission.directoryUri,
      filename,
      mimeType
    );

  if (
    textContent !== undefined
  ) {
    await FileSystem.writeAsStringAsync(
      targetUri,
      textContent,
      {
        encoding:
          FileSystem.EncodingType.UTF8,
      }
    );

    Alert.alert(
      "Downloaded",
      `${filename} saved successfully.`
    );

    return;
  }

  const base64 =
    await FileSystem.readAsStringAsync(
      uri,
      {
        encoding:
          FileSystem.EncodingType.Base64,
      }
    );

  await FileSystem.writeAsStringAsync(
    targetUri,
    base64,
    {
      encoding:
        FileSystem.EncodingType.Base64,
    }
  );

  Alert.alert(
    "Downloaded",
    `${filename} saved successfully.`
  );
}

function chooseShareOrDownload(file) {
  Alert.alert(
    "Export ready",
    "Choose how you want to save this report.",
    [
      {
        text: "Cancel",
        style: "cancel",
      },

      {
        text: "Share",

        onPress: async () => {
          const available =
            await Sharing.isAvailableAsync();

          if (!available) {
            Alert.alert(
              "Sharing unavailable",
              "Sharing is not available on this device."
            );

            return;
          }

          await Sharing.shareAsync(
            file.uri,
            {
              mimeType:
                file.mimeType,

              dialogTitle:
                file.dialogTitle,

              UTI:
                file.uti,
            }
          );
        },
      },

      {
        text: "Download",

        onPress: async () => {
          try {
            await saveFileToAndroidFolder(
              file
            );
          } catch (err) {
            Alert.alert(
              "Unable to download",
              err?.message ||
                "Please try again."
            );
          }
        },
      },
    ]
  );
}

/* ============================================================
   MAIN SCREEN
============================================================ */

export default function CanteenAttendanceScreen() {
  const router = useRouter();

  const responsive =
    useResponsive();

  const [date, setDate] =
    useState(new Date());

  const [meal, setMeal] =
    useState("breakfast");

  const [rows, setRows] =
    useState([]);

  const [settings, setSettings] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    savingKey,
    setSavingKey,
  ] = useState("");

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [
    exporting,
    setExporting,
  ] = useState("");

  /* ========================================================
     PROPERTY
  ======================================================== */

  const [
    selectedProperty,
    setSelectedProperty,
  ] = useState("all");

  const [
    propertyDropdownOpen,
    setPropertyDropdownOpen,
  ] = useState(false);

  /* ========================================================
     ENABLED MEALS
  ======================================================== */

  const enabledMeals =
    useMemo(
      () =>
        enabledMealsFromSettings(
          settings
        ),
      [settings]
    );

  const enabledMealValues =
    useMemo(
      () =>
        enabledMeals.map(
          (item) =>
            item.value
        ),
      [enabledMeals]
    );

  const dateKey =
    useMemo(
      () =>
        toDateKey(date),
      [date]
    );

  /* ========================================================
     PROPERTY OPTIONS
  ======================================================== */

  const properties =
    useMemo(() => {
      return Array.from(
        new Set(
          rows
            .map((tenant) =>
              String(
                tenant?.category ||
                  ""
              ).trim()
            )
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [rows]);

  /* ========================================================
     PROPERTY FILTER
  ======================================================== */

  const propertyFilteredRows =
    useMemo(() => {
      if (
        selectedProperty === "all"
      ) {
        return rows;
      }

      return rows.filter(
        (tenant) =>
          String(
            tenant?.category || ""
          ).trim() ===
          selectedProperty
      );
    }, [
      rows,
      selectedProperty,
    ]);

  /* ========================================================
     SEARCH
  ======================================================== */

  const visibleRows =
    useMemo(() => {
      const needle = query
        .trim()
        .toLowerCase();

      if (!needle) {
        return propertyFilteredRows;
      }

      return propertyFilteredRows.filter(
        (tenant) =>
          [
            tenant?.name,
            tenant?.phoneNo,
            tenant?.category,
            tenant?.floorNo,
            tenant?.roomNo,
            tenant?.bedNo,
            formatTenantUnit(
              tenant
            ),
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(needle)
          )
      );
    }, [
      propertyFilteredRows,
      query,
    ]);

  /* ========================================================
     SUMMARY
  ======================================================== */

  const filteredSummary =
    useMemo(
      () =>
        summarizeRows(
          propertyFilteredRows
        ),
      [propertyFilteredRows]
    );

  /* ========================================================
     LOAD
  ======================================================== */

  const loadAttendance =
    useCallback(async () => {
      try {
        setError("");

        const canteenSettings =
          await getCanteenSettings();

        setSettings(
          canteenSettings
        );

        if (
          !canteenSettings
            ?.isConfigured
        ) {
          setRows([]);
          return;
        }

        if (
          !needsCanteenAttendance(
            canteenSettings
          )
        ) {
          setRows([]);
          return;
        }

        const allowedMeals =
          enabledMealsFromSettings(
            canteenSettings
          );

        const nextMeal =
          allowedMeals.some(
            (item) =>
              item.value === meal
          )
            ? meal
            : allowedMeals[0]
                ?.value ||
              "breakfast";

        if (
          nextMeal !== meal
        ) {
          setMeal(nextMeal);
          return;
        }

        const data =
          await getCanteenAttendance(
            dateKey,
            nextMeal
          );

        const nextRows =
          Array.isArray(
            data?.rows
          )
            ? data.rows
            : [];

        setRows(nextRows);

        if (
          selectedProperty !==
            "all" &&
          !nextRows.some(
            (tenant) =>
              String(
                tenant?.category ||
                  ""
              ).trim() ===
              selectedProperty
          )
        ) {
          setSelectedProperty(
            "all"
          );
        }
      } catch (err) {
        setError(
          err?.response?.data
            ?.message ||
            "Unable to load canteen attendance."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [
      dateKey,
      meal,
      selectedProperty,
    ]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);

      loadAttendance();
    }, [loadAttendance])
  );

  /* ========================================================
     MARK ONE
  ======================================================== */

  async function markTenant(
    tenant,
    status
  ) {
    const key =
      `${tenant._id}-${status}`;

    const previousRows =
      rows;

    const nextRows =
      rows.map((row) =>
        String(row._id) ===
        String(tenant._id)
          ? {
              ...row,
              status,
            }
          : row
      );

    try {
      setSavingKey(key);

      setRows(nextRows);

      await markCanteenAttendance({
        tenantId:
          tenant._id,

        dateKey,
        meal,
        status,
      });
    } catch (err) {
      setRows(previousRows);

      Alert.alert(
        "Unable to mark attendance",
        err?.response?.data
          ?.message ||
          "Please try again."
      );
    } finally {
      setSavingKey("");
    }
  }

  /* ========================================================
     MARK ALL
  ======================================================== */

  async function markAll(status) {
    const targetRows =
      selectedProperty === "all"
        ? rows
        : propertyFilteredRows;

    if (!targetRows.length) {
      return;
    }

    const previousRows =
      rows;

    const targetIds =
      new Set(
        targetRows.map(
          (tenant) =>
            String(tenant._id)
        )
      );

    const nextRows =
      rows.map((row) =>
        targetIds.has(
          String(row._id)
        )
          ? {
              ...row,
              status,
            }
          : row
      );

    try {
      setSavingKey(
        `all-${status}`
      );

      setRows(nextRows);

      /*
        All properties:
        use existing bulk API.
      */

      if (
        selectedProperty ===
        "all"
      ) {
        await markAllCanteenAttendance({
          dateKey,
          meal,
          status,
        });
      } else {
        /*
          Selected property:
          update only tenants from
          selected property.
        */

        await Promise.all(
          targetRows.map(
            (tenant) =>
              markCanteenAttendance({
                tenantId:
                  tenant._id,

                dateKey,
                meal,
                status,
              })
          )
        );
      }
    } catch (err) {
      setRows(previousRows);

      Alert.alert(
        "Unable to mark all",
        err?.response?.data
          ?.message ||
          "Please try again."
      );

      await loadAttendance();
    } finally {
      setSavingKey("");
    }
  }

  /* ========================================================
     REFRESH
  ======================================================== */

  function refresh() {
    setRefreshing(true);

    loadAttendance();
  }

  /* ========================================================
     MONTHLY
  ======================================================== */

  async function loadMonthlyRows() {
    const range =
      monthRange(date);

    const data =
      await getCanteenAttendanceRange(
        range
      );

    let monthlyRows =
      pivotMonthlyAttendance(
        Array.isArray(
          data?.rows
        )
          ? data.rows
          : []
      );

    if (
      selectedProperty !== "all"
    ) {
      monthlyRows =
        monthlyRows.filter(
          (row) =>
            String(
              row?.category || ""
            ).trim() ===
            selectedProperty
        );
    }

    return monthlyRows;
  }

  /* ========================================================
     CSV EXPORT
  ======================================================== */

  async function exportMonthlyCsv() {
    try {
      setExporting("csv");

      const monthlyRows =
        await loadMonthlyRows();

      const range =
        monthRange(date);

      const mealHeaders =
        enabledMeals.map(
          (item) =>
            item.label
        );

      const lines = [
        [
          "Monthly Canteen Attendance",
          `${range.start} to ${range.end}`,
        ],

        [
          "Property",
          selectedProperty ===
          "all"
            ? "All Properties"
            : selectedProperty,
        ],

        [],

        [
          "Tenant",
          "Phone",
          "Property",
          "Unit",
          "Date",
          ...mealHeaders,
        ],

        ...monthlyRows.map(
          (row) => [
            row.tenantName,
            row.phoneNo,
            row.category,
            row.unit,
            row.dateKey,

            ...enabledMealValues.map(
              (key) =>
                row[key]
            ),
          ]
        ),
      ];

      const csv =
        lines
          .map(
            (line) =>
              line
                .map(csvCell)
                .join(",")
          )
          .join("\n");

      const label =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

      if (
        Platform.OS === "web"
      ) {
        const anchor =
          globalThis.document.createElement(
            "a"
          );

        anchor.href =
          `data:text/csv;charset=utf-8,${encodeURIComponent(
            csv
          )}`;

        anchor.download =
          `canteen-attendance-${label}.csv`;

        anchor.click();

        return;
      }

      const uri =
        `${FileSystem.cacheDirectory}canteen-attendance-${label}.csv`;

      await FileSystem.writeAsStringAsync(
        uri,
        csv,
        {
          encoding:
            FileSystem.EncodingType
              .UTF8,
        }
      );

      chooseShareOrDownload({
        uri,

        filename:
          `canteen-attendance-${label}.csv`,

        mimeType:
          "text/csv",

        dialogTitle:
          "Monthly canteen attendance",

        uti:
          "public.comma-separated-values-text",

        textContent:
          csv,
      });
    } catch (err) {
      Alert.alert(
        "Unable to export CSV",
        err?.response?.data
          ?.message ||
          err?.message ||
          "Please try again."
      );
    } finally {
      setExporting("");
    }
  }

  /* ========================================================
     PDF EXPORT
  ======================================================== */

  async function exportMonthlyPdf() {
    try {
      setExporting("pdf");

      const monthlyRows =
        await loadMonthlyRows();

      const range =
        monthRange(date);

      const propertyLabel =
        selectedProperty ===
        "all"
          ? "All Properties"
          : selectedProperty;

      const mealHeaders =
        enabledMeals
          .map(
            (item) =>
              `<th>${escapeHtml(
                item.label
              )}</th>`
          )
          .join("");

      const bodyRows =
        monthlyRows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(
                  row.tenantName
                )}</td>

                <td>${escapeHtml(
                  row.category
                )}</td>

                <td>${escapeHtml(
                  row.unit
                )}</td>

                <td>${escapeHtml(
                  row.dateKey
                )}</td>

                ${enabledMealValues
                  .map(
                    (key) =>
                      `<td>${escapeHtml(
                        row[key]
                      )}</td>`
                  )
                  .join("")}
              </tr>
            `
          )
          .join("");

      const colspan =
        4 +
        enabledMeals.length;

      const html = `
        <!doctype html>

        <html>

          <head>

            <style>

              body {
                font-family: Arial, sans-serif;
                padding: 24px;
                color: #111B2A;
              }

              h1 {
                margin-bottom: 4px;
                font-size: 22px;
              }

              .subtitle {
                margin-bottom: 4px;
                color: #63738A;
              }

              .property {
                margin-bottom: 18px;
                color: #244F70;
                font-weight: bold;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
              }

              th,
              td {
                padding: 8px;
                border-bottom: 1px solid #D9E1E7;
                text-align: left;
              }

              th {
                background: #E7F1F8;
                color: #244F70;
              }

            </style>

          </head>

          <body>

            <h1>
              Monthly Canteen Attendance
            </h1>

            <div class="subtitle">
              ${escapeHtml(
                range.start
              )}
              to
              ${escapeHtml(
                range.end
              )}
            </div>

            <div class="property">
              Property:
              ${escapeHtml(
                propertyLabel
              )}
            </div>

            <table>

              <tr>
                <th>Tenant</th>
                <th>Property</th>
                <th>Unit</th>
                <th>Date</th>

                ${mealHeaders}
              </tr>

              ${
                bodyRows ||
                `
                  <tr>
                    <td colspan="${colspan}">
                      No attendance records
                    </td>
                  </tr>
                `
              }

            </table>

          </body>

        </html>
      `;

      const { uri } =
        await Print.printToFileAsync({
          html,
        });

      const label =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

      chooseShareOrDownload({
        uri,

        filename:
          `canteen-attendance-${label}.pdf`,

        mimeType:
          "application/pdf",

        dialogTitle:
          "Monthly canteen attendance",

        uti:
          "com.adobe.pdf",
      });
    } catch (err) {
      Alert.alert(
        "Unable to export PDF",
        err?.response?.data
          ?.message ||
          err?.message ||
          "Please try again."
      );
    } finally {
      setExporting("");
    }
  }

  /* ========================================================
     UI
  ======================================================== */

  return (
    <View style={styles.screen}>

      <View
        style={[
          styles.page,

          {
            paddingHorizontal:
              responsive.pagePadding,
          },
        ]}
      >

        {/* HEADER */}

        <View style={styles.header}>

          <Pressable
            onPress={() =>
              router.replace(
                "/system/more"
              )
            }
            style={
              styles.backButton
            }
          >
            <ArrowLeft
              size={21}
              color={
                UI.blueDark
              }
            />
          </Pressable>

          <View
            style={
              styles.headerText
            }
          >
            <Text style={styles.title}>
              Canteen Attendance
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Mark and manage daily meal attendance
            </Text>
          </View>

        </View>

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={
                refresh
              }
              tintColor={
                UI.blueDark
              }
            />
          }
        >

          {/* =================================================
              DATE
          ================================================= */}

          <View style={styles.dateCard}>

            <Pressable
              onPress={() =>
                setDate(
                  (current) =>
                    shiftDay(
                      current,
                      -1
                    )
                )
              }
              style={
                styles.dateArrow
              }
            >
              <ChevronLeft
                size={20}
                color={
                  UI.blueDark
                }
              />
            </Pressable>

            <View
              style={
                styles.dateMiddle
              }
            >

              <View
                style={
                  styles.dateIcon
                }
              >
                <CalendarDays
                  size={18}
                  color={
                    UI.blueDark
                  }
                />
              </View>

              <View
                style={
                  styles.dateCopy
                }
              >
                <Text
                  style={
                    styles.dateLabel
                  }
                >
                  ATTENDANCE DATE
                </Text>

                <Text
                  style={
                    styles.dateText
                  }
                >
                  {formatDate(date)}
                </Text>
              </View>

            </View>

            <Pressable
              onPress={() =>
                setDate(
                  (current) =>
                    shiftDay(
                      current,
                      1
                    )
                )
              }
              style={
                styles.dateArrow
              }
            >
              <ChevronRight
                size={20}
                color={
                  UI.blueDark
                }
              />
            </Pressable>

          </View>

          {/* =================================================
              MEAL
          ================================================= */}

          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Meal
            </Text>

            <Text
              style={
                styles.sectionMeta
              }
            >
              Select meal
            </Text>
          </View>

          <View
            style={
              styles.mealTabs
            }
          >

            {enabledMeals.map(
              (item) => {
                const active =
                  item.value ===
                  meal;

                return (
                  <Pressable
                    key={
                      item.value
                    }
                    onPress={() =>
                      setMeal(
                        item.value
                      )
                    }
                    style={[
                      styles.mealTab,

                      active &&
                        styles.mealTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mealText,

                        active &&
                          styles.mealTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }
            )}

          </View>

          {/* =================================================
              PROPERTY
          ================================================= */}

          {rows.length > 0 ? (
            <>

              <View
                style={
                  styles.sectionHeader
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Property
                </Text>

                <Text
                  style={
                    styles.sectionMeta
                  }
                >
                  Filter tenants
                </Text>
              </View>

              <View
                style={
                  styles.propertyWrap
                }
              >

                <Pressable
                  onPress={() =>
                    setPropertyDropdownOpen(
                      (current) =>
                        !current
                    )
                  }
                  style={[
                    styles.propertyDropdown,

                    propertyDropdownOpen &&
                      styles.propertyDropdownActive,
                  ]}
                >

                  <View
                    style={
                      styles.propertyDropdownLeft
                    }
                  >

                    <View
                      style={
                        styles.propertyIcon
                      }
                    >
                      <Building2
                        size={18}
                        color={
                          UI.blueDark
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.propertyCopy
                      }
                    >
                      <Text
                        style={
                          styles.propertySmall
                        }
                      >
                        SELECTED PROPERTY
                      </Text>

                      <Text
                        style={
                          styles.propertyText
                        }
                        numberOfLines={
                          1
                        }
                      >
                        {selectedProperty ===
                        "all"
                          ? "All Properties"
                          : selectedProperty}
                      </Text>
                    </View>

                  </View>

                  <ChevronDown
                    size={18}
                    color={UI.muted}
                    style={{
                      transform: [
                        {
                          rotate:
                            propertyDropdownOpen
                              ? "180deg"
                              : "0deg",
                        },
                      ],
                    }}
                  />

                </Pressable>

                {propertyDropdownOpen ? (
                  <View
                    style={
                      styles.propertyMenu
                    }
                  >

                    <Pressable
                      onPress={() => {
                        setSelectedProperty(
                          "all"
                        );

                        setPropertyDropdownOpen(
                          false
                        );

                        setQuery("");
                      }}
                      style={[
                        styles.propertyOption,

                        selectedProperty ===
                          "all" &&
                          styles.propertyOptionActive,
                      ]}
                    >

                      <View
                        style={
                          styles.propertyOptionLeft
                        }
                      >

                        <View
                          style={
                            styles.propertyOptionIcon
                          }
                        >
                          <Building2
                            size={16}
                            color={
                              UI.blueDark
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.propertyOptionCopy
                          }
                        >
                          <Text
                            style={[
                              styles.propertyOptionText,

                              selectedProperty ===
                                "all" &&
                                styles.propertyOptionTextActive,
                            ]}
                          >
                            All Properties
                          </Text>

                          <Text
                            style={
                              styles.propertyOptionCount
                            }
                          >
                            {rows.length} tenant
                            {rows.length ===
                            1
                              ? ""
                              : "s"}
                          </Text>
                        </View>

                      </View>

                      {selectedProperty ===
                      "all" ? (
                        <View
                          style={
                            styles.selectedCheck
                          }
                        >
                          <Check
                            size={13}
                            color="#FFFFFF"
                          />
                        </View>
                      ) : null}

                    </Pressable>

                    {properties.map(
                      (property) => {
                        const active =
                          selectedProperty ===
                          property;

                        const count =
                          rows.filter(
                            (tenant) =>
                              String(
                                tenant?.category ||
                                  ""
                              ).trim() ===
                              property
                          ).length;

                        return (
                          <Pressable
                            key={
                              property
                            }
                            onPress={() => {
                              setSelectedProperty(
                                property
                              );

                              setPropertyDropdownOpen(
                                false
                              );

                              setQuery("");
                            }}
                            style={[
                              styles.propertyOption,

                              active &&
                                styles.propertyOptionActive,
                            ]}
                          >

                            <View
                              style={
                                styles.propertyOptionLeft
                              }
                            >

                              <View
                                style={
                                  styles.propertyOptionIcon
                                }
                              >
                                <Building2
                                  size={16}
                                  color={
                                    UI.blueDark
                                  }
                                />
                              </View>

                              <View
                                style={
                                  styles.propertyOptionCopy
                                }
                              >
                                <Text
                                  numberOfLines={
                                    1
                                  }
                                  style={[
                                    styles.propertyOptionText,

                                    active &&
                                      styles.propertyOptionTextActive,
                                  ]}
                                >
                                  {property}
                                </Text>

                                <Text
                                  style={
                                    styles.propertyOptionCount
                                  }
                                >
                                  {count} tenant
                                  {count ===
                                  1
                                    ? ""
                                    : "s"}
                                </Text>
                              </View>

                            </View>

                            {active ? (
                              <View
                                style={
                                  styles.selectedCheck
                                }
                              >
                                <Check
                                  size={13}
                                  color="#FFFFFF"
                                />
                              </View>
                            ) : null}

                          </Pressable>
                        );
                      }
                    )}

                  </View>
                ) : null}

              </View>

            </>
          ) : null}

          {/* =================================================
              SUMMARY
          ================================================= */}

          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Attendance Summary
            </Text>

            <Text
              style={
                styles.sectionMeta
              }
              numberOfLines={1}
            >
              {selectedProperty ===
              "all"
                ? "All properties"
                : selectedProperty}
            </Text>
          </View>

          <View
            style={
              styles.summaryGrid
            }
          >

            {/* TOTAL */}

            <View
              style={[
                styles.summaryCard,
                styles.summaryBlue,
              ]}
            >

              {/* <View
                style={[
                  styles.summaryIcon,
                  styles.summaryIconBlue,
                ]}
              >
                <UsersRound
                  size={18}
                  color={
                    UI.blueDark
                  }
                />
              </View> */}

              <View>
                <Text
                  style={
                    styles.summaryLabel
                  }
                >
                  Total
                </Text>

                <Text
                  style={
                    styles.summaryValue
                  }
                >
                  {
                    filteredSummary.total
                  }
                </Text>
              </View>

            </View>

            {/* PRESENT */}

            <View
              style={[
                styles.summaryCard,
                styles.summaryGreen,
              ]}
            >

              {/* <View
                style={[
                  styles.summaryIcon,
                  styles.summaryIconGreen,
                ]}
              >
                <Check
                  size={18}
                  color={UI.green}
                />
              </View> */}

              <View>
                <Text
                  style={
                    styles.summaryLabel
                  }
                >
                  Present
                </Text>

                <Text
                  style={[
                    styles.summaryValue,
                    styles.greenValue,
                  ]}
                >
                  {
                    filteredSummary.present
                  }
                </Text>
              </View>

            </View>

            {/* ABSENT */}

            <View
              style={[
                styles.summaryCard,
                styles.summaryRed,
              ]}
            >

              {/* <View
                style={[
                  styles.summaryIcon,
                  styles.summaryIconRed,
                ]}
              >
                <X
                  size={18}
                  color={UI.red}
                />
              </View> */}

              <View>
                <Text
                  style={
                    styles.summaryLabel
                  }
                >
                  Absent
                </Text>

                <Text
                  style={[
                    styles.summaryValue,
                    styles.redValue,
                  ]}
                >
                  {
                    filteredSummary.absent
                  }
                </Text>
              </View>

            </View>

            {/* PENDING */}

            <View
              style={[
                styles.summaryCard,
                styles.summaryOrange,
              ]}
            >

              {/* <View
                style={[
                  styles.summaryIcon,
                  styles.summaryIconOrange,
                ]}
              >
                <CalendarDays
                  size={18}
                  color={
                    UI.orange
                  }
                />
              </View> */}

              <View>
                <Text
                  style={
                    styles.summaryLabel
                  }
                >
                  Pending
                </Text>

                <Text
                  style={[
                    styles.summaryValue,
                    styles.orangeValue,
                  ]}
                >
                  {
                    filteredSummary.unmarked
                  }
                </Text>
              </View>

            </View>

          </View>

          {/* =================================================
              BULK
          ================================================= */}

          <View
            style={
              styles.bulkRow
            }
          >

            <Pressable
              disabled={
                !propertyFilteredRows.length ||
                Boolean(
                  savingKey
                )
              }
              onPress={() =>
                markAll(
                  "present"
                )
              }
              style={[
                styles.bulkButton,
                styles.presentBulk,

                (
                  !propertyFilteredRows.length ||
                  Boolean(
                    savingKey
                  )
                ) &&
                  styles.disabled,
              ]}
            >

              {savingKey ===
              "all-present" ? (
                <ActivityIndicator
                  size="small"
                  color={
                    UI.green
                  }
                />
              ) : (
                <Check
                  size={17}
                  color={
                    UI.green
                  }
                />
              )}

              <Text
                style={
                  styles.presentBulkText
                }
              >
                Mark all present
              </Text>

            </Pressable>

            <Pressable
              disabled={
                !propertyFilteredRows.length ||
                Boolean(
                  savingKey
                )
              }
              onPress={() =>
                markAll(
                  "absent"
                )
              }
              style={[
                styles.bulkButton,
                styles.absentBulk,

                (
                  !propertyFilteredRows.length ||
                  Boolean(
                    savingKey
                  )
                ) &&
                  styles.disabled,
              ]}
            >

              {savingKey ===
              "all-absent" ? (
                <ActivityIndicator
                  size="small"
                  color={
                    UI.red
                  }
                />
              ) : (
                <X
                  size={17}
                  color={
                    UI.red
                  }
                />
              )}

              <Text
                style={
                  styles.absentBulkText
                }
              >
                Mark all absent
              </Text>

            </Pressable>

          </View>

          {/* =================================================
              TENANTS HEADER
          ================================================= */}

          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Tenants
            </Text>

            <Text
              style={
                styles.sectionMeta
              }
            >
              {visibleRows.length} shown
            </Text>
          </View>

          {/* =================================================
              SEARCH
          ================================================= */}

          <View
            style={
              styles.searchBox
            }
          >

            <View
              style={
                styles.searchIconBox
              }
            >
              <Search
                size={17}
                color={
                  UI.blueDark
                }
              />
            </View>

            <TextInput
              value={query}
              onChangeText={
                setQuery
              }
              placeholder={
                selectedProperty ===
                "all"
                  ? "Search tenant, room or bed"
                  : `Search in ${selectedProperty}`
              }
              placeholderTextColor={
                UI.muted
              }
              style={
                styles.searchInput
              }
            />

            {query ? (
              <Pressable
                onPress={() =>
                  setQuery("")
                }
                style={
                  styles.searchClear
                }
              >
                <X
                  size={15}
                  color={
                    UI.muted
                  }
                />
              </Pressable>
            ) : null}

          </View>

          {/* =================================================
              EXPORT
          ================================================= */}

          <View
            style={
              styles.exportRow
            }
          >

            <Pressable
              disabled={
                Boolean(
                  exporting
                )
              }
              onPress={
                exportMonthlyCsv
              }
              style={[
                styles.exportButton,

                exporting &&
                  styles.disabled,
              ]}
            >

              {exporting ===
              "csv" ? (
                <ActivityIndicator
                  size="small"
                  color={
                    UI.blueDark
                  }
                />
              ) : (
                <FileDown
                  size={17}
                  color={
                    UI.blueDark
                  }
                />
              )}

              <Text
                style={
                  styles.exportText
                }
              >
                Monthly CSV
              </Text>

            </Pressable>

            <Pressable
              disabled={
                Boolean(
                  exporting
                )
              }
              onPress={
                exportMonthlyPdf
              }
              style={[
                styles.exportButton,

                exporting &&
                  styles.disabled,
              ]}
            >

              {exporting ===
              "pdf" ? (
                <ActivityIndicator
                  size="small"
                  color={
                    UI.blueDark
                  }
                />
              ) : (
                <FileText
                  size={17}
                  color={
                    UI.blueDark
                  }
                />
              )}

              <Text
                style={
                  styles.exportText
                }
              >
                Monthly PDF
              </Text>

            </Pressable>

          </View>

          {/* =================================================
              STATES / TENANTS
          ================================================= */}

          {loading ? (

            <View
              style={
                styles.loading
              }
            >
              <ActivityIndicator
                size="large"
                color={
                  UI.blueDark
                }
              />

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading attendance...
              </Text>
            </View>

          ) : error ? (

            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>
            </View>

          ) : settings &&
            !settings.isConfigured ? (

            <View
              style={
                styles.emptyCard
              }
            >

              <View
                style={
                  styles.emptyIcon
                }
              >
                <Utensils
                  size={22}
                  color={
                    UI.blueDark
                  }
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                Canteen setup required
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Choose your canteen billing settings before marking attendance.
              </Text>

              <Pressable
                onPress={() =>
                  router.push(
                    "/system/canteen-settings"
                  )
                }
                style={
                  styles.setupButton
                }
              >
                <Text
                  style={
                    styles.setupButtonText
                  }
                >
                  Open Canteen Settings
                </Text>
              </Pressable>

            </View>

          ) : settings &&
            !needsCanteenAttendance(
              settings
            ) ? (

            <View
              style={
                styles.emptyCard
              }
            >

              <View
                style={
                  styles.emptyIcon
                }
              >
                <Utensils
                  size={22}
                  color={
                    UI.blueDark
                  }
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                Attendance not required
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Current canteen package uses fixed monthly billing.
              </Text>

            </View>

          ) : !rows.length ? (

            <View
              style={
                styles.emptyCard
              }
            >

              <View
                style={
                  styles.emptyIcon
                }
              >
                <UsersRound
                  size={22}
                  color={
                    UI.blueDark
                  }
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                No canteen tenants
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Active tenants with canteen enabled will appear here.
              </Text>

            </View>

          ) : !visibleRows.length ? (

            <View
              style={
                styles.emptyCard
              }
            >

              <View
                style={
                  styles.emptyIcon
                }
              >
                <Search
                  size={22}
                  color={
                    UI.blueDark
                  }
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                No matching tenant
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Try another search or select a different property.
              </Text>

            </View>

          ) : (

            <View
              style={
                styles.tenantList
              }
            >

              {visibleRows.map(
                (tenant) => {
                  const isPresent =
                    tenant.status ===
                    "present";

                  const isAbsent =
                    tenant.status ===
                    "absent";

                  return (
                    <View
                      key={
                        tenant._id
                      }
                      style={[
                        styles.tenantCard,

                        isPresent &&
                          styles.tenantCardPresent,

                        isAbsent &&
                          styles.tenantCardAbsent,
                      ]}
                    >

                      {/* LEFT STATUS STRIP */}

                      <View
                        style={[
                          styles.statusStrip,

                          isPresent
                            ? styles.statusStripPresent
                            : isAbsent
                            ? styles.statusStripAbsent
                            : styles.statusStripPending,
                        ]}
                      />

                      {/* INFO */}

                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname:
                              "/system/tenant-details",

                            params: {
                              id:
                                tenant._id,

                              tenantId:
                                tenant._id,

                              returnTo:
                                "/system/canteen-attendance",
                            },
                          })
                        }
                        style={
                          styles.tenantInfo
                        }
                      >

                        <View
                          style={[
                            styles.avatar,

                            isPresent &&
                              styles.avatarPresent,

                            isAbsent &&
                              styles.avatarAbsent,
                          ]}
                        >
                          <Text
                            style={[
                              styles.avatarText,

                              isPresent &&
                                styles.avatarTextPresent,

                              isAbsent &&
                                styles.avatarTextAbsent,
                            ]}
                          >
                            {tenantInitial(
                              tenant.name
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.tenantCopy
                          }
                        >

                          <Text
                            style={
                              styles.tenantName
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {tenant.name}
                          </Text>

                          <Text
                            style={
                              styles.tenantUnit
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {formatTenantUnit(
                              tenant
                            )}
                          </Text>

                          <View
                            style={
                              styles.metaRow
                            }
                          >

                            {tenant.category ? (
                              <View
                                style={
                                  styles.propertyBadge
                                }
                              >
                                <Building2
                                  size={10}
                                  color={
                                    UI.blueDark
                                  }
                                />

                                <Text
                                  style={
                                    styles.propertyBadgeText
                                  }
                                  numberOfLines={
                                    1
                                  }
                                >
                                  {
                                    tenant.category
                                  }
                                </Text>
                              </View>
                            ) : null}

                            <View
                              style={[
                                styles.statusBadge,

                                isPresent &&
                                  styles.statusBadgePresent,

                                isAbsent &&
                                  styles.statusBadgeAbsent,
                              ]}
                            >

                              {isPresent ? (
                                <Check
                                  size={10}
                                  color={
                                    UI.green
                                  }
                                />
                              ) : isAbsent ? (
                                <X
                                  size={10}
                                  color={
                                    UI.red
                                  }
                                />
                              ) : (
                                <View
                                  style={
                                    styles.pendingDot
                                  }
                                />
                              )}

                              <Text
                                style={[
                                  styles.statusBadgeText,

                                  isPresent &&
                                    styles.statusBadgeTextPresent,

                                  isAbsent &&
                                    styles.statusBadgeTextAbsent,
                                ]}
                              >
                                {statusLabel(
                                  tenant.status
                                )}
                              </Text>

                            </View>

                          </View>

                        </View>

                      </Pressable>

                      {/* ACTIONS */}

                      <View
                        style={
                          styles.markActions
                        }
                      >

                        <Pressable
                          disabled={
                            Boolean(
                              savingKey
                            )
                          }
                          onPress={() =>
                            markTenant(
                              tenant,
                              "present"
                            )
                          }
                          style={[
                            styles.markButton,
                            styles.presentButton,

                            isPresent &&
                              styles.presentSelected,
                          ]}
                        >

                          {savingKey ===
                          `${tenant._id}-present` ? (
                            <ActivityIndicator
                              size="small"
                              color={
                                isPresent
                                  ? "#FFFFFF"
                                  : UI.green
                              }
                            />
                          ) : (
                            <Check
                              size={17}
                              color={
                                isPresent
                                  ? "#FFFFFF"
                                  : UI.green
                              }
                            />
                          )}

                        </Pressable>

                        <Pressable
                          disabled={
                            Boolean(
                              savingKey
                            )
                          }
                          onPress={() =>
                            markTenant(
                              tenant,
                              "absent"
                            )
                          }
                          style={[
                            styles.markButton,
                            styles.absentButton,

                            isAbsent &&
                              styles.absentSelected,
                          ]}
                        >

                          {savingKey ===
                          `${tenant._id}-absent` ? (
                            <ActivityIndicator
                              size="small"
                              color={
                                isAbsent
                                  ? "#FFFFFF"
                                  : UI.red
                              }
                            />
                          ) : (
                            <X
                              size={17}
                              color={
                                isAbsent
                                  ? "#FFFFFF"
                                  : UI.red
                              }
                            />
                          )}

                        </Pressable>

                      </View>

                    </View>
                  );
                }
              )}

            </View>
          )}

        </ScrollView>

      </View>

    </View>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({

  /* ========================================================
     PAGE
  ======================================================== */

  screen: {
    flex: 1,
    backgroundColor:
      UI.screen,
  },

  page: {
    flex: 1,

    width: "100%",
    maxWidth: 760,

    alignSelf: "center",

    paddingTop: 16,
  },

  scroller: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 90,
  },

  /* ========================================================
     HEADER
  ======================================================== */

  header: {
    minHeight: 58,

    flexDirection: "row",
    alignItems: "center",

    gap: 10,

    marginBottom: 12,
  },

  backButton: {
    width: 42,
    height: 42,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: UI.navy,

    fontSize: 28,
    fontWeight: "900",

    letterSpacing: -0.5,
  },

  subtitle: {
    marginTop: 2,

    color: UI.muted,

    fontSize: 12,
    fontWeight: "600",
  },

  /* ========================================================
     SECTION HEADING
  ======================================================== */

  sectionHeader: {
    marginTop: 16,
    marginBottom: 7,

    paddingHorizontal: 1,

    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",

    gap: 10,
  },

  sectionTitle: {
    color: UI.navy,

    fontSize: 13,
    fontWeight: "900",
  },

  sectionMeta: {
    flexShrink: 1,

    color: UI.muted,

    fontSize: 9,
    fontWeight: "700",

    textAlign: "right",
  },

  /* ========================================================
     DATE
  ======================================================== */

  dateCard: {
    minHeight: 64,

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 5,

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  dateArrow: {
    width: 40,
    height: 44,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 7,
  },

  dateMiddle: {
    flex: 1,

    minWidth: 0,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 9,
  },

  dateIcon: {
    width: 37,
    height: 37,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,

    backgroundColor:
      UI.blueSoft,
  },

  dateCopy: {
    minWidth: 0,
  },

  dateLabel: {
    color: UI.muted,

    fontSize: 8,
    fontWeight: "700",

    letterSpacing: 0.3,
  },

  dateText: {
    marginTop: 2,

    color: UI.navy,

    fontSize: 13,
    fontWeight: "900",
  },

  /* ========================================================
     MEALS
  ======================================================== */

  mealTabs: {
    minHeight: 44,

    padding: 3,

    flexDirection: "row",

    gap: 3,

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.neutralSoft,
  },

  mealTab: {
    flex: 1,

    minHeight: 36,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 6,
  },

  mealTabActive: {
    borderWidth: 1,
    borderColor:
      UI.blueDark,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  mealText: {
    color: UI.muted,

    fontSize: 10,
    fontWeight: "800",
  },

  mealTextActive: {
    color: UI.blueDark,

    fontWeight: "900",
  },

  /* ========================================================
     PROPERTY
  ======================================================== */

  propertyWrap: {
    position: "relative",

    zIndex: 30,
  },

  propertyDropdown: {
    minHeight: 57,

    paddingHorizontal: 9,

    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  propertyDropdownActive: {
    borderColor:
      "#AFC8DA",

    backgroundColor:
      "#FBFDFE",
  },

  propertyDropdownLeft: {
    flex: 1,

    minWidth: 0,

    flexDirection: "row",
    alignItems: "center",

    gap: 9,
  },

  propertyIcon: {
    width: 37,
    height: 37,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,

    backgroundColor:
      UI.blueSoft,
  },

  propertyCopy: {
    flex: 1,

    minWidth: 0,
  },

  propertySmall: {
    color: UI.muted,

    fontSize: 8,
    fontWeight: "700",
  },

  propertyText: {
    marginTop: 2,

    color: UI.navy,

    fontSize: 12,
    fontWeight: "900",
  },

  propertyMenu: {
    marginTop: 5,

    overflow: "hidden",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  propertyOption: {
    minHeight: 55,

    paddingHorizontal: 10,

    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",

    borderBottomWidth:
      StyleSheet.hairlineWidth,

    borderBottomColor:
      UI.border,
  },

  propertyOptionActive: {
    backgroundColor:
      UI.blueSoft,
  },

  propertyOptionLeft: {
    flex: 1,

    minWidth: 0,

    flexDirection: "row",
    alignItems: "center",

    gap: 9,
  },

  propertyOptionIcon: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 7,

    backgroundColor:
      "#F3F7FA",
  },

  propertyOptionCopy: {
    flex: 1,

    minWidth: 0,
  },

  propertyOptionText: {
    color: UI.navy,

    fontSize: 11,
    fontWeight: "800",
  },

  propertyOptionTextActive: {
    color: UI.blueDark,

    fontWeight: "900",
  },

  propertyOptionCount: {
    marginTop: 2,

    color: UI.muted,

    fontSize: 8,
    fontWeight: "600",
  },

  selectedCheck: {
    width: 22,
    height: 22,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 11,

    backgroundColor:
      UI.blueDark,
  },

  /* ========================================================
     SUMMARY
  ======================================================== */

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",

    gap: 8,
  },

  summaryCard: {
    width: "23%",

    minHeight: 68,

    paddingHorizontal: 10,

    overflow: "hidden",

    flexDirection: "row",
    alignItems: "center",

    gap: 9,

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  summaryBlue: {
    borderLeftWidth: 4,
    borderLeftColor:
      UI.blue,
  },

  summaryGreen: {
    borderLeftWidth: 4,
    borderLeftColor:
      UI.green,
  },

  summaryRed: {
    borderLeftWidth: 4,
    borderLeftColor:
      UI.red,
  },

  summaryOrange: {
    borderLeftWidth: 4,
    borderLeftColor:
      "#DDA044",
  },

  summaryIcon: {
    width: 35,
    height: 35,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,
  },

  summaryIconBlue: {
    backgroundColor:
      UI.blueSoft,
  },

  summaryIconGreen: {
    backgroundColor:
      UI.greenSoft,
  },

  summaryIconRed: {
    backgroundColor:
      UI.redSoft,
  },

  summaryIconOrange: {
    backgroundColor:
      UI.orangeSoft,
  },

  summaryLabel: {
    color: UI.muted,

    fontSize: 9,
    fontWeight: "700",
  },

  summaryValue: {
    marginTop: 1,

    color: UI.navy,

    fontSize: 19,
    fontWeight: "900",
  },

  greenValue: {
    color: UI.green,
  },

  redValue: {
    color: UI.red,
  },

  orangeValue: {
    color: UI.orange,
  },

  /* ========================================================
     BULK
  ======================================================== */

  bulkRow: {
    marginTop: 9,

    flexDirection: "row",

    gap: 8,
  },

  bulkButton: {
    flex: 1,

    minHeight: 42,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 6,

    borderWidth: 1,

    borderRadius: 8,
  },

  presentBulk: {
    borderColor:
      "#BFDDCF",

    backgroundColor:
      "#F6FBF8",
  },

  absentBulk: {
    borderColor:
      "#EDCDCD",

    backgroundColor:
      "#FFF8F8",
  },

  presentBulkText: {
    color: UI.green,

    fontSize: 10,
    fontWeight: "900",
  },

  absentBulkText: {
    color: UI.red,

    fontSize: 10,
    fontWeight: "900",
  },

  /* ========================================================
     SEARCH
  ======================================================== */

  searchBox: {
    height: 46,

    paddingHorizontal: 8,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  searchIconBox: {
    width: 31,
    height: 31,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 7,

    backgroundColor:
      UI.blueSoft,
  },

  searchInput: {
    flex: 1,

    height: "100%",

    paddingHorizontal: 9,

    color: UI.navy,

    fontSize: 12,
    fontWeight: "700",
  },

  searchClear: {
    width: 30,
    height: 30,

    alignItems: "center",
    justifyContent: "center",
  },

  /* ========================================================
     EXPORT
  ======================================================== */

  exportRow: {
    marginTop: 8,

    flexDirection: "row",

    gap: 8,
  },

  exportButton: {
    flex: 1,

    minHeight: 40,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 6,

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  exportText: {
    color: UI.blueDark,

    fontSize: 10,
    fontWeight: "900",
  },

  /* ========================================================
     TENANT CARDS
  ======================================================== */

  tenantList: {
    marginTop: 10,

    gap: 8,
  },

  tenantCard: {
    minHeight: 84,

    overflow: "hidden",

    paddingRight: 10,

    flexDirection: "row",
    alignItems: "center",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  tenantCardPresent: {
    borderColor:
      "#CFE3D9",

    backgroundColor:
      "#FCFEFD",
  },

  tenantCardAbsent: {
    borderColor:
      "#EBCFCF",

    backgroundColor:
      "#FFFCFC",
  },

  statusStrip: {
    width: 4,

    alignSelf: "stretch",

    marginRight: 10,
  },

  statusStripPending: {
    backgroundColor:
      UI.blue,
  },

  statusStripPresent: {
    backgroundColor:
      UI.green,
  },

  statusStripAbsent: {
    backgroundColor:
      UI.red,
  },

  tenantInfo: {
    flex: 1,

    minWidth: 0,

    paddingVertical: 10,

    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 42,
    height: 42,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,

    backgroundColor:
      UI.blueSoft,
  },

  avatarPresent: {
    backgroundColor:
      UI.greenSoft,
  },

  avatarAbsent: {
    backgroundColor:
      UI.redSoft,
  },

  avatarText: {
    color: UI.blueDark,

    fontSize: 15,
    fontWeight: "900",
  },

  avatarTextPresent: {
    color: UI.green,
  },

  avatarTextAbsent: {
    color: UI.red,
  },

  tenantCopy: {
    flex: 1,

    minWidth: 0,

    marginLeft: 10,
  },

  tenantName: {
    color: UI.navy,

    fontSize: 13,
    fontWeight: "900",
  },

  tenantUnit: {
    marginTop: 3,

    color: UI.muted,

    fontSize: 10,
    fontWeight: "600",
  },

  metaRow: {
    marginTop: 6,

    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",

    gap: 5,
  },

  propertyBadge: {
    maxWidth: 130,

    minHeight: 22,

    paddingHorizontal: 6,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    borderRadius: 6,

    backgroundColor:
      UI.blueSoft,
  },

  propertyBadgeText: {
    flexShrink: 1,

    color: UI.blueDark,

    fontSize: 8,
    fontWeight: "800",
  },

  statusBadge: {
    minHeight: 22,

    paddingHorizontal: 6,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    borderRadius: 6,

    backgroundColor:
      "#F1F3F5",
  },

  statusBadgePresent: {
    backgroundColor:
      UI.greenSoft,
  },

  statusBadgeAbsent: {
    backgroundColor:
      UI.redSoft,
  },

  statusBadgeText: {
    color: UI.muted,

    fontSize: 8,
    fontWeight: "900",
  },

  statusBadgeTextPresent: {
    color: UI.green,
  },

  statusBadgeTextAbsent: {
    color: UI.red,
  },

  pendingDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor:
      UI.subtle,
  },

  /* ========================================================
     PRESENT / ABSENT BUTTONS
  ======================================================== */

  markActions: {
    marginLeft: 7,

    flexDirection: "row",

    gap: 5,
  },

  markButton: {
    width: 37,
    height: 37,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,

    borderRadius: 8,
  },

  presentButton: {
    borderColor:
      "#C7DED3",

    backgroundColor:
      "#F7FBF9",
  },

  absentButton: {
    borderColor:
      "#EBCFCF",

    backgroundColor:
      "#FFF8F8",
  },

  presentSelected: {
    borderColor:
      UI.green,

    backgroundColor:
      UI.green,
  },

  absentSelected: {
    borderColor:
      UI.red,

    backgroundColor:
      UI.red,
  },

  /* ========================================================
     LOADING / EMPTY
  ======================================================== */

  loading: {
    minHeight: 180,

    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 8,

    color: UI.muted,

    fontSize: 10,
    fontWeight: "700",
  },

  emptyCard: {
    minHeight: 145,

    marginTop: 10,

    padding: 18,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor:
      UI.border,

    borderRadius: 8,

    backgroundColor:
      UI.card,

    ...systemShadow,
  },

  emptyIcon: {
    width: 42,
    height: 42,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,

    backgroundColor:
      UI.blueSoft,
  },

  emptyTitle: {
    marginTop: 8,

    color: UI.navy,

    fontSize: 14,
    fontWeight: "900",

    textAlign: "center",
  },

  emptyText: {
    maxWidth: 320,

    marginTop: 4,

    color: UI.muted,

    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",

    textAlign: "center",
  },

  setupButton: {
    minHeight: 42,

    marginTop: 12,

    paddingHorizontal: 14,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 8,

    backgroundColor:
      UI.blueDark,

    ...systemShadow,
  },

  setupButtonText: {
    color: "#FFFFFF",

    fontSize: 10,
    fontWeight: "900",
  },

  errorText: {
    color: UI.red,

    fontSize: 11,
    fontWeight: "800",

    textAlign: "center",
  },

  disabled: {
    opacity: 0.5,
  },

});