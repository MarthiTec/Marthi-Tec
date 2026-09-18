import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PartnerSignupPage } from './pages/PartnerSignupPage';
import { TotemPage } from './pages/totem/TotemPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CustomersPage } from './pages/admin/CustomersPage';
import { StockPage } from './pages/admin/StockPage';
import { OrdersPage } from './pages/admin/OrdersPage';
import { FinancePage } from './pages/admin/FinancePage';
import { PosPage } from './pages/admin/PosPage';
import { ProfilePage } from './pages/admin/ProfilePage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/parceiro" element={<PartnerSignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/totem" element={<TotemPage />} />
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="pdv" element={<PosPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="estoque" element={<StockPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="perfil" element={<ProfilePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
