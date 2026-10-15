import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { formatINR, orderStatusColor } from "@/lib/restaurant.ts";

type Range = 1 | 7 | 30;

export default function ReportsPage() {
  const [range, setRange] = useState<Range>(7);
  const analytics = useQuery(api.analytics.getAnalytics, { days: range });
  const dailyRevenue = useQuery(api.analytics.getDailyRevenue, { days: range });
  const dailyCounts = useQuery(api.analytics.getDailyCounts, { days: range });
  const allOrders = useQuery(api.orders.listAllOrdersForManagement, {});

  const isLoading = analytics === undefined || dailyRevenue === undefined || allOrders === undefined;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex gap-2">
          {([1, 7, 30] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                range === r ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {r === 1 ? "Today" : r === 7 ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <>
          {/* Sales summary */}
          <Card>
            <CardHeader>
              <CardTitle>Sales Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{formatINR(analytics.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{analytics.totalCustomers}</p>
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{analytics.cancelledOrders}</p>
                  <p className="text-xs text-muted-foreground">Cancellations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily revenue table */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Revenue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {dailyRevenue.map((d) => (
                  <div key={d.date} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{d.date}</span>
                    <span className="font-semibold">{formatINR(d.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer counts */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Customer Counts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(dailyCounts ?? []).map((d) => (
                  <div key={d.date} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{d.date}</span>
                    <span className="font-semibold">{d.count} customers</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analytics.paymentByMethod).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between">
                    <span className="capitalize font-medium">{method}</span>
                    <span className="font-bold">{formatINR(amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top 5 and Least 5 */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {analytics.top5Items.map((item, idx) => (
                  <div key={item.name} className="flex justify-between px-4 py-2.5 text-sm border-t first:border-t-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5">#{idx + 1}</span>
                      <span>{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{item.count} sold</p>
                      <p className="text-xs text-muted-foreground">{formatINR(item.revenue)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Least Ordered Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {analytics.least5Items.map((item, idx) => (
                  <div key={item.name} className="flex justify-between px-4 py-2.5 text-sm border-t first:border-t-0">
                    <span>{item.name}</span>
                    <span className="font-semibold text-muted-foreground">{item.count} sold</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent orders */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Order History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y overflow-x-auto">
                {allOrders.slice(0, 20).map((order) => (
                  <div key={order._id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-4">
                    <span className="font-mono text-xs">{order.orderNumber}</span>
                    <span className="text-muted-foreground">Table {order.table?.tableNumber ?? "?"}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${orderStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="font-semibold">{formatINR(order.total)}</span>
                    <span className="text-xs text-muted-foreground">{order.placedAt.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
