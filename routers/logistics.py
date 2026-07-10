"""Routes for logistics: XGBoost-backed transport cost estimation."""

import math
import pickle
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from models.schemas import CostEstimateRequest

router = APIRouter(prefix="/api")

MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "cost_model.pkl"

_model_bundle: Optional[dict] = None


def _load_model_bundle() -> dict:
    """Lazily load and cache the trained model + its expected feature order.
    See ml/train_cost_model.py for how cost_model.pkl was produced."""
    global _model_bundle
    if _model_bundle is None:
        try:
            with open(MODEL_PATH, "rb") as f:
                _model_bundle = pickle.load(f)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cost model is not available. Run ml/train_cost_model.py to generate ml/cost_model.pkl.",
            ) from exc
    return _model_bundle


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


@router.post("/estimate-cost")
async def estimate_transport_cost(request: CostEstimateRequest):
    bundle = _load_model_bundle()
    model = bundle["model"]
    features = bundle["features"]

    distance_km = _haversine_km(request.pickup_lat, request.pickup_lng, request.dropoff_lat, request.dropoff_lng)
    feature_values = {"distance_km": distance_km, "payload_kg": request.payload_kg}
    input_row = [[feature_values[name] for name in features]]

    predicted_cost = float(model.predict(input_row)[0])
    estimated_price = round(max(predicted_cost, 0.0), 2)

    return {
        "status": "success",
        "estimated_cost_ghs": estimated_price,
        "currency": "GHS",
    }