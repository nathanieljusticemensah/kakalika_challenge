import { useState } from "react";
import { Button, Field, Input } from "./ui";

export interface LatLngValue {
  lat: string;
  lng: string;
}

// Ghana (Tarkwa/Kumasi belt) makes a sensible default for the demo dataset.
export const DEFAULT_LOCATION: LatLngValue = { lat: "6.6885", lng: "-1.6244" };

export function LocationPicker({
  value,
  onChange,
  label = "Location",
}: {
  value: LatLngValue;
  onChange: (next: LatLngValue) => void;
  label?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      (err) => {
        setError(err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={useMyLocation}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:text-slate-400"
          disabled={locating}
        >
          {locating ? "Locating…" : "📍 Use my location"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <Input
            type="number"
            step="any"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: e.target.value })}
            placeholder="6.6885"
          />
        </Field>
        <Field label="Longitude">
          <Input
            type="number"
            step="any"
            value={value.lng}
            onChange={(e) => onChange({ ...value, lng: e.target.value })}
            placeholder="-1.6244"
          />
        </Field>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export { Button };
