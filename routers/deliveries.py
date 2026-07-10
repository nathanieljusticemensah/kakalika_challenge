"""Delivery routes for farmers and assigned drivers."""

import math
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Form, Header, HTTPException, Path, status
from shapely import wkb
from supabase import ClientOptions, create_client

from database import get_supabase_client

router = APIRouter()


def _extract_user_id_from_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header")

    supabase_client = get_supabase_client()
    try:
        user_response = supabase_client.auth.get_user(token)
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    user = getattr(user_response, "user", None)
    if user is None and isinstance(user_response, dict):
        user = user_response.get("user")

    user_id = getattr(user, "id", None)
    if user_id is None and isinstance(user, dict):
        user_id = user.get("id")

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    return str(user_id)


def _create_user_client(authorization: Optional[str]):
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Supabase client is not configured")

    return create_client(supabase_url, supabase_key, options=ClientOptions(headers={"Authorization": authorization}))


def _normalize_location_field(row: dict[str, Any], field_name: str) -> dict[str, Any]:
    normalized_row = dict(row)
    raw_location = normalized_row.get(field_name)
    if raw_location is None:
        return normalized_row

    try:
        if isinstance(raw_location, str):
            geometry = wkb.loads(raw_location, hex=True)
        elif isinstance(raw_location, (bytes, bytearray)):
            geometry = wkb.loads(bytes(raw_location))
        else:
            geometry = None

        if geometry is not None:
            normalized_row[field_name] = {"lat": float(geometry.y), "lng": float(geometry.x)}
        elif not isinstance(raw_location, dict):
            normalized_row[field_name] = str(raw_location)
    except Exception:
        if not isinstance(raw_location, dict):
            normalized_row[field_name] = str(raw_location)

    return normalized_row


def _get_farmer_profile(authorization: Optional[str]) -> tuple[dict[str, Any], Any]:
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        response = authed_supabase.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify user role") from exc

    profile_rows = getattr(response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None

    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only farmers can manage deliveries")

    if profile.get("role") != "farmer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only farmers can manage deliveries")

    return profile, authed_supabase


