# this contains the routes for the products 
from fastapi import APIRouter
from models.schemas import ProductBase
from database import supabase

router = APIRouter()

@router.post("/products")
async def create_product(product: ProductBase):
    # TODO: Insert product into Supabase 'Products' table
    return {"message": "Produce uploaded successfully", "data": product}

@router.get("/products")
async def get_products(category: str = None):
    # TODO: Fetch and filter products from Supabase for the buyer
    return {"message": "List of available produce", "data": []}