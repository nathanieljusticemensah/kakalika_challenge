import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import {
  fetchDriverDetails,
  fetchOpenDeliveries,
  setDriverAvailability,
} from "../../lib/deliveries";
import { formatDate, formatGHS } from "../../lib/format";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
} from "../../components/ui";

export function DriverJobBoard() {
  const { profile } = useAuth();
  const driverId = profile?.id ?? "";

  const details = useAsync(() => fetchDriverDetails(driverId), [driverId]);
  const open = useAsync(() => fetchOpenDeliveries(), []);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = Boolean(details.data?.is_available);

  async function toggleAvailability() {
    setError(null);
    setToggling(true);
    try {
      await setDriverAvailability(driverId, !isAvailable);
      details.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update availability.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Job Board"
        subtitle="Stay available to get matched with nearby delivery jobs."
      />

      {error && (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Availability status
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {isAvailable
              ? "You're online — farmers can match you to nearby jobs."
              : "You're offline — you won't receive new job matches."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
              isAvailable
                ? "bg-brand-100 text-brand-800"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isAvailable ? "bg-brand-600" : "bg-slate-400"
              }`}
            />
            {isAvailable ? "Available" : "Offline"}
          </span>
          <Button
            variant={isAvailable ? "secondary" : "primary"}
            loading={toggling || details.loading}
            onClick={toggleAvailability}
          >
            {isAvailable ? "Go offline" : "Go online"}
          </Button>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Open jobs nearby</h2>
        <Button variant="ghost" onClick={open.reload}>
          Refresh
        </Button>
      </div>

      {open.error && <Alert kind="error">{open.error}</Alert>}

      {open.loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : (open.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No open jobs right now"
          description="When farmers arrange deliveries near you, they'll appear here. Keep your status available to get matched."
        />
      ) : (
        <div className="space-y-3">
          {open.data!.map((delivery) => (
            <Card
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    Delivery #{delivery.id.slice(0, 8)}
                  </span>
                  <StatusBadge status={String(delivery.status)} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Posted {formatDate(delivery.created_at)}
                  {delivery.estimated_cost != null &&
                    ` · Est. ${formatGHS(delivery.estimated_cost)}`}
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Awaiting farmer assignment
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
