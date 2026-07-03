import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createOrder, estimateCost } from "../../lib/api";
import type { LatLng, Product } from "../../types";
import { formatGHS, titleCase } from "../../lib/format";
import { Alert, Button, Field, Input } from "../../components/ui";
import { Modal } from "../../components/Modal";
import {
  DEFAULT_LOCATION,
  LocationPicker,
  type LatLngValue,
} from "../../components/LocationPicker";

function productLatLng(product: Product): LatLng | null {
  const loc = product.location;
  if (loc && typeof loc === "object" && "lat" in loc) return loc;
  return null;
}

export function CheckoutModal({
  product,
  onClose,
  onOrdered,
}: {
  product: Product;
  onClose: () => void;
  onOrdered: () => void;
}) {
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState("1");
  const [delivery, setDelivery] = useState<LatLngValue>(DEFAULT_LOCATION);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Number(quantity) || 0;
  const subtotal = useMemo(
    () => qty * Number(product.price_per_unit),
    [qty, product.price_per_unit],
  );

  // Fetch a delivery cost estimate whenever quantity or drop-off changes.
  useEffect(() => {
    const pickup = productLatLng(product);
    if (!pickup || qty <= 0) {
      setEstimate(null);
      return;
    }
    const lat = Number(delivery.lat);
    const lng = Number(delivery.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    let active = true;
    setEstimating(true);
    const handle = setTimeout(() => {
      estimateCost({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: lat,
        dropoff_lng: lng,
        payload_kg: qty,
      })
        .then((res) => {
          if (active) setEstimate(res.estimated_cost_ghs);
        })
        .catch(() => {
          if (active) setEstimate(null);
        })
        .finally(() => {
          if (active) setEstimating(false);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [product, qty, delivery.lat, delivery.lng]);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (qty <= 0) return setError("Enter a valid quantity.");
    if (qty > Number(product.quantity))
      return setError(`Only ${Number(product.quantity)} ${product.unit} available.`);

    setBusy(true);
    try {
      await createOrder({
        product_id: product.id,
        quantity_ordered: qty,
        delivery_lat: Number(delivery.lat),
        delivery_lng: Number(delivery.lng),
      });
      onOrdered();
      navigate("/marketplace/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Order ${titleCase(product.crop_type)}`}>
      <form onSubmit={placeOrder} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">Unit price</span>
          <span className="font-semibold text-slate-900">
            {formatGHS(product.price_per_unit)} / {product.unit}
          </span>
        </div>

        <Field
          label={`Quantity (${product.unit})`}
          hint={`${Number(product.quantity)} ${product.unit} available`}
        >
          <Input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </Field>

        <LocationPicker
          value={delivery}
          onChange={setDelivery}
          label="Delivery location"
        />

        <div className="space-y-1 rounded-lg border border-slate-200 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Produce subtotal</span>
            <span className="font-medium text-slate-800">
              {formatGHS(subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">
              Est. delivery {estimating && "…"}
            </span>
            <span className="font-medium text-slate-800">
              {estimate != null ? formatGHS(estimate) : "—"}
            </span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-base font-bold">
            <span className="text-slate-900">Estimated total</span>
            <span className="text-brand-700">
              {formatGHS(subtotal + (estimate ?? 0))}
            </span>
          </div>
          <p className="pt-1 text-xs text-slate-400">
            Delivery cost is an AI estimate and confirmed once a driver is
            assigned.
          </p>
        </div>

        <Button type="submit" loading={busy} className="w-full">
          Place order
        </Button>
      </form>
    </Modal>
  );
}
