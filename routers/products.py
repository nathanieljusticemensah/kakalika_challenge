"""Product routes for farmer uploads and public browsing."""

import os
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile, status
from supabase import ClientOptions, create_client

from database import get_supabase_client
from models.schemas import ProductRead

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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only farmers can create products")

    if profile.get("role") != "farmer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only farmers can create products")

    return profile, authed_supabase


def _normalize_public_url(public_url_response: Any) -> str:
    if isinstance(public_url_response, str):
        return public_url_response

    public_url = getattr(public_url_response, "public_url", None)
    if public_url:
        return str(public_url)

    if isinstance(public_url_response, dict):
        return (
            public_url_response.get("publicUrl")
            or public_url_response.get("public_url")
            or public_url_response.get("signedUrl")
            or public_url_response.get("signed_url")
            or ""
        )

    return str(public_url_response)


def _normalize_product_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized_row = dict(row)
    location = normalized_row.get("location")
    if location is not None and not isinstance(location, str):
        normalized_row["location"] = str(location)
    return normalized_row


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    crop_type: str = Form(..., min_length=1),
    quantity: Decimal = Form(..., gt=0),
    unit: str = Form("kg", min_length=1),
    price_per_unit: Decimal = Form(..., gt=0),
    location_lat: float = Form(...),
    location_lng: float = Form(...),
    image: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    farmer_profile, authed_supabase = _get_farmer_profile(authorization)
    supabase_client = get_supabase_client()

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file cannot be empty")

    image_suffix = Path(image.filename or "").suffix.lower()
    storage_path = f"{farmer_profile['id']}/{uuid4().hex}{image_suffix}"
    storage_bucket = authed_supabase.storage.from_("product-images")

    try:
        storage_bucket.upload(
            storage_path,
            image_bytes,
            file_options={"content-type": image.content_type or "application/octet-stream"},
        )
        public_url = _normalize_public_url(storage_bucket.get_public_url(storage_path))
        if not public_url:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Image upload succeeded but public URL could not be resolved")
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to upload product image") from exc

    product_payload = {
        "farmer_id": farmer_profile["id"],
        "crop_type": crop_type.strip(),
        "quantity": quantity,
        "unit": unit.strip() or "kg",
        "price_per_unit": price_per_unit,
        "image_url": public_url,
        "location": f"SRID=4326;POINT({location_lng} {location_lat})",
    }

    try:
        response = authed_supabase.table("products").insert(product_payload).select("*").execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        try:
            storage_bucket.remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to save product") from exc

    inserted_rows = getattr(response, "data", None) or []
    inserted_product = inserted_rows[0] if inserted_rows else None
    if not inserted_product:
        try:
            storage_bucket.remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Product was not returned after insert")

    return _normalize_product_row(inserted_product)


@router.get("/products", response_model=list[ProductRead])
async def get_products(
    crop_type: Optional[str] = Query(default=None, min_length=1),
    max_price: Optional[Decimal] = Query(default=None, ge=0),
    product_status: str = Query(default="available", min_length=1, alias="status"),
):
    supabase_client = get_supabase_client()
    query_builder = supabase_client.table("products").select("*")

    if crop_type:
        query_builder = query_builder.eq("crop_type", crop_type.strip())

    if max_price is not None:
        query_builder = query_builder.lte("price_per_unit", max_price)

    if product_status:
        query_builder = query_builder.eq("status", product_status.strip())

    try:
        response = query_builder.order("created_at", desc=True).execute()
    except Exception as exc:  # pragma: no cover - network/client failures depend on Supabase runtime
        print(f"DEBUG - actual error: {exc}", flush=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to fetch products") from exc

    rows = getattr(response, "data", None) or []
    return [_normalize_product_row(row) for row in rows]