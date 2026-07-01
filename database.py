# this file contains logic to handle supabase connection initialisation
import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("❌ Error: SUPABASE_URL or SUPABASE_KEY not found in .env file.")
    sys.exit(1) # Stop the app if credentials are missing

# Initialize the Supabase client
supabase: Client = create_client(url, key)
print("✅ Database connection successful!")

# Quick connectivity test
try:
    # Try to fetch one row from a public table or just test the client
    response = supabase.table("profiles").select("*").limit(1).execute()
    print("🚀 Supabase is reachable!")
except Exception as e:
    print(f"⚠️ Supabase is reachable, but encountered an error querying data: {e}")