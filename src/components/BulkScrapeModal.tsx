import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { jobsApi } from "@/lib/api/jobs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Play,
  Pause,
  X
} from "lucide-react";

interface QueueItem {
  id: string;
  name: string;
  careerUrl: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  jobsFound?: number;
  error?: string;
}

interface BulkScrapeModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Array<{ id: string; name: string; careerUrl: string }>;
  onComplete: () => void;
}

const BulkScrapeModal = ({
  isOpen,
  onClose,
  companies,
  onComplete,
}: BulkScrapeModalProps) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize queue when modal opens
  useEffect(() => {
    if (isOpen && companies.length > 0) {
      setQueue(
        companies.map((c) => ({
          id: c.id,
          name: c.name,
          careerUrl: c.careerUrl,
          status: 'pending' as const,
        }))
      );
      setCurrentIndex(0);
      setIsRunning(false);
      setIsPaused(false);
    }
  }, [isOpen, companies]);

  // Process queue
  useEffect(() => {
    if (!isRunning || isPaused || currentIndex >= queue.length) return;

    const processNext = async () => {
      const item = queue[currentIndex];
      if (!item || item.status !== 'pending') {
        setCurrentIndex((prev) => prev + 1);
        return;
      }

      // Update status to running
      setQueue((prev) =>
        prev.map((q, i) =>
          i === currentIndex ? { ...q, status: 'running' as const } : q
        )
      );

      try {
        const result = await jobsApi.scrapeCompany(item.id, item.careerUrl);
        
        setQueue((prev) =>
          prev.map((q, i) =>
            i === currentIndex
              ? {
                  ...q,
                  status: 'completed' as const,
                  jobsFound: result?.jobsInserted || 0,
                }
              : q
          )
        );
      } catch (error) {
        setQueue((prev) =>
          prev.map((q, i) =>
            i === currentIndex
              ? {
                  ...q,
                  status: 'failed' as const,
                  error: error instanceof Error ? error.message : 'Unknown error',
                }
              : q
          )
        );
      }

      setCurrentIndex((prev) => prev + 1);
    };

    processNext();
  }, [isRunning, isPaused, currentIndex, queue]);

  // Check if all done
  useEffect(() => {
    if (isRunning && currentIndex >= queue.length) {
      setIsRunning(false);
      onComplete();
    }
  }, [isRunning, currentIndex, queue.length, onComplete]);

  // Subscribe to realtime updates for running item
  useEffect(() => {
    const runningItem = queue.find((q) => q.status === 'running');
    if (!runningItem) return;

    const channel = supabase
      .channel(`bulk-scrape-${runningItem.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'company_career_sites',
          filter: `id=eq.${runningItem.id}`,
        },
        (payload) => {
          const data = payload.new as any;
          if (data.scrape_progress_jobs_found) {
            setQueue((prev) =>
              prev.map((q) =>
                q.id === runningItem.id
                  ? { ...q, jobsFound: data.scrape_progress_jobs_found }
                  : q
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queue]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleCancel = () => {
    setIsRunning(false);
    setIsPaused(false);
    onClose();
  };

  const completedCount = queue.filter((q) => q.status === 'completed').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;
  const totalJobs = queue.reduce((sum, q) => sum + (q.jobsFound || 0), 0);
  const progressPercent = queue.length > 0 ? ((completedCount + failedCount) / queue.length) * 100 : 0;

  const getStatusIcon = (status: QueueItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Bulk Scrape Queue
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {completedCount + failedCount} / {queue.length} companies
              </span>
              <span className="font-medium">{totalJobs} jobs found</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-2 bg-green-500/10 rounded">
              <p className="font-bold text-green-600">{completedCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="p-2 bg-red-500/10 rounded">
              <p className="font-bold text-red-600">{failedCount}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="p-2 bg-muted/50 rounded">
              <p className="font-bold">{queue.length - completedCount - failedCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>

          {/* Queue List */}
          <ScrollArea className="h-[250px] pr-4">
            <div className="space-y-2">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.status === 'running'
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    {getStatusIcon(item.status)}
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.status === 'running' && item.jobsFound !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {item.jobsFound} jobs found...
                        </p>
                      )}
                      {item.status === 'completed' && (
                        <p className="text-xs text-green-600">
                          {item.jobsFound} jobs saved
                        </p>
                      )}
                      {item.status === 'failed' && item.error && (
                        <p className="text-xs text-red-600 truncate max-w-[200px]">
                          {item.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {!isRunning ? (
              <>
                <Button onClick={handleStart} className="flex-1">
                  <Play className="w-4 h-4 mr-2" />
                  Start Scraping
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {isPaused ? (
                  <Button onClick={handleResume} className="flex-1">
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                ) : (
                  <Button onClick={handlePause} variant="secondary" className="flex-1">
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                )}
                <Button variant="destructive" onClick={handleCancel}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkScrapeModal;
