import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Queries ───────────────────────────────────────────────────────

export const getCart = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return null;

    const cartItems = await ctx.db
      .query("cart_items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const itemsWithAddons = await Promise.all(
      cartItems.map(async (item) => {
        const addons = await ctx.db
          .query("cart_item_addons")
          .withIndex("by_cart_item", (q) => q.eq("cartItemId", item._id))
          .collect();
        const addonTotal = addons.reduce((sum, a) => sum + a.addonPrice * item.quantity, 0);
        const lineTotal = item.basePrice * item.quantity + addonTotal;
        return { ...item, addons, lineTotal };
      })
    );

    const total = itemsWithAddons.reduce((sum, i) => sum + i.lineTotal, 0);
    return { items: itemsWithAddons, total };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const addToCart = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    menuItemId: v.id("menu_items"),
    quantity: v.number(),
    selectedAddonIds: v.optional(v.array(v.id("menu_addons"))),
    specialInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"cart_items">> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    if (args.quantity < 1 || args.quantity > 20) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Quantity must be between 1 and 20" });
    }

    const menuItem = await ctx.db.get(args.menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Menu item is unavailable" });
    }

    // Validate addons
    const selectedAddons: Array<{ _id: Id<"menu_addons">; name: string; price: number }> = [];
    if (args.selectedAddonIds?.length) {
      for (const addonId of args.selectedAddonIds) {
        const addon = await ctx.db.get(addonId);
        if (!addon || addon.menuItemId !== args.menuItemId || !addon.isAvailable) {
          throw new ConvexError({ code: "BAD_REQUEST", message: `Invalid add-on selected` });
        }
        selectedAddons.push({ _id: addon._id, name: addon.name, price: addon.price });
      }
    }

    const cartItemId = await ctx.db.insert("cart_items", {
      sessionId: args.sessionId,
      menuItemId: args.menuItemId,
      menuItemName: menuItem.name,
      basePrice: menuItem.price, // Server-side price snapshot
      quantity: args.quantity,
      specialInstructions: args.specialInstructions,
    });

    for (const addon of selectedAddons) {
      await ctx.db.insert("cart_item_addons", {
        cartItemId,
        addonId: addon._id,
        addonName: addon.name,
        addonPrice: addon.price, // Server-side addon price snapshot
      });
    }

    return cartItemId;
  },
});

export const updateCartItemQuantity = mutation({
  args: {
    cartItemId: v.id("cart_items"),
    sessionId: v.id("table_sessions"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem || cartItem.sessionId !== args.sessionId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Cart item not found" });
    }
    if (args.quantity < 1 || args.quantity > 20) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Quantity must be between 1 and 20" });
    }
    await ctx.db.patch(args.cartItemId, { quantity: args.quantity });
  },
});

export const removeFromCart = mutation({
  args: {
    cartItemId: v.id("cart_items"),
    sessionId: v.id("table_sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem || cartItem.sessionId !== args.sessionId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Cart item not found" });
    }
    // Delete addons first
    const addons = await ctx.db
      .query("cart_item_addons")
      .withIndex("by_cart_item", (q) => q.eq("cartItemId", args.cartItemId))
      .collect();
    for (const addon of addons) {
      await ctx.db.delete(addon._id);
    }
    await ctx.db.delete(args.cartItemId);
  },
});

export const clearCart = mutation({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const cartItems = await ctx.db
      .query("cart_items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const item of cartItems) {
      const addons = await ctx.db
        .query("cart_item_addons")
        .withIndex("by_cart_item", (q) => q.eq("cartItemId", item._id))
        .collect();
      for (const addon of addons) {
        await ctx.db.delete(addon._id);
      }
      await ctx.db.delete(item._id);
    }
  },
});
