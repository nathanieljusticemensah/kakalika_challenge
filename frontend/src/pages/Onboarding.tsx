import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { homeForRole } from "../components/ProtectedRoute";
import { Alert, Button, Field, Input, Select, Spinner } from "../components/ui";
import {
  DEFAULT_LOCATION,
  LocationPicker,
  type LatLngValue,
} from "../components/LocationPicker";
import type { UserRole } from "../types";

// PostGIS geography literal that PostgREST accepts on insert.
function ewkt(loc: LatLngValue): string {
  return `SRID=4326;POINT(${Number(loc.lng)} ${Number(loc.lat)})`;
}

export function Onboarding() {
  const { profile, role, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<UserRole>("farmer");
  const [fullName, setFullName] = useState("");
  const [region, setRegion] = useState("");
  const [location, setLocation] = useState<LatLngValue>(DEFAULT_LOCATION);
  const [vehicleType, setVehicleType] = useState("tricycle");
  const [capacity, setCapacity] = useState("500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already onboarded → straight to the dashboard.
  useEffect(() => {
    if (!loading && role) navigate(homeForRole(role), { replace: true });
  }, [loading, role, navigate]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if (profile?.region) setRegion(profile.region);
  }, [profile]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // Read the session straight from the Supabase client rather than trusting
      // AuthContext's `session`: that value is populated by an onAuthStateChange
      // listener that fires asynchronously after sign-in, so it can still be null
      // here even though Supabase itself already has a valid session in memory.
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.user) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const user = currentSession.user;

      const profilePayload = {
        id: user.id,
        full_name: fullName.trim(),
        phone_number: user.phone ?? null,
        role: selectedRole,
        // Farmers are hard-restricted to "Kumasi" in the database (any other
        // value is rejected), so skip whatever's in the region field entirely.
        region: selectedRole === "farmer" ? "Kumasi" : region.trim() || null,
        location: ewkt(location),
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (profileError) {
        console.error("Failed to save profile:", profileError);
        setError(profileError.message);
        return;
      }

      if (selectedRole === "driver") {
        const { error: driverError } = await supabase
          .from("driver_details")
          .upsert(
            {
              profile_id: user.id,
              vehicle_type: vehicleType,
              load_capacity_kg: Number(capacity) || null,
              is_available: true,
              current_location: ewkt(location),
            },
            { onConflict: "profile_id" },
          );
        if (driverError) {
          console.error("Failed to save driver details:", driverError);
          setError(driverError.message);
          return;
        }
      }

      await refreshProfile();
      navigate(homeForRole(selectedRole), { replace: true });
    } catch (err) {
      console.error("Onboarding submit failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const roleOptions: { value: UserRole; label: string; desc: string }[] = [
    { value: "farmer", label: "Farmer", desc: "List produce and manage orders" },
    { value: "buyer", label: "Buyer", desc: "Browse and order fresh produce" },
    { value: "driver", label: "Driver", desc: "Accept and deliver transport jobs" },
  ];

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">Complete your profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tell us who you are so we can set up the right experience.
        </p>

        {error && (
          <div className="mt-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">
              I am a…
            </span>
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setSelectedRole(opt.value)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selectedRole === opt.value
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-800">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Full name">
            <Input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ama Mensah"
            />
          </Field>

          {selectedRole !== "farmer" && (
            <Field label="Region" hint="e.g. Western, Ashanti">
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Western"
              />
            </Field>
          )}

          <LocationPicker
            value={location}
            onChange={setLocation}
            label={
              selectedRole === "buyer" ? "Home / delivery area" : "Base location"
            }
          />

          {selectedRole === "driver" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
              <Field label="Vehicle type">
                <Select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                >
                  <option value="tricycle">Tricycle</option>
                  <option value="van">Van</option>
                  <option value="truck">Truck</option>
                  <option value="motorbike">Motorbike</option>
                </Select>
              </Field>
              <Field label="Load capacity (kg)">
                <Input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </Field>
            </div>
          )}

          <Button type="submit" loading={busy} className="w-full">
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
