import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Clock,
  Play,
  Pause,
  X
} from "lucide-react";

interface CompanyToProcess {
  id: string;
  company_name: string;
  website: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  career_url?: string;
  error?: string;
}

interface FindCareerPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Array<{ id: string; company_name: string; website: string | null }>;
  onComplete: () => void;
}

export default function FindCareerPagesModal({
  isOpen,
  onClose,
  companies,
  onComplete,
}: FindCareerPagesModalProps) {
  const [queue, setQueue] = useState<CompanyToProcess[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const processingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const completionTimesRef = useRef<number[]>([]);
  const itemStartTimeRef = useRef<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { toast } = useToast();

  // Initialize queue when modal opens
  useEffect(() => {
    if (isOpen && companies.length > 0) {
      setQueue(
        companies.map((c) => ({
          id: c.id,
          company_name: c.company_name,
          website: c.website,
          status: 'pending' as const,
        }))
      );
      setCurrentIndex(0);
      setIsRunning(false);
      setIsPaused(false);
      setElapsedTime(0);
      processingRef.current = false;
      startTimeRef.current = null;
      completionTimesRef.current = [];
      itemStartTimeRef.current = null;
    }
  }, [isOpen, companies]);

  // Timer for elapsed time display
  useEffect(() => {
    if (!isRunning || isPaused) return;
    
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // Process queue in batches
  useEffect(() => {
    if (!isRunning || isPaused || currentIndex >= queue.length) return;
    if (processingRef.current) return; // Prevent double processing

    const processNext = async () => {
      processingRef.current = true;
      itemStartTimeRef.current = Date.now();
      
      // Process one at a time for better responsiveness with slow companies
      const batchSize = 1;
      const batchStart = currentIndex;
      const batchEnd = Math.min(currentIndex + batchSize, queue.length);
      const batch = queue.slice(batchStart, batchEnd);
      
      if (batch.length === 0) {
        processingRef.current = false;
        return;
      }

      // Update status to running for batch
      setQueue((prev) =>
        prev.map((q, i) =>
          i >= batchStart && i < batchEnd
            ? { ...q, status: 'running' as const }
            : q
        )
      );

      // Set up timeout handling - 90 second client-side timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const { data, error } = await supabase.functions.invoke('find-career-page', {
          body: {
            companies: batch.map((c) => ({
              company_name: c.company_name,
              website: c.website,
            })),
          },
        });

        clearTimeout(timeoutId);

        if (error) throw error;

        // Update queue with results
        if (data?.success && data.results) {
          const resultsMap = new Map<string, string>();
          for (const r of data.results as Array<{ company_name: string; career_url: string | null }>) {
            if (r.career_url) {
              resultsMap.set(r.company_name, r.career_url);
            }
          }

          // Update database for each found career URL
          for (const item of batch) {
            const careerUrl = resultsMap.get(item.company_name);
            if (careerUrl) {
              await supabase
                .from('company_career_sites')
                .update({ career_url: careerUrl })
                .eq('id', item.id);
            }
          }

          setQueue((prev) =>
            prev.map((q) => {
              const batchItem = batch.find((b) => b.id === q.id);
              if (batchItem) {
                const careerUrl = resultsMap.get(q.company_name);
                return {
                  ...q,
                  status: careerUrl ? 'completed' as const : 'failed' as const,
                  career_url: careerUrl || undefined,
                  error: careerUrl ? undefined : 'No career page found',
                };
              }
              return q;
            })
          );
        } else {
          // Mark batch as failed
          setQueue((prev) =>
            prev.map((q) =>
              batch.find((b) => b.id === q.id)
                ? { ...q, status: 'failed' as const, error: 'API error' }
                : q
            )
          );
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error finding career pages:', error);
        
        // Determine user-friendly error message
        const errorMessage = error instanceof Error 
          ? (error.name === 'AbortError' || error.message.includes('Load failed') || error.message.includes('timeout')
            ? 'Request timed out - company may have slow career page'
            : error.message)
          : 'Unknown error';
        
        setQueue((prev) =>
          prev.map((q) =>
            batch.find((b) => b.id === q.id)
              ? {
                  ...q,
                  status: 'failed' as const,
                  error: errorMessage,
                }
              : q
          )
        );
      }

      // Track completion time for this item
      if (itemStartTimeRef.current) {
        const itemDuration = (Date.now() - itemStartTimeRef.current) / 1000;
        completionTimesRef.current.push(itemDuration);
      }

      setCurrentIndex(batchEnd);
      processingRef.current = false;
    };

    processNext();
  }, [isRunning, isPaused, currentIndex, queue.length]);

  // Check if all done
  useEffect(() => {
    if (isRunning && currentIndex >= queue.length && queue.length > 0 && !processingRef.current) {
      setIsRunning(false);
      const completedCount = queue.filter((q) => q.status === 'completed').length;
      toast({
        title: "Career page discovery complete",
        description: `Found career pages for ${completedCount} of ${queue.length} companies`,
      });
      onComplete();
    }
  }, [isRunning, currentIndex, queue, onComplete, toast]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
    completionTimesRef.current = [];
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
    processingRef.current = false;
    startTimeRef.current = null;
    onClose();
  };

  const completedCount = queue.filter((q) => q.status === 'completed').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;
  const processedCount = completedCount + failedCount;
  const pendingCount = queue.length - processedCount;
  const progressPercent = queue.length > 0 ? (processedCount / queue.length) * 100 : 0;

  // Calculate estimated time remaining
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getEstimatedTimeRemaining = (): string | null => {
    if (!isRunning || pendingCount === 0) return null;
    
    const times = completionTimesRef.current;
    if (times.length === 0) {
      // No data yet, use a default estimate of 15s per company
      return `~${formatTime(pendingCount * 15)}`;
    }
    
    // Calculate average time per company
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const estimatedSeconds = Math.ceil(avgTime * pendingCount);
    return `~${formatTime(estimatedSeconds)}`;
  };

  const estimatedTimeRemaining = getEstimatedTimeRemaining();

  const getStatusIcon = (status: CompanyToProcess['status']) => {
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
            <Search className="w-5 h-5" />
            Find Career Pages
          </DialogTitle>
          <DialogDescription>
            Discover career pages for {queue.length} companies using Firecrawl
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {processedCount} / {queue.length} companies
              </span>
              <span className="font-medium">{completedCount} found</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            
            {/* Time indicators */}
            {isRunning && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Elapsed: {formatTime(elapsedTime)}</span>
                </div>
                {estimatedTimeRemaining && (
                  <span>Remaining: {estimatedTimeRemaining}</span>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-2 bg-green-500/10 rounded">
              <p className="font-bold text-green-600">{completedCount}</p>
              <p className="text-xs text-muted-foreground">Found</p>
            </div>
            <div className="p-2 bg-red-500/10 rounded">
              <p className="font-bold text-red-600">{failedCount}</p>
              <p className="text-xs text-muted-foreground">Not Found</p>
            </div>
            <div className="p-2 bg-muted/50 rounded">
              <p className="font-bold">{pendingCount}</p>
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
                      <p className="text-sm font-medium">{item.company_name}</p>
                      {item.status === 'completed' && item.career_url && (
                        <p className="text-xs text-green-600 truncate max-w-[200px]">
                          {item.career_url}
                        </p>
                      )}
                      {item.status === 'failed' && item.error && (
                        <p className="text-xs text-red-600">
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
          <DialogFooter className="flex items-center gap-2 pt-2">
            {!isRunning ? (
              <>
                <Button onClick={handleStart} className="flex-1">
                  <Play className="w-4 h-4 mr-2" />
                  Start Discovery
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
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
