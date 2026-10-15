import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ShoppingCart, Trash2, Minus, Plus } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { motion } from "motion/react";

interface Props {
  sessionId: Id<"table_sessions">;
  tableNumber: number;
  onOrderPlaced: () => void;
}

export default function CartView({ sessionId, tableNumber, onOrderPlaced }: Props) {
  const cart = useQuery(api.cart.getCart, { sessionId });
  const removeItem = useMutation(api.cart.removeFromCart);
  const updateQty = useMutation(api.cart.updateCartItemQuantity);
  const placeOrder = useMutation(api.orders.placeOrder);
  const [placing, setPlacing] = useState(false);

  if (cart === undefined) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
          <EmptyTitle>Your cart is empty</EmptyTitle>
          <EmptyDescription>Add items from the menu to get started</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const handleRemove = async (cartItemId: Id<"cart_items">) => {
    try {
      await removeItem({ cartItemId, sessionId });
    } catch (e) {
      toast.error("Failed to remove item");
    }
  };

  const handleQty = async (cartItemId: Id<"cart_items">, qty: number) => {
    try {
      await updateQty({ cartItemId, sessionId, quantity: qty });
    } catch (e) {
      toast.error("Failed to update quantity");
    }
  };

  const handlePlaceOrder = async () => {
    setPlacing(true);
    try {
      const result = await placeOrder({ sessionId });
      toast.success(`Order ${result.orderNumber} placed!`);
      onOrderPlaced();
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 space-y-3">
        {cart.items.map((item) => (
          <motion.div
            key={item._id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card border rounded-xl p-3"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{item.menuItemName}</p>
                {item.addons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    + {item.addons.map((a) => a.addonName).join(", ")}
                  </p>
                )}
                {item.specialInstructions && (
                  <p className="text-xs text-primary mt-0.5 italic">"{item.specialInstructions}"</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-sm font-bold">{formatINR(item.lineTotal)}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-6"
                    onClick={() => item.quantity > 1 ? handleQty(item._id, item.quantity - 1) : handleRemove(item._id)}
                  >
                    <Minus className="size-2.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-6"
                    onClick={() => handleQty(item._id, item.quantity + 1)}
                    disabled={item.quantity >= 20}
                  >
                    <Plus className="size-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive"
                    onClick={() => handleRemove(item._id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Order total and place order */}
      <div className="sticky bottom-0 bg-card border-t p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-bold text-lg">{formatINR(cart.total)}</span>
        </div>
        <Button
          onClick={handlePlaceOrder}
          disabled={placing || cart.items.length === 0}
          className="w-full"
          size="lg"
        >
          {placing ? "Placing Order..." : `Place Order · ${formatINR(cart.total)}`}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Table {tableNumber} · You have 3 minutes to cancel after placing
        </p>
      </div>
    </div>
  );
}
