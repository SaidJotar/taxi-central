import { useEffect, useState } from "react";
import "./index.css";

const API_BASE_URL = "https://api.sjaceuta.es";

// Cambia estos datos por los reales
const TELEFONO_CENTRAL = "+34 956 00 00 00";
const TELEFONO_CENTRAL_LIMPIO = "34956000000";
const EMAIL_CONTACTO = "info@sjaceuta.es";

export default function App() {
  const [objetos, setObjetos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargarObjetos = async (texto = "") => {
    try {
      setLoading(true);
      setError("");

      const q = texto.trim()
        ? `?q=${encodeURIComponent(texto.trim())}`
        : "";

      const res = await fetch(
        `${API_BASE_URL}/mobile/public/objetos-perdidos${q}`
      );

      if (!res.ok) {
        throw new Error("No se pudieron cargar los objetos perdidos.");
      }

      const data = await res.json();
      setObjetos(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Error cargando objetos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarObjetos();
  }, []);

  const handleBuscar = (e) => {
    e.preventDefault();
    cargarObjetos(busqueda);
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    cargarObjetos("");
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <img
              src="/logo-taxi-ceuta.png"
              alt="Taxi Ceuta"
              className="brand-logo"
            />
            <div>
              <p className="brand-kicker">Servicio oficial</p>
              <h1 className="brand-title">Taxi Ceuta</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <a className="topbar-phone" href={`tel:${TELEFONO_CENTRAL}`}>
              {TELEFONO_CENTRAL}
            </a>
            <a
              className="btn btn-primary"
              href={`tel:${TELEFONO_CENTRAL}`}
            >
              Llamar ahora
            </a>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-badge">Objetos perdidos</span>
            <h2>Consulta si tu objeto ha sido encontrado en un taxi</h2>
            <p>
              Esta página permite buscar de forma rápida los objetos
              encontrados en los vehículos de Taxi Ceuta. Si localizas un
              objeto que podría ser tuyo, ponte en contacto con la central para
              verificarlo.
            </p>

            <div className="hero-cta">
              <a className="btn btn-primary" href={`tel:${TELEFONO_CENTRAL}`}>
                Llamar a central
              </a>
              <a className="btn btn-secondary" href={`mailto:${EMAIL_CONTACTO}`}>
                Contactar por email
              </a>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-card-icon">🛡️</div>
            <h3>Canal oficial</h3>
            <p>
              Consulta pública de objetos perdidos gestionada por la central de
              Taxi Ceuta.
            </p>

            <div className="hero-contact-box">
              <span>Atención al cliente</span>
              <strong>{TELEFONO_CENTRAL}</strong>
            </div>
          </div>
        </section>

        <section className="search-section">
          <div className="section-head">
            <h3>Buscar objeto</h3>
            <p>
              Busca por descripción, observaciones, número de taxi o estado.
            </p>
          </div>

          <form className="search-box" onSubmit={handleBuscar}>
            <input
              type="text"
              placeholder="Ejemplo: mochila, móvil, gafas, cartera..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Buscar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={limpiarBusqueda}
            >
              Limpiar
            </button>
          </form>

          <div className="results-bar">
            <span>
              {loading
                ? "Buscando..."
                : `${objetos.length} resultado${objetos.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </section>

        <section className="info-banner">
          <div>
            <h3>Información importante</h3>
            <p>
              Por privacidad, esta página no muestra datos personales de los
              taxistas. Para recuperar un objeto, será necesario verificar la
              información con la central.
            </p>
          </div>
        </section>

        {loading && <div className="status-box">Cargando objetos perdidos...</div>}

        {error && !loading && <div className="error-box">{error}</div>}

        {!loading && !error && objetos.length === 0 && (
          <div className="empty-box">
            <h3>No hay resultados</h3>
            <p>No se han encontrado objetos con esa búsqueda.</p>
          </div>
        )}

        {!loading && !error && objetos.length > 0 && (
          <section className="cards-grid">
            {objetos.map((item) => (
              <article className="object-card" key={item.id}>
                <div className="object-card-top">
                  <h3>{item.descripcion}</h3>
                  <span className="status-chip">
                    {capitalizar(item.estado)}
                  </span>
                </div>

                {item.observaciones && (
                  <p className="object-notes">{item.observaciones}</p>
                )}

                <div className="object-meta">
                  <div className="meta-item">
                    <span>Fecha</span>
                    <strong>{formatearFecha(item.fecha)}</strong>
                  </div>

                  <div className="meta-item">
                    <span>Taxi</span>
                    <strong>{item.numeroTaxi || "-"}</strong>
                  </div>
                </div>

                <div className="card-actions">
                  <a
                    className="btn btn-primary btn-full"
                    href={`tel:${TELEFONO_CENTRAL}`}
                  >
                    Llamar para consultar
                  </a>
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="contact-panel">
          <div className="contact-copy">
            <h3>¿Has encontrado tu objeto?</h3>
            <p>
              Llama a la central e indica la descripción del objeto, la fecha
              aproximada del trayecto y, si aparece en el listado, el número de
              taxi.
            </p>
          </div>

          <div className="contact-actions">
            <a className="btn btn-primary" href={`tel:${TELEFONO_CENTRAL}`}>
              {TELEFONO_CENTRAL}
            </a>
            <a className="btn btn-secondary" href={`mailto:${EMAIL_CONTACTO}`}>
              {EMAIL_CONTACTO}
            </a>
            <a
              className="btn btn-whatsapp"
              href={`https://wa.me/${TELEFONO_CENTRAL_LIMPIO}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Taxi Ceuta</strong>
            <p>Servicio oficial de atención y gestión de objetos perdidos.</p>
          </div>

          <div className="footer-links">
            <a href={`tel:${TELEFONO_CENTRAL}`}>{TELEFONO_CENTRAL}</a>
            <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function formatearFecha(fecha) {
  if (!fecha) return "No disponible";

  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;

  return d.toLocaleString("es-ES");
}

function capitalizar(texto) {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}