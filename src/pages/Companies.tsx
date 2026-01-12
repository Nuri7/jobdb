import { useState, useCallback } from "react";
import { useCompanies } from "@/hooks/useJobs";
import { jobsApi, CompanyCareerSite } from "@/lib/api/jobs";
import Header from "@/components/Header";
import CompanyEditModal from "@/components/CompanyEditModal";
import ScrapeProgressModal from "@/components/ScrapeProgressModal";
import ScrapeHistoryModal from "@/components/ScrapeHistoryModal";
import BulkScrapeModal from "@/components/BulkScrapeModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Pencil,
  History,
  ListChecks,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Companies = () => {
  const [search, setSearch] = useState("");
  const [scrapingCompany, setScrapingCompany] = useState<{id: string; name: string} | null>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyCareerSite | null>(null);
  const [historyCompany, setHistoryCompany] = useState<{id: string; name: string} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [showBulkScrapeModal, setShowBulkScrapeModal] = useState(false);
  const { data: companies, isLoading, refetch } = useCompanies();
  const { toast } = useToast();

  const filteredCompanies = companies?.filter(company =>
    company.company_name.toLowerCase().includes(search.toLowerCase()) ||
    company.industry?.toLowerCase().includes(search.toLowerCase()) ||
    company.headquarters_city?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleScrapeCompany = async (companyId: string, careerUrl: string, companyName: string) => {
    setScrapingCompany({ id: companyId, name: companyName });
    try {
      await jobsApi.scrapeCompany(companyId, careerUrl);
    } catch (error) {
      toast({
        title: "Scraping failed",
        description: `Failed to scrape ${companyName}`,
        variant: "destructive",
      });
      setScrapingCompany(null);
    }
  };

  const handleScrapeComplete = useCallback(() => {
    if (scrapingCompany) {
      toast({
        title: "Scraping complete",
        description: `Successfully scraped jobs from ${scrapingCompany.name}`,
      });
    }
    setScrapingCompany(null);
    refetch();
  }, [scrapingCompany, toast, refetch]);

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

  const toggleCompanySelection = (companyId: string) => {
    setSelectedCompanies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    const allIds = new Set(filteredCompanies.map((c) => c.id));
    setSelectedCompanies(allIds);
  };

  const clearSelection = () => {
    setSelectedCompanies(new Set());
  };

  const handleBulkScrape = () => {
    if (selectedCompanies.size === 0) {
      toast({
        title: "No companies selected",
        description: "Please select at least one company to scrape",
        variant: "destructive",
      });
      return;
    }
    setShowBulkScrapeModal(true);
  };

  const handleBulkScrapeComplete = () => {
    toast({
      title: "Bulk scraping complete",
      description: `Finished scraping ${selectedCompanies.size} companies`,
    });
    setShowBulkScrapeModal(false);
    setBulkSelectMode(false);
    setSelectedCompanies(new Set());
    refetch();
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

  const selectedCompaniesData = companies?.filter((c) => selectedCompanies.has(c.id)) || [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Companies</h1>
            <p className="text-muted-foreground">
              Browse career pages from top Dutch companies
            </p>
          </div>
          <Button
            variant={bulkSelectMode ? "default" : "outline"}
            onClick={() => {
              setBulkSelectMode(!bulkSelectMode);
              if (bulkSelectMode) {
                setSelectedCompanies(new Set());
              }
            }}
          >
            <ListChecks className="w-4 h-4 mr-2" />
            {bulkSelectMode ? "Exit Bulk Mode" : "Bulk Scrape"}
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {bulkSelectMode && (
          <div className="flex items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedCompanies.size === filteredCompanies.length && filteredCompanies.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    selectAllFiltered();
                  } else {
                    clearSelection();
                  }
                }}
              />
              <span className="text-sm font-medium">
                {selectedCompanies.size} selected
              </span>
            </div>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={selectAllFiltered}>
              Select All ({filteredCompanies.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
            <Button 
              onClick={handleBulkScrape} 
              disabled={selectedCompanies.size === 0}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Scrape Selected ({selectedCompanies.size})
            </Button>
          </div>
        )}

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
                className={`bg-card border rounded-lg p-5 hover:shadow-lg transition-all ${
                  bulkSelectMode && selectedCompanies.has(company.id)
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border'
                }`}
                onClick={() => {
                  if (bulkSelectMode) {
                    toggleCompanySelection(company.id);
                  }
                }}
                style={{ cursor: bulkSelectMode ? 'pointer' : 'default' }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {bulkSelectMode && (
                      <Checkbox
                        checked={selectedCompanies.has(company.id)}
                        onCheckedChange={() => toggleCompanySelection(company.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
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
                  {!bulkSelectMode && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryCompany({ id: company.id, name: company.company_name })}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors"
                        title="View scrape history"
                      >
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors"
                        title="Edit career URL"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      {getStatusIcon(company.crawl_status)}
                    </div>
                  )}
                  {bulkSelectMode && getStatusIcon(company.crawl_status)}
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

                {/* Actions - only show when not in bulk mode */}
                {!bulkSelectMode && (
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
                      disabled={scrapingCompany?.id === company.id}
                      onClick={() => handleScrapeCompany(company.id, company.career_url, company.company_name)}
                    >
                      {scrapingCompany?.id === company.id ? (
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
                )}
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

      {/* Scrape Progress Modal */}
      <ScrapeProgressModal
        isOpen={!!scrapingCompany}
        companyId={scrapingCompany?.id || null}
        companyName={scrapingCompany?.name || ""}
        onComplete={handleScrapeComplete}
      />

      {/* Scrape History Modal */}
      <ScrapeHistoryModal
        isOpen={!!historyCompany}
        onClose={() => setHistoryCompany(null)}
        companyId={historyCompany?.id || null}
        companyName={historyCompany?.name || ""}
      />

      {/* Bulk Scrape Modal */}
      <BulkScrapeModal
        isOpen={showBulkScrapeModal}
        onClose={() => setShowBulkScrapeModal(false)}
        companies={selectedCompaniesData.map((c) => ({
          id: c.id,
          name: c.company_name,
          careerUrl: c.career_url,
        }))}
        onComplete={handleBulkScrapeComplete}
      />
    </div>
  );
};

export default Companies;
