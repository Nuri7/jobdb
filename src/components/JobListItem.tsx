import { useState } from "react";
import { MapPin, Calendar, Copy, DollarSign, GraduationCap, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLogoUrl, getCompanyFaviconUrl } from "@/lib/utils/logo";
import { getIndustryColors } from "@/lib/utils/industryColors";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ReactMarkdown from "react-markdown";

interface JobListItemProps {
  title: string;
  image: string;
  location: string;
  dateRange: string;
  source: string;
  startDate: string;
  jobUrl?: string;
  experienceLevel?: string;
  salaryRange?: string;
  companyCareerUrl?: string | null;
  isInternship?: boolean;
  industry?: string | null;
  description?: string | null;
}

const JobListItem = ({ title, location, dateRange, source, startDate, jobUrl, experienceLevel, salaryRange, companyCareerUrl, isInternship, industry, description }: JobListItemProps) => {
  const { toast } = useToast();
  const [logoError, setLogoError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const logoUrl = getCompanyLogoUrl(companyCareerUrl);
  const fallbackUrl = getCompanyFaviconUrl(companyCareerUrl);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (jobUrl) {
      navigator.clipboard.writeText(jobUrl);
      toast({ title: "Copied!", description: "Job URL copied to clipboard" });
    }
  };

  const colors = industry ? getIndustryColors(industry) : null;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="bg-card rounded-lg border border-border hover:shadow-lg transition-shadow duration-200 p-4">
        <div className="flex items-center gap-4">
          {/* Company Logo */}
          <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
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

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-base truncate">
              {title}
            </h3>
            {jobUrl && (
              <div className="flex items-center gap-1.5 mt-1">
                <a 
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-muted-foreground hover:text-primary truncate"
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
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{location}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{dateRange}</span>
              </div>
              {experienceLevel && (
                <div className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{experienceLevel}</span>
                </div>
              )}
              {industry && colors && (
                <Badge variant="outline" className={`text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                  {industry}
                </Badge>
              )}
              {salaryRange && (
                <div className="flex items-center gap-1 text-green-600 font-medium">
                  <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{salaryRange}</span>
                </div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-muted-foreground">{source}</span>
            {isInternship && (
              <Badge variant="outline" className="text-xs font-medium border-purple-300 text-purple-600 bg-purple-50">
                Internship
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs font-medium">
              {startDate}
            </Badge>
            {description && (
              <CollapsibleTrigger asChild>
                <button
                  onClick={handleToggleExpand}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <span>Show less</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Show more</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        {/* Expandable Description */}
        <CollapsibleContent>
          {description && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="bg-muted/50 rounded-lg p-4 prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
                <ReactMarkdown>{description}</ReactMarkdown>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default JobListItem;
