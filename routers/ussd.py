"""USSD router for Africa's Talking farmer menu.

Africa's Talking POSTs form-encoded payloads to this endpoint on every
menu interaction. The response body is plain text prefixed with either
``CON`` (show another menu) or ``END`` (terminate the session).

The ``text`` field accumulates every input the caller has entered so far,
separated by ``*``. This handler is therefore stateless: the current step
is derived by inspecting how many segments ``text`` contains.

Flow (minimal demo):
  Entry → PIN setup (new farmer) or PIN entry (returning farmer)
        → Main menu (1. Check prices | 2. List produce)
        → 1: END with latest listings
        → 2: crop type → quantity → price → insert into ``products``
"""

import hashlib
import os
import re
import secrets
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import APIRouter, Form, HTTPException, Response, status
from shapely import wkb
from supabase import Client, create_client

router = APIRouter()

# Fallback location for USSD listings when the farmer's profile has none.
# Centre of Accra, close to the produce markets used by the demo.
DEFAULT_LOCATION_EWKT = "SRID=4326;POINT(-0.1870 5.6037)"

# PBKDF2 iterations. Overkill for a 4-digit PIN but cheap on a phone-scale
# workload and gives us a reasonable margin against offline attacks if the
# hashes ever leaked.
PIN_HASH_ITERATIONS = 200_000
PIN_HASH_ALGO = "pbkdf2_sha256"


def _get_admin_client() -> Client:
    """Return a Supabase client using the service role key.

    USSD requests carry no JWT, so we bypass RLS. The service role key is
    already used by the ``get_*_token.py`` helpers under the same name.
    """

    url = os.environ.get("SUPABASE_URL")
    service_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
    )
    if not url or not service_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase admin client is not configured",
        )
    return create_client(url, service_key)


def _normalize_phone(phone: str) -> str:
    """Strip formatting so we can compare across ``+233…`` / ``233…`` variants."""

    if not phone:
        return ""
    normalized = phone.strip()
    for junk in (" ", "-", "(", ")"):
        normalized = normalized.replace(junk, "")
    if normalized.startswith("+"):
        normalized = normalized[1:]
    return normalized


def _hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PIN_HASH_ITERATIONS)
    return f"{PIN_HASH_ALGO}${PIN_HASH_ITERATIONS}${salt.hex()}${dk.hex()}"


def _verify_pin(pin: str, stored: str) -> bool:
    try:
        algo, iters_str, salt_hex, dk_hex = stored.split("$")
        if algo != PIN_HASH_ALGO:
            return False
        iters = int(iters_str)
        expected = hashlib.pbkdf2_hmac(
            "sha256", pin.encode("utf-8"), bytes.fromhex(salt_hex), iters
        )
        return secrets.compare_digest(expected.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


def _plain(body: str) -> Response:
    return Response(content=body, media_type="text/plain")


def _con(msg: str) -> Response:
    return _plain(f"CON {msg}")


def _end(msg: str) -> Response:
    return _plain(f"END {msg}")


def _find_profile_by_phone(admin: Client, phone: str) -> Optional[dict[str, Any]]:
    """Look up a farmer profile by phone, tolerating ``+`` / no-``+`` storage."""

    normalized = _normalize_phone(phone)
    candidates = [phone, f"+{normalized}", normalized]
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        try:
            resp = (
                admin.table("profiles")
                .select("id, phone_number, pin_hash, full_name, role, location")
                .eq("phone_number", candidate)
                .limit(1)
                .execute()
            )
        except Exception:
            continue
        rows = getattr(resp, "data", None) or []
        if rows:
            return rows[0]
    return None


def _create_farmer_profile(admin: Client, phone: str) -> dict[str, Any]:
    """Provision a fresh auth user + farmer profile for a first-time caller."""

    normalized_digits = _normalize_phone(phone)
    international_phone = f"+{normalized_digits}"

    try:
        user_resp = admin.auth.admin.create_user(
            {
                "phone": international_phone,
                "phone_confirm": True,
                "user_metadata": {"full_name": "USSD Farmer", "role": "farmer"},
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to provision farmer account",
        ) from exc

    user = getattr(user_resp, "user", None)
    if user is None and isinstance(user_resp, dict):
        user = user_resp.get("user")
    user_id = getattr(user, "id", None)
    if user_id is None and isinstance(user, dict):
        user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to provision farmer account",
        )

    profile_payload = {
        "id": str(user_id),
        "phone_number": international_phone,
        "full_name": "USSD Farmer",
        "role": "farmer",
        "location": DEFAULT_LOCATION_EWKT,
    }
    try:
        resp = admin.table("profiles").upsert(profile_payload, on_conflict="id").execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to save farmer profile",
        ) from exc

    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else profile_payload


