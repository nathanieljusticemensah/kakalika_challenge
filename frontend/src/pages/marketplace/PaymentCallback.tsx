import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyPayment } from "../../lib/api";
import { Alert, Button, Card, PageHeader, Spinner } from "../../components/ui";

type State =
  | { kind: "verifying" }
  | { kind: "success"; orderId: string }
  | { kind: "failed"; message: string };

export function PaymentCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reference = params.get("reference") ?? params.get("trxref");
  const [state, setState] = useState<State>({ kind: "verifying" });

  useEffect(() => {
    if (!reference) {
      setState({
        kind: "failed",
        message: "Missing payment reference in callback URL.",
      });
      return;
    }
    let active = true;
    verifyPayment(reference)
      .then((res) => {
        if (!active) return;
        if (res.paid) {
          setState({ kind: "success", orderId: res.order_id });
          setTimeout(() => {
            if (active) navigate("/marketplace/orders", { replace: true });
          }, 1500);
        } else {
          setState({
            kind: "failed",
            message: `Payment was not successful (status: ${res.status ?? "unknown"}).`,
          });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState({
          kind: "failed",
          message: err instanceof Error ? err.message : "Failed to verify payment.",
        });
      });
    return () => {
      active = false;
    };
  }, [reference, navigate]);

  return (
    <div>
      <PageHeader title="Payment" subtitle="Verifying your Paystack transaction." />
      <Card className="p-6">
        {state.kind === "verifying" && (
          <div className="grid place-items-center gap-3 py-8">
            <Spinner className="h-7 w-7 text-brand-600" />
            <p className="text-sm text-slate-500">
              Confirming your payment with Paystack…
            </p>
          </div>
        )}
        {state.kind === "success" && (
          <div className="space-y-4">
            <Alert kind="success">
              Payment received. Your order is now in escrow.
            </Alert>
            <Link to="/marketplace/orders">
              <Button>Go to my orders</Button>
            </Link>
          </div>
        )}
        {state.kind === "failed" && (
          <div className="space-y-4">
            <Alert kind="error">{state.message}</Alert>
            <div className="flex gap-2">
              <Link to="/marketplace">
                <Button variant="secondary">Back to marketplace</Button>
              </Link>
              <Link to="/marketplace/orders">
                <Button>View orders</Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
