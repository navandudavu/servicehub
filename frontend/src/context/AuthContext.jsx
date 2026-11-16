import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { storeSession, clearSession, endSession } from '../api/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('servicehub_token');
    const refresh = localStorage.getItem('servicehub_refresh');
    if (!token && !refresh) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch((err) => { if (err?.status === 401) clearSession(); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, refreshToken, user } = await api.login(email, password);
    storeSession(token, refreshToken);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    endSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
