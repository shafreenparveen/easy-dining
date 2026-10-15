import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatINR, orderStatusColor, isCancellable, secondsUntilDeadline, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ClipboardList, Clock } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

interface Props {
  sessionId: Id<"table_sessions">;
}

function CancelTimer({ deadline, orderId, sessionId }: { deadline: string; orderId: Id<"orders">; sessionId: Id<"table_sessions">; status: string }) {
  const [secs, setSecs] = useState(() => secondsUntilDeadline(deadline));
  const cancelOrder = useMutation(api.orders.cancelOrder);

  useEffect(() => {
    if (secs <= 0) return;
    const interval = setInterval(() => {
      setSecs(secondsUntilDeadline(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, secs]);

  const handleCancel = async () => {
    try {
      await cancelOrder({ orderId, sessionId });
      toast.success("Order cancelled");
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Cannot cancel this order");
    }
  };

  if (secs <= 0) return null;

  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="text-xs h-7 gap-1"
      onClick={handleCancel}
    >
      <Clock className="size-3" />
      Cancel ({mins}:{String(s).padStart(2, "0")})
    </Button>
  );
}

export default function OrdersView({ sessionId }: Props) {
  const orders = useQuery(api.orders.getOrdersForSession, { sessionId });

  if (orders === undefined) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>Place your first order from the menu</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const statusLabels: Record<string, string> = {
    placed: "Order Placed",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready for Pickup",
    served: "Served",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };

  const statusSteps = ["placed", "accepted", "preparing", "ready", "served"];

  return (
    <div className="p-4 space-y-4">
      {orders.map((order) => {
        const currentStep = statusSteps.indexOf(order.status);
        const canCancel = isCancellable(order.cancellationDeadline, order.status);

        return (
          <div key={order._id} className="bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div>
                <p className="font-bold text-sm">{order.orderNumber}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(order.placedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${orderStatusColor(order.status)}`}>
                  {statusLabels[order.status] ?? order.status}
                </span>
              </div>
            </div>

            {/* Status progress bar */}
            {!["cancelled", "rejected"].includes(order.status) && (
              <div className="px-4 py-2 border-b">
                <div className="flex items-center gap-1">
                  {statusSteps.map((step, idx) => (
                    <div key={step} className="flex-1 flex items-center">
                      <div className={`h-2 rounded-full flex-1 transition-colors ${
                        idx <= currentStep ? "bg-primary" : "bg-muted"
                      }`} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {statusSteps.map((step) => (
                    <span key={step} className="text-[9px] text-muted-foreground capitalize">{step}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="px-4 py-3 space-y-2">
              {order.items.map((item) => (
                <div key={item._id}>
                  <div className="flex justify-between text-sm">
                    <span>{item.quantity}× {item.menuItemName}</span>
                    <span className="font-medium">{formatINR(item.lineTotal)}</span>
                  </div>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-muted-foreground pl-4">
                      + {item.addons.map((a) => a.addonName).join(", ")}
                    </p>
                  )}
                  {item.specialInstructions && (
                    <p className="text-xs text-primary pl-4 italic">"{item.specialInstructions}"</p>
                  )}
                </div>
              ))}
              {order.rejectionReason && (
                <p className="text-xs text-destructive">Reason: {order.rejectionReason}</p>
              )}
            </div>

            <div className="px-4 pb-3 flex items-center justify-between">
              <span className="font-bold">{formatINR(order.total)}</span>
              {canCancel && (
                <CancelTimer deadline={order.cancellationDeadline} orderId={order._id} sessionId={sessionId} status={order.status} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
