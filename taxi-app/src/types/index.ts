export type Vehiculo = {
  id?: string;
  numeroTaxi?: string | null;
  matricula?: string | null;
  marca?: string | null;
  modelo?: string | null;
};

export type Parada = {
  id: string;
  nombre: string;
  direccion?: string | null;
  lat?: number;
  lng?: number;
};

export type Taxista = {
  id: string;
  nombreCompleto?: string;
  telefono?: string;
  estado: "disponible" | "ocupado" | "desconectado";
  parada?: Parada | null;
  paradaId?: string | null;
  vehiculo?: Vehiculo | null;
  ubicacionActualizadaEn?: string | null;
};

export type Solicitud = {
  id: string;
  nombreCliente?: string | null;
  telefonoCliente?: string | null;
  direccionRecogida?: string | null;
  direccionBase?: string | null;
  referenciaRecogida?: string | null;
  estado?: string;
};

export type Oferta = {
  ofertaId: string;
  expiresAt?: string;
  solicitud: Solicitud;
};

export type ServicioActivo = {
  solicitudId: string;
  nombreCliente?: string | null;
  telefonoCliente?: string | null;
  direccionRecogida?: string | null;
  direccionBase?: string | null;
  referenciaRecogida?: string | null;
};

export type ColaParadaItem = {
  taxistaId: string;
  nombreCompleto?: string;
  numeroTaxi?: string | null;
  posicion: number;
  enParadaDesde?: string;
};

export type ResumenParada = {
  paradaId: string;
  nombre: string;
  totalTaxis: number;
  cola: ColaParadaItem[];
};

export type ServicioHistorico = {
  id: string;
  fecha: string;
  cliente?: string | null;
  recogida?: string | null;
  taxista?: string | null;
  estado?: string;
};

export type ObjetoPerdido = {
  id: string;
  fecha: string;
  descripcion: string;
  taxistaId?: string | null;
  taxistaNombre?: string | null;
  numeroTaxi?: string | null;
  estado: "pendiente" | "entregado";
};