import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function LoginPage({ onLogin }) {
    const [modo, setModo] = useState("login"); // login | register | verify
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [form, setForm] = useState({
        nombreCompleto: "",
        telefono: "",
        password: "",
        numeroTaxi: "",
        matricula: "",
        modelo: "",
        color: "",
    });

    const [codigo, setCodigo] = useState("");
    const [telefonoPendiente, setTelefonoPendiente] = useState("");

    const handleChange = (e) => {
        setForm((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleLogin = async () => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                telefono: form.telefono,
                password: form.password,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Error al iniciar sesión");
        }

        localStorage.setItem("taxista", JSON.stringify(data.taxista));
        onLogin(data.taxista);
        window.location.href = `/?taxista=${data.taxista.id}`;
    };

    const handleRegister = async () => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(form),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Error en el registro");
        }

        setTelefonoPendiente(form.telefono);
        setModo("verify");
        setSuccess(data.message || "Te hemos enviado un código por SMS");
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/verify-phone`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    telefono: telefonoPendiente,
                    codigo,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Código incorrecto");
            }

            localStorage.setItem("taxista", JSON.stringify(data.taxista));
            onLogin(data.taxista);
            window.location.href = `/?taxista=${data.taxista.id}`;
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/resend-code`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    telefono: telefonoPendiente,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "No se pudo reenviar el código");
            }

            setSuccess(data.message || "Código reenviado");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            if (modo === "login") {
                await handleLogin();
            } else if (modo === "register") {
                await handleRegister();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (modo === "verify") {
        return (
            <main className="app-shell">
                <section className="app-card">
                    <h1 className="app-title">Verifica tu teléfono</h1>

                    <p className="app-subtitle">
                        Hemos enviado un código SMS al número <strong>{telefonoPendiente}</strong>
                    </p>

                    <form className="login-form" onSubmit={handleVerify}>
                        <input
                            name="codigo"
                            placeholder="Introduce el código"
                            value={codigo}
                            onChange={(e) => setCodigo(e.target.value)}
                        />

                        {error && <p className="form-error">{error}</p>}
                        {success && <p className="form-success">{success}</p>}

                        <button type="submit" className="activo" disabled={loading}>
                            {loading ? "Verificando..." : "Verificar teléfono"}
                        </button>
                    </form>

                    <button
                        className="modo-switch"
                        type="button"
                        onClick={handleResendCode}
                        disabled={loading}
                    >
                        Reenviar código
                    </button>

                    <button
                        className="modo-switch"
                        type="button"
                        onClick={() => {
                            setModo("register");
                            setCodigo("");
                            setError("");
                            setSuccess("");
                        }}
                    >
                        Volver al registro
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="app-shell">
            <section className="app-card">
                <h1 className="app-title">
                    {modo === "login" ? "Iniciar sesión" : "Registro de taxista"}
                </h1>

                <p className="app-subtitle">
                    {modo === "login"
                        ? "Accede con tu teléfono y contraseña"
                        : "Crea tu cuenta y tu vehículo"}
                </p>

                <form className="login-form" onSubmit={handleSubmit}>
                    {modo === "register" && (
                        <input
                            name="nombreCompleto"
                            placeholder="Nombre completo"
                            value={form.nombreCompleto}
                            onChange={handleChange}
                        />
                    )}

                    <input
                        name="telefono"
                        placeholder="Teléfono"
                        value={form.telefono}
                        onChange={handleChange}
                    />

                    <input
                        name="password"
                        type="password"
                        placeholder="Contraseña"
                        value={form.password}
                        onChange={handleChange}
                    />

                    {modo === "register" && (
                        <>
                            <input
                                name="numeroTaxi"
                                placeholder="Número de taxi"
                                value={form.numeroTaxi}
                                onChange={handleChange}
                            />
                            <input
                                name="matricula"
                                placeholder="Matrícula"
                                value={form.matricula}
                                onChange={handleChange}
                            />
                            <input
                                name="modelo"
                                placeholder="Modelo"
                                value={form.modelo}
                                onChange={handleChange}
                            />
                            <input
                                name="color"
                                placeholder="Color"
                                value={form.color}
                                onChange={handleChange}
                            />
                        </>
                    )}

                    {error && <p className="form-error">{error}</p>}
                    {success && <p className="form-success">{success}</p>}

                    <button type="submit" className="activo" disabled={loading}>
                        {loading
                            ? "Cargando..."
                            : modo === "login"
                                ? "Entrar"
                                : "Registrarme"}
                    </button>
                </form>

                <button
                    className="modo-switch"
                    type="button"
                    onClick={() => {
                        setModo((prev) => (prev === "login" ? "register" : "login"));
                        setError("");
                        setSuccess("");
                    }}
                >
                    {modo === "login"
                        ? "No tengo cuenta"
                        : "Ya tengo cuenta, iniciar sesión"}
                </button>
            </section>
        </main>
    );
}