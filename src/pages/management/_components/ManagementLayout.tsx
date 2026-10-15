import { Outlet, NavLink } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api.js";
import {
  OwnerSetupRetry,
  SignInButton,
} from "@/components/ui/signin.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  UtensilsCrossed,
  LayoutDashboard,
  ClipboardList,
  Table2,
  MenuSquare,
  CreditCard,
  Bell,
  BarChart3,
  FileText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

const NAV_ITEMS = [
  {
    to: "/management",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/management/orders",
    label: "Orders",
    icon: ClipboardList,
  },
  {
    to: "/management/tables",
    label: "Tables",
    icon: Table2,
  },
  {
    to: "/management/menu",
    label: "Menu",
    icon: MenuSquare,
  },
  {
    to: "/management/payments",
    label: "Payments",
    icon: CreditCard,
  },
  {
    to: "/management/requests",
    label: "Requests",
    icon: Bell,
  },
  {
    to: "/management/analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    to: "/management/reports",
    label: "Reports",
    icon: FileText,
  },
];

function ManagementSidebar() {
  const { signOut } = useAuthActions();

  return (
    <aside className="hidden md:flex md:w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0 overflow-y-auto sidebar-scroll">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border">
        <div className="bg-primary rounded-lg p-2">
          <UtensilsCrossed className="size-5 text-primary-foreground" />
        </div>

        <div>
          <h1 className="font-bold text-lg">SmartDine</h1>
          <p className="text-xs text-muted-foreground">
            Restaurant Management
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )
            }
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function MobileBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border flex items-center justify-around px-1 py-2">
      {NAV_ITEMS.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-md transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground",
            )
          }
        >
          <Icon className="size-4" />
          <span className="text-[10px]">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function UnauthView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
      <div className="text-center space-y-2">
        <div className="bg-primary rounded-xl p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
          <UtensilsCrossed className="size-8 text-primary-foreground" />
        </div>

        <h1 className="text-2xl font-bold">SmartDine Management</h1>

        <p className="text-muted-foreground">
          Sign in to access the restaurant dashboard
        </p>
      </div>

      <SignInButton size="lg" />
    </div>
  );
}

function AuthorizedManagement() {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!user || (user.role !== "owner" && user.role !== "staff")) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-xl font-bold">Access denied</h1>

        <p className="text-center text-muted-foreground">
          Your account is not authorized to access restaurant management.
        </p>

        <OwnerSetupRetry />

        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <ManagementSidebar />

        <main className="flex-1 overflow-auto pb-16 md:pb-0 bg-background">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </>
  );
}

export default function ManagementLayout() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="size-8" />
        </div>
      </AuthLoading>

      <Unauthenticated>
        <UnauthView />
      </Unauthenticated>

      <Authenticated>
        <AuthorizedManagement />
      </Authenticated>
    </>
  );
}
