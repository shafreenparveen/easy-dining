import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR, orderStatusColor, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ClipboardList, CheckCircle, ChefHat, Bell, Star, X } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

type StatusFilter = "all" | "placed" | "accepted" | "preparing" | "ready" | "served";

export default function OrdersPage() {
  const [filter, setFilter] = useState<StatusFilter>("placed");
  const [rejectDialog, setRejectDialog] = useState<Id<"orders"> | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const activeOrders = useQuery(api.orders.listActiveOrders, {});
  const allOrders = useQuery(api.orders.listAllOrdersForManagement, {});
  const updateStatus = useMutation(api.orders.updateOrderStatus);

  const orders = filter === "all" || filter === "served"
    ? allOrders?.filter((o) => filter === "all" || o.status === filter) ?? []
    : activeOrders?.filter((o) => filter === "placed" ? true : o.status === filter) ?? [];

  const handleStatus = async (
    orderId: Id<"orders">,
    status: "accepted" | "preparing" | "ready" | "served" | "rejected",
    reason?: string
  ) => {
    try {
      await updateStatus({ orderId, status, rejectionReason: reason });
      toast.success(`Order updated to ${status}`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to update order");
    }
  };

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: "placed", label: "New" },
    { id: "accepted", label: "Accepted" },
    { id: "preparing", label: "Preparing" },
    { id: "ready", label: "Ready" },
    { id: "served", label: "Served" },
    { id: "all", label: "All" },
  ];

  const isLoading = filter === "all" || filter === "served" ? allOrders === undefined : activeOrders === undefined;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>No orders</EmptyTitle>
            <EmptyDescription>No {filter !== "all" ? filter : ""} orders right now</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order._id} className="bg-card border rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{order.orderNumber}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${orderStatusColor(order.status)}`}>
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Table {order.table?.tableNumber ?? "?"} · {timeAgo(order.placedAt)}
                  </p>
                </div>
                <p className="font-bold text-lg">{formatINR(order.total)}</p>
              </div>

              {/* Items */}
              <div className="px-4 py-3 space-y-2">
                {order.items.map((item) => (
                  <div key={item._id} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{item.quantity}× {item.menuItemName}</span>
                      <span>{formatINR(item.lineTotal)}</span>
                    </div>
                    {item.addons.map((a) => (
                      <p key={a._id} className="text-xs text-muted-foreground pl-4">+ {a.addonName} ({formatINR(a.addonPrice)}/unit)</p>
                    ))}
                    {item.specialInstructions && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 pl-4 font-medium">
                        Note: {item.specialInstructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="px-4 py-3 border-t flex flex-wrap gap-2">
                {order.status === "placed" && (
                  <>
                    <Button size="sm" onClick={() => handleStatus(order._id, "accepted")} className="gap-1">
                      <CheckCircle className="size-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setRejectDialog(order._id); setRejectReason(""); }} className="gap-1">
                      <X className="size-3.5" /> Reject
                    </Button>
                  </>
                )}
                {order.status === "accepted" && (
                  <>
                    <Button size="sm" onClick={() => handleStatus(order._id, "preparing")} className="gap-1 bg-orange-500 hover:bg-orange-600 text-white">
                      <ChefHat className="size-3.5" /> Start Preparing
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setRejectDialog(order._id); setRejectReason(""); }} className="gap-1">
                      <X className="size-3.5" /> Reject
                    </Button>
                  </>
                )}
                {order.status === "preparing" && (
                  <Button size="sm" onClick={() => handleStatus(order._id, "ready")} className="gap-1 bg-green-600 hover:bg-green-700 text-white">
                    <Bell className="size-3.5" /> Mark Ready
                  </Button>
                )}
                {order.status === "ready" && (
                  <Button size="sm" onClick={() => handleStatus(order._id, "served")} className="gap-1 bg-purple-600 hover:bg-purple-700 text-white">
                    <Star className="size-3.5" /> Mark Served
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for rejecting this order (optional)</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Item out of stock..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (rejectDialog) {
                  await handleStatus(rejectDialog, "rejected", rejectReason || undefined);
                  setRejectDialog(null);
                }
              }}
            >
              Reject Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
