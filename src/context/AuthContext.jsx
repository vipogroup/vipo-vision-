import { useState, useCallback } from 'react';
import { AuthContext } from './AuthContextInstance.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('vipo_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((email, password) => {
    if (email && password) {
      const userData = {
        id: 'usr-001',
        name: 'David Cohen',
        email,
        role: 'admin',
        avatar: null,
      };
      setUser(userData);
      localStorage.setItem('vipo_user', JSON.stringify(userData));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('vipo_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}
