import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Plus, Leaf, Drumstick } from "lucide-react";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import AddToCartDialog from "./AddToCartDialog.tsx";

interface Props {
  sessionId: Id<"table_sessions">;
  onAddedToCart: () => void;
}

export default function MenuView({ sessionId, onAddedToCart }: Props) {
  const menu = useQuery(api.menu.getMenuWithCategories, {});
  const [selectedItemId, setSelectedItemId] = useState<Id<"menu_items"> | null>(null);

  if (menu === undefined) {
    return (
      <div className="p-4 space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-32" />
            {[1, 2].map((j) => <Skeleton key={j} className="h-24 w-full rounded-xl" />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-8">
      {menu.map((category) => (
        <section key={category._id}>
          <h2 className="text-lg font-bold mb-3 pb-2 border-b">{category.name}</h2>
          <div className="space-y-3">
            {category.items.map((item) => (
              <div
                key={item._id}
                className="bg-card border rounded-xl overflow-hidden flex gap-3 p-3"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        {item.isVeg ? (
                          <Leaf className="size-3.5 text-green-600 flex-shrink-0" />
                        ) : (
                          <Drumstick className="size-3.5 text-red-500 flex-shrink-0" />
                        )}
                        <p className="font-semibold text-sm leading-tight">{item.name}</p>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                      )}
                      {item.addons.length > 0 && (
                        <p className="text-xs text-primary mt-1">+{item.addons.length} add-on{item.addons.length !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="font-bold text-sm">{formatINR(item.price)}</span>
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => setSelectedItemId(item._id)}
                      >
                        <Plus className="size-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {selectedItemId && (
        <AddToCartDialog
          menuItemId={selectedItemId}
          sessionId={sessionId}
          onClose={() => setSelectedItemId(null)}
          onAdded={() => {
            setSelectedItemId(null);
            onAddedToCart();
          }}
        />
      )}
    </div>
  );
}
