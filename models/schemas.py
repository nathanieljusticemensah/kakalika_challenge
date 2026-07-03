"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class Location(BaseModel):
    lat: float
    lng: float


class ProductRead(BaseModel):
    id: UUID
    farmer_id: UUID
    crop_type: str
    quantity: Decimal
    unit: str
    price_per_unit: Decimal
    image_url: Optional[str] = None
    location: Location
    status: str
    created_at: datetime


class OrderRead(BaseModel):
    id: UUID
    product_id: UUID
    buyer_id: UUID
    farmer_id: UUID
    quantity_ordered: Decimal
    total_price: Decimal
    status: str
    payment_reference: Optional[str] = None
    delivery_address: Location
    created_at: datetime
    updated_at: datetime


class CostEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    payload_kg: float