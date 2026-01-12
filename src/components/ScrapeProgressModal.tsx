import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, FileSearch, Database, Globe } from "lucide-react";

interface ScrapeProgress {
  phase: string | null;
  pagesScraped: number;
  jobsFound: number;
  currentPage: string | null;
}

interface ScrapeProgressModalProps {
  isOpen: boolean;
  companyId: string | null;
  companyName: string;
  onComplete: () => void;
}

const ScrapeProgressModal = ({
  isOpen,
  companyId,
  companyName,
  onComplete,
}: ScrapeProgressModalProps) => {
  const [progress, setProgress] = useState<ScrapeProgress>({
    phase: null,
    pagesScraped: 0,
    jobsFound: 0,
    currentPage: null,
  });
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isOpen || !companyId) return;

    // Reset state when modal opens
    setProgress({
      phase: "starting",
      pagesScraped: 0,
      jobsFound: 0,
      currentPage: null,
    });
    setIsComplete(false);

    // Subscribe to realtime updates for this company
    const channel = supabase
      .channel(`scrape-progress-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "company_career_sites",
          filter: `id=eq.${companyId}`,
        },
        (payload) => {
          const data = payload.new as any;
          
          setProgress({
            phase: data.scrape_progress_phase,
            pagesScraped: data.scrape_progress_pages_scraped || 0,
            jobsFound: data.scrape_progress_jobs_found || 0,
            currentPage: data.scrape_progress_current_page,
          });

          // Check if scraping is complete
          if (data.crawl_status === "completed" || data.scrape_progress_phase === "complete") {
            setIsComplete(true);
            setTimeout(() => {
              onComplete();
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, companyId, onComplete]);

  const getPhaseIcon = (phase: string | null) => {
    switch (phase) {
      case "collecting":
        return <Globe className="w-5 h-5" />;
      case "scraping":
        return <FileSearch className="w-5 h-5" />;
      case "inserting":
        return <Database className="w-5 h-5" />;
      case "complete":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const getPhaseLabel = (phase: string | null) => {
    switch (phase) {
      case "collecting":
        return "Collecting job URLs from listing pages...";
      case "scraping":
        return "Scraping individual job pages...";
      case "inserting":
        return "Saving jobs to database...";
      case "complete":
        return "Scraping complete!";
      default:
        return "Starting scrape...";
    }
  };

  const getProgressPercent = () => {
    if (isComplete) return 100;
    switch (progress.phase) {
      case "collecting":
        return Math.min(30, progress.pagesScraped * 3);
      case "scraping":
        return 30 + Math.min(50, progress.jobsFound * 0.5);
      case "inserting":
        return 80 + Math.min(15, progress.jobsFound * 0.1);
      case "complete":
        return 100;
      default:
        return 5;
    }
  };

  // Truncate long URLs for display
  const truncateUrl = (url: string | null, maxLength = 50) => {
    if (!url) return null;
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getPhaseIcon(progress.phase)}
            Scraping {companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={getProgressPercent()} className="h-2" />
            <p className="text-sm text-muted-foreground">{getPhaseLabel(progress.phase)}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{progress.pagesScraped}</p>
              <p className="text-xs text-muted-foreground">Pages Scraped</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{progress.jobsFound}</p>
              <p className="text-xs text-muted-foreground">Jobs Found</p>
            </div>
          </div>

          {/* Current Page */}
          {progress.currentPage && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 font-mono truncate">
              {truncateUrl(progress.currentPage, 60)}
            </div>
          )}

          {/* Complete Message */}
          {isComplete && (
            <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
              <CheckCircle className="w-5 h-5" />
              Successfully scraped {progress.jobsFound} jobs!
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapeProgressModal;
