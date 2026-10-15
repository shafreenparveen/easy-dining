import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
const ORDER_CANCEL_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

// ─── Queries ───────────────────────────────────────────────────────

export const getOrdersForSession = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();

    return Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return { ...order, items: itemsWithAddons };
      })
    );
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const items = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const itemsWithAddons = await Promise.all(
      items.map(async (item) => {
        const addons = await ctx.db
          .query("order_item_addons")
          .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
          .collect();
        return { ...item, addons };
      })
    );
    const table = await ctx.db.get(order.tableId);
    return { ...order, items: itemsWithAddons, table };
  },
});

export const listActiveOrders = query({
  args: {},
  handler: async (ctx) => {
    const activeStatuses = ["placed", "accepted", "preparing", "ready"] as const;
    const allOrders = await Promise.all(
      activeStatuses.map((status) =>
        ctx.db
          .query("orders")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      )
    );
    const orders = allOrders.flat().sort(
      (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
    );

    return Promise.all(
      orders.map(async (order) => {
        const table = await ctx.db.get(order.tableId);
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return { ...order, items: itemsWithAddons, table };
      })
    );
  },
});

export const listAllOrdersForManagement = query({
  args: {
    sessionId: v.optional(v.id("table_sessions")),
  },
  handler: async (ctx, args) => {
    const orders = args.sessionId
      ? await ctx.db
          .query("orders")
          .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
          .order("desc")
          .collect()
      : await ctx.db.query("orders").order("desc").take(100);

    return Promise.all(
      orders.map(async (order) => {
        const table = await ctx.db.get(order.tableId);
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return { ...order, items: itemsWithAddons, table };
      })
    );
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

async function getNextOrderNumber(ctx: MutationCtx): Promise<string> {
  const seq = await ctx.db
    .query("sequences")
    .withIndex("by_name", (q) => q.eq("name", "order_number"))
    .unique();
  const next = seq ? seq.value + 1 : 1001;
  if (seq) {
    await ctx.db.patch(seq._id, { value: next });
  } else {
    await ctx.db.insert("sequences", { name: "order_number", value: next });
  }
  return `ORD-${next}`;
}

export const placeOrder = mutation({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args): Promise<{ orderId: Id<"orders">; orderNumber: string }> => {
    // Validate session
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    const table = await ctx.db.get(session.tableId);
    if (!table || !table.isActive) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Table is not available" });
    }

    // Load cart
    const cartItems = await ctx.db
      .query("cart_items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    if (cartItems.length === 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Cart is empty" });
    }

    // Server-side validate each menu item is still available
    for (const cartItem of cartItems) {
      const menuItem = await ctx.db.get(cartItem.menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `"${cartItem.menuItemName}" is no longer available`,
        });
      }
      if (cartItem.quantity < 1) {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Invalid quantity" });
      }
    }

    // Calculate server-side total
    let subtotal = 0;
    const cartItemsWithAddons = await Promise.all(
      cartItems.map(async (item) => {
        const addons = await ctx.db
          .query("cart_item_addons")
          .withIndex("by_cart_item", (q) => q.eq("cartItemId", item._id))
          .collect();

        // Re-validate addon prices from DB
        const validatedAddons: Array<{ addonId: Id<"menu_addons">; addonName: string; addonPrice: number }> = [];
        for (const ca of addons) {
          const addon = await ctx.db.get(ca.addonId);
          if (addon && addon.isAvailable) {
            validatedAddons.push({
              addonId: ca.addonId,
              addonName: addon.name,
              addonPrice: addon.price, // Fresh from DB
            });
          }
        }

        // Use CURRENT menu item price (not cached cart price)
        const menuItem = (await ctx.db.get(item.menuItemId))!;
        const addonTotal = validatedAddons.reduce((s, a) => s + a.addonPrice, 0);
        const lineTotal = (menuItem.price + addonTotal) * item.quantity;
        subtotal += lineTotal;

        return { cartItem: item, menuItem, addons: validatedAddons, lineTotal };
      })
    );

    const now = new Date();
    const orderNumber = await getNextOrderNumber(ctx);
    const cancellationDeadline = new Date(now.getTime() + ORDER_CANCEL_WINDOW_MS).toISOString();

    const orderId = await ctx.db.insert("orders", {
      sessionId: args.sessionId,
      tableId: table._id,
      orderNumber,
      status: "placed",
      subtotal,
      total: subtotal, // No extra charges for now
      placedAt: now.toISOString(),
      cancellationDeadline,
    });

    // Create order items and their addons
    for (const { cartItem, menuItem, addons, lineTotal } of cartItemsWithAddons) {
      const orderItemId = await ctx.db.insert("order_items", {
        orderId,
        menuItemId: cartItem.menuItemId,
        menuItemName: menuItem.name,
        basePrice: menuItem.price,
        quantity: cartItem.quantity,
        specialInstructions: cartItem.specialInstructions,
        lineTotal,
      });

      for (const addon of addons) {
        await ctx.db.insert("order_item_addons", {
          orderItemId,
          addonId: addon.addonId,
          addonName: addon.addonName,
          addonPrice: addon.addonPrice,
        });
      }
    }

    // Update bill total (add this order's total)
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (bill) {
      await ctx.db.patch(bill._id, { totalAmount: bill.totalAmount + subtotal });
    }

    // Clear cart after successful order
    for (const cartItem of cartItems) {
      const cartAddons = await ctx.db
        .query("cart_item_addons")
        .withIndex("by_cart_item", (q) => q.eq("cartItemId", cartItem._id))
        .collect();
      for (const ca of cartAddons) {
        await ctx.db.delete(ca._id);
      }
      await ctx.db.delete(cartItem._id);
    }

    return { orderId, orderNumber };
  },
});

