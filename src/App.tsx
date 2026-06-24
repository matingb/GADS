/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { Users, Clock, FileText, Settings, LayoutDashboard, LogOut, FileSpreadsheet, CalendarClock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect } from 'react';
import TerminalEmpleado from './pages/TerminalEmpleado';
import AdminFichadas from './pages/AdminFichadas';
import Login from './pages/Login';
import AdminEmpleados from './pages/AdminEmpleados';
import AdminHorarios from './pages/AdminHorarios';
import DetalleEmpleado from './pages/DetalleEmpleado';
import AdminNovedades from './pages/AdminNovedades';
import MisFichadas from './pages/MisFichadas';
import CierresMensuales from './pages/CierresMensuales';
import Configuracion from './pages/Configuracion';
import PreLiquidacion from './pages/PreLiquidacion';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '/login') {
      localStorage.setItem('lastRoute', location.pathname);
    }
  }, [location]);

  return null;
}

function Sidebar() {
  const { usuario, logout } = useAuth();

  if (!usuario) return null;

  return (
    <div className="w-64 bg-gray-900 text-white h-screen flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold">Gestion Pymes</h1>
        <p className="text-sm text-gray-400">Novedades y Horarios</p>
      </div>

      <div className="px-6 py-4 mb-4 bg-gray-800/50 border-y border-gray-800">
        <p className="text-sm font-medium text-white">{usuario.nombre}</p>
        <p className="text-xs text-gray-400">{usuario.rol}</p>
        {usuario.legajo && <p className="text-xs text-blue-400 mt-1 font-mono">Legajo: {usuario.legajo}</p>}
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {usuario.rol === 'ADMIN' && (
          <>
            <Link to="/dashboard" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <LayoutDashboard size={20} />
              Dashboard
            </Link>
            <Link to="/empleados" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <Users size={20} />
              Empleados
            </Link>
            <Link to="/horarios" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <CalendarClock size={20} />
              Horarios
            </Link>
            <Link to="/fichadas" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <Clock size={20} />
              Fichadas
            </Link>
            <Link to="/novedades" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <FileText size={20} />
              Novedades
            </Link>
            <Link to="/pre-liquidacion" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <FileSpreadsheet size={20} />
              Cierre Mensual
            </Link>
            <Link to="/configuracion" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <Settings size={20} />
              Configuracion
            </Link>
          </>
        )}
        {usuario.rol === 'EMPLEADO' && (
          <>
            <Link to="/terminal" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <Clock size={20} />
              Terminal Reloj
            </Link>
            <Link to="/mis-fichadas" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <FileText size={20} />
              Mis Fichadas
            </Link>
          </>
        )}
        {usuario.rol === 'CONTADOR' && (
          <>
            <Link to="/cierres" className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
              <FileText size={20} />
              Cierres Mensuales
            </Link>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={() => {
            void logout();
          }}
          className="flex items-center gap-3 px-4 py-3 w-full text-left text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          Cerrar Sesion
        </button>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { usuario, cargandoAuth } = useAuth();

  if (cargandoAuth) {
    return <div className="p-8 text-gray-600">Cargando sesion...</div>;
  }

  if (!usuario) return <Navigate to="/login" replace />;

  const lastRoute = localStorage.getItem('lastRoute');
  if (lastRoute && lastRoute !== '/' && lastRoute !== '/login') {
    return <Navigate to={lastRoute} replace />;
  }

  if (usuario.rol === 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (usuario.rol === 'EMPLEADO') return <Navigate to="/terminal" replace />;
  if (usuario.rol === 'CONTADOR') return <Navigate to="/cierres" replace />;

  return <Navigate to="/login" replace />;
}

function AuthenticatedShell() {
  const { usuario, cargandoAuth } = useAuth();

  if (cargandoAuth) {
    return <div className="p-8 text-gray-600">Cargando sesion...</div>;
  }

  if (!usuario) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute roles={['ADMIN']}><Dashboard /></ProtectedRoute>} />
            <Route path="/empleados" element={<ProtectedRoute roles={['ADMIN']}><AdminEmpleados /></ProtectedRoute>} />
            <Route path="/empleados/:id" element={<ProtectedRoute roles={['ADMIN']}><DetalleEmpleado /></ProtectedRoute>} />
            <Route path="/horarios" element={<ProtectedRoute roles={['ADMIN']}><AdminHorarios /></ProtectedRoute>} />
            <Route path="/fichadas" element={<ProtectedRoute roles={['ADMIN']}><AdminFichadas /></ProtectedRoute>} />
            <Route path="/novedades" element={<ProtectedRoute roles={['ADMIN']}><AdminNovedades /></ProtectedRoute>} />
            <Route path="/pre-liquidacion" element={<ProtectedRoute roles={['ADMIN']}><PreLiquidacion /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute roles={['ADMIN']}><Configuracion /></ProtectedRoute>} />

            <Route path="/terminal" element={<ProtectedRoute roles={['EMPLEADO', 'ADMIN']}><div className="p-8"><TerminalEmpleado /></div></ProtectedRoute>} />
            <Route path="/mis-fichadas" element={<ProtectedRoute roles={['EMPLEADO']}><MisFichadas /></ProtectedRoute>} />

            <Route path="/cierres" element={<ProtectedRoute roles={['CONTADOR', 'ADMIN']}><CierresMensuales /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AppContent() {
  return (
    <Router>
      <RouteTracker />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<AuthenticatedShell />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
