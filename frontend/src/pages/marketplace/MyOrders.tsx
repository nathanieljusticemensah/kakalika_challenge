import { useEffect } from "react";
import { useAsync } from "../../hooks/useAsync";
import { listOrders, listProducts } from "../../lib/api";
import { fetchDeliveriesByOrderIds } from "../../lib/deliveries";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Delivery, Order, Product } from "../../types";
import { formatDate, formatGHS, titleCase } from "../../lib/format";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import { DeliveryTimeline } from "../../components/DeliveryTimeline";
import { Link } from "react-router-dom";

interface BuyerData {
  orders: Order[];
  deliveries: Record<string, Delivery>;
  products: Record<string, Product>;
}

async function loadBuyerData(): Promise<BuyerData> {
  const orders = await listOrders();
  const [deliveries, available, unavailable] = await Promise.all([
    fetchDeliveriesByOrderIds(orders.map((o) => o.id)),
    listProducts({ status: "available" }),
    listProducts({ status: "unavailable" }),
  ]);
  const deliveryMap: Record<string, Delivery> = {};
  for (const d of deliveries) deliveryMap[d.order_id] = d;
  const productMap: Record<string, Product> = {};
  for (const p of [...available, ...unavailable]) productMap[p.id] = p;
  return { orders, deliveries: deliveryMap, products: productMap };
}

export function MyOrders() {
  const { profile } = useAuth();
  const buyerId = profile?.id ?? "";
  const { data, loading, error, reload } = useAsync(loadBuyerData, []);

  // Live updates: refresh when this buyer's orders or their deliveries change.
  useEffect(() => {
    if (!buyerId) return;
    const channel = supabase
      .channel(`buyer-orders-${buyerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `buyer_id=eq.${buyerId}`,
        },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [buyerId, reload]);

  return (
    <div>
      <PageHeader
        title="My Orders"
        subtitle="Track your purchases and deliveries in real time."
        action={
          <Button variant="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : (data?.orders.length ?? 0) === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Browse the marketplace and place your first order."
          action={
            <Link to="/marketplace">
              <Button>Go to marketplace</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {data!.orders.map((order) => {
            const product = data!.products[order.product_id];
            const delivery = data!.deliveries[order.id] ?? null;
            return (
              <Card key={order.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {product ? titleCase(product.crop_type) : "Produce order"}
                      </h3>
                      <StatusBadge status={String(order.status)} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {Number(order.quantity_ordered)} {product?.unit ?? "units"} ·{" "}
                      {formatGHS(order.total_price)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Placed {formatDate(order.created_at)} · #{order.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <DeliveryTimeline delivery={delivery} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
