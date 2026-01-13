import { useState } from "react";
import { MapPin, Calendar, Copy, DollarSign, GraduationCap, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLogoUrl, getCompanyFaviconUrl } from "@/lib/utils/logo";

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
  companyCareerUrl?: string | null;
  isInternship?: boolean;
  onClick?: () => void;
}

const JobCard = ({ title, location, dateRange, source, startDate, description, jobUrl, experienceLevel, salaryRange, companyCareerUrl, isInternship, onClick }: JobCardProps) => {
  const { toast } = useToast();
  const [logoError, setLogoError] = useState(false);

  const logoUrl = getCompanyLogoUrl(companyCareerUrl);
  const fallbackUrl = getCompanyFaviconUrl(companyCareerUrl);

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
      {/* Header with Logo */}
      <div className="flex items-start gap-3 mb-3">
        {/* Company Logo */}
        <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
          {logoUrl && !logoError ? (
            <img 
              src={logoUrl}
              alt={`${source} logo`}
              className="w-full h-full object-contain p-1"
              onError={() => setLogoError(true)}
            />
          ) : fallbackUrl && logoError ? (
            <img 
              src={fallbackUrl}
              alt={`${source} logo`}
              className="w-6 h-6 object-contain"
            />
          ) : (
            <Building2 className="w-5 h-5 text-muted-foreground/40" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-base line-clamp-2">
            {title}
          </h3>
          <span className="text-xs text-muted-foreground">{source}</span>
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0">
          {isInternship && (
            <Badge variant="outline" className="text-xs font-medium border-purple-300 text-purple-600 bg-purple-50">
              Internship
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs font-medium">
            {startDate}
          </Badge>
        </div>
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
      </div>
    </div>
  );
};

export default JobCard;
