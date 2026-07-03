import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";
import { Spinner } from "./ui";

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-8 w-8 text-brand-600" />
    </div>
  );
}

// Guards routes that require an authenticated user. When `roles` is provided,
// users whose role is not in the list are redirected to their own home.
export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const { session, role, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!role) return <Navigate to="/onboarding" replace />;
  if (roles && !roles.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />;
  }
  return <>{children}</>;
}

export function homeForRole(role: UserRole): string {
  switch (role) {
    case "farmer":
      return "/farmer";
    case "buyer":
      return "/marketplace";
    case "driver":
      return "/driver";
  }
}
