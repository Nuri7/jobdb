import { MapPin, Calendar, Briefcase, ExternalLink, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface JobListItemProps {
  title: string;
  image: string;
  location: string;
  dateRange: string;
  source: string;
  startDate: string;
  jobUrl?: string;
  onClick?: () => void;
}

const JobListItem = ({ title, image, location, dateRange, source, startDate, jobUrl, onClick }: JobListItemProps) => {
  const { toast } = useToast();
  const hasImage = image && !image.includes("placeholder");

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (jobUrl) {
      navigator.clipboard.writeText(jobUrl);
      toast({ title: "Copied!", description: "Job URL copied to clipboard" });
    }
  };

  return (
    <div 
      className="bg-card rounded-lg border border-border hover:shadow-lg transition-shadow duration-200 p-4 flex items-center gap-4 cursor-pointer"
      onClick={onClick}
    >
      {/* Image */}
      <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-muted overflow-hidden">
        {hasImage ? (
          <img 
            src={image} 
            alt={title} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground text-base truncate">
          {title}
        </h3>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{dateRange}</span>
          </div>
        </div>
      </div>

      {/* Meta and URL */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{source}</span>
          <Badge variant="secondary" className="text-xs font-medium">
            {startDate}
          </Badge>
          {jobUrl && (
            <Button 
              size="sm" 
              variant="default" 
              onClick={(e) => {
                e.stopPropagation();
                window.open(jobUrl, '_blank');
              }} 
              className="h-7 text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              Job page
            </Button>
          )}
        </div>
        {jobUrl && (
          <div className="flex items-center gap-1.5">
            <a 
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-primary truncate max-w-[300px]"
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
      </div>
    </div>
  );
};

export default JobListItem;
