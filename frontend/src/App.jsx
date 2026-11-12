import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Customers from './pages/Customers';
import Team from './pages/Team';
import NalozList from './pages/NalozList';
import NalogNew from './pages/NalogNew';
import NalogDetail from './pages/NalogDetail';
import NalogEdit from './pages/NalogEdit';
import NalogPrintPage from './pages/NalogPrintPage';
import Reports from './pages/Reports';
import Parts from './pages/Parts';
import { isAdminLevel, isOwner } from './context/roles';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!isAdminLevel(user?.role)) return <Navigate to="/" replace />;
  return children;
}

// The Tim tab (accounts, roles, passwords) is for admins only; a manager is sent home.
function RequireOwner({ children }) {
  const { user } = useAuth();
  if (!isOwner(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <RequireAuth><Layout><Dashboard /></Layout></RequireAuth>
      } />
      <Route path="/nalozi" element={
        <RequireAuth><Layout><NalozList /></Layout></RequireAuth>
      } />
      <Route path="/nalozi/new" element={
        <RequireAuth><RequireAdmin><Layout><NalogNew /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/nalozi/:id" element={
        <RequireAuth><Layout><NalogDetail /></Layout></RequireAuth>
      } />
      <Route path="/nalozi/:id/edit" element={
        <RequireAuth><Layout><NalogEdit /></Layout></RequireAuth>
      } />
      <Route path="/nalozi/:id/print" element={
        <RequireAuth><NalogPrintPage /></RequireAuth>
      } />
      <Route path="/calendar" element={
        <RequireAuth><Layout><Calendar /></Layout></RequireAuth>
      } />
      <Route path="/customers" element={
        <RequireAuth><Layout><Customers /></Layout></RequireAuth>
      } />
      <Route path="/parts" element={
        <RequireAuth><RequireAdmin><Layout><Parts /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/reports" element={
        <RequireAuth><RequireAdmin><Layout><Reports /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/team" element={
        <RequireAuth><RequireOwner><Layout><Team /></Layout></RequireOwner></RequireAuth>
      } />
    </Routes>
  );
}

