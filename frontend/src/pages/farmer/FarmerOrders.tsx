import { useMemo, useState } from "react";
import { useAsync } from "../../hooks/useAsync";
import {
  assignDriver,
  createDelivery,
  getNearbyDrivers,
  listOrders,
  listProducts,
} from "../../lib/api";
import { fetchDeliveriesByOrderIds } from "../../lib/deliveries";
import type { Delivery, NearbyDriver, Order, Product } from "../../types";
import { formatDate, formatGHS, metersToKm, titleCase } from "../../lib/format";
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

interface FarmerData {
  orders: Order[];
  deliveries: Record<string, Delivery>; // keyed by order_id
  products: Record<string, Product>; // keyed by product_id
}

async function loadFarmerData(): Promise<FarmerData> {
  const orders = await listOrders();
  const orderIds = orders.map((o) => o.id);
  const [deliveries, available, unavailable] = await Promise.all([
    fetchDeliveriesByOrderIds(orderIds),
    listProducts({ status: "available" }),
    listProducts({ status: "unavailable" }),
  ]);
  const deliveryMap: Record<string, Delivery> = {};
  for (const d of deliveries) deliveryMap[d.order_id] = d;
  const productMap: Record<string, Product> = {};
  for (const p of [...available, ...unavailable]) productMap[p.id] = p;
  return { orders, deliveries: deliveryMap, products: productMap };
}

export function FarmerOrders() {
  const { data, loading, error, reload } = useAsync(loadFarmerData, []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [driverModal, setDriverModal] = useState<{
    delivery: Delivery;
    order: Order;
  } | null>(null);

  async function handleCreateDelivery(order: Order) {
    setActionError(null);
    setBusyId(order.id);
    try {
      await createDelivery(order.id);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to arrange delivery.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = useMemo(() => data?.orders ?? [], [data]);

  return (
    <div>
      <PageHeader
        title="Orders & Deliveries"
        subtitle="Fulfil buyer orders and coordinate drivers to move your produce."
        action={
          <Button variant="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />

      {actionError && (
        <div className="mb-4">
          <Alert kind="error">{actionError}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When buyers order your produce, their orders will appear here for you to fulfil."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((order) => {
            const product = data!.products[order.product_id];
            const delivery = data!.deliveries[order.id];
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
                      Ordered {formatDate(order.created_at)} · #{order.id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {delivery ? (
                      <DeliveryPanel
                        delivery={delivery}
                        onManageDriver={() =>
                          setDriverModal({ delivery, order })
                        }
                      />
                    ) : (
                      <Button
                        loading={busyId === order.id}
                        onClick={() => handleCreateDelivery(order)}
                      >
                        Arrange delivery
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {driverModal && (
        <NearbyDriversModal
          delivery={driverModal.delivery}
          onClose={() => setDriverModal(null)}
          onAssigned={() => {
            setDriverModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DeliveryPanel({
  delivery,
  onManageDriver,
}: {
  delivery: Delivery;
  onManageDriver: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Delivery</span>
        <StatusBadge status={String(delivery.status)} />
      </div>
      {delivery.status === "pending" && (
        <Button variant="secondary" onClick={onManageDriver}>
          Find & assign driver
        </Button>
      )}
      {delivery.driver_id && (
        <span className="text-xs text-slate-400">
          Driver #{delivery.driver_id.slice(0, 8)}
        </span>
      )}
    </div>
  );
}

function NearbyDriversModal({
  delivery,
  onClose,
  onAssigned,
}: {
  delivery: Delivery;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const drivers = useAsync<NearbyDriver[]>(
    () => getNearbyDrivers(delivery.id),
    [delivery.id],
  );
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(driverId: string) {
    setError(null);
    setAssigningId(driverId);
    try {
      await assignDriver(delivery.id, driverId);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign driver.");
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nearby available drivers">
      {error && (
        <div className="mb-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      {drivers.error && <Alert kind="error">{drivers.error}</Alert>}
      {drivers.loading ? (
        <div className="grid place-items-center py-10">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : (drivers.data?.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No available drivers within range right now. Try again shortly.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {drivers.data!.map((driver) => (
            <li
              key={driver.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {driver.full_name ?? "Driver"}
                </p>
                <p className="text-xs text-slate-500">
                  {titleCase(driver.vehicle_type ?? "vehicle")} ·{" "}
                  {metersToKm(driver.distance_meters)} away
                </p>
              </div>
              <Button
                loading={assigningId === driver.id}
                onClick={() => assign(driver.id)}
              >
                Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
