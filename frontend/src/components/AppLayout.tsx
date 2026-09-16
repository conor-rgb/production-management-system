import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { ElementType } from "react";
import {
  LayoutDashboard,
  CheckSquare,
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
import { useState } from "react";
import CommandMenu from "./CommandMenu";
import { useEmailUnreadCount } from "../hooks/useEmailUnreadCount";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/productions", icon: Film, label: "Projects" },
  { to: "/contacts", icon: Users, label: "People" },
  { to: "/budgets", icon: DollarSign, label: "Finance" },
  { to: "/files", icon: FolderOpen, label: "Files & exports" },
  { to: "/actions", icon: CheckSquare, label: "Actions" },
  { to: "/opportunities", icon: TrendingUp, label: "Enquiries" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/email", icon: Mail, label: "Email" },
  { to: "/receipts", icon: DollarSign, label: "Receipts & reporting" },
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
  icon: ElementType;
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
        `relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
          isActive
            ? "bg-stone-200/60 text-stone-950"
            : "text-stone-500 hover:bg-stone-200/40 hover:text-stone-950"
        }`
      }
    >
      <Icon size={18} />
      <span className="truncate">{label}</span>
      {Boolean(badge) && (
        <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-900">
          {badge && badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export default function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const emailUnread = useEmailUnreadCount();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-[#fafaf8] overflow-hidden">
      {/* Desktop sidebar */}
      <nav className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-[#f4f4f0] px-3 py-6 md:flex">
        <div className="mb-3 px-3 py-2">
          <p className="text-lg font-semibold tracking-tight text-stone-900">unlimited.bond<span className="text-emerald-700">®</span></p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">Production workspace</p>
        </div>
        <CommandMenu />
        <div className="mt-5 flex flex-col gap-1 overflow-auto">
          {navItems.map((item) => (
            <div key={item.to} className={item.to === "/actions" ? "mt-5 border-t border-stone-200 pt-4" : ""}><SidebarItem {...item} badge={item.to === "/email" ? emailUnread : undefined} /></div>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </nav>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-stone-200 p-2 md:hidden"><CommandMenu /></div>
        <main className="min-h-0 flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#f4f4f0] flex items-center border-t border-stone-200 z-50">
        {mobileMainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
                isActive ? "text-stone-950" : "text-stone-500"
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
