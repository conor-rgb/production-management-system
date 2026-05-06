import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Email from "./pages/Email";
import Opportunities from "./pages/Opportunities";
import Productions from "./pages/Productions";
import Budgets from "./pages/Budgets";
import Contacts from "./pages/Contacts";
import Files from "./pages/Files";
import SettingsPage from "./pages/SettingsPage";

function AuthedRoutes() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="email" element={<Email />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="productions" element={<Productions />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="files" element={<Files />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AuthedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
