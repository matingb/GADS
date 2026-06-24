import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { RolUsuario } from '../types';

interface ProtectedRouteProps {
  children: ReactNode;
  roles: RolUsuario[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { usuario, cargandoAuth } = useAuth();

  if (cargandoAuth) {
    return <div className="p-8 text-gray-600">Cargando sesion...</div>;
  }

  if (!usuario) return <Navigate to="/login" replace />;

  if (!roles.includes(usuario.rol)) {
    const destino =
      usuario.rol === 'ADMIN'
        ? '/dashboard'
        : usuario.rol === 'EMPLEADO'
          ? '/terminal'
          : usuario.rol === 'CONTADOR'
            ? '/cierres'
            : '/login';
    return <Navigate to={destino} replace />;
  }

  return <>{children}</>;
}
