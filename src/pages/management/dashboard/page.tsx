import { useQuery, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { Users, ShoppingBag, DollarSign, Table2, XCircle, TrendingUp, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

function StatCard({ title, value, icon: Icon, sub }: { title: string; value: string; icon: React.FC<{ className?: string }>; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="bg-primary/10 rounded-xl p-3">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [seeding, setSeeding] = useState(false);
  const analytics = useQuery(api.analytics.getAnalytics, { days: 1 });
  const analytics7 = useQuery(api.analytics.getAnalytics, { days: 7 });
  const activeSessions = useQuery(api.sessions.listActiveSessions, {});
  const activeOrders = useQuery(api.orders.listActiveOrders, {});
  const tables = useQuery(api.tables.listTables, {});
  const seedDatabase = useMutation(api.seed.seedDatabase);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDatabase();
      toast.success(result.message);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to seed database");
    } finally {
      setSeeding(false);
    }
  };

  if (analytics === undefined || activeSessions === undefined) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const newOrders = activeOrders?.filter((o) => o.status === "placed") ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Today, {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {tables !== undefined && tables.length === 0 && (
          <Button
            onClick={handleSeed}
            disabled={seeding}
            variant="secondary"
            size="sm"
            className="gap-2"
          >
            <Database className="size-4" />
            {seeding ? "Seeding..." : "Load Demo Data (Tables + Menu)"}
          </Button>
        )}
      </div>

      {/* Today stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Customers" value={String(analytics.totalCustomers)} icon={Users} sub="from new sessions" />
          <StatCard title="Orders" value={String(analytics.totalOrders)} icon={ShoppingBag} sub={`${analytics.cancelledOrders} cancelled`} />
          <StatCard title="Revenue" value={formatINR(analytics.totalRevenue)} icon={DollarSign} />
          <StatCard title="Active Tables" value={String(analytics.activeTables)} icon={Table2} />
          <StatCard title="New Orders" value={String(newOrders.length)} icon={TrendingUp} sub="awaiting acceptance" />
          <StatCard title="Cancelled" value={String(analytics.cancelledOrders)} icon={XCircle} sub="today" />
        </div>
      </div>

      {/* 7-day stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Last 7 Days</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Customers" value={String(analytics7?.totalCustomers ?? 0)} icon={Users} />
          <StatCard title="Orders" value={String(analytics7?.totalOrders ?? 0)} icon={ShoppingBag} />
          <StatCard title="Revenue" value={formatINR(analytics7?.totalRevenue ?? 0)} icon={DollarSign} />
        </div>
      </div>

      {/* Active tables */}
      {activeSessions && activeSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Tables</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {activeSessions.map(({ session, table, bill }) => (
              <Card key={session._id} className="text-center p-4">
                <p className="text-xl font-bold text-primary">{table?.tableNumber ?? "?"}</p>
                <p className="text-xs text-muted-foreground">{table?.name}</p>
                <p className="text-xs mt-1">{session.peopleCount} guests</p>
                {bill && (
                  <p className="text-xs font-semibold mt-1">{formatINR(bill.totalAmount)}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Top items */}
      {analytics.top5Items.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Items Today</h2>
          <Card>
            <CardContent className="p-0">
              {analytics.top5Items.map((item, idx) => (
                <div key={item.name} className={`flex items-center justify-between px-4 py-3 ${idx !== 0 ? "border-t" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">#{idx + 1}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.count} sold</p>
                    <p className="text-xs text-muted-foreground">{formatINR(item.revenue)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
