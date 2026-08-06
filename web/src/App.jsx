import { useCallback, useEffect, useState } from "react";
import "./index.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "https://api.sjaceuta.es"
).replace(/\/$/, "");

const TELEFONO_CENTRAL = "+34 856 55 10 30";
const TELEFONO_CENTRAL_HREF = "+34856551030";
const EMAIL_CONTACTO = "info@sjaceuta.es";
const EMAIL_PRIVACIDAD = "info@sjaceuta.es";

/*
 * Sustituye estos datos antes de publicar la política.
 */
const RESPONSABLE = "SJACEUTA";
const NIF_CIF = "45108982W";
const DOMICILIO = "Avenida Reyes Católicos 127, Ceuta, España";

const rutasValidas = [
  "/",
  "/objetos-perdidos",
  "/privacidad",
  "/contacto",
];

function obtenerRutaActual() {
  const ruta = window.location.pathname.replace(/\/+$/, "") || "/";
  return rutasValidas.includes(ruta) ? ruta : "/";
}

export default function App() {
  const [ruta, setRuta] = useState(obtenerRutaActual);

  useEffect(() => {
    const handlePopState = () => {
      setRuta(obtenerRutaActual());
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navegar = (nuevaRuta) => {
    if (window.location.pathname !== nuevaRuta) {
      window.history.pushState({}, "", nuevaRuta);
    }

    setRuta(nuevaRuta);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page">
      <Cabecera ruta={ruta} navegar={navegar} />

      <main>
        {ruta === "/" && <PaginaInicio navegar={navegar} />}
        {ruta === "/objetos-perdidos" && <PaginaObjetos />}
        {ruta === "/privacidad" && <PaginaPrivacidad />}
        {ruta === "/contacto" && <PaginaContacto />}
      </main>

      <PiePagina navegar={navegar} />
    </div>
  );
}

function EnlaceInterno({
  href,
  navegar,
  className = "",
  children,
  ...props
}) {
  const handleClick = (event) => {
    event.preventDefault();
    navegar(href);
  };

  return (
    <a
      href={href}
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
}

function Cabecera({ ruta, navegar }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const irA = (destino) => {
    setMenuAbierto(false);
    navegar(destino);
  };

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <EnlaceInterno
          href="/"
          navegar={irA}
          className="brand"
          aria-label="Inicio de Taxi Ceuta"
        >
          <img
            src="/logo-taxi-ceuta.png"
            alt="Taxi Ceuta"
            className="brand-logo"
          />

          <div>
            <p className="brand-kicker">Servicio de taxi en Ceuta</p>
            <p className="brand-title">Taxi Ceuta</p>
          </div>
        </EnlaceInterno>

        <button
          type="button"
          className="menu-button"
          aria-expanded={menuAbierto}
          aria-label="Abrir menú"
          onClick={() => setMenuAbierto((actual) => !actual)}
        >
          ☰
        </button>

        <nav
          className={`main-nav ${menuAbierto ? "main-nav-open" : ""}`}
          aria-label="Navegación principal"
        >
          <EnlaceInterno
            href="/"
            navegar={irA}
            className={ruta === "/" ? "nav-active" : ""}
          >
            Inicio
          </EnlaceInterno>

          <EnlaceInterno
            href="/objetos-perdidos"
            navegar={irA}
            className={ruta === "/objetos-perdidos" ? "nav-active" : ""}
          >
            Objetos perdidos
          </EnlaceInterno>

          <EnlaceInterno
            href="/privacidad"
            navegar={irA}
            className={ruta === "/privacidad" ? "nav-active" : ""}
          >
            Privacidad
          </EnlaceInterno>

          <EnlaceInterno
            href="/contacto"
            navegar={irA}
            className={ruta === "/contacto" ? "nav-active" : ""}
          >
            Contacto
          </EnlaceInterno>

          <a
            className="btn btn-header"
            href={`tel:${TELEFONO_CENTRAL_HREF}`}
          >
            Llamar ahora
          </a>
        </nav>
      </div>
    </header>
  );
}

function PaginaInicio({ navegar }) {
  return (
    <>
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-copy">
            <span className="hero-badge">Taxi Ceuta</span>

            <h1>Servicio de taxi rápido, cercano y conectado</h1>

            <p>
              Taxi Ceuta conecta clientes, taxistas y central para gestionar
              solicitudes, asignaciones, paradas y objetos perdidos de forma
              sencilla.
            </p>

            <div className="hero-cta">
              <a
                href={`tel:${TELEFONO_CENTRAL_HREF}`}
                className="btn btn-primary"
              >
                Llamar a la central
              </a>

              <EnlaceInterno
                href="/objetos-perdidos"
                navegar={navegar}
                className="btn btn-secondary"
              >
                Consultar objetos perdidos
              </EnlaceInterno>
            </div>
          </div>

          <aside className="home-status-card">
            <span className="status-dot" aria-hidden="true" />

            <p className="status-label">Central de Taxi Ceuta</p>

            <h2>Atención y gestión de servicios</h2>

            <p>
              Contacta con la central para solicitar información o realizar
              una consulta relacionada con un servicio.
            </p>

            <a
              href={`tel:${TELEFONO_CENTRAL_HREF}`}
              className="status-phone"
            >
              {TELEFONO_CENTRAL}
            </a>
          </aside>
        </div>
      </section>

      <section className="container services-section">
        <div className="section-title-centered">
          <span>Servicios</span>
          <h2>Todo el servicio de taxi desde un mismo sistema</h2>
          <p>
            Herramientas para mejorar la coordinación entre la central,
            los taxistas y los clientes.
          </p>
        </div>

        <div className="services-grid">
          <article className="service-card">
            <div className="service-icon">🚕</div>
            <h3>Solicitud de taxi</h3>
            <p>
              Gestión de solicitudes y asignación de servicios a taxistas
              disponibles.
            </p>
          </article>

          <article className="service-card">
            <div className="service-icon">📍</div>
            <h3>Ubicación y paradas</h3>
            <p>
              Organización de taxistas según disponibilidad, ubicación y
              permanencia en las paradas.
            </p>
          </article>

          <article className="service-card">
            <div className="service-icon">🔔</div>
            <h3>Avisos en tiempo real</h3>
            <p>
              Notificaciones de nuevas ofertas, asignaciones, mensajes y
              cambios en los servicios.
            </p>
          </article>

          <article className="service-card">
            <div className="service-icon">🧳</div>
            <h3>Objetos perdidos</h3>
            <p>
              Consulta pública de objetos encontrados que ya se encuentran
              depositados en la central.
            </p>

            <EnlaceInterno
              href="/objetos-perdidos"
              navegar={navegar}
              className="text-link"
            >
              Consultar objetos →
            </EnlaceInterno>
          </article>
        </div>
      </section>

      <section className="container home-information">
        <div>
          <span className="section-kicker">Taxi Ceuta</span>
          <h2>Una plataforma orientada al servicio local</h2>

          <p>
            Nuestro sistema permite gestionar el estado de los taxistas,
            recibir solicitudes, distribuir ofertas y mantener la información
            del servicio actualizada.
          </p>

          <p>
            La ubicación se utiliza para determinar la proximidad de los
            taxistas a las paradas y a las direcciones de recogida, siempre
            conforme a los permisos concedidos por el usuario.
          </p>
        </div>

        <div className="information-list">
          <div>
            <strong>Disponibilidad</strong>
            <span>Estados desconectado, disponible y ocupado.</span>
          </div>

          <div>
            <strong>Asignación</strong>
            <span>Ofertas y servicios enviados en tiempo real.</span>
          </div>

          <div>
            <strong>Seguridad</strong>
            <span>Comunicaciones cifradas mediante HTTPS/TLS.</span>
          </div>
        </div>
      </section>

      <BannerContacto />
    </>
  );
}

function PaginaObjetos() {
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

      const response = await fetch(
        `${API_BASE_URL}/mobile/public/objetos-perdidos${query}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal,
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "No se pudieron cargar los objetos perdidos."
        );
      }

      setObjetos(Array.isArray(data) ? data : []);
      setBusquedaAplicada(textoLimpio);
    } catch (errorPeticion) {
      if (errorPeticion.name === "AbortError") {
        return;
      }

      setObjetos([]);
      setError(
        errorPeticion.message ||
          "No se pudieron cargar los objetos perdidos."
      );
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

  return (
    <div className="container content-page">
      <section className="page-heading">
        <span className="hero-badge">Objetos perdidos</span>
        <h1>Consulta los objetos depositados en la central</h1>

        <p>
          Busca objetos encontrados en los taxis que ya han sido entregados
          físicamente en la central de Taxi Ceuta.
        </p>
      </section>

      <section className="search-section" aria-labelledby="buscar-titulo">
        <div className="section-head">
          <h2 id="buscar-titulo">Buscar un objeto</h2>
          <p>
            Introduce una descripción como móvil, cartera, llaves, mochila,
            gafas o documentación.
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
            onClick={() => cargarObjetos(busquedaAplicada)}
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

      <BannerContacto />
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

        <span className="status-chip">Disponible en central</span>
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
        La entrega se realizará después de comprobar que la persona que
        reclama el objeto es su propietaria.
      </div>

      <a
        className="btn btn-primary btn-full"
        href={`tel:${TELEFONO_CENTRAL_HREF}`}
      >
        Llamar para consultar
      </a>
    </article>
  );
}

function PaginaPrivacidad() {
  return (
    <div className="container content-page">
      <article className="legal-document">
        <header className="legal-heading">
          <span className="hero-badge">Información legal</span>
          <h1>Política de privacidad</h1>
          <p>Última actualización: 7 de agosto de 2026</p>
        </header>

        <div className="legal-notice">
          Esta política explica cómo Taxi Ceuta trata los datos personales
          utilizados para gestionar cuentas, taxistas, solicitudes, viajes,
          ubicaciones y comunicaciones.
        </div>

        <LegalSection title="1. Responsable del tratamiento">
          <p>El responsable del tratamiento es:</p>

          <ul>
            <li>
              <strong>Responsable o razón social:</strong> {RESPONSABLE}
            </li>
            <li>
              <strong>NIF/CIF:</strong> {NIF_CIF}
            </li>
            <li>
              <strong>Domicilio:</strong> {DOMICILIO}
            </li>
            <li>
              <strong>Correo de privacidad:</strong>{" "}
              <a href={`mailto:${EMAIL_PRIVACIDAD}`}>
                {EMAIL_PRIVACIDAD}
              </a>
            </li>
            <li>
              <strong>Sitio web:</strong>{" "}
              <a href="https://sjaceuta.es">https://sjaceuta.es</a>
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="2. Ámbito de aplicación">
          <p>
            Esta política se aplica a la aplicación móvil Taxi Ceuta, a la
            página web, a la central y a los servicios tecnológicos asociados.
          </p>

          <p>
            La aplicación para taxistas está destinada a profesionales
            autorizados y registrados previamente por Taxi Ceuta.
          </p>
        </LegalSection>

        <LegalSection title="3. Datos que tratamos">
          <h3>Datos de identificación y cuenta</h3>
          <ul>
            <li>Nombre y apellidos.</li>
            <li>Número de teléfono.</li>
            <li>Identificador interno de usuario.</li>
            <li>Estado de verificación del teléfono.</li>
            <li>Credenciales almacenadas mediante hash.</li>
            <li>Fecha y hora del último acceso.</li>
          </ul>

          <h3>Datos profesionales y del vehículo</h3>
          <ul>
            <li>Número de taxi.</li>
            <li>Matrícula, marca y modelo.</li>
            <li>Parada asociada.</li>
            <li>Estado desconectado, disponible u ocupado.</li>
          </ul>

          <h3>Datos de ubicación</h3>
          <ul>
            <li>Ubicación aproximada y precisa.</li>
            <li>Fecha y hora de actualización.</li>
            <li>Proximidad a paradas y direcciones de recogida.</li>
          </ul>

          <p>
            Cuando el taxista activa el estado “Disponible”, la aplicación
            puede tratar su ubicación en segundo plano para mantenerlo
            operativo y enviarle solicitudes cercanas.
          </p>

          <h3>Datos de viajes</h3>
          <ul>
            <li>Dirección y coordenadas de recogida.</li>
            <li>Referencia indicada por el cliente.</li>
            <li>Teléfono de contacto.</li>
            <li>Fechas de creación, asignación y finalización.</li>
            <li>Estado de la solicitud.</li>
            <li>Taxista y vehículo asignados.</li>
            <li>Duración, distancia y coste final, cuando se registren.</li>
            <li>Valoraciones y comentarios.</li>
          </ul>

          <h3>Datos técnicos</h3>
          <ul>
            <li>Token de notificaciones.</li>
            <li>Datos de sesión.</li>
            <li>Información del dispositivo y sistema operativo.</li>
            <li>Registros técnicos, errores y dirección IP.</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Finalidades">
          <ul>
            <li>Crear y gestionar cuentas autorizadas.</li>
            <li>Autenticar a los usuarios.</li>
            <li>Gestionar la disponibilidad del taxista.</li>
            <li>Determinar la proximidad a paradas y recogidas.</li>
            <li>Crear, distribuir y asignar solicitudes.</li>
            <li>Gestionar servicios iniciados y completados.</li>
            <li>Enviar notificaciones relacionadas con el servicio.</li>
            <li>Facilitar comunicaciones entre cliente y taxista.</li>
            <li>Gestionar objetos perdidos.</li>
            <li>Prevenir accesos no autorizados y resolver incidencias.</li>
            <li>Cumplir obligaciones legales.</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Base jurídica">
          <p>El tratamiento puede basarse en:</p>

          <ul>
            <li>
              La ejecución de la relación contractual o profesional con el
              taxista.
            </li>
            <li>El cumplimiento de obligaciones legales.</li>
            <li>
              El interés legítimo en proteger el servicio y prevenir usos
              fraudulentos.
            </li>
            <li>
              El consentimiento para los permisos del dispositivo cuando sea
              necesario.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="6. Ubicación">
          <p>La ubicación se utiliza para:</p>

          <ul>
            <li>Conocer la posición del taxista disponible.</li>
            <li>Calcular la proximidad a las paradas.</li>
            <li>Seleccionar taxistas cercanos a una recogida.</li>
            <li>Gestionar la cola de taxistas.</li>
            <li>Actualizar el progreso de servicios activos.</li>
          </ul>

          <p>
            El usuario puede retirar el permiso desde los ajustes del
            dispositivo. Esto puede impedir que reciba solicitudes basadas en
            su ubicación.
          </p>
        </LegalSection>

        <LegalSection title="7. Notificaciones">
          <p>
            Taxi Ceuta utiliza notificaciones para avisar de nuevas ofertas,
            asignaciones, mensajes, cancelaciones y cambios relacionados con
            los servicios.
          </p>

          <p>
            El usuario puede desactivar las notificaciones desde los ajustes
            del dispositivo.
          </p>
        </LegalSection>

        <LegalSection title="8. Proveedores y destinatarios">
          <p>Taxi Ceuta no vende datos personales.</p>

          <p>
            Los datos pueden ser tratados por proveedores necesarios para el
            funcionamiento del servicio, entre ellos:
          </p>

          <ul>
            <li>Proveedores de alojamiento y bases de datos.</li>
            <li>Google Maps Platform y Google Play Services.</li>
            <li>Expo y proveedores de notificaciones push.</li>
            <li>Twilio o Retell AI para la gestión de llamadas.</li>
            <li>Proveedores de seguridad, correo y soporte.</li>
          </ul>
        </LegalSection>

        <LegalSection title="9. Transferencias internacionales">
          <p>
            Algunos proveedores pueden tratar datos fuera del Espacio
            Económico Europeo. Cuando sea necesario se utilizarán decisiones
            de adecuación, cláusulas contractuales tipo u otras garantías
            admitidas legalmente.
          </p>
        </LegalSection>

        <LegalSection title="10. Conservación">
          <p>
            Los datos se conservarán durante el tiempo necesario para prestar
            el servicio y mientras exista una relación activa con el usuario.
          </p>

          <p>
            Posteriormente podrán mantenerse bloqueados durante los plazos
            legales necesarios para atender posibles responsabilidades.
          </p>
        </LegalSection>

        <LegalSection title="11. Seguridad">
          <p>
            Taxi Ceuta aplica medidas destinadas a evitar la pérdida, el
            acceso no autorizado, la alteración o la divulgación de datos.
          </p>

          <ul>
            <li>Conexiones cifradas mediante HTTPS/TLS.</li>
            <li>Contraseñas almacenadas mediante funciones de hash.</li>
            <li>Autenticación mediante tokens.</li>
            <li>Restricción de acceso a servidores y bases de datos.</li>
            <li>Separación de entornos de desarrollo y producción.</li>
          </ul>
        </LegalSection>

        <LegalSection title="12. Datos obligatorios">
          <p>
            El teléfono y las credenciales son necesarios para iniciar sesión.
            La ubicación es necesaria para recibir ofertas basadas en
            proximidad y gestionar correctamente determinados servicios.
          </p>
        </LegalSection>

        <LegalSection title="13. Decisiones automatizadas">
          <p>
            Taxi Ceuta puede emplear reglas automáticas para ordenar o
            seleccionar taxistas según:
          </p>

          <ul>
            <li>Estado de disponibilidad.</li>
            <li>Distancia respecto a la recogida.</li>
            <li>Tiempo de permanencia en una parada.</li>
            <li>Actualización reciente del GPS.</li>
            <li>Existencia de un servicio activo.</li>
          </ul>
        </LegalSection>

        <LegalSection title="14. Derechos">
          <p>El usuario puede solicitar:</p>

          <ul>
            <li>Acceso a sus datos.</li>
            <li>Rectificación.</li>
            <li>Supresión.</li>
            <li>Limitación del tratamiento.</li>
            <li>Oposición.</li>
            <li>Portabilidad.</li>
            <li>Retirada del consentimiento.</li>
          </ul>

          <p>
            Las solicitudes pueden enviarse a{" "}
            <a href={`mailto:${EMAIL_PRIVACIDAD}`}>
              {EMAIL_PRIVACIDAD}
            </a>
            .
          </p>

          <p>
            El usuario también puede presentar una reclamación ante la Agencia
            Española de Protección de Datos.
          </p>
        </LegalSection>

        <LegalSection title="15. Eliminación de cuenta y datos">
          <p>
            Los taxistas pueden solicitar la eliminación de su cuenta y datos
            asociados escribiendo a{" "}
            <a href={`mailto:${EMAIL_PRIVACIDAD}`}>
              {EMAIL_PRIVACIDAD}
            </a>
            .
          </p>

          <p>
            Algunos datos podrán conservarse bloqueados cuando sean necesarios
            para cumplir obligaciones legales.
          </p>
        </LegalSection>

        <LegalSection title="16. Menores">
          <p>
            Taxi Ceuta es una herramienta profesional y no está dirigida a
            menores de edad.
          </p>
        </LegalSection>

        <LegalSection title="17. Modificaciones">
          <p>
            Esta política podrá modificarse para reflejar cambios legales,
            técnicos o funcionales. La fecha de actualización se indicará al
            comienzo de la página.
          </p>
        </LegalSection>

        <LegalSection title="18. Contacto">
          <ul>
            <li>
              <strong>Correo de privacidad:</strong>{" "}
              <a href={`mailto:${EMAIL_PRIVACIDAD}`}>
                {EMAIL_PRIVACIDAD}
              </a>
            </li>
            <li>
              <strong>Correo general:</strong>{" "}
              <a href={`mailto:${EMAIL_CONTACTO}`}>
                {EMAIL_CONTACTO}
              </a>
            </li>
            <li>
              <strong>Responsable:</strong> {RESPONSABLE}
            </li>
            <li>
              <strong>Domicilio:</strong> {DOMICILIO}
            </li>
          </ul>
        </LegalSection>
      </article>
    </div>
  );
}

function LegalSection({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PaginaContacto() {
  return (
    <div className="container content-page">
      <section className="page-heading">
        <span className="hero-badge">Contacto</span>
        <h1>Contacta con Taxi Ceuta</h1>

        <p>
          Utiliza estos datos para consultas relacionadas con servicios,
          taxistas, objetos perdidos o privacidad.
        </p>
      </section>

      <div className="contact-grid">
        <article className="contact-card">
          <span className="contact-card-icon">☎</span>
          <h2>Teléfono</h2>
          <p>Atención telefónica y consultas generales.</p>

          <a href={`tel:${TELEFONO_CENTRAL_HREF}`}>
            {TELEFONO_CENTRAL}
          </a>
        </article>

        <article className="contact-card">
          <span className="contact-card-icon">✉</span>
          <h2>Correo general</h2>
          <p>Información y soporte relacionado con Taxi Ceuta.</p>

          <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>
        </article>

        <article className="contact-card">
          <span className="contact-card-icon">🔒</span>
          <h2>Privacidad</h2>
          <p>Solicitudes de acceso, rectificación o eliminación de datos.</p>

          <a href={`mailto:${EMAIL_PRIVACIDAD}`}>{EMAIL_PRIVACIDAD}</a>
        </article>
      </div>
    </div>
  );
}

function BannerContacto() {
  return (
    <section className="container contact-panel">
      <div className="contact-copy">
        <span className="contact-kicker">Atención al cliente</span>
        <h2>¿Necesitas contactar con la central?</h2>

        <p>
          Puedes llamar o escribir para realizar consultas relacionadas con
          servicios de taxi u objetos perdidos.
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
  );
}

function PiePagina({ navegar }) {
  return (
    <footer className="footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <strong>Taxi Ceuta</strong>
          <p>
            Plataforma de gestión de servicios, taxistas y objetos perdidos.
          </p>
        </div>

        <nav className="footer-links" aria-label="Enlaces legales">
          <EnlaceInterno href="/" navegar={navegar}>
            Inicio
          </EnlaceInterno>

          <EnlaceInterno href="/objetos-perdidos" navegar={navegar}>
            Objetos perdidos
          </EnlaceInterno>

          <EnlaceInterno href="/privacidad" navegar={navegar}>
            Política de privacidad
          </EnlaceInterno>

          <EnlaceInterno href="/contacto" navegar={navegar}>
            Contacto
          </EnlaceInterno>
        </nav>
      </div>

      <div className="container footer-bottom">
        <span>© 2026 Taxi Ceuta. Todos los derechos reservados.</span>
        <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>
      </div>
    </footer>
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