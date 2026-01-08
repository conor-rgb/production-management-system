import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Suppliers from "./pages/Suppliers";
import Crew from "./pages/Crew";
import Talent from "./pages/Talent";
import SupplierDetail from "./pages/SupplierDetail";
import CrewDetail from "./pages/CrewDetail";
import TalentDetail from "./pages/TalentDetail";
import ProtectedRoute from "./components/ProtectedRoute";
import Topbar from "./components/Topbar";
import { ToastProvider } from "./components/ToastProvider";

function PublicNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 text-sm text-dusk/80">
      <Link className="font-display text-lg font-semibold text-ink" to="/">
        Unlimited Bond
      </Link>
      <div className="flex items-center gap-4">
        <Link className="hover:text-ink" to="/">
          Overview
        </Link>
        <Link className="hover:text-ink" to="/login">
          Sign in
        </Link>
        <Link className="hover:text-ink" to="/reset-password">
          Reset
        </Link>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <PublicNav />
                <Home />
              </>
            }
          />
          <Route
            path="/login"
            element={
              <>
                <PublicNav />
                <Login />
              </>
            }
          />
          <Route
            path="/reset-password"
            element={
              <>
                <PublicNav />
                <ResetPassword />
              </>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Dashboard />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Projects />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <ProjectDetail />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Clients />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <ClientDetail />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Suppliers />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers/:supplierId"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <SupplierDetail />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/crew"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Crew />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/crew/:crewId"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <CrewDetail />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/talent"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <Talent />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/talent/:talentId"
            element={
              <ProtectedRoute>
                <>
                  <Topbar />
                  <TalentDetail />
                </>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </ToastProvider>
  );
}
