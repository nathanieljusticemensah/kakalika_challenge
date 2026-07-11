import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { fetchDriverDeliveries } from "../../lib/deliveries";
import { updateDeliveryStatus } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { Delivery } from "../../types";
import { formatDate, formatGHS, formatLatLng, googleMapsUrl } from "../../lib/format";
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

// The next status a driver can move a delivery into, and the button label.
const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  driver_assigned: { status: "arrived_at_farm", label: "Arrived at farm" },
  arrived_at_farm: { status: "in_transit", label: "Start transit" },
  in_transit: { status: "delivered", label: "Mark delivered" },
};

export function DriverTrips() {
  const { profile } = useAuth();
  const driverId = profile?.id ?? "";
  const { data, loading, error, reload } = useAsync(
    () => fetchDriverDeliveries(driverId),
    [driverId],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live updates: refresh when any of this driver's deliveries change.
  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel("driver-deliveries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deliveries",
          filter: `driver_id=eq.${driverId}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, reload]);

  async function advance(delivery: Delivery) {
    const next = NEXT_ACTION[delivery.status];
    if (!next) return;
    setActionError(null);
    setBusyId(delivery.id);
    try {
      await updateDeliveryStatus(delivery.id, next.status);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  }

  const active = (data ?? []).filter((d) => d.status !== "delivered");
  const past = (data ?? []).filter((d) => d.status === "delivered");

  return (
    <div>
      <PageHeader
        title="My Trips"
        subtitle="Update each delivery as you progress from farm to buyer."
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
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No trips assigned yet"
          description="Once a farmer assigns you a delivery, it will show up here for you to fulfil."
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Active</h2>
              {active.map((delivery) => (
                <TripCard
                  key={delivery.id}
                  delivery={delivery}
                  busy={busyId === delivery.id}
                  onAdvance={() => advance(delivery)}
                />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Completed</h2>
              {past.map((delivery) => (
                <TripCard key={delivery.id} delivery={delivery} busy={false} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TripCard({
  delivery,
  busy,
  onAdvance,
}: {
  delivery: Delivery;
  busy: boolean;
  onAdvance?: () => void;
}) {
  const next = NEXT_ACTION[delivery.status];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              Delivery #{delivery.id.slice(0, 8)}
            </h3>
            <StatusBadge status={String(delivery.status)} />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Order #{delivery.order_id.slice(0, 8)} · Assigned{" "}
            {formatDate(delivery.created_at)}
            {delivery.estimated_cost != null &&
              ` · Payout est. ${formatGHS(delivery.estimated_cost)}`}
          </p>
        </div>
        {next && onAdvance && (
          <Button loading={busy} onClick={onAdvance}>
            {next.label}
          </Button>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-100 pt-5">
        <LocationLink label="Pickup (farm)" location={delivery.pickup_location} />
        <LocationLink label="Dropoff (buyer)" location={delivery.dropoff_location} />
      </div>
      <div className="mt-5 border-t border-slate-100 pt-5">
        <DeliveryTimeline delivery={delivery} />
      </div>
    </Card>
  );
}

function LocationLink({
  label,
  location,
}: {
  label: string;
  location: Delivery["pickup_location"];
}) {
  const url = googleMapsUrl(location);
  return (
    <div className="text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-600 hover:underline"
        >
          {formatLatLng(location)} · Open in Maps
        </a>
      ) : (
        <p className="text-slate-500">{formatLatLng(location)}</p>
      )}
    </div>
  );
}
