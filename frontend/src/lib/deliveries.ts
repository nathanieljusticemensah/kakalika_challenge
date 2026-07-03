// Read helpers for deliveries via Supabase directly.
//
// The FastAPI backend exposes writes for deliveries (create, assign-driver,
// status transitions) but no list endpoint, so the driver portal reads the
// job board and its assigned trips straight from Supabase. Row Level Security
// on the `deliveries` table governs what each driver can see.

import { supabase } from "./supabase";
import type { Delivery } from "../types";

// Deliveries still waiting for a driver — the open job board.
export async function fetchOpenDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

// Deliveries assigned to the given driver (their active + past trips).
export async function fetchDriverDeliveries(driverId: string): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

// Deliveries linked to a set of orders — used by the farmer to track the
// delivery state of each order they've placed on the job board.
export async function fetchDeliveriesByOrderIds(
  orderIds: string[],
): Promise<Delivery[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

// A driver's own driver_details row (availability, vehicle, capacity).
export async function fetchDriverDetails(profileId: string) {
  const { data, error } = await supabase
    .from("driver_details")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setDriverAvailability(
  profileId: string,
  isAvailable: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("driver_details")
    .update({ is_available: isAvailable })
    .eq("profile_id", profileId);
  if (error) throw error;
}
