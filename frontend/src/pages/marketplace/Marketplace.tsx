import { useState } from "react";
import { useAsync } from "../../hooks/useAsync";
import { listProducts, type ProductFilters } from "../../lib/api";
import type { Product } from "../../types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Alert,
} from "../../components/ui";
import { ProductCard } from "../../components/ProductCard";
import { CheckoutModal } from "./CheckoutModal";

const CROP_OPTIONS = [
  "",
  "Tomatoes",
  "Peppers",
  "Onions",
  "Cabbage",
  "Garden Eggs",
  "Okra",
  "Carrots",
  "Lettuce",
];

export function Marketplace() {
  const [filters, setFilters] = useState<ProductFilters>({ status: "available" });
  const [applied, setApplied] = useState<ProductFilters>({ status: "available" });
  const [selected, setSelected] = useState<Product | null>(null);

  const products = useAsync(() => listProducts(applied), [applied]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setApplied({ ...filters, status: "available" });
  }

  function clearFilters() {
    const reset = { status: "available" };
    setFilters(reset);
    setApplied(reset);
  }

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle="Fresh produce direct from Ghana's farmers."
      />

      <Card className="mb-6 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
        >
          <Field label="Crop type">
            <Select
              value={filters.crop_type ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  crop_type: e.target.value || undefined,
                }))
              }
            >
              {CROP_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === "" ? "All crops" : c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max price / unit (GHS)">
            <Input
              type="number"
              min="0"
              step="any"
              value={filters.max_price ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  max_price: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              placeholder="Any"
            />
          </Field>
          <Button type="submit">Search</Button>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Clear
          </Button>
        </form>
      </Card>

      {products.error && <Alert kind="error">{products.error}</Alert>}

      {products.loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : (products.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No produce found"
          description="Try widening your filters or check back soon — farmers list fresh produce daily."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.data!.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              footer={
                <Button className="w-full" onClick={() => setSelected(product)}>
                  Order now
                </Button>
              }
            />
          ))}
        </div>
      )}

      {selected && (
        <CheckoutModal
          product={selected}
          onClose={() => setSelected(null)}
          onOrdered={() => setSelected(null)}
        />
      )}
    </div>
  );
}
