import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import type { Permission } from './lib/shared';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { SignupPage } from './pages/auth/SignupPage';
import { ClientDetailPage } from './pages/clients/ClientDetailPage';
import { ClientFormPage } from './pages/clients/ClientFormPage';
import { ClientsPage } from './pages/clients/ClientsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EnterpriseDetailPage } from './pages/enterprises/EnterpriseDetailPage';
import { EnterpriseFormPage } from './pages/enterprises/EnterpriseFormPage';
import { EnterprisesPage } from './pages/enterprises/EnterprisesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrganizationsPage } from './pages/platform/OrganizationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { UsersPage } from './pages/users/UsersPage';

function FullScreenLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Bloqueia a rota se faltar permissão (a API também valida; isto só evita telas inúteis). */
function Guard({ permissions = [], platform, children }: { permissions?: Permission[]; platform?: boolean; children: ReactNode }) {
  const { can, me } = useAuth();
  if (platform && !me?.user.isPlatformAdmin) return <NotFoundPage />;
  if (!can(...permissions)) return <NotFoundPage />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/cadastro" element={<PublicOnly><SignupPage /></PublicOnly>} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<Guard permissions={['clients.read']}><ClientsPage /></Guard>} />
        <Route path="clientes/novo" element={<Guard permissions={['clients.write']}><ClientFormPage /></Guard>} />
        <Route path="clientes/:id" element={<Guard permissions={['clients.read']}><ClientDetailPage /></Guard>} />
        <Route path="clientes/:id/editar" element={<Guard permissions={['clients.write']}><ClientFormPage /></Guard>} />
        <Route path="empreendimentos" element={<Guard permissions={['enterprises.read']}><EnterprisesPage /></Guard>} />
        <Route path="empreendimentos/novo" element={<Guard permissions={['enterprises.write']}><EnterpriseFormPage /></Guard>} />
        <Route path="empreendimentos/:id" element={<Guard permissions={['enterprises.read']}><EnterpriseDetailPage /></Guard>} />
        <Route path="empreendimentos/:id/editar" element={<Guard permissions={['enterprises.write']}><EnterpriseFormPage /></Guard>} />
        <Route path="usuarios" element={<Guard permissions={['users.read']}><UsersPage /></Guard>} />
        <Route path="plataforma/organizacoes" element={<Guard platform><OrganizationsPage /></Guard>} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
