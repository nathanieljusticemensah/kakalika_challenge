// Supabase's JS client returns PostGIS geography columns as raw EWKB hex
// strings (unlike the FastAPI routes, which decode them server-side). Decode
// the same "little-endian point, optional SRID" layout here so reads that go
// straight through Supabase still end up with {lat, lng}.
import type { LatLng } from "../types";

function decodeWkbPoint(hex: string): LatLng | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian);
  const hasSrid = (type & 0x20000000) !== 0;

  const xOffset = hasSrid ? 9 : 5;
  if (bytes.length < xOffset + 16) return null;

  const lng = view.getFloat64(xOffset, littleEndian);
  const lat = view.getFloat64(xOffset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Normalizes a location field that may come back as {lat,lng}, a WKB hex
// string, a plain text address, or null.
export function normalizeLocation(
  value: LatLng | string | null | undefined,
): LatLng | string | null {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  return decodeWkbPoint(value) ?? value;
}
