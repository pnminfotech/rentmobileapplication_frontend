import { createContext, useContext, useMemo } from "react";

import { allowedUnitTypes } from "../utils/subscriptionAccess";

const SystemAccessContext = createContext(null);

export function SystemAccessProvider({ source, children }) {
  const value = useMemo(() => {
    const unitTypes = allowedUnitTypes(source);
    const allowedValues = new Set(unitTypes.map((item) => item.value));

    return {
      unitTypes,
      firstUnitType: unitTypes[0]?.value || "bed",
      isUnitTypeAllowed: (type) => allowedValues.has(type),
    };
  }, [source]);

  return <SystemAccessContext.Provider value={value}>{children}</SystemAccessContext.Provider>;
}

export function useSystemAccess() {
  const context = useContext(SystemAccessContext);
  if (!context) {
    throw new Error("useSystemAccess must be used inside SystemAccessProvider");
  }
  return context;
}
