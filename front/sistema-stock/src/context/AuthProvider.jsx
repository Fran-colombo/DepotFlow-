import { useState, useEffect } from 'react';
import AuthContext from './AuthContext';
import { jwtDecode } from 'jwt-decode'; 

export default function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        return {
          token,
          isAuthenticated: true,
          role: decoded.role,
          userId: decoded.user_id,
          email: decoded.sub
        };
      } catch (error) {
        console.error("Error decoding token:", error);
        localStorage.removeItem('authToken');
        return {
          token: null,
          isAuthenticated: false,
          role: null,
          userId: null,
          email: null
        };
      }
    }
    return {
      token: null,
      isAuthenticated: false,
      role: null,
      userId: null,
      email: null
    };
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const decoded = jwtDecode(token);
          setAuthState({
            token,
            isAuthenticated: true,
            role: decoded.role,
            userId: decoded.user_id,
            email: decoded.sub
          });
        } catch (error) {
          console.error("Error decoding token:", error);
          handleLogout();
        }
      } else {
        handleLogout();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
  if (!authState.token) return;

  const decoded = jwtDecode(authState.token);
  const exp = decoded.exp * 1000;
  const now = Date.now();

  if (exp < now) {
    handleLogout();
    return;
  }

  const timeoutId = setTimeout(() => {
    handleLogout();
  }, exp - now);

  return () => clearTimeout(timeoutId);
}, [authState.token]);


  const handleLogin = (token) => {
    localStorage.setItem('authToken', token);
    const decoded = jwtDecode(token);
    setAuthState({
      token,
      isAuthenticated: true,
      role: decoded.role,
      userId: decoded.user_id,
      email: decoded.sub
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setAuthState({
      token: null,
      isAuthenticated: false,
      role: null,
      userId: null,
      email: null,
      
    });
  };

  return (
    <AuthContext.Provider value={{ 
      ...authState,
      login: handleLogin,
      logout: handleLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
}