import { Link, useNavigate } from "react-router-dom";

function getStoredUser() {
  const raw = localStorage.getItem("pms_user");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { email?: string };
  } catch (error) {
    return null;
  }
}

export default function Topbar() {
  const navigate = useNavigate();
  const user = getStoredUser();

  function handleLogout() {
    localStorage.removeItem("pms_access_token");
    localStorage.removeItem("pms_refresh_token");
    localStorage.removeItem("pms_user");
    navigate("/login");
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-sm text-dusk/80">
      <Link className="font-display text-lg font-semibold text-ink" to="/dashboard">
        Unlimited Bond
      </Link>
      <div className="flex items-center gap-4">
        <Link className="hover:text-ink" to="/dashboard">
          Dashboard
        </Link>
        <Link className="hover:text-ink" to="/projects">
          Projects
        </Link>
        <Link className="hover:text-ink" to="/clients">
          Clients
        </Link>
        <Link className="hover:text-ink" to="/suppliers">
          Suppliers
        </Link>
        <Link className="hover:text-ink" to="/crew">
          Crew
        </Link>
        <Link className="hover:text-ink" to="/talent">
          Talent
        </Link>
        <span className="text-xs text-dusk/70">{user?.email ?? ""}</span>
        <button className="text-sm font-semibold text-ink hover:text-dusk" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
