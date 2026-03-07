import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { TelemetryProvider } from './context/TelemetryContext';
import { UIZoomProvider } from './context/UIZoomContext';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CamerasPage from './pages/CamerasPage';
import CameraPlayerPage from './pages/CameraPlayerPage';
import RecordingsPage from './pages/RecordingsPage';
import EventsPage from './pages/EventsPage';
import SettingsPage from './pages/SettingsPage';
import DiscoverCamerasPage from './pages/DiscoverCamerasPage';
import { cameraStore } from './stores/cameraStore';
import UpdateNotifier from './components/UpdateNotifier';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cameras" element={<CamerasPage />} />
        <Route path="/camera/:id" element={<CameraPlayerPage />} />
        <Route path="/recordings" element={<RecordingsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/discover" element={<DiscoverCamerasPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    cameraStore.loadCameras();
  }, []);

  return (
    <>
      <UpdateNotifier />
      <HashRouter>
        <AuthProvider>
          <TelemetryProvider>
            <UIZoomProvider>
              <LanguageProvider>
                <AppRoutes />
              </LanguageProvider>
            </UIZoomProvider>
          </TelemetryProvider>
        </AuthProvider>
      </HashRouter>
    </>
  );
}
