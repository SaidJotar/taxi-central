import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function LoginPage({ onLogin }) {
    const [modo, setModo] = useState("login");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        nombreCompleto: "",
        telefono: "",
        password: "",
        numeroTaxi: "",
        matricula: "",
        modelo: "",
        color: "",
    });

    const handleChange = (e) => {
        setForm((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const endpoint =
                modo === "login" ? `${API_URL}/auth/login` : `${API_URL}/auth/register`;

            const body =
                modo === "login"
                    ? {
                        telefono: form.telefono,
                        password: form.password,
                    }
                    : form;

            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error en la solicitud");
            }

            localStorage.setItem("taxista", JSON.stringify(data.taxista));
            window.location.href = `/?taxista=${data.taxista.id}`;
            onLogin(data.taxista);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
                    onClick={() =>
                        setModo((prev) => (prev === "login" ? "register" : "login"))
                    }
                >
                    {modo === "login"
                        ? "No tengo cuenta"
                        : "Ya tengo cuenta, iniciar sesión"}
                </button>
            </section>
        </main>
    );
}