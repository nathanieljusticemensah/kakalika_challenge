"""Create or reuse a test farmer and print an access token.

This script uses the Supabase service role key to create a user if needed,
then uses the anon client to sign in via OTP and verify with a fixed test code.
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client
from database import get_supabase_client

load_dotenv()


def get_env_var(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Environment variable {name} is required")
    return value


def get_admin_client() -> object:
    """Create a Supabase admin client using the service role key."""
    url = get_env_var("SUPABASE_URL")
    service_role_key = get_env_var("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, service_role_key)


def get_anon_client() -> object:
    """Return the normal anon Supabase client used elsewhere in the app."""
    return get_supabase_client()


def normalize_phone(phone: str) -> str:
    """Normalize phone numbers for reliable comparison."""
    if phone is None:
        return ""
    normalized = phone.strip()
    normalized = normalized.replace(" ", "")
    normalized = normalized.replace("-", "")
    normalized = normalized.replace("(", "")
    normalized = normalized.replace(")", "")
    if normalized.startswith("+"):
        normalized = normalized[1:]
    return normalized


def find_user_by_phone(admin_client: object, phone: str) -> dict | None:
    """Search for an existing user with the given phone number."""
    target_phone = normalize_phone(phone)
    page = 1
    per_page = 100

    while True:
        response = admin_client.auth.admin.list_users(page=page, per_page=per_page)
        users = response if response is not None else []
        for user in users:
            user_phone = getattr(user, "phone", None)
            if user_phone is None and isinstance(user, dict):
                user_phone = user.get("phone")
            if user_phone:
                matched_phone = normalize_phone(user_phone)
                if matched_phone == target_phone:
                    return user
        if len(users) < per_page:
            break
        page += 1

    return None


def create_test_farmer_user(admin_client: object, phone: str) -> dict:
    """Create a test farmer user using the admin service role client."""
    existing_user = find_user_by_phone(admin_client, phone)
    if existing_user:
        return existing_user

    attributes = {
        "phone": phone,
        "phone_confirm": True,
        "user_metadata": {
            "full_name": "Test Farmer",
            "role": "farmer",
        },
    }

    response = admin_client.auth.admin.create_user(attributes)
    user = getattr(response, "user", None)
    if user is None and isinstance(response, dict):
        user = response.get("user")
    if not user:
        raise RuntimeError("Failed to create test farmer user")
    return user


def _extract_token_from_auth_response(response: object) -> str | None:
    session = getattr(response, "session", None)
    if session is None and isinstance(response, dict):
        session = response.get("session")
    if session is None:
        return None
    token = getattr(session, "access_token", None)
    if token is None and isinstance(session, dict):
        token = session.get("access_token")
    return token


def main() -> None:
    phone = os.getenv("TEST_FARMER_PHONE")
    otp_code = os.getenv("TEST_FARMER_OTP_CODE")

    if not phone:
        print("ERROR: Set TEST_FARMER_PHONE in .env to your registered test phone number.")
        sys.exit(1)
    if not otp_code:
        print("ERROR: Set TEST_FARMER_OTP_CODE in .env to the fixed OTP code configured for that number.")
        sys.exit(1)

    admin_client = get_admin_client()
    user = find_user_by_phone(admin_client, phone)

    if user:
        user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        print(f"Found existing user for phone {phone}: {user_id}")
    else:
        print(f"Creating new test farmer user for phone {phone}")
        user = create_test_farmer_user(admin_client, phone)
        user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        print(f"Created user id: {user_id}")

    anon_client = get_anon_client()
    print(f"Requesting OTP for {phone} using anon client...")
    otp_response = anon_client.auth.sign_in_with_otp({"phone": phone})
    if not otp_response:
        raise RuntimeError("Failed to request OTP")
    print("OTP request sent (or mocked by Supabase test phone settings).")

    print(f"Verifying OTP code {otp_code}...")
    verify_response = anon_client.auth.verify_otp({"phone": phone, "token": otp_code, "type": "sms"})
    access_token = _extract_token_from_auth_response(verify_response)
    if not access_token:
        raise RuntimeError("Failed to obtain access token from OTP verification")

    print("\n=== Farmer Access Token ===")
    print(access_token)
    print("=== End Token ===\n")


if __name__ == "__main__":
    main()
