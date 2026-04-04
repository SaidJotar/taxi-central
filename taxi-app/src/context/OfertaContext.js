import React, { createContext, useContext, useMemo, useState } from "react";

const OfertaContext = createContext(null);

export function OfertaProvider({ children }) {
  const [oferta, setOferta] = useState(null);
  const [servicioActivo, setServicioActivo] = useState(null);

  const value = useMemo(
    () => ({
      oferta,
      setOferta,
      servicioActivo,
      setServicioActivo,
    }),
    [oferta, servicioActivo]
  );

  return (
    <OfertaContext.Provider value={value}>
      {children}
    </OfertaContext.Provider>
  );
}

export function useOferta() {
  const ctx = useContext(OfertaContext);
  if (!ctx) throw new Error("useOferta debe usarse dentro de OfertaProvider");
  return ctx;
}