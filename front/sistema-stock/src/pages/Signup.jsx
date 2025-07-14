import { useRef, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signup, getCurrentUserName } from "../api/auth";
import Dashboard from "./Dashboard";
import useAuth from "../hooks/useAuth";

const SignUp = () => {
  const { token } = useAuth();
  const [currentUserName, setCurrentUserName] = useState(null);
  const [serverError, setServerError] = useState('');
  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const refs = {
    name: useRef(null),
    surname: useRef(null),
    email: useRef(null),
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
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: false });
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
      await signup(form);
      navigate("/admin/users");
    } catch (error) {
      setServerError(error.message || "Ocurrió un error al crear el usuario.");
      console.error("Signup error:", error);
    }
  };

return (
  <Dashboard>
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow-sm border-0">
            <div className="card-body p-5">
              <h2 className="text-center mb-3 fw-bold text-dark">
                Hola {currentUserName || "Administrador"} 👋
              </h2>
              <p className="text-center mb-4 text-muted" style={{ fontSize: "0.95rem" }}>
                Estás por <strong>crear un nuevo usuario</strong> del sistema. Asegurate de ingresar todos los campos obligatorios.
              </p>

              {serverError && (
                <div className="alert alert-danger" role="alert">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {["name", "surname", "email"].map((field) => (
                  <div key={field} className="mb-3">
                    <label htmlFor={field} className="form-label">
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </label>
                    <input
                      id={field}
                      name={field}
                      type="text"
                      className={`form-control ${errors[field] ? "is-invalid" : ""}`}
                      placeholder={`Ingresar ${field}`}
                      onChange={handleChange}
                      value={form[field]}
                      ref={refs[field]}
                      autoComplete="off"
                    />
                    {errors[field] && (
                      <div className="invalid-feedback">
                        Debe completar este campo
                      </div>
                    )}
                  </div>
                ))}

                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Password</label>
                  <div className="input-group">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className={`form-control ${errors.password ? "is-invalid" : ""}`}
                      placeholder="Ingresar password"
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
                      {showPassword ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
                    </button>
                    {errors.password && (
                      <div className="invalid-feedback">
                        Debe completar este campo
                      </div>
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
                    Volver a la página
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
