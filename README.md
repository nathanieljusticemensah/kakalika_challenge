# Kakalika — AgriTech MVP

A farmer-to-buyer produce marketplace with logistics coordination, built for
the GDSS-PSInno AgriTech challenge. FastAPI backend + Supabase (Postgres,
Auth, Storage, Realtime) + a React/TypeScript frontend, with an XGBoost model
estimating delivery cost at checkout.

## Stack

- **Backend**: FastAPI (Python), Supabase client, Paystack (mobile money
  escrow payments), USSD endpoint for feature-phone access
- **ML**: scikit-learn / XGBoost delivery-cost estimator (`ml/`)
- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS v4 + React Router
  — see [`frontend/README.md`](frontend/README.md) for details
- **Data**: Supabase Postgres with PostGIS (locations), Realtime (delivery
  tracking)

## Three portals (role-based)

| Role   | What it does                                              |
| ------ | ----------------------------------------------------------- |
| Farmer | List produce, track orders, arrange & assign deliveries     |
| Buyer  | Browse/filter produce, checkout, live delivery tracking     |
| Driver | Toggle availability, view jobs, progress trip statuses      |

## Getting started

### Backend

```bash
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase + Paystack keys
uvicorn main:app --reload   # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in Supabase + API values
npm run dev   # http://localhost:5173
```

## API overview

| Router          | Endpoints                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| `products`        | `POST/GET /products`                                                   |
| `orders`           | `POST/GET /orders`, `PATCH /orders/{id}/cancel`                        |
| `deliveries`      | `POST /deliveries`, driver assignment, status & cancellation           |
| `logistics`       | `POST /api/estimate-cost` — ML delivery-cost estimate                  |
| `payments`         | `POST /payments/initiate`, `GET /payments/verify` (Paystack)           |
| `ussd`              | `POST /ussd` — feature-phone flow                                      |

## Project layout

```
main.py, database.py     FastAPI app entrypoint + Supabase client
routers/                 API route handlers (products, orders, deliveries, logistics, payments, ussd)
models/                  Pydantic schemas
ml/                      Delivery-cost model training + trained artifact
frontend/                React app (see frontend/README.md)
```
