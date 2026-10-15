
import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";

export interface SignInButtonProps {
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function SignInButton({ size = "default", className }: SignInButtonProps) {
  const { signIn } = useAuthActions();
  const bootstrapOwner = useAction(api.users.bootstrapOwner);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [isOwnerSetup, setIsOwnerSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: isOwnerSetup ? "signUp" : "signIn",
        ...(isOwnerSetup ? { bootstrapSecret } : {}),
      });
      if (isOwnerSetup) {
        await bootstrapOwner({ secret: bootstrapSecret });
        toast.success("Owner account set up successfully.");
      }
    } catch (error) {
      toast.error(isOwnerSetup ? "Owner setup failed" : "Sign-in failed", {
        description: isOwnerSetup
          ? "Check the setup secret and try again."
          : "Check your email and password, then try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full max-w-sm space-y-4 ${className ?? ""}`}>
      <div className="space-y-2 text-left">
        <label htmlFor="staff-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="staff-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="staff@restaurant.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-2 text-left">
        <label htmlFor="staff-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isOwnerSetup && (
        <div className="space-y-2 text-left">
          <label htmlFor="owner-bootstrap-secret" className="text-sm font-medium">
            Owner setup secret
          </label>
          <input
            id="owner-bootstrap-secret"
            type="password"
            autoComplete="off"
            required
            value={bootstrapSecret}
            onChange={(event) => setBootstrapSecret(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      <Button type="submit" size={size} className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <LogIn className="mr-2 size-4" />
        )}
        {loading
          ? isOwnerSetup
            ? "Creating owner account..."
            : "Signing in..."
          : isOwnerSetup
            ? "Create owner account"
            : "Sign In"}
      </Button>

      <button
        type="button"
        className="w-full text-sm text-primary underline-offset-4 hover:underline"
        disabled={loading}
        onClick={() => setIsOwnerSetup((value) => !value)}
      >
        {isOwnerSetup ? "Back to sign in" : "Set up the first owner"}
      </button>
    </form>
  );
}

export function OwnerSetupRetry() {
  const bootstrapOwner = useAction(api.users.bootstrapOwner);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await bootstrapOwner({ secret });
      toast.success("Owner account set up successfully.");
    } catch {
      toast.error("Owner setup failed", {
        description:
          "Check the setup secret. If setup is already complete, contact an owner.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-2 text-left">
        <label htmlFor="owner-bootstrap-retry" className="text-sm font-medium">
          Owner setup secret
        </label>
        <input
          id="owner-bootstrap-retry"
          type="password"
          autoComplete="off"
          required
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <LogIn className="mr-2 size-4" />
        )}
        {loading ? "Completing setup..." : "Complete owner setup"}
      </Button>
    </form>
  );
}
