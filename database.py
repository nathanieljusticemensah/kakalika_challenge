# db.py — Supabase connection handling
import os
import sys
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Lazily initialize and return a singleton Supabase client."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL or SUPABASE_KEY not found in environment/.env file."
        )

    _supabase_client = create_client(url, key)
    return _supabase_client


def test_connection(table: str = "profiles") -> bool:
    """Actually verify connectivity by querying a table. Returns True/False."""
    client = get_supabase_client()
    try:
        client.table(table).select("*").limit(1).execute()
        print("🚀 Supabase is reachable!")
        return True
    except Exception as e:
        print(f"⚠️ Could not query '{table}': {e}")
        return False


if __name__ == "__main__":
    # Only runs sys.exit / prints when executed directly, not on import
    try:
        get_supabase_client()
        print(" Supabase client initialized.")
    except RuntimeError as e:
        print(f" Error: {e}")
        sys.exit(1)

    test_connection()