"""Order routes for buyer checkout and order history."""

import os
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Form, Header, HTTPException, Path, status
from shapely import wkb
from supabase import ClientOptions, create_client

from database import get_supabase_client
from models.schemas import OrderRead

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


def _get_buyer_profile(authorization: Optional[str]) -> tuple[dict[str, Any], Any]:
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        response = authed_supabase.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify user role") from exc

    profile_rows = getattr(response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None

    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyers can create orders")

    if profile.get("role") != "buyer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyers can create orders")

    return profile, authed_supabase


def _normalize_delivery_address(row: dict[str, Any]) -> dict[str, Any]:
    normalized_row = dict(row)
    delivery_address = normalized_row.get("delivery_address")
    if delivery_address is None:
        return normalized_row

    try:
        if isinstance(delivery_address, str):
            geometry = wkb.loads(delivery_address, hex=True)
        elif isinstance(delivery_address, (bytes, bytearray)):
            geometry = wkb.loads(bytes(delivery_address))
        else:
            geometry = None

        if geometry is not None:
            normalized_row["delivery_address"] = {"lat": float(geometry.y), "lng": float(geometry.x)}
        elif not isinstance(delivery_address, dict):
            normalized_row["delivery_address"] = str(delivery_address)
    except Exception:
        if not isinstance(delivery_address, dict):
            normalized_row["delivery_address"] = str(delivery_address)

    return normalized_row


@router.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    product_id: UUID = Form(...),
    quantity_ordered: Decimal = Form(..., gt=0),
    delivery_lat: float = Form(...),
    delivery_lng: float = Form(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    buyer_profile, authed_supabase = _get_buyer_profile(authorization)
    supabase_client = get_supabase_client()

    try:
        product_response = supabase_client.table("products").select("farmer_id, price_per_unit").eq("id", str(product_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load product") from exc

    product_rows = getattr(product_response, "data", None) or []
    product = product_rows[0] if product_rows else None
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    farmer_id = product.get("farmer_id")
    price_value = product.get("price_per_unit")
    try:
        price_per_unit = Decimal(str(price_value))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid product price") from exc

    total_price = quantity_ordered * price_per_unit

    order_payload = {
        "product_id": str(product_id),
        "buyer_id": buyer_profile["id"],
        "farmer_id": farmer_id,
        "quantity_ordered": float(quantity_ordered),
        "total_price": float(total_price),
        "delivery_address": f"SRID=4326;POINT({delivery_lng} {delivery_lat})",
    }

    try:
        response = authed_supabase.table("orders").insert(order_payload).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to create order") from exc

    inserted_rows = getattr(response, "data", None) or []
    inserted_order = inserted_rows[0] if inserted_rows else None
    if not inserted_order:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order was not returned after insert")

    return _normalize_delivery_address(inserted_order)


@router.get("/orders", response_model=list[OrderRead])
async def get_orders(
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        profile_response = authed_supabase.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify user role") from exc

    profile_rows = getattr(profile_response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None
    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid user profile")

    role = profile.get("role")
    query_builder = authed_supabase.table("orders").select("*")
    if role == "buyer":
        query_builder = query_builder.eq("buyer_id", user_id)
    elif role == "farmer":
        query_builder = query_builder.eq("farmer_id", user_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view orders")

    try:
        response = query_builder.order("created_at", desc=True).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to fetch orders") from exc

    rows = getattr(response, "data", None) or []
    return [_normalize_delivery_address(row) for row in rows]


@router.patch("/orders/{order_id}/cancel", response_model=OrderRead)
async def cancel_order(
    order_id: UUID = Path(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    buyer_profile, authed_supabase = _get_buyer_profile(authorization)
    buyer_id = buyer_profile["id"]

    try:
        order_response = authed_supabase.table("orders").select("id, buyer_id, status").eq("id", str(order_id)).limit(1).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load order") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.get("buyer_id") != buyer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only cancel your own orders")

    if order.get("status") != "pending_payment":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order status is '{order.get('status')}' and cannot be cancelled",
        )

    try:
        response = authed_supabase.table("orders").update({"status": "cancelled"}).eq("id", str(order_id)).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to cancel order") from exc

    updated_rows = getattr(response, "data", None) or []
    updated_order = updated_rows[0] if updated_rows else None
    if not updated_order:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order was not returned after cancellation")

    return _normalize_delivery_address(updated_order)
