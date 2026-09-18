import { useRef, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signup, getCurrentUserName } from "../api/auth";
import Dashboard from "./Dashboard";
import useAuth from "../hooks/useAuth";

const SignUp = () => {
  const { token } = useAuth();
  const [currentUserName, setCurrentUserName] = useState(null);
  const [serverError, setServerError] = useState("");
  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    phone: "",
    password: "",
    role: "user",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const refs = {
    name: useRef(null),
    surname: useRef(null),
    email: useRef(null),
    phone: useRef(null),
    password: useRef(null),
  };
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const data = await getCurrentUserName(token);
        setCurrentUserName(data);
      } catch (error) {
        console.error("Error al obtener nombre del usuario:", error.message);
      }
    };

    if (token) fetchUserName();
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: name === "email" ? value.toLowerCase() : value,
    });
    setErrors({ ...errors, [name]: false });
  };

  const handleShowPassword = () => setShowPassword(!showPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();

    let hasErrors = false;
    const newErrors = {};

    ["name", "surname", "email", "password"].forEach((field) => {
      if (!form[field]) {
        newErrors[field] = true;
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setErrors(newErrors);
      const firstErrorField = Object.keys(newErrors)[0];
      refs[firstErrorField].current.focus();
      return;
    }

    try {
      await signup({
        ...form,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
      });
      navigate("/admin/users");
    } catch (error) {
      setServerError(error.message || "Ocurrió un error al crear el usuario.");
      console.error("Signup error:", error);
    }
  };

  return (
    <Dashboard>
      <div className="container-fluid px-0 py-2 py-md-3">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6">
            <div className="card shadow-sm border-0">
              <div className="card-body p-3 p-md-5">
                <h2 className="text-center mb-3 fw-bold text-dark">
                  Hola {currentUserName || "Administrador"}
                </h2>
                <p className="text-center mb-4 text-muted" style={{ fontSize: "0.95rem" }}>
                  Estás por <strong>crear un nuevo usuario</strong> del sistema.
                </p>

                {serverError && (
                  <div className="alert alert-danger" role="alert">
                    {serverError}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {["name", "surname", "email", "phone"].map((field) => (
                    <div key={field} className="mb-3">
                      <label htmlFor={field} className="form-label">
                        {field === "name"
                          ? "Nombre"
                          : field === "surname"
                            ? "Apellido"
                            : field === "email"
                              ? "Email"
                              : "Teléfono WhatsApp (opcional)"}
                      </label>
                      <input
                        id={field}
                        name={field}
                        type={field === "phone" ? "tel" : "text"}
                        className={`form-control ${errors[field] ? "is-invalid" : ""}`}
                        placeholder={
                          field === "phone"
                            ? "+54 9 11 1234-5678"
                            : `Ingresar ${field}`
                        }
                        onChange={handleChange}
                        value={form[field]}
                        ref={refs[field]}
                        autoComplete="off"
                      />
                      {field === "phone" && (
                        <div className="form-text">
                          Un número por usuario. Se guarda como +54 9 …
                        </div>
                      )}
                      {errors[field] && (
                        <div className="invalid-feedback">Debe completar este campo</div>
                      )}
                    </div>
                  ))}

                  <div className="mb-3">
                    <label htmlFor="role" className="form-label">
                      Rol
                    </label>
                    <select
                      id="role"
                      name="role"
                      className="form-select"
                      value={form.role}
                      onChange={handleChange}
                    >
                      <option value="user">Usuario</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="password" className="form-label">
                      Password
                    </label>
                    <div className="input-group">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        className={`form-control ${errors.password ? "is-invalid" : ""}`}
                        placeholder="Ingresar contraseña"
                        onChange={handleChange}
                        value={form.password}
                        ref={refs.password}
                        autoComplete="new-password"
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={handleShowPassword}
                      >
                        {showPassword ? (
                          <i className="bi bi-eye-slash" />
                        ) : (
                          <i className="bi bi-eye" />
                        )}
                      </button>
                      {errors.password && (
                        <div className="invalid-feedback">Debe completar este campo</div>
                      )}
                    </div>
                  </div>

                  <div className="d-grid mt-4">
                    <button type="submit" className="btn btn-primary fw-bold">
                      Crear cuenta
                    </button>
                  </div>
                </form>

                <div className="text-center mt-4">
                  <p className="mb-0 text-muted" style={{ fontSize: "0.9rem" }}>
                    <Link to="/admin/users" className="text-decoration-none">
                      Volver a Gestión usuarios
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dashboard>
  );
};

export default SignUp;
