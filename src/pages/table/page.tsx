"use client";
import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { UtensilsCrossed, Users } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import SessionDining from "./_components/SessionDining.tsx";
import { motion, AnimatePresence } from "motion/react";

export default function TablePage() {
  const { token } = useParams<{ token: string }>();
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(`smartdine_session_${token}`)
  );
  const [step, setStep] = useState<"loading" | "new-session" | "dining">("loading");
  const [peopleCount, setPeopleCount] = useState(2);

  const table = useQuery(api.tables.getTableByToken, token ? { token } : "skip");
  const createOrJoin = useMutation(api.sessions.createOrJoinSession);

  // Check for active session on load
  const activeSession = useQuery(
    api.sessions.getActiveSessionForTable,
    table?._id ? { tableId: table._id } : "skip"
  );

  if (!token) return <Navigate to="/" replace />;

  // Table loading
  if (table === undefined || (table && activeSession === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (table === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center gap-4">
        <UtensilsCrossed className="size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Invalid QR Code</h1>
        <p className="text-muted-foreground">This QR code is not recognized. Please ask your waiter for assistance.</p>
      </div>
    );
  }

  if (!table.isActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center gap-4">
        <UtensilsCrossed className="size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Table Unavailable</h1>
        <p className="text-muted-foreground">This table is currently not in service. Please ask your waiter for assistance.</p>
      </div>
    );
  }

  // If we already have a session stored and it matches active
  if (sessionId && activeSession && sessionId === activeSession._id) {
    return <SessionDining sessionId={sessionId as Id<"table_sessions">} tableNumber={table.tableNumber} />;
  }

  // If there's an active session but we don't have it stored
  if (activeSession && !sessionId) {
    // Auto-join
    const handleJoin = async () => {
      try {
        const result = await createOrJoin({ tableToken: token });
        sessionStorage.setItem(`smartdine_session_${token}`, result.sessionId);
        setSessionId(result.sessionId);
      } catch (e) {
        if (e instanceof ConvexError) toast.error(e.data.message);
        else toast.error("Failed to join session");
      }
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border rounded-2xl p-8 max-w-sm w-full text-center space-y-6 shadow-lg"
        >
          <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
            <Users className="size-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{table.name}</h2>
            <p className="text-muted-foreground mt-1">A dining session is already active at this table.</p>
          </div>
          <Button onClick={handleJoin} className="w-full" size="lg">
            Join Current Session
          </Button>
        </motion.div>
      </div>
    );
  }

  // If session stored but no active session (session was closed), clear it
  if (sessionId && !activeSession) {
    sessionStorage.removeItem(`smartdine_session_${token}`);
    setSessionId(null);
  }

  // No active session → ask for people count and create
  const handleCreateSession = async () => {
    if (peopleCount < 1 || peopleCount > 20) {
      toast.error("Please enter a valid number of people (1–20)");
      return;
    }
    try {
      const result = await createOrJoin({ tableToken: token, peopleCount });
      sessionStorage.setItem(`smartdine_session_${token}`, result.sessionId);
      setSessionId(result.sessionId);
      toast.success(`Welcome! Session ${result.sessionNumber} started.`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to start session");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border rounded-2xl p-8 max-w-sm w-full text-center space-y-6 shadow-lg"
      >
        <div className="bg-primary rounded-xl p-4 w-16 h-16 mx-auto flex items-center justify-center">
          <UtensilsCrossed className="size-8 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-primary uppercase tracking-wide">SmartDine</p>
          <h1 className="text-3xl font-bold mt-1">{table.name}</h1>
          <p className="text-muted-foreground mt-2">Welcome! How many people are dining today?</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setPeopleCount((p) => Math.max(1, p - 1))}
              disabled={peopleCount <= 1}
              className="rounded-full size-10 text-lg"
            >
              −
            </Button>
            <Input
              type="number"
              min={1}
              max={20}
              value={peopleCount}
              onChange={(e) => setPeopleCount(Number(e.target.value))}
              className="text-center text-2xl font-bold h-14 w-20"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setPeopleCount((p) => Math.min(20, p + 1))}
              disabled={peopleCount >= 20}
              className="rounded-full size-10 text-lg"
            >
              +
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {peopleCount === 1 ? "1 person" : `${peopleCount} people`}
          </p>
        </div>
        <Button onClick={handleCreateSession} className="w-full" size="lg">
          Start Dining
        </Button>
      </motion.div>
    </div>
  );
}
