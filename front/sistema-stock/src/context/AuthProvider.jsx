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
  const loginRef = useRef(null);
  const logoutRef = useRef(null);

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

  loginRef.current = handleLogin;
  logoutRef.current = handleLogout;

  useEffect(() => {
    const idleLimit = 30 * 60 * 1000;
    const renewWithin = 10 * 60 * 1000;
    const grace = 2 * 60 * 1000;

    const maybeExtend = async () => {
      const token = localStorage.getItem("authToken");
      if (!token || refreshing.current) return;
      let exp = 0;
      try {
        exp = jwtDecode(token).exp * 1000;
      } catch {
        logoutRef.current?.();
        return;
      }
      const now = Date.now();
      const active = lastActivity.current > 0 && now - lastActivity.current < idleLimit;
      if (lastActivity.current > 0 && !active) {
        logoutRef.current?.();
        return;
      }
      const expired = exp <= now;
      if (expired && (!active || now - exp >= grace)) {
        logoutRef.current?.();
        return;
      }
      if (!active || exp - now > renewWithin) return;
      refreshing.current = true;
      try {
        const data = await refreshSession();
        if (data?.access_token) loginRef.current?.(data.access_token);
        else if (Date.now() >= exp) logoutRef.current?.();
      } catch {
        if (Date.now() >= exp) logoutRef.current?.();
      } finally {
        refreshing.current = false;
      }
    };

    const mark = () => {
      const now = Date.now();
      if (lastActivity.current > 0 && now - lastActivity.current >= idleLimit) {
        logoutRef.current?.();
        return;
      }
      lastActivity.current = now;
      maybeExtend();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeExtend();
    };

    setActivityListener(mark);
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(maybeExtend, 60 * 1000);
    maybeExtend();

    return () => {
      setActivityListener(null);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, []);

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