def _profile_location_ewkt(profile: dict[str, Any]) -> str:
    """Turn PostGIS-encoded ``location`` back into EWKT for a new insert."""

    location = profile.get("location")
    if not location:
        return DEFAULT_LOCATION_EWKT
    try:
        if isinstance(location, str):
            geometry = wkb.loads(location, hex=True)
        elif isinstance(location, (bytes, bytearray)):
            geometry = wkb.loads(bytes(location))
        else:
            return DEFAULT_LOCATION_EWKT
        return f"SRID=4326;POINT({geometry.x} {geometry.y})"
    except Exception:
        return DEFAULT_LOCATION_EWKT


def _fetch_recent_prices(admin: Client, limit: int = 5) -> list[dict[str, Any]]:
    resp = (
        admin.table("products")
        .select("crop_type, unit, price_per_unit")
        .eq("status", "available")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return getattr(resp, "data", None) or []


def _insert_ussd_product(
    admin: Client,
    profile: dict[str, Any],
    crop_type: str,
    quantity: Decimal,
    price_per_unit: Decimal,
) -> None:
    payload = {
        "farmer_id": profile["id"],
        "crop_type": crop_type,
        "quantity": float(quantity),
        "unit": "kg",
        "price_per_unit": float(price_per_unit),
        "location": _profile_location_ewkt(profile),
    }
    admin.table("products").insert(payload).execute()


@router.post("/ussd")
async def ussd_handler(
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(""),
    serviceCode: Optional[str] = Form(None),
    networkCode: Optional[str] = Form(None),
):
    """Handle a single USSD interaction from Africa's Talking."""

    admin = _get_admin_client()

    # Africa's Talking sends the accumulated inputs separated by "*".
    # Empty text = first dial-in.
    inputs = text.split("*") if text else []

    profile = _find_profile_by_phone(admin, phoneNumber)
    if profile is None:
        profile = _create_farmer_profile(admin, phoneNumber)

    has_pin = bool(profile.get("pin_hash"))

    # Step 0: opening screen.
    if not inputs:
        if has_pin:
            return _con("Welcome back to Kakalika.\nEnter your 4-digit PIN:")
        return _con("Welcome to Kakalika.\nSet a new 4-digit PIN:")

    # Step 1: PIN — either set it (new user) or verify it (returning user).
    pin_input = inputs[0]
    if not has_pin:
        if not re.fullmatch(r"\d{4}", pin_input):
            return _end("Invalid PIN. It must be exactly 4 digits.")
        try:
            admin.table("profiles").update(
                {"pin_hash": _hash_pin(pin_input)}
            ).eq("id", profile["id"]).execute()
        except Exception:
            return _end("Sorry, we could not save your PIN. Please try again.")
    else:
        if not _verify_pin(pin_input, profile["pin_hash"]):
            return _end("Invalid PIN. Please try again.")

    # Step 2: main menu.
    if len(inputs) == 1:
        return _con("Kakalika Menu\n1. Check prices\n2. List produce")

    choice = inputs[1]

    if choice == "1":
        try:
            rows = _fetch_recent_prices(admin)
        except Exception:
            return _end("Sorry, prices are unavailable right now.")
        if not rows:
            return _end("No listings yet. Be the first to list produce.")
        lines = ["Latest prices:"]
        for row in rows:
            lines.append(
                f"{row['crop_type']}: GHS {row['price_per_unit']}/{row.get('unit') or 'kg'}"
            )
        return _end("\n".join(lines))

    if choice == "2":
        # 2a: ask for crop type.
        if len(inputs) == 2:
            return _con("Enter crop type (e.g. Maize):")

        crop_type = inputs[2].strip()
        if not crop_type:
            return _end("Crop type cannot be empty.")

        # 2b: ask for quantity.
        if len(inputs) == 3:
            return _con(f"Crop: {crop_type}\nEnter quantity in kg:")

        try:
            quantity = Decimal(inputs[3])
            if quantity <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            return _end("Invalid quantity. Enter a positive number.")

        # 2c: ask for price.
        if len(inputs) == 4:
            return _con(
                f"{quantity} kg of {crop_type}\nEnter price per kg (GHS):"
            )

        try:
            price_per_unit = Decimal(inputs[4])
            if price_per_unit <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            return _end("Invalid price. Enter a positive number.")

        # 2d: commit the listing.
        try:
            _insert_ussd_product(admin, profile, crop_type, quantity, price_per_unit)
        except Exception:
            return _end("Sorry, we could not save your listing. Please try again.")

        return _end(
            f"Listed {quantity}kg of {crop_type} at GHS {price_per_unit}/kg.\n"
            "Buyers will be notified."
        )

    return _end("Invalid choice.")
