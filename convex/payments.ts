import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { getAuthUserId } from "@convex-dev/auth/server";
const PAYMENT_HISTORY_VISIBILITY_MS = 60 * 60 * 1000; // 1 hour

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

// ─── Queries ───────────────────────────────────────────────────────

export const getBillForSession = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) return null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_bill", (q) => q.eq("billId", bill._id))
      .collect();
    const session = await ctx.db.get(args.sessionId);
    const table = session ? await ctx.db.get(session.tableId) : null;
    const remaining = bill.totalAmount - bill.paidAmount;
    return {
      bill,
      payments,
      session,
      table,
      remaining,
    };
  },
});

export const getPaymentsForManagement = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const table = session ? await ctx.db.get(session.tableId) : null;

    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_bill", (q) => q.eq("billId", bill._id))
      .collect();

    // Enforce 1-hour visibility rule for completed sessions
    let visiblePayments = allPayments;
    if (session.status === "closed" && bill.completedAt) {
      const completedTime = new Date(bill.completedAt).getTime();
      const now = Date.now();
      if (now - completedTime > PAYMENT_HISTORY_VISIBILITY_MS) {
        // Payment history expired — return null to indicate hidden
        return null;
      }
    }

    const remaining = bill.totalAmount - bill.paidAmount;
    const paymentModes = [...new Set(visiblePayments.filter((p) => p.status === "paid").map((p) => p.method))];

    return {
      bill,
      payments: visiblePayments,
      session,
      table,
      remaining,
      paymentModes,
    };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const recordPayment = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    amount: v.number(), // in paise
    method: v.union(v.literal("upi"), v.literal("card"), v.literal("cash")),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">> => {
    await requireManagement(ctx);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) throw new ConvexError({ code: "NOT_FOUND", message: "Bill not found" });

    const remaining = bill.totalAmount - bill.paidAmount;
    if (args.amount <= 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Payment amount must be greater than 0" });
    }
    if (args.amount > remaining) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Payment ₹${(args.amount / 100).toFixed(2)} exceeds remaining balance ₹${(remaining / 100).toFixed(2)}`,
      });
    }

    const now = new Date().toISOString();
    const userId = await getAuthUserId(ctx);
const user = userId ? await ctx.db.get(userId) : null;

    const paymentId = await ctx.db.insert("payments", {
      sessionId: args.sessionId,
      billId: bill._id,
      amount: args.amount,
      method: args.method,
      status: "paid", // Cash/UPI recorded by management = immediate confirmation
      reference: args.reference,
      createdAt: now,
      completedAt: now,
      recordedBy: user?._id,
    });

    // Update bill paid amount
    const newPaid = bill.paidAmount + args.amount;
    const newRemaining = bill.totalAmount - newPaid;
    const newStatus = newRemaining <= 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";

    await ctx.db.patch(bill._id, {
      paidAmount: newPaid,
      status: newStatus,
    });

    // Update table status to bill_pending when payment complete
    if (newStatus === "paid") {
      await ctx.db.patch(session.tableId, { status: "bill_pending" });
    }

    return paymentId;
  },
});

export const requestBill = mutation({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    const table = await ctx.db.get(session.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });

    const now = new Date().toISOString();
    await ctx.db.insert("waiter_requests", {
      sessionId: args.sessionId,
      tableId: session.tableId,
      requestType: "bill",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    // Mark table as bill_pending
    await ctx.db.patch(session.tableId, { status: "bill_pending" });
  },
});
