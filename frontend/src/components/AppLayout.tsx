import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Mail,
  TrendingUp,
  Film,
  CalendarDays,
  DollarSign,
  Users,
  FolderOpen,
  Settings,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/email", icon: Mail, label: "Email" },
  { to: "/opportunities", icon: TrendingUp, label: "Opportunities" },
  { to: "/productions", icon: Film, label: "Productions" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/budgets", icon: DollarSign, label: "Budgets" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/files", icon: FolderOpen, label: "Files" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const mobileMainItems = navItems.slice(0, 4);

function SidebarItem({
  to,
  icon: Icon,
  label,
  badge,
  exact,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  exact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact ?? to === "/"}
      title={label}
      className={({ isActive }) =>
        `relative flex items-center justify-center w-full h-12 rounded-lg transition-colors ${
          isActive
            ? "bg-gray-700 text-white"
            : "text-gray-400 hover:bg-gray-800 hover:text-white"
        }`
      }
    >
      <Icon size={20} />
      {Boolean(badge) && (
        <span className="absolute right-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-900">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export default function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [emailUnread, setEmailUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadUnread() {
      try {
        const data = await api.get<{ count: number }>("/api/email/unread-count");
        if (mounted) setEmailUnread(data.count);
      } catch {
        if (mounted) setEmailUnread(0);
      }
    }
    loadUnread();
    const timer = window.setInterval(loadUnread, 60_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col items-center w-13 bg-gray-900 py-3 gap-1 shrink-0">
        {navItems.map((item) => (
          <SidebarItem key={item.to} {...item} badge={item.to === "/email" ? emailUnread : undefined} />
        ))}
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex items-center justify-center w-full h-12 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={20} />
        </button>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 flex items-center border-t border-gray-800 z-50">
        {mobileMainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
                isActive ? "text-white" : "text-gray-400"
              }`
            }
          >
            <span className="relative">
              <item.icon size={20} />
              {item.to === "/email" && Boolean(emailUnread) && (
                <span className="absolute -right-2 -top-2 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-gray-900">{emailUnread}</span>
              )}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* More menu */}
        <div className="flex-1 relative">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className="w-full flex flex-col items-center py-2 gap-0.5 text-xs text-gray-400"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>

          {moreOpen && (
            <div className="absolute bottom-full right-0 mb-1 w-44 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
              {navItems.slice(4).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      isActive ? "text-white bg-gray-700" : "text-gray-300 hover:bg-gray-700"
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 transition-colors border-t border-gray-700"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
