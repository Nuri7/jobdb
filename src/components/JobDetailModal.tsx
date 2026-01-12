import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, ExternalLink, Clock, Building2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    id: string;
    job_title: string;
    job_url: string;
    location: string | null;
    employment_type: string | null;
    department: string | null;
    description: string | null;
    is_remote: boolean | null;
    company_name?: string;
    scraped_at?: string;
  } | null;
}

const JobDetailModal = ({ isOpen, onClose, job }: JobDetailModalProps) => {
  if (!job) return null;

  const handleApply = () => {
    window.open(job.job_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold leading-tight mb-2">
                {job.job_title}
              </DialogTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-4 h-4" />
                <span className="font-medium">{job.company_name || "Unknown Company"}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 py-3 border-b border-border">
          {job.location && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {job.location}
            </Badge>
          )}
          {job.employment_type && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {job.employment_type}
            </Badge>
          )}
          {job.is_remote && (
            <Badge variant="default" className="bg-green-600">
              Remote
            </Badge>
          )}
          {job.department && (
            <Badge variant="outline">
              {job.department}
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="py-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Job Description
            </h3>
            {job.description ? (
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
                {job.description.slice(0, 3000)}
                {job.description.length > 3000 && "..."}
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                No description available. Click "Apply Now" to view the full job posting.
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t border-border flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {job.scraped_at && `Found ${new Date(job.scraped_at).toLocaleDateString()}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleApply} className="gap-2">
              Apply Now
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobDetailModal;
