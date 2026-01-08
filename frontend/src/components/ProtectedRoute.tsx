import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("pms_access_token");
  const refreshToken = localStorage.getItem("pms_refresh_token");
  if (!token && !refreshToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
