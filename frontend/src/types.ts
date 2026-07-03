// Domain types mirroring the AgriTech Supabase schema and FastAPI responses.

export type UserRole = "farmer" | "buyer" | "driver";

export type OrderStatus =
  | "pending"
  | "paid"
  | "paid_escrow"
  | "assigned"
  | "in-transit"
  | "delivered"
  | "cancelled";

export type DeliveryStatus =
  | "pending"
  | "driver_assigned"
  | "arrived_at_farm"
  | "in_transit"
  | "delivered"
  | "cancelled";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  role: UserRole | null;
  location: string | null;
  region: string | null;
  created_at?: string;
}

export interface Product {
  id: string;
  farmer_id: string;
  crop_type: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  image_url: string | null;
  location: LatLng | string | null;
  status: string;
  created_at: string;
}

export interface Order {
  id: string;
  product_id: string;
  buyer_id: string;
  farmer_id: string;
  quantity_ordered: number;
  total_price: number;
  status: OrderStatus | string;
  payment_reference: string | null;
  delivery_address: LatLng | string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  driver_id: string | null;
  pickup_location: LatLng | string | null;
  dropoff_location: LatLng | string | null;
  estimated_cost: number | null;
  status: DeliveryStatus | string;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface NearbyDriver {
  id: string;
  full_name: string | null;
  role: string | null;
  vehicle_type: string | null;
  is_available: boolean;
  current_location: LatLng;
  distance_meters: number;
}

export interface DriverDetails {
  profile_id: string;
  vehicle_type: string | null;
  load_capacity_kg: number | null;
  is_available: boolean;
  current_location: string | null;
}

export interface CostEstimate {
  status: string;
  estimated_cost_ghs: number;
  currency: string;
}
