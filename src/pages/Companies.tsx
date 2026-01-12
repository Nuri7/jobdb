import { useState } from "react";
import { useCompanies } from "@/hooks/useJobs";
import { jobsApi, CompanyCareerSite } from "@/lib/api/jobs";
import Header from "@/components/Header";
import CompanyEditModal from "@/components/CompanyEditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  ExternalLink, 
  MapPin, 
  Search, 
  Loader2,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  Pencil
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Companies = () => {
  const [search, setSearch] = useState("");
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyCareerSite | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { data: companies, isLoading, refetch } = useCompanies();
  const { toast } = useToast();

  const filteredCompanies = companies?.filter(company =>
    company.company_name.toLowerCase().includes(search.toLowerCase()) ||
    company.industry?.toLowerCase().includes(search.toLowerCase()) ||
    company.headquarters_city?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleScrapeCompany = async (companyId: string, careerUrl: string, companyName: string) => {
    setScrapingId(companyId);
    try {
      await jobsApi.scrapeCompany(companyId, careerUrl);
      toast({
        title: "Scraping complete",
        description: `Successfully scraped jobs from ${companyName}`,
      });
      refetch();
    } catch (error) {
      toast({
        title: "Scraping failed",
        description: `Failed to scrape ${companyName}`,
        variant: "destructive",
      });
    } finally {
      setScrapingId(null);
    }
  };

  const handleSaveCareerUrl = async (companyId: string, careerUrl: string) => {
    setIsSaving(true);
    try {
      await jobsApi.updateCompanyCareerUrl(companyId, careerUrl);
      toast({
        title: "URL updated",
        description: "Career page URL has been updated successfully",
      });
      refetch();
      setEditingCompany(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update career page URL",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Companies</h1>
          <p className="text-muted-foreground">
            Browse career pages from top Dutch companies
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search companies by name, industry, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
          <span>{filteredCompanies.length} companies</span>
          <span>•</span>
          <span>
            {filteredCompanies.filter(c => c.crawl_status === "completed").length} scraped
          </span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Companies Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                className="bg-card border border-border rounded-lg p-5 hover:shadow-lg transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {company.company_name}
                      </h3>
                      {company.industry && (
                        <p className="text-xs text-muted-foreground">
                          {company.industry}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCompany(company)}
                      className="p-1.5 rounded-full hover:bg-muted transition-colors"
                      title="Edit career URL"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {getStatusIcon(company.crawl_status)}
                  </div>
                </div>

                {/* Meta */}
                <div className="space-y-2 mb-4">
                  {company.headquarters_city && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{company.headquarters_city}</span>
                    </div>
                  )}
                  {company.company_size && (
                    <Badge variant="secondary" className="text-xs">
                      {company.company_size} employees
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                {company.jobs_found_count !== null && company.jobs_found_count > 0 && (
                  <div className="text-sm text-muted-foreground mb-4">
                    <span className="font-medium text-foreground">{company.jobs_found_count}</span> jobs found
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(company.career_url, '_blank')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Careers Page
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    disabled={scrapingId === company.id}
                    onClick={() => handleScrapeCompany(company.id, company.career_url, company.company_name)}
                  >
                    {scrapingId === company.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Scraping...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Scrape
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredCompanies.length === 0 && (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No companies found</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <CompanyEditModal
        isOpen={!!editingCompany}
        onClose={() => setEditingCompany(null)}
        company={editingCompany}
        onSave={handleSaveCareerUrl}
        isSaving={isSaving}
      />
    </div>
  );
};

export default Companies;
