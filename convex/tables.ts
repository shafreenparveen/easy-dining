import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { getAuthUserId } from "@convex-dev/auth/server";

// Helper: get authenticated management user
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

async function getNextSequence(
  ctx: MutationCtx,
  name: string,
  prefix: string,
  width = 4
): Promise<string> {
  const seq = await ctx.db
    .query("sequences")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  const next = seq ? seq.value + 1 : 1;
  if (seq) {
    await ctx.db.patch(seq._id, { value: next });
  } else {
    await ctx.db.insert("sequences", { name, value: next });
  }
  return `${prefix}${String(next).padStart(width, "0")}`;
}

export const generateTableToken = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

// ─── Queries ───────────────────────────────────────────────────────

export const listTables = query({
  args: {},
  handler: async (ctx) => {
    const tables = await ctx.db.query("restaurant_tables").collect();
    return tables.sort((a, b) => a.tableNumber - b.tableNumber);
  },
});

export const getTableByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    return table;
  },
});

export const getTableById = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tableId);
  },
});

export const getTableWithSession = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return null;
    const session = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
    if (!session) return { table, session: null, bill: null };
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .first();
    return { table, session, bill };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createTable = mutation({
  args: {
    tableNumber: v.number(),
    name: v.string(),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"restaurant_tables">> => {
    await requireManagement(ctx);
    const existing = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_table_number", (q) => q.eq("tableNumber", args.tableNumber))
      .first();
    if (existing) {
      throw new ConvexError({ code: "CONFLICT", message: `Table ${args.tableNumber} already exists` });
    }
    const token = generateTableToken();
    return await ctx.db.insert("restaurant_tables", {
      tableNumber: args.tableNumber,
      name: args.name,
      token,
      status: "available",
      isActive: true,
      capacity: args.capacity,
    });
  },
});

export const updateTable = mutation({
  args: {
    tableId: v.id("restaurant_tables"),
    name: v.optional(v.string()),
    capacity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireManagement(ctx);
    const { tableId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.capacity !== undefined) clean.capacity = updates.capacity;
    if (updates.isActive !== undefined) clean.isActive = updates.isActive;
    await ctx.db.patch(tableId, clean);
  },
});

export const regenerateTableToken = mutation({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args): Promise<string> => {
    await requireManagement(ctx);
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });
    // Only regenerate if table has no active session
    const activeSession = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
    if (activeSession) {
      throw new ConvexError({ code: "CONFLICT", message: "Cannot regenerate QR while table is occupied" });
    }
    const token = generateTableToken();
    await ctx.db.patch(args.tableId, { token });
    return token;
  },
});

// Get next order number helper (exported for re-use)
export const getNextOrderNumber = async (ctx: MutationCtx) =>
  getNextSequence(ctx, "order_number", "ORD-");

export const getNextSessionNumber = async (ctx: MutationCtx) =>
  getNextSequence(ctx, "session_number", "SES-");
