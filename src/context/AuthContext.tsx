import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode, useRef } from 'react';
import { UsuarioActual } from '../types';
import { supabase, supabaseConfigError } from '../lib/supabase';
import { api } from '../lib/apiClient';

interface AuthContextType {
  usuario: UsuarioActual | null;
  cargandoAuth: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

function isUsuarioActual(value: unknown): value is UsuarioActual {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.idUsuario === 'string' &&
    typeof v.nombre === 'string' &&
    (v.rol === 'ADMIN' || v.rol === 'EMPLEADO' || v.rol === 'CONTADOR')
  );
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hadSessionRef = useRef(false);

  const aplicarUsuarioActual = (usuarioActual: UsuarioActual | null) => {
    setUsuario(usuarioActual);
    if (usuarioActual) {
      localStorage.removeItem('lastRoute');
    }
  };

  const cargarUsuarioActual = async (): Promise<UsuarioActual | null> => {
    try {
      const me = await api.get<UsuarioActual>('/me');
      if (!isUsuarioActual(me)) {
        throw new Error('Respuesta invalida en /me.');
      }
      return me;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    let refreshCounter = 0;

    const refrescarUsuario = ({ showLoading }: { showLoading: boolean }) => {
      const currentRefresh = ++refreshCounter;
      if (showLoading) {
        setCargandoAuth(true);
      }

      void cargarUsuarioActual()
        .then((me) => {
          if (!mounted || currentRefresh !== refreshCounter) return;
          aplicarUsuarioActual(me);
        })
        .finally(() => {
        if (!mounted || currentRefresh !== refreshCounter) return;
          if (showLoading) {
            setCargandoAuth(false);
          }
        });
    };

    const refrescarUsuarioDiferido = ({ showLoading }: { showLoading: boolean }) => {
      window.setTimeout(() => {
        if (!mounted) return;
        refrescarUsuario({ showLoading });
      }, 0);
    };

    if (!supabase) {
      setUsuario(null);
      setError(supabaseConfigError ?? 'Supabase no esta configurado.');
      setCargandoAuth(false);
      return () => {
        mounted = false;
      };
    }

    
    const bootstrap = async () => {
      setCargandoAuth(true);
      const { data, error: sessionError } = await supabase.auth.getSession();
      hadSessionRef.current = !!data.session;
      if (!mounted) return;

      if (sessionError || !data.session) {
        setUsuario(null);
        setCargandoAuth(false);
        return;
      }

      refrescarUsuario({ showLoading: true });
    };

    
    

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const hasSession = !!session;
      console.log('Auth event:', event);

      if (event === 'SIGNED_OUT' || !session) {
        hadSessionRef.current = false;
        setUsuario(null);
        setError(null);
        setCargandoAuth(false);
        return;
      }

      // Evita deadlocks: nunca ejecutar flujo async/Supabase directamente
      // dentro del callback de onAuthStateChange.
      if (event === 'SIGNED_IN') {
        const isRealLoginTransition = !hadSessionRef.current && hasSession;
        hadSessionRef.current = true;

        if (isRealLoginTransition) {
          refrescarUsuarioDiferido({ showLoading: true }); // login real
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        refrescarUsuarioDiferido({ showLoading: false });
        return;
      }

      if (event === 'INITIAL_SESSION') {
        return;
      }

      refrescarUsuarioDiferido({ showLoading: false });
    });

    void bootstrap();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase no esta configurado.');
    }

    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (signInError) {
      throw new Error('Credenciales incorrectas. Verifica tu email y contrasena.');
    }

    try {
      const me = await cargarUsuarioActual();
      if (!me) {
        throw new Error('No se pudo cargar el perfil del usuario.');
      }
      aplicarUsuarioActual(me);
    } catch {
      await supabase.auth.signOut();
      throw new Error('No se pudo cargar el perfil del usuario.');
    }
  };

  const logout = async () => {
    setError(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUsuario(null);
    localStorage.removeItem('usuario');
    localStorage.removeItem('lastRoute');
  };

  const value = useMemo(
    () => ({
      usuario,
      cargandoAuth,
      login: async (email: string, pass: string) => {
        try {
          await login(email, pass);
        } catch (err: any) {
          setError(err?.message ?? 'No se pudo iniciar sesion.');
          throw err;
        }
      },
      logout,
      error,
    }),
    [usuario, cargandoAuth, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
