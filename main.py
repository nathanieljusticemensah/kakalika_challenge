# this file contains the entry point of the FATAPI
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import products, logistics

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

@app.get("/")
def read_root():
    return {"status": "API is running", "phase": "1 - Foundation"}