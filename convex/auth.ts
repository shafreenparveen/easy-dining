import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const {
  auth,
  signIn,
  signOut,
  store,
  isAuthenticated,
} = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const email = params.email;
        if (typeof email !== "string" || email.length === 0) {
          throw new Error("Email is required.");
        }

        if (params.flow === "signUp") {
          const bootstrapSecret = process.env.OWNER_BOOTSTRAP_SECRET;
          if (
            !bootstrapSecret ||
            params.bootstrapSecret !== bootstrapSecret
          ) {
            throw new Error("Initial owner setup is unavailable.");
          }
        }

        return { email };
      },
    }),
  ],
});
