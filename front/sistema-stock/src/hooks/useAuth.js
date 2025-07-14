import { useContext } from "react";
import AuthContext from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function useAuth() {
  const context = useContext(AuthContext);
  const navigate = useNavigate();

  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }

  const login = (token) => {
    context.login(token);
  };

  const logout = () => {
    context.logout();
    navigate('/login');
  };

  return { 
    ...context,
    login,
    logout
  };
}