export const cancelOrder = mutation({
  args: {
    orderId: v.id("orders"),
    sessionId: v.id("table_sessions"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });
    if (order.sessionId !== args.sessionId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Order does not belong to this session" });
    }

    // Status check — server-side
    if (["preparing", "ready", "served", "cancelled", "rejected"].includes(order.status)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: order.status === "preparing"
          ? "Cannot cancel — order is already being prepared"
          : `Cannot cancel order with status: ${order.status}`,
      });
    }

    // Time check — server-side
    const now = new Date();
    const deadline = new Date(order.cancellationDeadline);
    if (now > deadline) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Cancellation window has expired (3-minute limit)",
      });
    }

    const nowIso = now.toISOString();
    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: nowIso,
    });

    // Update bill total — subtract this order's total
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (bill) {
      await ctx.db.patch(bill._id, {
        totalAmount: Math.max(0, bill.totalAmount - order.total),
      });
    }
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("accepted"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("served"),
      v.literal("rejected")
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

if (userId === null) {
  throw new ConvexError({
    code: "UNAUTHENTICATED",
    message: "Login required",
  });
}

const user = await ctx.db.get(userId);

if (!user || (user.role !== "owner" && user.role !== "staff")) {
  throw new ConvexError({
    code: "UNAUTHORIZED",
    message: "Management access required",
  });
}

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      placed: ["accepted", "rejected"],
      accepted: ["preparing", "rejected"],
      preparing: ["ready"],
      ready: ["served"],
    };
    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Cannot transition from ${order.status} to ${args.status}`,
      });
    }

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedBy: user._id,
    };
    if (args.status === "rejected" && args.rejectionReason) {
      updates.rejectionReason = args.rejectionReason;
    }

    // If rejected, subtract from bill
    if (args.status === "rejected") {
      const bill = await ctx.db
        .query("bills")
        .withIndex("by_session", (q) => q.eq("sessionId", order.sessionId))
        .first();
      if (bill) {
        await ctx.db.patch(bill._id, {
          totalAmount: Math.max(0, bill.totalAmount - order.total),
        });
      }
    }

    await ctx.db.patch(args.orderId, updates);
  },
});
