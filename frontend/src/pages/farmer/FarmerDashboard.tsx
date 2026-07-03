import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { listProducts, listOrders } from "../../lib/api";
import type { Product } from "../../types";
import { formatGHS } from "../../lib/format";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import { Modal } from "../../components/Modal";
import { ProductForm } from "./ProductForm";
import { ProductCard } from "../../components/ProductCard";

// A farmer's own listings: fetch both available and unavailable, keep only ours.
async function loadMyProducts(farmerId: string): Promise<Product[]> {
  const [available, unavailable] = await Promise.all([
    listProducts({ status: "available" }),
    listProducts({ status: "unavailable" }),
  ]);
  return [...available, ...unavailable].filter((p) => p.farmer_id === farmerId);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

export function FarmerDashboard() {
  const { profile } = useAuth();
  const farmerId = profile?.id ?? "";
  const [showForm, setShowForm] = useState(false);

  const products = useAsync(() => loadMyProducts(farmerId), [farmerId]);
  const orders = useAsync(() => listOrders(), []);

  const stats = useMemo(() => {
    const list = products.data ?? [];
    const orderList = orders.data ?? [];
    const revenue = orderList
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total_price), 0);
    return {
      listings: list.length,
      available: list.filter((p) => p.status === "available").length,
      orders: orderList.length,
      revenue,
    };
  }, [products.data, orders.data]);

  return (
    <div>
      <PageHeader
        title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        subtitle="Manage your produce listings and track incoming orders."
        action={<Button onClick={() => setShowForm(true)}>+ List produce</Button>}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active listings" value={String(stats.available)} />
        <Stat label="Total listings" value={String(stats.listings)} />
        <Stat label="Orders received" value={String(stats.orders)} />
        <Stat label="Order value" value={formatGHS(stats.revenue)} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">My produce</h2>
        </div>

        {products.error && <Alert kind="error">{products.error}</Alert>}

        {products.loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="h-7 w-7 text-brand-600" />
          </div>
        ) : (products.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No produce listed yet"
            description="List your first batch of vegetables to start receiving orders from buyers."
            action={
              <Button onClick={() => setShowForm(true)}>List produce</Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.data!.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                footer={<StatusBadge status={product.status} />}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="List new produce"
      >
        <ProductForm
          onCreated={() => {
            setShowForm(false);
            products.reload();
          }}
        />
      </Modal>
    </div>
  );
}
