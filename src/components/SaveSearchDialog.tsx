import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { JobFilters } from "@/lib/api/publicJobs";
import {
  AUTH_RETURN,
  PENDING_ALERT,
  criteriaSummary,
} from "@/lib/discoveryState";
import { trackEvent } from "@/lib/productEvents";

export function SaveSearchDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: JobFilters;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const route = useLocation();
  const client = useQueryClient();
  const db = supabase as unknown as SupabaseClient;
  const [frequency, setFrequency] = useState("daily");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    try {
      const stored = sessionStorage.getItem(PENDING_ALERT);
      if (stored === "daily" || stored === "weekly") setFrequency(stored);
    } catch {
      /* optional continuity */
    }
  }, [open]);
  const save = async () => {
    if (!user) {
      try {
        sessionStorage.setItem(AUTH_RETURN, `${route.pathname}${route.search}`);
        sessionStorage.setItem(PENDING_ALERT, frequency);
      } catch {
        /* router state also preserves destination */
      }
      navigate("/inloggen", {
        state: { from: `${route.pathname}${route.search}` },
      });
      return;
    }
    setBusy(true);
    try {
      const criteria = Object.fromEntries(
        Object.entries(filters).filter(
          ([key, value]) =>
            value !== undefined &&
            ![
              "page",
              "limit",
              "includeFacets",
              "includeDescription",
              "sort",
            ].includes(key),
        ),
      );
      const name = [
        filters.mode === "freelance" ? "Freelance" : "Vacatures",
        filters.search,
        filters.location,
      ]
        .filter(Boolean)
        .join(" · ");
      const { data: existing, error: lookupError } = await db
        .from("job_saved_searches")
        .select("id")
        .eq("user_id", user.id)
        .eq("criteria", JSON.stringify(criteria))
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      const values = {
        name,
        criteria,
        email_enabled: true,
        email_frequency: frequency,
      };
      const { error } = existing
        ? await db
            .from("job_saved_searches")
            .update(values)
            .eq("id", existing.id)
            .eq("user_id", user.id)
        : await db
            .from("job_saved_searches")
            .insert({ ...values, user_id: user.id });
      if (error) throw error;
      sessionStorage.removeItem(PENDING_ALERT);
      trackEvent("search_saved");
      await client.invalidateQueries({ queryKey: ["saved-searches", user.id] });
      toast.success(
        `Zoekmelding staat aan: ${frequency === "weekly" ? "wekelijks" : "dagelijks"} nieuwe matches per e-mail.`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Zoekmelding bewaren is niet gelukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ontvang nieuwe passende vacatures</DialogTitle>
          <DialogDescription>
            We mailen alleen als er nieuwe matches zijn. Je kunt je melding
            wijzigen of uitzetten bij Bewaard.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
          <p className="mb-1 font-semibold">Jouw zoekcriteria</p>
          {criteriaSummary(filters)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-frequency">Hoe vaak?</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger id="alert-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Dagelijks</SelectItem>
              <SelectItem value="weekly">Wekelijks</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button disabled={busy} onClick={save}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Bell className="mr-2 h-4 w-4" />
          )}
          {user ? "Zoekmelding aanzetten" : "Inloggen om melding aan te zetten"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
