import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { getAuthUserId } from "@convex-dev/auth/server";

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
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function incrementDailyCustomers(
  ctx: MutationCtx,
  count: number
) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const existing = await ctx.db
    .query("daily_customer_counts")
    .withIndex("by_date", (q) => q.eq("date", today))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + count });
  } else {
    await ctx.db.insert("daily_customer_counts", { date: today, count });
  }
}

// ─── Queries ───────────────────────────────────────────────────────

export const getActiveSessionForTable = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
  },
});

export const getSessionById = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.sessionId);
  },
});

export const getSessionWithDetails = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const table = await ctx.db.get(session.tableId);
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    return { session, table, bill };
  },
});

export const listActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("table_sessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const results = await Promise.all(
      sessions.map(async (s) => {
        const table = await ctx.db.get(s.tableId);
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .first();
        return { session: s, table, bill };
      })
    );
    return results;
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createOrJoinSession = mutation({
  args: {
    tableToken: v.string(),
    peopleCount: v.optional(v.number()), // required only for new sessions
  },
  handler: async (ctx, args): Promise<{
    sessionId: Id<"table_sessions">;
    isNew: boolean;
    tableId: Id<"restaurant_tables">;
    tableNumber: number;
    sessionNumber: string;
  }> => {
    const table = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_token", (q) => q.eq("token", args.tableToken))
      .unique();
    if (!table) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invalid QR code — table not found" });
    }
    if (!table.isActive) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "This table is currently inactive" });
    }

    // Check for existing active session
    const existingSession = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", table._id).eq("status", "active")
      )
      .first();

    if (existingSession) {
      // Join existing session — do NOT increment customer count
      return {
        sessionId: existingSession._id,
        isNew: false,
        tableId: table._id,
        tableNumber: table.tableNumber,
        sessionNumber: existingSession.sessionNumber,
      };
    }

    // Create new session
    if (!args.peopleCount || args.peopleCount < 1) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "People count required to start a new session" });
    }

    const sessionNumber = await getNextSequence(ctx, "session_number", "SES-");
    const sessionId = await ctx.db.insert("table_sessions", {
      tableId: table._id,
      status: "active",
      peopleCount: args.peopleCount,
      sessionNumber,
      startTime: new Date().toISOString(),
    });

    // Update table status to occupied
    await ctx.db.patch(table._id, { status: "occupied" });

    // Create bill for this session
    await ctx.db.insert("bills", {
      sessionId,
      totalAmount: 0,
      paidAmount: 0,
      status: "unpaid",
    });

    // Increment daily customer count
    await incrementDailyCustomers(ctx, args.peopleCount);

    return {
      sessionId,
      isNew: true,
      tableId: table._id,
      tableNumber: table.tableNumber,
      sessionNumber,
    };
  },
});

export const closeSession = mutation({
  args: {
    sessionId: v.id("table_sessions"),
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
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError({ code: "NOT_FOUND", message: "Session not found" });
    if (session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is already closed" });
    }

    // Verify bill balance is 0
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Bill not found" });
    }
    const remaining = bill.totalAmount - bill.paidAmount;
    if (remaining !== 0) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Cannot close session — remaining balance: ₹${(remaining / 100).toFixed(2)}`,
      });
    }

    // Check for pending payments
    const pendingPayments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const hasPending = pendingPayments.some((p) => p.status === "pending");
    if (hasPending) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "There are pending payments — please wait for them to complete" });
    }

    const now = new Date().toISOString();

    // Close session atomically
    await ctx.db.patch(args.sessionId, {
      status: "closed",
      endTime: now,
      closedBy: user._id,
    });

    // Free the table
    await ctx.db.patch(session.tableId, { status: "available" });

    // Mark bill completed
    await ctx.db.patch(bill._id, {
      completedAt: now,
      completedBy: user._id,
    });

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: user._id,
      action: "close_session",
      resourceType: "table_sessions",
      resourceId: args.sessionId,
      details: `Session ${session.sessionNumber} closed`,
      createdAt: now,
    });
  },
});
