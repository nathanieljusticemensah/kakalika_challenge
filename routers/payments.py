"""Payment routes: initiate Paystack transactions and verify their result."""

import os
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Form, Header, HTTPException, Query, status
from supabase import ClientOptions, create_client

from database import get_supabase_client

router = APIRouter()

PAYSTACK_BASE = "https://api.paystack.co"


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


def _paystack_secret_key() -> str:
    key = os.environ.get("PAYSTACK_SECRET_KEY")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Paystack is not configured. Set PAYSTACK_SECRET_KEY in the environment.",
        )
    return key


def _paystack_email_for_buyer(profile: dict[str, Any]) -> str:
    # We don't collect emails yet, so synthesise a stable placeholder Paystack
    # will accept. Prefer phone-derived so receipts still look meaningful.
    phone = profile.get("phone_number")
    if phone:
        cleaned = "".join(ch for ch in str(phone) if ch.isalnum())
        if cleaned:
            return f"{cleaned}@buyer.agritech.local"
    return f"{profile['id']}@buyer.agritech.local"


@router.post("/payments/initiate")
async def initiate_payment(
    order_id: UUID = Form(...),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        profile_response = (
            authed_supabase.table("profiles")
            .select("id, role, phone_number")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load buyer profile") from exc

    profile_rows = getattr(profile_response, "data", None) or []
    profile = profile_rows[0] if profile_rows else None
    if not profile or profile.get("role") != "buyer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyers can initiate payments")

    try:
        order_response = (
            authed_supabase.table("orders")
            .select("id, buyer_id, total_price, status")
            .eq("id", str(order_id))
            .limit(1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to load order") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.get("buyer_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot pay for someone else's order")
    if order.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order status is '{order.get('status')}' and cannot be paid",
        )

    total_price = order.get("total_price")
    try:
        amount_pesewa = int(round(float(total_price) * 100))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid order total_price") from exc
    if amount_pesewa <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order amount must be positive")

    frontend_base = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
    callback_url = f"{frontend_base.rstrip('/')}/marketplace/orders/payment-callback"

    payload = {
        "email": _paystack_email_for_buyer(profile),
        "amount": amount_pesewa,
        "currency": "GHS",
        "callback_url": callback_url,
        "metadata": {"order_id": str(order_id), "buyer_id": user_id},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            paystack_response = await client.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                json=payload,
                headers={
                    "Authorization": f"Bearer {_paystack_secret_key()}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to reach Paystack") from exc

    if paystack_response.status_code >= 400:
        try:
            body = paystack_response.json()
            message = body.get("message") or "Paystack rejected the request"
        except Exception:
            message = "Paystack rejected the request"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)

    body = paystack_response.json()
    data = body.get("data") or {}
    authorization_url = data.get("authorization_url")
    reference = data.get("reference")
    if not authorization_url or not reference:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Paystack response missing authorization_url or reference")

    try:
        authed_supabase.table("orders").update({"payment_reference": reference}).eq("id", str(order_id)).execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store payment reference") from exc

    return {
        "authorization_url": authorization_url,
        "reference": reference,
        "amount_pesewa": amount_pesewa,
        "amount_ghs": float(total_price),
    }


@router.get("/payments/verify")
async def verify_payment(
    reference: str = Query(..., min_length=1),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer access token"),
):
    user_id = _extract_user_id_from_token(authorization)
    authed_supabase = _create_user_client(authorization)

    try:
        order_response = (
            authed_supabase.table("orders")
            .select("id, buyer_id, status, payment_reference")
            .eq("payment_reference", reference)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to look up order for reference") from exc

    order_rows = getattr(order_response, "data", None) or []
    order = order_rows[0] if order_rows else None
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No order matches that payment reference")
    if order.get("buyer_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot verify someone else's payment")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            paystack_response = await client.get(
                f"{PAYSTACK_BASE}/transaction/verify/{reference}",
                headers={"Authorization": f"Bearer {_paystack_secret_key()}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to reach Paystack") from exc

    if paystack_response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Paystack rejected the verify request")

    body = paystack_response.json()
    data = body.get("data") or {}
    tx_status = data.get("status")

    if tx_status != "success":
        return {"paid": False, "status": tx_status, "order_id": order["id"]}

    # Only advance a pending order — never regress a further-progressed one.
    if order.get("status") == "pending":
        try:
            authed_supabase.table("orders").update({"status": "paid_escrow"}).eq("id", str(order["id"])).eq("status", "pending").execute()
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to update order status") from exc

    return {"paid": True, "status": tx_status, "order_id": order["id"]}