def _get_driver_or_admin_profile(authorization: Optional[str]) -> tuple[dict[str, Any], Any]:
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        response = authed_supabase.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify user role") from exc

    profile_rows = getattr(response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None

    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid user profile")

    role = profile.get("role")
    if role not in {"farmer", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to access this endpoint")

    return profile, authed_supabase


def _get_driver_profile(authorization: Optional[str]) -> tuple[dict[str, Any], Any]:
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        response = authed_supabase.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify user role") from exc

    profile_rows = getattr(response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None

    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid user profile")

    if profile.get("role") != "driver":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only drivers can access this endpoint")

    return profile, authed_supabase


@router.post("/drivers/profile", status_code=status.HTTP_201_CREATED)
async def create_driver_profile(
    vehicle_type: str = Form(..., min_length=1),
    load_capacity_kg: float = Form(..., gt=0),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    driver_profile, authed_supabase = _get_driver_profile(authorization)
    driver_id = driver_profile["id"]

    try:
        existing_response = authed_supabase.table("driver_details").select("profile_id").eq("profile_id", str(driver_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to check driver profile") from exc

    existing_rows = getattr(existing_response, "data", None) or []
    if existing_rows:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Driver profile already set up")

    driver_payload = {
        "profile_id": str(driver_id),
        "vehicle_type": vehicle_type.strip(),
        "load_capacity_kg": float(load_capacity_kg),
        "is_available": False,
        "current_location": None,
    }

    try:
        response = authed_supabase.table("driver_details").insert(driver_payload).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to create driver profile") from exc

    created_rows = getattr(response, "data", None) or []
    created_driver = created_rows[0] if created_rows else None
    if not created_driver:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Driver profile was not returned after creation")

    return created_driver


@router.patch("/drivers/availability")
async def update_driver_availability(
    is_available: bool = Form(...),
    current_lat: Optional[float] = Form(default=None),
    current_lng: Optional[float] = Form(default=None),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    driver_profile, authed_supabase = _get_driver_profile(authorization)
    driver_id = driver_profile["id"]

    try:
        existing_response = authed_supabase.table("driver_details").select("*").eq("profile_id", str(driver_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load driver profile") from exc

    existing_rows = getattr(existing_response, "data", None) or []
    if not existing_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver profile not found. Please complete your driver profile first.")

    update_payload = {"is_available": is_available}
    if current_lat is not None and current_lng is not None:
        update_payload["current_location"] = f"SRID=4326;POINT({current_lng} {current_lat})"

    try:
        response = authed_supabase.table("driver_details").update(update_payload).eq("profile_id", str(driver_id)).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to update driver availability") from exc

    updated_rows = getattr(response, "data", None) or []
    updated_driver = updated_rows[0] if updated_rows else None
    if not updated_driver:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Driver availability was not returned after update")

    return updated_driver


@router.post("/deliveries", status_code=status.HTTP_201_CREATED)
async def create_delivery(
    order_id: UUID = Form(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    farmer_profile, authed_supabase = _get_farmer_profile(authorization)
    farmer_id = farmer_profile["id"]

    try:
        order_response = authed_supabase.table("orders").select("id, farmer_id, status, delivery_address").eq("id", str(order_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load order") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.get("farmer_id") != farmer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Farmers can only create deliveries for their own orders")

    if order.get("status") != "paid_escrow":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delivery can only be created for orders with status 'paid_escrow'")

    try:
        profile_response = authed_supabase.table("profiles").select("location").eq("id", farmer_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load farmer profile location") from exc

    profile_rows = getattr(profile_response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None
    if not profile or profile.get("location") is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Farmer pickup location is missing")

    pickup_location = profile.get("location")
    dropoff_location = order.get("delivery_address")
    if dropoff_location is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order delivery address is missing")

    delivery_payload = {
        "order_id": str(order_id),
        "pickup_location": pickup_location,
        "dropoff_location": dropoff_location,
    }

    try:
        response = authed_supabase.table("deliveries").insert(delivery_payload).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to create delivery") from exc

    inserted_rows = getattr(response, "data", None) or []
    inserted_delivery = inserted_rows[0] if inserted_rows else None
    if not inserted_delivery:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Delivery was not returned after insert")

    delivery = _normalize_location_field(inserted_delivery, "pickup_location")
    delivery = _normalize_location_field(delivery, "dropoff_location")
    return delivery


@router.get("/deliveries/nearby-drivers/{delivery_id}")
async def get_nearby_drivers(
    delivery_id: UUID = Path(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    _, authed_supabase = _get_driver_or_admin_profile(authorization)

    try:
        delivery_response = authed_supabase.table("deliveries").select("id, pickup_location").eq("id", str(delivery_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load delivery") from exc

    delivery_rows = getattr(delivery_response, "data", None) or []
    delivery = delivery_rows[0] if delivery_rows else None
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")

    pickup_location = delivery.get("pickup_location")
    if pickup_location is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Delivery pickup location is missing")

    if isinstance(pickup_location, str):
        try:
            decoded = wkb.loads(pickup_location, hex=True)
            pickup_lat = float(decoded.y)
            pickup_lng = float(decoded.x)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to decode delivery pickup location") from exc
    elif isinstance(pickup_location, (bytes, bytearray)):
        try:
            decoded = wkb.loads(bytes(pickup_location))
            pickup_lat = float(decoded.y)
            pickup_lng = float(decoded.x)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to decode delivery pickup location") from exc
    elif isinstance(pickup_location, dict) and "lat" in pickup_location and "lng" in pickup_location:
        pickup_lat = float(pickup_location["lat"])
        pickup_lng = float(pickup_location["lng"])
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Pickup location must contain lat and lng")

    try:
        response = authed_supabase.table("driver_details").select(
            "profile_id, vehicle_type, is_available, current_location, profiles(id, full_name, role)"
        ).eq("is_available", True).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to query nearby drivers") from exc

    driver_rows = getattr(response, "data", None) or []
    drivers = []

    def haversine(latitude1: float, longitude1: float, latitude2: float, longitude2: float) -> float:
        radius = 6371000.0
        dlat = math.radians(latitude2 - latitude1)
        dlon = math.radians(longitude2 - longitude1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(latitude1)) * math.cos(math.radians(latitude2)) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius * c

    for row in driver_rows:
        profile = row.get("profiles") or {}
        current_location = row.get("current_location")

        try:
            if isinstance(current_location, str):
                decoded = wkb.loads(current_location, hex=True)
            elif isinstance(current_location, (bytes, bytearray)):
                decoded = wkb.loads(bytes(current_location))
            else:
                raise ValueError("Driver current_location must be WKB string or bytes")

            driver_lat = float(decoded.y)
            driver_lng = float(decoded.x)
            normalized_location = {"lat": driver_lat, "lng": driver_lng}
        except Exception as exc:
            raise

        distance_meters = haversine(pickup_lat, pickup_lng, driver_lat, driver_lng)
        passes = distance_meters <= 10000

        if passes:
            drivers.append(
                {
                    "id": profile.get("id"),
                    "full_name": profile.get("full_name"),
                    "role": profile.get("role"),
                    "vehicle_type": row.get("vehicle_type"),
                    "is_available": row.get("is_available"),
                    "current_location": normalized_location,
                    "distance_meters": distance_meters,
                }
            )

    return drivers


@router.patch("/deliveries/{delivery_id}/assign-driver")
async def assign_driver(
    delivery_id: UUID = Path(...),
    driver_id: UUID = Form(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    farmer_profile, authed_supabase = _get_farmer_profile(authorization)
    farmer_id = farmer_profile["id"]

    try:
        delivery_response = authed_supabase.table("deliveries").select("id, order_id, status").eq("id", str(delivery_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load delivery") from exc

    delivery_rows = getattr(delivery_response, "data", None) or []
    delivery = delivery_rows[0] if delivery_rows else None
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")

    if delivery.get("status") != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Driver can only be assigned to a pending delivery")

    order_id = delivery.get("order_id")
    if not order_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Delivery order reference is missing")

    try:
        order_response = authed_supabase.table("orders").select("farmer_id").eq("id", str(order_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify delivery ownership") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order or order.get("farmer_id") != farmer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the delivery owner can assign a driver")

    try:
        driver_response = authed_supabase.table("driver_details").select("profile_id, is_available").eq("profile_id", str(driver_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify driver") from exc

    driver_rows = getattr(driver_response, "data", None) or []
    driver = driver_rows[0] if driver_rows else None
    if not driver or not driver.get("is_available"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected driver is not available")

    try:
        response = authed_supabase.table("deliveries").update(
            {"driver_id": str(driver_id), "status": "driver_assigned"}
        ).eq("id", str(delivery_id)).select("*").execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to assign driver to delivery") from exc

    updated_rows = getattr(response, "data", None) or []
    updated_delivery = updated_rows[0] if updated_rows else None
    if not updated_delivery:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Updated delivery was not returned")

    updated_delivery = _normalize_location_field(updated_delivery, "pickup_location")
    updated_delivery = _normalize_location_field(updated_delivery, "dropoff_location")
    return updated_delivery


@router.patch("/deliveries/{delivery_id}/cancel")
async def cancel_delivery(
    delivery_id: UUID = Path(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    farmer_profile, authed_supabase = _get_farmer_profile(authorization)
    farmer_id = farmer_profile["id"]

    try:
        delivery_response = authed_supabase.table("deliveries").select("id, order_id, driver_id, status").eq("id", str(delivery_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load delivery") from exc

    delivery_rows = getattr(delivery_response, "data", None) or []
    delivery = delivery_rows[0] if delivery_rows else None
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")

    order_id = delivery.get("order_id")
    if not order_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Delivery order reference is missing")

    try:
        order_response = authed_supabase.table("orders").select("farmer_id").eq("id", str(order_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify delivery ownership") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order or order.get("farmer_id") != farmer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the delivery owner can cancel this delivery")

    current_status = delivery.get("status")
    if current_status not in ("pending", "driver_assigned"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Delivery status is '{current_status}' and cannot be cancelled",
        )

    try:
        response = authed_supabase.table("deliveries").update({"status": "cancelled"}).eq("id", str(delivery_id)).select("*").execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to cancel delivery") from exc

    updated_rows = getattr(response, "data", None) or []
    updated_delivery = updated_rows[0] if updated_rows else None
    if not updated_delivery:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Updated delivery was not returned")

    driver_id = delivery.get("driver_id")
    if driver_id:
        try:
            authed_supabase.table("driver_details").update({"is_available": True}).eq("profile_id", str(driver_id)).execute()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Delivery was cancelled but failed to free up the driver's availability",
            ) from exc

    updated_delivery = _normalize_location_field(updated_delivery, "pickup_location")
    updated_delivery = _normalize_location_field(updated_delivery, "dropoff_location")
    return updated_delivery


@router.patch("/deliveries/{delivery_id}/status")
async def update_delivery_status(
    delivery_id: UUID = Path(...),
    new_status: str = Form(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    driver_profile, authed_supabase = _get_driver_profile(authorization)
    driver_id = driver_profile["id"]

    try:
        delivery_response = authed_supabase.table("deliveries").select("id, driver_id, status").eq("id", str(delivery_id)).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load delivery") from exc

    delivery_rows = getattr(delivery_response, "data", None) or []
    delivery = delivery_rows[0] if delivery_rows else None
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")

    if delivery.get("driver_id") != driver_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the assigned driver can update delivery status")

    current_status = delivery.get("status")
    allowed_transitions = {
        "pending": ["driver_assigned"],
        "driver_assigned": ["arrived_at_farm"],
        "arrived_at_farm": ["in_transit"],
        "in_transit": ["delivered"],
        "delivered": [],
        "cancelled": [],
    }

    if new_status not in allowed_transitions.get(current_status, []):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition from '{current_status}' to '{new_status}'",
        )

    update_data = {"status": new_status}
    if new_status == "delivered":
        update_data["delivered_at"] = datetime.utcnow().isoformat() + "Z"
    if new_status == "in_transit":
        update_data["picked_up_at"] = datetime.utcnow().isoformat() + "Z"

    try:
        response = authed_supabase.table("deliveries").update(update_data).eq("id", str(delivery_id)).select("*").execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to update delivery status") from exc

    updated_rows = getattr(response, "data", None) or []
    updated_delivery = updated_rows[0] if updated_rows else None
    if not updated_delivery:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Updated delivery was not returned")

    updated_delivery = _normalize_location_field(updated_delivery, "pickup_location")
    updated_delivery = _normalize_location_field(updated_delivery, "dropoff_location")
    return updated_delivery
