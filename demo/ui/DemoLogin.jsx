import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import useAuth from '../hooks/useAuth';
import logoConkreto from '../assets/logo-conkreto.png';
import warehouseBg from '../assets/demo/warehouse-login-bg.jpg';

const DEMO_USERS = {
  admin: {
    label: 'Administrador',
    username: 'demo.admin@example.com',
    password: 'Demo123!',
  },
  user: {
    label: 'Usuario',
    username: 'demo.user@example.com',
    password: 'Demo123!',
  },
};

function DemoLoginPage() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const submitCredentials = async (username, password) => {
    setLoading(true);
    setError('');

    try {
      const { access_token } = await login({ username, password });
      authLogin(access_token);
      navigate('/');
    } catch (err) {
      const message = err?.response?.data?.detail || err.message || 'Error de autenticación';
      setError(typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitCredentials(formData.username, formData.password);
  };

  const handleDemoLogin = async (role) => {
    const creds = DEMO_USERS[role];
    setFormData({ username: creds.username, password: creds.password });
    await submitCredentials(creds.username, creds.password);
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center p-3 position-relative overflow-hidden"
      style={{
        backgroundColor: '#0f172a',
        backgroundImage: `
          linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 64, 175, 0.72) 100%),
          url(${warehouseBg})
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="rounded-4 shadow-lg p-4 border-0"
        style={{
          maxWidth: 440,
          width: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div className="text-center mb-3">
          <img src={logoConkreto} alt="Logo Conkreto" style={{ maxWidth: 180 }} />
          <h4 className="mt-3 fw-bold mb-1 text-dark">Gestor de Inventario</h4>
          <p className="text-muted small mb-0">Conkreto Construcciones STL</p>
        </div>

        <div className="alert alert-warning py-2 px-3 small text-center border-0">
          <strong>Entorno DEMO</strong> — Datos ficticios para evaluación
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 mt-3">
            {error}
          </div>
        )}

        <p className="text-muted small text-center mb-2 mt-3">
          Acceso rápido con cuentas de prueba:
        </p>
        <div className="d-grid gap-2 mb-3">
          <button
            type="button"
            className="btn btn-outline-primary"
            disabled={loading}
            onClick={() => handleDemoLogin('admin')}
          >
            {loading ? 'Iniciando...' : 'Entrar como Admin'}
            <span className="d-block small fw-normal text-muted">
              demo.admin@example.com
            </span>
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={loading}
            onClick={() => handleDemoLogin('user')}
          >
            {loading ? 'Iniciando...' : 'Entrar como Usuario'}
            <span className="d-block small fw-normal text-muted">
              demo.user@example.com
            </span>
          </button>
        </div>

        <div className="text-center text-muted small mb-2">o ingresá manualmente</div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="username" className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="password" className="form-label">Contraseña</label>
            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <i className="bi bi-eye-slash"></i>
                ) : (
                  <i className="bi bi-eye"></i>
                )}
              </button>
            </div>
            <div className="form-text">Contraseña demo: Demo123!</div>
          </div>

          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Iniciando...
              </>
            ) : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default DemoLoginPage;
