import { useState } from "react";
import { useCompanies } from "@/hooks/useJobs";
import { format, parseISO } from "date-fns";
import Header from "@/components/Header";
import { Building2, MapPin, Loader2 } from "lucide-react";
import { getCompanyLogoUrl, getCompanyFaviconUrl } from "@/lib/utils/logo";

// Company logo component with fallback
const CompanyLogo = ({ careerUrl, companyName }: { careerUrl: string; companyName: string }) => {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = getCompanyLogoUrl(careerUrl);
  const fallbackUrl = getCompanyFaviconUrl(careerUrl);

  return (
    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
      {logoUrl && !logoError ? (
        <img 
          src={logoUrl}
          alt={`${companyName} logo`}
          className="w-full h-full object-contain p-1"
          onError={() => setLogoError(true)}
        />
      ) : fallbackUrl && logoError ? (
        <img 
          src={fallbackUrl}
          alt={`${companyName} logo`}
          className="w-5 h-5 object-contain"
        />
      ) : (
        <Building2 className="w-5 h-5 text-muted-foreground" />
      )}
    </div>
  );
};

const Companies = () => {
  const { data: companies, isLoading } = useCompanies();

  // Sort companies alphabetically by name
  const sortedCompanies = [...(companies || [])].sort((a, b) => 
    a.company_name.localeCompare(b.company_name)
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-7xl py-8">
        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
          <span>{sortedCompanies.length} companies</span>
          <span>•</span>
          <span>
            {sortedCompanies.filter(c => c.is_scrape_enabled).length} enabled
          </span>
          <span>•</span>
          <span>
            {sortedCompanies.reduce((sum, c) => sum + (c.jobs_found_count || 0), 0)} total jobs
          </span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Companies List */}
        {!isLoading && (
          <div className="flex flex-col gap-3">
            {sortedCompanies.map((company) => (
              <div
                key={company.id}
                className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:shadow-md transition-all"
              >
                <CompanyLogo careerUrl={company.career_url} companyName={company.company_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {company.company_name}
                    </h3>
                    {!company.is_scrape_enabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Disabled
                      </span>
                    )}
                  </div>
                  <a 
                    href={company.career_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary truncate block"
                  >
                    {company.career_url}
                  </a>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    {company.industry && <span>{company.industry}</span>}
                    {company.headquarters_city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {company.headquarters_city}
                      </span>
                    )}
                    {company.jobs_found_count !== null && company.jobs_found_count > 0 && (
                      <span className="font-medium text-foreground">{company.jobs_found_count} jobs</span>
                    )}
                    <span className="text-xs text-muted-foreground/70">
                      Added {format(parseISO(company.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sortedCompanies.length === 0 && (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No companies found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Companies;
