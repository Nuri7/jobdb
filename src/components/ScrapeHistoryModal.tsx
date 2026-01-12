import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Clock,
  FileText,
  Briefcase,
  Database,
  Trash2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ScrapeHistoryEntry {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  pages_scraped: number;
  jobs_found: number;
  jobs_inserted: number;
  jobs_removed: number | null;
  error_message: string | null;
  career_url: string;
}

interface ScrapeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  companyName: string;
}

const ScrapeHistoryModal = ({
  isOpen,
  onClose,
  companyId,
  companyName,
}: ScrapeHistoryModalProps) => {
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !companyId) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('scrape_history')
        .select('*')
        .eq('company_career_site_id', companyId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setHistory(data);
      }
      setIsLoading(false);
    };

    fetchHistory();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`scrape-history-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scrape_history",
          filter: `company_career_site_id=eq.${companyId}`,
        },
        () => {
          fetchHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, companyId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 hover:bg-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "In progress...";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Scrape History - {companyName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No scrape history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-border rounded-lg p-4 bg-card"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    {getStatusBadge(entry.status)}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.started_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                        <FileText className="w-3 h-3" />
                        Pages
                      </div>
                      <p className="font-semibold text-foreground">{entry.pages_scraped}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                        <Briefcase className="w-3 h-3" />
                        Found
                      </div>
                      <p className="font-semibold text-foreground">{entry.jobs_found}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                        <Database className="w-3 h-3" />
                        Saved
                      </div>
                      <p className="font-semibold text-foreground">{entry.jobs_inserted}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                        <Trash2 className="w-3 h-3" />
                        Removed
                      </div>
                      <p className="font-semibold text-foreground">{entry.jobs_removed ?? 0}</p>
                    </div>
                  </div>

                  {/* Duration & URL */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <span className="font-medium">Duration:</span>{" "}
                      {formatDuration(entry.started_at, entry.completed_at)}
                    </p>
                    <p className="truncate" title={entry.career_url}>
                      <span className="font-medium">URL:</span> {entry.career_url}
                    </p>
                  </div>

                  {/* Error message */}
                  {entry.error_message && (
                    <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-600">
                      {entry.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapeHistoryModal;
