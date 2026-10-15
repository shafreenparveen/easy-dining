import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
// ─── Queries ───────────────────────────────────────────────────────

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("categories")
      .withIndex("by_sort_order")
      .collect();
  },
});

export const listMenuItems = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    includeUnavailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let items = args.categoryId
      ? await ctx.db
          .query("menu_items")
          .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
          .collect()
      : await ctx.db.query("menu_items").collect();

    if (!args.includeUnavailable) {
      items = items.filter((i) => i.isAvailable);
    }
    return items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  },
});

export const listAddonsForItem = query({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("menu_addons")
      .withIndex("by_menu_item", (q) => q.eq("menuItemId", args.menuItemId))
      .collect();
  },
});

export const getMenuWithCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_sort_order")
      .collect();
    const activeCategories = categories.filter((c) => c.isActive);

    const results = await Promise.all(
      activeCategories.map(async (cat) => {
        const items = await ctx.db
          .query("menu_items")
          .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
          .collect();
        const availableItems = items.filter((i) => i.isAvailable);
        const itemsWithAddons = await Promise.all(
          availableItems.map(async (item) => {
            const addons = await ctx.db
              .query("menu_addons")
              .withIndex("by_menu_item", (q) => q.eq("menuItemId", item._id))
              .collect();
            return { ...item, addons: addons.filter((a) => a.isAvailable) };
          })
        );
        return { ...cat, items: itemsWithAddons };
      })
    );
    return results.filter((c) => c.items.length > 0);
  },
});

export const getMenuItemWithAddons = query({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.menuItemId);
    if (!item) return null;
    const addons = await ctx.db
      .query("menu_addons")
      .withIndex("by_menu_item", (q) => q.eq("menuItemId", args.menuItemId))
      .collect();
    return { ...item, addons };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

async function requireManagement(ctx: MutationCtx) {
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

  return user;
}
export const createCategory = mutation({
  args: {
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"categories">> => {
    await requireManagement(ctx);
    return ctx.db.insert("categories", { ...args, isActive: true });
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    const { categoryId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.sortOrder !== undefined) clean.sortOrder = updates.sortOrder;
    if (updates.isActive !== undefined) clean.isActive = updates.isActive;
    await ctx.db.patch(categoryId, clean);
  },
});

export const createMenuItem = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    categoryId: v.id("categories"),
    price: v.number(), // in paise
    isVeg: v.boolean(),
    isAvailable: v.boolean(),
    ingredients: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"menu_items">> => {
    await requireManagement(ctx);
    return ctx.db.insert("menu_items", args);
  },
});

export const updateMenuItem = mutation({
  args: {
    menuItemId: v.id("menu_items"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    price: v.optional(v.number()),
    isVeg: v.optional(v.boolean()),
    isAvailable: v.optional(v.boolean()),
    ingredients: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    const { menuItemId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch(menuItemId, clean);
  },
});

export const deleteMenuItem = mutation({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    await ctx.db.patch(args.menuItemId, { isAvailable: false });
  },
});

export const createAddon = mutation({
  args: {
    menuItemId: v.id("menu_items"),
    name: v.string(),
    price: v.number(), // in paise
  },
  handler: async (ctx, args): Promise<Id<"menu_addons">> => {
    await requireManagement(ctx);
    return ctx.db.insert("menu_addons", { ...args, isAvailable: true });
  },
});

export const updateAddon = mutation({
  args: {
    addonId: v.id("menu_addons"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    const { addonId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.price !== undefined) clean.price = updates.price;
    if (updates.isAvailable !== undefined) clean.isAvailable = updates.isAvailable;
    await ctx.db.patch(addonId, clean);
  },
});

export const deleteAddon = mutation({
  args: { addonId: v.id("menu_addons") },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    await ctx.db.patch(args.addonId, { isAvailable: false });
  },
});
