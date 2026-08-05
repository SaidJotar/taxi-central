import { createContext, useContext, useMemo, useState } from "react";

const RideContext = createContext(null);

export function RideProvider({ children }) {
  const [ride, setRide] = useState(null);

  const value = useMemo(
    () => ({
      ride,
      setRide,
      clearRide: () => setRide(null),
    }),
    [ride]
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) {
    throw new Error("useRide debe usarse dentro de RideProvider");
  }
  return ctx;
}