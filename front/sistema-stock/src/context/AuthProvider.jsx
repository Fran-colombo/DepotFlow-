import { useState, useEffect, useRef } from 'react';
import AuthContext from './AuthContext';
import { jwtDecode } from 'jwt-decode';
import { refreshSession } from '../api/auth';
import { setActivityListener } from '../sessionActivity'; 

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

  const lastActivity = useRef(0);
  const refreshing = useRef(false);

  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now();
      const token = localStorage.getItem("authToken");
      if (!token || refreshing.current) return;
      let exp = 0;
      try {
        exp = jwtDecode(token).exp * 1000;
      } catch {
        return;
      }
      if (exp - Date.now() > 5 * 60 * 1000) return;
      refreshing.current = true;
      refreshSession()
        .then((data) => {
          if (data?.access_token) handleLogin(data.access_token);
        })
        .catch(() => {})
        .finally(() => {
          refreshing.current = false;
        });
    };
    setActivityListener(mark);
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    return () => {
      setActivityListener(null);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  useEffect(() => {
    if (!authState.token) return;

    let decoded;
    try {
      decoded = jwtDecode(authState.token);
    } catch {
      handleLogout();
      return;
    }
    const exp = decoded.exp * 1000;
    const now = Date.now();

    if (exp < now) {
      handleLogout();
      return;
    }

    let logoutId = 0;
    const refreshId = setTimeout(async () => {
      const idle = Date.now() - lastActivity.current;
      const used = lastActivity.current > 0 && idle < 30 * 60 * 1000;
      if (used) {
        try {
          const data = await refreshSession();
          if (data?.access_token) {
            handleLogin(data.access_token);
            return;
          }
        } catch {
          /* el token sigue hasta que vence */
        }
      }
      const left = exp - Date.now();
      logoutId = setTimeout(() => handleLogout(), Math.max(0, left));
    }, Math.max(0, exp - now - 60 * 1000));

    return () => {
      clearTimeout(refreshId);
      clearTimeout(logoutId);
    };
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