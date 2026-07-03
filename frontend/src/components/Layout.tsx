import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";
import { titleCase } from "../lib/format";

interface NavItem {
  to: string;
  label: string;
}

const navByRole: Record<UserRole, NavItem[]> = {
  farmer: [
    { to: "/farmer", label: "Dashboard" },
    { to: "/farmer/orders", label: "Orders & Deliveries" },
  ],
  buyer: [
    { to: "/marketplace", label: "Marketplace" },
    { to: "/marketplace/orders", label: "My Orders" },
  ],
  driver: [
    { to: "/driver", label: "Job Board" },
    { to: "/driver/trips", label: "My Trips" },
  ],
};

function LeafMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900">
        AgriTech
      </span>
    </div>
  );
}

export function Layout() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const items = role ? navByRole[role] : [];

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-8">
            <LeafMark />
            <nav className="hidden items-center gap-1 sm:flex">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/farmer" || item.to === "/driver"}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">
                {profile?.full_name ?? "Account"}
              </p>
              <p className="text-xs text-slate-500">
                {role ? titleCase(role) : "—"}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/farmer" || item.to === "/driver"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
