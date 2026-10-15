
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    return await ctx.db.get("users", userId);
  },
});

export const updateCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "User not logged in",
      });
    }

    return await ctx.db.get("users", userId);
  },
});

export const bootstrapOwner = action({
  args: { secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in before completing owner setup.",
      });
    }

    const configuredSecret = process.env.OWNER_BOOTSTRAP_SECRET;
    if (!configuredSecret || args.secret !== configuredSecret) {
      throw new ConvexError({
        code: "INVALID_OWNER_SETUP",
        message: "Owner setup could not be completed.",
      });
    }

    await ctx.runMutation(internal.users.completeOwnerBootstrap, { userId });
    return null;
  },
});

export const completeOwnerBootstrap = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in before completing owner setup.",
      });
    }

    const bootstrapRecord = await ctx.db
      .query("owner_bootstrap")
      .withIndex("by_key", (q) => q.eq("key", "initial_owner"))
      .unique();
    const existingOwner = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "owner"))
      .first();

    if (bootstrapRecord !== null || existingOwner !== null) {
      throw new ConvexError({
        code: "OWNER_SETUP_COMPLETED",
        message: "Initial owner setup has already been completed.",
      });
    }

    await ctx.db.patch("users", args.userId, { role: "owner" });
    await ctx.db.insert("owner_bootstrap", {
      key: "initial_owner",
      ownerId: args.userId,
      createdAt: Date.now(),
    });

    return null;
  },
});
