# AgriTech Marketplace — Frontend

React + TypeScript web app for the GDSS-PSInno AgriTech MVP: a farmer-to-buyer
produce marketplace with logistics coordination. Built with Vite, Tailwind CSS,
React Router and Supabase, talking to the FastAPI backend in the repo root.

## Three portals (role-based)

| Role   | Routes                        | What it does                                             |
| ------ | ----------------------------- | -------------------------------------------------------- |
| Farmer | `/farmer`, `/farmer/orders`   | List produce, track orders, arrange & assign deliveries  |
| Buyer  | `/marketplace`, `.../orders`  | Browse/filter produce, checkout, live delivery tracking  |
| Driver | `/driver`, `/driver/trips`    | Toggle availability, view jobs, progress trip statuses   |

A user's role is stored on their `profiles` row and picked during onboarding.

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **React Router v6** for role-guarded routing
- **@supabase/supabase-js** for phone-OTP auth, profile/role reads, and
  Realtime delivery updates on the driver's trips
- Typed `fetch` client (`src/lib/api.ts`) for the FastAPI endpoints, attaching
  the Supabase access token as a Bearer header on every call

## Getting started

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in your Supabase + API values
npm run dev                  # http://localhost:5173
```

Environment variables (see `.env.example`):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — same Supabase project as the backend
- `VITE_API_BASE_URL` — FastAPI base URL (default `http://localhost:8000`)

The backend runs from the repo root: `uvicorn main:app --reload`.

## How it maps to the schema

- `profiles` — role, name, region, base location (set at onboarding)
- `products` — created via `POST /products` (multipart w/ image); browsed via `GET /products`
- `orders` — placed via `POST /orders`; listed via `GET /orders` (scoped by role)
- `deliveries` — created & driver-assigned via the backend; read directly from
  Supabase for the driver job board / trip lists (backend exposes writes only)
- `driver_details` — vehicle, capacity, availability, current location
- `/api/estimate-cost` — AI delivery-cost estimate shown at checkout

## Project layout

```
src/
  lib/         supabase client, typed API client, Supabase read helpers, formatters
  context/     AuthContext (session + profile/role)
  components/  UI primitives, Layout, route guard, product card, delivery timeline
  hooks/       useAsync data-loading hook
  pages/
    farmer/       dashboard, product form, orders & deliveries
    marketplace/  browse, checkout, my orders
    driver/       job board, my trips
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — type-check + production build
- `npm run preview` — preview the built app
