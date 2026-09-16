import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Actions = lazy(() => import("./pages/Actions"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Email = lazy(() => import("./pages/Email"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const Productions = lazy(() => import("./pages/Productions"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const Budgets = lazy(() => import("./pages/Budgets"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Files = lazy(() => import("./pages/Files"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SelectsPortal = lazy(() => import("./components/selects/SelectsPortal"));

function RouteFallback() {
  return <div className="grid min-h-screen place-items-center bg-[#f8f7f2] text-sm text-gray-500">Loading...</div>;
}

function AuthedRoutes() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="actions" element={<Actions />} />
            <Route path="receipts" element={<Dashboard />} />
            <Route path="email" element={<Email />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="productions" element={<Productions />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="files" element={<Files />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/selects/review/:token" element={<PublicSelectsReview />} />
            <Route path="/*" element={<AuthedRoutes />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

function PublicSelectsReview() {
  const token = window.location.pathname.split("/").filter(Boolean).at(-1);
  if (!token) return null;
  return <SelectsPortal reviewToken={token} />;
}
