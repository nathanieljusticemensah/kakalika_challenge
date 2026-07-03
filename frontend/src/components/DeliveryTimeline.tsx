import type { Delivery } from "../types";

const STEPS: { key: string; label: string }[] = [
  { key: "pending", label: "Awaiting driver" },
  { key: "driver_assigned", label: "Driver assigned" },
  { key: "arrived_at_farm", label: "Arrived at farm" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
];

export function DeliveryTimeline({ delivery }: { delivery: Delivery | null }) {
  if (!delivery) {
    return (
      <p className="text-sm text-slate-400">
        Delivery not arranged yet — the farmer will assign a driver soon.
      </p>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === delivery.status);

  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => {
        const done = currentIndex >= 0 && i <= currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-brand-600 text-white"
                    : "bg-slate-200 text-slate-500"
                } ${active ? "ring-4 ring-brand-100" : ""}`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`mt-1 hidden w-20 text-center text-[11px] leading-tight sm:block ${
                  done ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  i < currentIndex ? "bg-brand-600" : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
