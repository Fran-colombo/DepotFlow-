import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import useAuth from '../hooks/useAuth';
import logoConkreto from '../assets/logo-conkreto.png';

function LoginPage() {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleShowPassword = () => {
    setShowPassword(prev => !prev);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { access_token } = await login(formData);
      authLogin(access_token);
      navigate('/');
    } catch (err) {
      const message = err?.response?.data?.detail || err.message || 'Error de autenticación';
      setError(typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{
        background: "url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYkFvWRRoSpdvSHWgcAIWJmIv8S7u3YYjEUw&s') no-repeat center center",
        backgroundSize: 'cover'
      }}
    >
      <div className="bg-white rounded shadow-lg p-4" style={{ maxWidth: 420, width: '100%' }}>
        <div className="text-center mb-4">
          <img src={logoConkreto} alt="Logo Conkreto" style={{ maxWidth: 200 }} /> 
          <h4 className="mt-3 fw-bold">Gestor de Inventario</h4>
          <p className="text-muted">Conkreto Construcciones STL</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3">
            {error}
          </div>
        )}

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
                onClick={handleShowPassword}
                tabIndex={-1}
              >
                {showPassword ? (
                  <i className="bi bi-eye-slash"></i>
                ) : (
                  <i className="bi bi-eye"></i>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={loading}
          >
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

export default LoginPage;
