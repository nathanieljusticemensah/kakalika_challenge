// Thin typed client for the AgriTech FastAPI backend.
// Every call attaches the current Supabase access token as a Bearer header so
// the backend can resolve the user and enforce role-based access.

import { supabase } from "./supabase";
import type {
  CostEstimate,
  Delivery,
  NearbyDriver,
  Order,
  Product,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? JSON.stringify(body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Products ------------------------------------------------------------

export interface ProductFilters {
  crop_type?: string;
  max_price?: number;
  status?: string;
}

export async function listProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.crop_type) params.set("crop_type", filters.crop_type);
  if (filters.max_price != null) params.set("max_price", String(filters.max_price));
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/products${qs ? `?${qs}` : ""}`);
  return handle<Product[]>(res);
}

export interface CreateProductInput {
  crop_type: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  location_lat: number;
  location_lng: number;
  image: File;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const form = new FormData();
  form.set("crop_type", input.crop_type);
  form.set("quantity", String(input.quantity));
  form.set("unit", input.unit);
  form.set("price_per_unit", String(input.price_per_unit));
  form.set("location_lat", String(input.location_lat));
  form.set("location_lng", String(input.location_lng));
  form.set("image", input.image);
  const res = await fetch(`${API_BASE_URL}/products`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  return handle<Product>(res);
}

// ---- Orders --------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    headers: await authHeader(),
  });
  return handle<Order[]>(res);
}

export interface CreateOrderInput {
  product_id: string;
  quantity_ordered: number;
  delivery_lat: number;
  delivery_lng: number;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const form = new FormData();
  form.set("product_id", input.product_id);
  form.set("quantity_ordered", String(input.quantity_ordered));
  form.set("delivery_lat", String(input.delivery_lat));
  form.set("delivery_lng", String(input.delivery_lng));
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  return handle<Order>(res);
}

// ---- Deliveries ----------------------------------------------------------

export async function createDelivery(orderId: string): Promise<Delivery> {
  const form = new FormData();
  form.set("order_id", orderId);
  const res = await fetch(`${API_BASE_URL}/deliveries`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  return handle<Delivery>(res);
}

export async function getNearbyDrivers(deliveryId: string): Promise<NearbyDriver[]> {
  const res = await fetch(`${API_BASE_URL}/deliveries/nearby-drivers/${deliveryId}`, {
    headers: await authHeader(),
  });
  return handle<NearbyDriver[]>(res);
}

export async function assignDriver(
  deliveryId: string,
  driverId: string,
): Promise<Delivery> {
  const form = new FormData();
  form.set("driver_id", driverId);
  const res = await fetch(`${API_BASE_URL}/deliveries/${deliveryId}/assign-driver`, {
    method: "PATCH",
    headers: await authHeader(),
    body: form,
  });
  return handle<Delivery>(res);
}

export async function updateDeliveryStatus(
  deliveryId: string,
  newStatus: string,
): Promise<Delivery> {
  const form = new FormData();
  form.set("new_status", newStatus);
  const res = await fetch(`${API_BASE_URL}/deliveries/${deliveryId}/status`, {
    method: "PATCH",
    headers: await authHeader(),
    body: form,
  });
  return handle<Delivery>(res);
}

// ---- Logistics / ML ------------------------------------------------------

export interface EstimateCostInput {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  payload_kg: number;
}

export async function estimateCost(input: EstimateCostInput): Promise<CostEstimate> {
  const res = await fetch(`${API_BASE_URL}/api/estimate-cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<CostEstimate>(res);
}
