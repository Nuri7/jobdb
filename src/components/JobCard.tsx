import { MapPin, Calendar, Copy, DollarSign, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface JobCardProps {
  title: string;
  image: string;
  location: string;
  dateRange: string;
  source: string;
  startDate: string;
  description?: string;
  jobUrl?: string;
  experienceLevel?: string;
  salaryRange?: string;
  onClick?: () => void;
}

const JobCard = ({ title, location, dateRange, source, startDate, description, jobUrl, experienceLevel, salaryRange, onClick }: JobCardProps) => {
  const { toast } = useToast();

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (jobUrl) {
      navigator.clipboard.writeText(jobUrl);
      toast({ title: "Copied!", description: "Job URL copied to clipboard" });
    }
  };

  return (
    <div 
      className="bg-card rounded-lg overflow-hidden border border-border hover:shadow-lg transition-shadow duration-200 cursor-pointer p-4"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-foreground text-base line-clamp-2 flex-1">
          {title}
        </h3>
        <Badge variant="secondary" className="text-xs font-medium shrink-0">
          {startDate}
        </Badge>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          <span className="truncate">{location}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>{dateRange}</span>
        </div>
        {experienceLevel && (
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{experienceLevel}</span>
          </div>
        )}
      </div>

      {/* Salary */}
      {salaryRange && (
        <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium mb-3">
          <DollarSign className="w-3.5 h-3.5" />
          <span>{salaryRange}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
          {description.replace(/[#*_`]/g, '').slice(0, 200)}
        </p>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        {jobUrl && (
          <div className="flex items-center gap-1.5">
            <a 
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-primary truncate flex-1"
            >
              {jobUrl}
            </a>
            <button
              onClick={handleCopyUrl}
              className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
              title="Copy URL"
            >
              <Copy className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{source}</span>
      </div>
    </div>
  );
};

export default JobCard;
