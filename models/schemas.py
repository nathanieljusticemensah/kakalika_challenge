#this file contains the validation of the data fom pydantic
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

# --- Profile/User Schema ---
class Profile(BaseModel):
    id: UUID
    full_name: str
    phone_number: str
    role: str  # 'farmer', 'buyer', 'driver'
    location: Optional[str] # WKT or GeoJSON format for geography type
    region: Optional[str]

# --- Product Schema ---
class Product(BaseModel):
    id: UUID
    farmer_id: UUID
    crop_type: str
    quantity: float
    unit: str
    price_per_unit: float
    image_url: Optional[str]
    location: str # PostGIS geography
    status: str
    created_at: datetime

# --- Driver Details Schema ---
class DriverDetails(BaseModel):
    profile_id: UUID
    vehicle_type: str
    load_capacity_kg: float
    is_available: bool
    current_location: str # PostGIS geography

# --- Order Schema ---
class Order(BaseModel):
    id: UUID
    product_id: UUID
    buyer_id: UUID
    farmer_id: UUID
    quantity_ordered: float
    total_price: float
    status: str # 'pending', 'in-transit', 'delivered'
    payment_reference: Optional[str]
    delivery_address: str # PostGIS geography
    created_at: datetime

# --- Delivery Schema ---
class Delivery(BaseModel):
    id: UUID
    order_id: UUID
    driver_id: UUID
    pickup_location: str # PostGIS geography
    dropoff_location: str # PostGIS geography
    estimated_cost: float
    status: str # 'pending', 'picked_up', 'delivered'
    picked_up_at: Optional[datetime]
    delivered_at: Optional[datetime]