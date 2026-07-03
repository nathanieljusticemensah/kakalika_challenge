import type { LatLng } from "../types";

export function formatGHS(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLatLng(loc: LatLng | string | null | undefined): string {
  if (!loc) return "—";
  if (typeof loc === "string") return loc;
  return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
}

export function metersToKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
