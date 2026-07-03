# this file contains the entry point of the FATAPI
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import logistics, orders, products
from database import get_supabase_client

app = FastAPI(title="AgriTech MVP API", version="1.0.0")

# Crucial for Frontend Integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update this to the frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the routers
app.include_router(products.router)
app.include_router(logistics.router)
app.include_router(orders.router)

@app.get("/")
def read_root():
    return {"status": "API is running", "phase": "1 - Foundation"}


@app.get("/test-db")
def test_db():
    client = get_supabase_client()
    data = client.table("profiles").select("*").execute()
    return data.data