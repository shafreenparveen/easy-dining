import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { UtensilsCrossed } from "lucide-react";
import MenuView from "./MenuView.tsx";
import CartView from "./CartView.tsx";
import OrdersView from "./OrdersView.tsx";
import RequestsView from "./RequestsView.tsx";

type Tab = "menu" | "cart" | "orders" | "requests";

interface Props {
  sessionId: Id<"table_sessions">;
  tableNumber: number;
}

export default function SessionDining({ sessionId, tableNumber }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const session = useQuery(api.sessions.getSessionById, { sessionId });
  const cart = useQuery(api.cart.getCart, { sessionId });

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!session || session.status === "closed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center gap-4">
        <UtensilsCrossed className="size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Session Ended</h1>
        <p className="text-muted-foreground">
          Your dining session has been closed. Thank you for dining with us!
        </p>
      </div>
    );
  }

  const cartCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "menu", label: "Menu" },
    { id: "cart", label: "Cart", badge: cartCount > 0 ? cartCount : undefined },
    { id: "orders", label: "Orders" },
    { id: "requests", label: "Service" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary rounded-lg p-1.5">
            <UtensilsCrossed className="size-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-none">SmartDine</p>
            <p className="text-xs text-muted-foreground">Table {tableNumber} · {session.sessionNumber}</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {session.peopleCount} {session.peopleCount === 1 ? "guest" : "guests"}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="sticky top-[57px] z-10 bg-card border-b">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full text-xs px-1.5 py-0.5">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-8">
        {activeTab === "menu" && (
          <MenuView sessionId={sessionId} onAddedToCart={() => setActiveTab("cart")} />
        )}
        {activeTab === "cart" && (
          <CartView sessionId={sessionId} tableNumber={tableNumber} onOrderPlaced={() => setActiveTab("orders")} />
        )}
        {activeTab === "orders" && (
          <OrdersView sessionId={sessionId} />
        )}
        {activeTab === "requests" && (
          <RequestsView sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}
