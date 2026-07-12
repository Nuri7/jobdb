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
  firstSeenAt?: string | null;
  easyApply?: boolean;
  closingDate?: string | null;
  description?: string | null;
}

const DAY = 86_400_000;

const JobListItem = ({ title, location, dateRange, source, startDate, jobUrl, experienceLevel, salaryRange, companyCareerUrl, isInternship, industry, firstSeenAt, easyApply, closingDate, description }: JobListItemProps) => {
  const { toast } = useToast();
  const [logoError, setLogoError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isNew = firstSeenAt ? Date.now() - new Date(firstSeenAt).getTime() < 7 * DAY : false;
  const daysToClose = closingDate ? Math.ceil((new Date(closingDate).getTime() - Date.now()) / DAY) : null;
  const closesSoon = daysToClose !== null && daysToClose >= 0 && daysToClose <= 7;

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
      <div className="bg-card rounded-lg border border-border hover:shadow-lg transition-shadow duration-200 p-3 sm:p-4">
        {/* One wrapping column next to the logo — no fixed right rail, so nothing overflows
            off a narrow screen and the title always has room (the old 3-column row squeezed
            the title to zero width on mobile). */}
        <div className="flex items-start gap-3">
          {/* Company Logo */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
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
            {/* Title + company name (name sits top-right, capped so it never eats the title) */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-2">
                {title}
              </h3>
              <span className="text-xs text-muted-foreground flex-shrink-0 max-w-[40%] truncate text-right pt-0.5">
                {source}
              </span>
            </div>

            {jobUrl && (
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <a
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-muted-foreground hover:text-primary truncate min-w-0"
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

            {/* Meta chips — wrap instead of overflowing */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1 min-w-0 max-w-full">
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
              {salaryRange && (
                <div className="flex items-center gap-1 text-green-600 font-medium">
                  <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{salaryRange}</span>
                </div>
              )}
            </div>

            {/* Badges + Show more — wrap; Show more trails to the end of the row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {isNew && (
                <Badge variant="outline" className="text-xs font-medium border-emerald-300 text-emerald-700 bg-emerald-50">
                  Nieuw
                </Badge>
              )}
              {easyApply && (
                <Badge variant="outline" className="text-xs font-medium border-blue-300 text-blue-700 bg-blue-50" title="Gestructureerd sollicitatiesysteem — FairApply kan dit automatiseren">
                  1-klik
                </Badge>
              )}
              {closesSoon && (
                <Badge variant="outline" className="text-xs font-medium border-amber-300 text-amber-700 bg-amber-50">
                  {daysToClose === 0 ? "Sluit vandaag" : `Nog ${daysToClose}d`}
                </Badge>
              )}
              {isInternship && (
                <Badge variant="outline" className="text-xs font-medium border-purple-300 text-purple-600 bg-purple-50">
                  Stage
                </Badge>
              )}
              {industry && colors && (
                <Badge variant="outline" className={`text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                  {industry}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs font-medium">
                {startDate}
              </Badge>
              {description && (
                <CollapsibleTrigger asChild>
                  <button
                    onClick={handleToggleExpand}
                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors flex-shrink-0"
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
        </div>

        {/* Expandable Description */}
        <CollapsibleContent>
          {description && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="bg-muted/50 rounded-lg p-3 sm:p-4 prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground break-words">
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
