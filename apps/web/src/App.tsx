import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { TotemPage } from './pages/totem/TotemPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/painel" element={<PanelPage />} />
        <Route path="/totem" element={<TotemPage />} />
      </Routes>
    </AuthProvider>
  );
}
