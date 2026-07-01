#this file contains the validation of the data fom pydantic

from pydantic import BaseModel

from pydantic import BaseModel
from typing import Optional

class ProductBase(BaseModel):
    farmer_id: str
    crop_type: str
    quantity_kg: float
    price: float
    location_lat: float
    location_lng: float

class CostEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    payload_kg: float