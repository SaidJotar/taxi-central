import { useCallback, useEffect, useState } from "react";
import "./index.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");

// Sustituye estos datos por los definitivos
const TELEFONO_CENTRAL = "+34 856 55 10 30";
const TELEFONO_CENTRAL_HREF = "+34856551030";
const TELEFONO_WHATSAPP = "+34856551030";
const EMAIL_CONTACTO = "info@sjaceuta.es";

export default function App() {
  const [objetos, setObjetos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargarObjetos = useCallback(async (texto = "", signal) => {
    try {
      setLoading(true);
      setError("");

      const textoLimpio = texto.trim();

      const query = textoLimpio
        ? `?q=${encodeURIComponent(textoLimpio)}`
        : "";

      const res = await fetch(
        `${API_BASE_URL}/mobile/public/objetos-perdidos${query}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal,
        }
      );

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error(
          data?.error || "No se pudieron cargar los objetos perdidos."
        );
      }

      setObjetos(Array.isArray(data) ? data : []);
      setBusquedaAplicada(textoLimpio);
    } catch (e) {
      if (e.name === "AbortError") {
        return;
      }

      setObjetos([]);
      setError(e.message || "No se pudieron cargar los objetos perdidos.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    cargarObjetos("", controller.signal);

    return () => {
      controller.abort();
    };
  }, [cargarObjetos]);

  const handleBuscar = (event) => {
    event.preventDefault();
    cargarObjetos(busqueda);
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    cargarObjetos("");
  };

  const recargarObjetos = () => {
    cargarObjetos(busquedaAplicada);
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <a href="/" className="brand" aria-label="Inicio de Taxi Ceuta">
            <img
              src="/logo-taxi-ceuta.png"
              alt=""
              className="brand-logo"
            />

            <div>
              <p className="brand-kicker">Servicio oficial</p>
              <p className="brand-title">Taxi Ceuta</p>
            </div>
          </a>

          <div className="topbar-actions">
            <a
              className="btn btn-header"
              href={`tel:${TELEFONO_CENTRAL_HREF}`}
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

            <h1>Consulta si tu objeto está disponible en la central</h1>

            <p>
              Aquí puedes buscar los objetos encontrados en los taxis que ya
              han sido depositados en la central de Taxi Ceuta. Si reconoces
              alguno, contacta con nosotros para verificar que te pertenece.
            </p>

            <div className="hero-cta">
              <a
                className="btn btn-secondary"
                href={`mailto:${EMAIL_CONTACTO}`}
              >
                Contactar por correo
              </a>
            </div>
          </div>

          <aside className="hero-card">
            <div className="hero-card-icon" aria-hidden="true">
              ✓
            </div>

            <h2>Objetos custodiados</h2>

            <p>
              Los objetos mostrados en esta página ya se encuentran
              físicamente en la central.
            </p>

            <div className="hero-contact-box">
              <span>Atención al cliente</span>

              <a href={`tel:${TELEFONO_CENTRAL_HREF}`}>
                {TELEFONO_CENTRAL}
              </a>
            </div>
          </aside>
        </section>

        <section className="search-section" aria-labelledby="buscar-titulo">
          <div className="section-head">
            <h2 id="buscar-titulo">Buscar un objeto</h2>

            <p>
              Introduce una descripción como móvil, cartera, llaves,
              mochila, gafas o documentación.
            </p>
          </div>

          <form className="search-box" onSubmit={handleBuscar}>
            <label className="sr-only" htmlFor="busqueda-objeto">
              Descripción del objeto
            </label>

            <input
              id="busqueda-objeto"
              type="search"
              placeholder="Ejemplo: mochila negra, móvil, gafas..."
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              autoComplete="off"
              maxLength={100}
            />

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>

            {(busqueda || busquedaAplicada) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={limpiarBusqueda}
                disabled={loading}
              >
                Limpiar
              </button>
            )}
          </form>

          <div className="results-bar" aria-live="polite">
            {!loading && !error && (
              <span>
                {objetos.length}{" "}
                {objetos.length === 1
                  ? "objeto encontrado"
                  : "objetos encontrados"}
              </span>
            )}

            {busquedaAplicada && !loading && !error && (
              <span>
                Búsqueda: <strong>{busquedaAplicada}</strong>
              </span>
            )}
          </div>
        </section>

        {loading && (
          <div className="status-box" role="status">
            <span className="loader" aria-hidden="true" />
            <span>Cargando objetos perdidos...</span>
          </div>
        )}

        {error && !loading && (
          <div className="error-box" role="alert">
            <div>
              <strong>No se ha podido cargar el listado</strong>
              <p>{error}</p>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={recargarObjetos}
            >
              Volver a intentar
            </button>
          </div>
        )}

        {!loading && !error && objetos.length === 0 && (
          <div className="empty-box">
            <div className="empty-icon" aria-hidden="true">
              ⌕
            </div>

            <h2>No hay resultados</h2>

            <p>
              No se han encontrado objetos disponibles en la central con esa
              descripción. Prueba con una búsqueda más general.
            </p>
          </div>
        )}

        {!loading && !error && objetos.length > 0 && (
          <section
            className="cards-grid"
            aria-label="Listado de objetos perdidos"
          >
            {objetos.map((item) => (
              <ObjetoCard key={item.id} item={item} />
            ))}
          </section>
        )}

        <section className="contact-panel">
          <div className="contact-copy">
            <span className="contact-kicker">Recuperación de objetos</span>

            <h2>¿Crees que uno de estos objetos es tuyo?</h2>

            <p>
              Contacta con la central e indica la descripción del objeto y la
              fecha aproximada del trayecto. Tendrás que aportar información
              que permita comprobar que eres su propietario.
            </p>
          </div>

          <div className="contact-actions">
            <a
              className="btn btn-contact-primary"
              href={`tel:${TELEFONO_CENTRAL_HREF}`}
            >
              {TELEFONO_CENTRAL}
            </a>

            <a
              className="btn btn-contact-secondary"
              href={`mailto:${EMAIL_CONTACTO}`}
            >
              Enviar correo
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Taxi Ceuta</strong>
            <p>Servicio de gestión y custodia de objetos perdidos.</p>
          </div>

          <nav className="footer-links" aria-label="Enlaces de contacto">
            <a href={`tel:${TELEFONO_CENTRAL_HREF}`}>
              {TELEFONO_CENTRAL}
            </a>

            <a href={`mailto:${EMAIL_CONTACTO}`}>
              {EMAIL_CONTACTO}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function ObjetoCard({ item }) {
  return (
    <article className="object-card">
      <div className="object-card-top">
        <div>
          <span className="object-label">Objeto encontrado</span>
          <h2>{item.descripcion || "Objeto sin descripción"}</h2>
        </div>

        <span className="status-chip">
          Disponible en central
        </span>
      </div>

      {item.observaciones && (
        <p className="object-notes">{item.observaciones}</p>
      )}

      <dl className="object-meta">
        <div className="meta-item">
          <dt>Fecha de hallazgo</dt>
          <dd>{formatearFecha(item.fecha)}</dd>
        </div>

        {item.numeroTaxi && (
          <div className="meta-item">
            <dt>Número de taxi</dt>
            <dd>Taxi {item.numeroTaxi}</dd>
          </div>
        )}
      </dl>

      <div className="card-notice">
        La entrega se realizará únicamente después de comprobar la
        titularidad del objeto.
      </div>

      <div className="card-actions">
        <a
          className="btn btn-primary btn-full"
          href={`tel:${TELEFONO_CENTRAL_HREF}`}
        >
          Llamar para consultar
        </a>
      </div>
    </article>
  );
}

function formatearFecha(fecha) {
  if (!fecha) {
    return "No disponible";
  }

  const date = new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}