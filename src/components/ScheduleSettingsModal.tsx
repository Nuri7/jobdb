import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface ScheduleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  companyName: string;
  currentSchedule: string | null;
  isEnabled: boolean;
  lastScheduledAt: string | null;
  onSaved: () => void;
}

const ScheduleSettingsModal = ({
  isOpen,
  onClose,
  companyId,
  companyName,
  currentSchedule,
  isEnabled,
  lastScheduledAt,
  onSaved,
}: ScheduleSettingsModalProps) => {
  const [schedule, setSchedule] = useState<string | null>(currentSchedule);
  const [enabled, setEnabled] = useState(isEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSchedule(currentSchedule);
    setEnabled(isEnabled);
  }, [currentSchedule, isEnabled, companyId]);

  const handleSave = async () => {
    if (!companyId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("company_career_sites")
        .update({
          scrape_schedule: enabled ? schedule : null,
          is_scrape_enabled: enabled,
        })
        .eq("id", companyId);

      if (error) throw error;

      toast({
        title: "Schedule updated",
        description: enabled
          ? `Automatic scraping set to ${schedule}`
          : "Automatic scraping disabled",
      });
      onSaved();
      onClose();
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast({
        title: "Error",
        description: "Failed to update schedule",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Schedule Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Configure automatic scraping for{" "}
              <span className="font-medium text-foreground">{companyName}</span>
            </p>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enable automatic scraping</Label>
              <p className="text-xs text-muted-foreground">
                Automatically scrape jobs on a schedule
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Schedule Frequency */}
          {enabled && (
            <div className="space-y-2">
              <Label>Scraping frequency</Label>
              <Select
                value={schedule || "daily"}
                onValueChange={(value) => setSchedule(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12hours">Every 12 hours</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Last Scheduled Run */}
          {lastScheduledAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Clock className="w-4 h-4" />
              <span>
                Last scheduled scrape:{" "}
                {formatDistanceToNow(new Date(lastScheduledAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleSettingsModal;
