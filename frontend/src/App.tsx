import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute, homeForRole } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { FarmerDashboard } from "./pages/farmer/FarmerDashboard";
import { FarmerOrders } from "./pages/farmer/FarmerOrders";
import { Marketplace } from "./pages/marketplace/Marketplace";
import { MyOrders } from "./pages/marketplace/MyOrders";
import { PaymentCallback } from "./pages/marketplace/PaymentCallback";
import { DriverJobBoard } from "./pages/driver/DriverJobBoard";
import { DriverTrips } from "./pages/driver/DriverTrips";
import { Spinner } from "./components/ui";

// Sends an authenticated user to their role's home; otherwise to login.
function RootRedirect() {
  const { session, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!role) return <Navigate to="/onboarding" replace />;
  return <Navigate to={homeForRole(role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Farmer portal */}
          <Route
            element={
              <ProtectedRoute roles={["farmer"]}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/farmer" element={<FarmerDashboard />} />
            <Route path="/farmer/orders" element={<FarmerOrders />} />
          </Route>

          {/* Buyer marketplace */}
          <Route
            element={
              <ProtectedRoute roles={["buyer"]}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/orders" element={<MyOrders />} />
            <Route
              path="/marketplace/orders/payment-callback"
              element={<PaymentCallback />}
            />
          </Route>

          {/* Driver / logistics portal */}
          <Route
            element={
              <ProtectedRoute roles={["driver"]}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/driver" element={<DriverJobBoard />} />
            <Route path="/driver/trips" element={<DriverTrips />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
