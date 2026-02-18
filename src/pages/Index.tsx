import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useJobs, useCompanies } from "@/hooks/useJobs";
import { jobsApi, CompanyCareerSite } from "@/lib/api/jobs";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import JobListItem from "@/components/JobListItem";
import Pagination from "@/components/Pagination";
import CompanyEditModal from "@/components/CompanyEditModal";
import ScrapeHistoryModal from "@/components/ScrapeHistoryModal";
import { AddCompanyModal } from "@/components/AddCompanyModal";
import { CompanyScrapeSettingsModal } from "@/components/CompanyScrapeSettingsModal";
import FindCareerPagesModal from "@/components/FindCareerPagesModal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Loader2, 
  RefreshCw, 
  Trash2, 
  Pencil, 
  History, 
  Ban, 
  ExternalLink,
  Building2,
  Sliders,
  Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLogoUrl, getCompanyFaviconUrl } from "@/lib/utils/logo";

// Company logo component with fallback
const CompanyLogo = ({ careerUrl, companyName, size = "sm" }: { careerUrl: string; companyName: string; size?: "sm" | "md" }) => {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = getCompanyLogoUrl(careerUrl);
  const fallbackUrl = getCompanyFaviconUrl(careerUrl);
  
  const sizeClasses = size === "sm" ? "w-6 h-6" : "w-10 h-10";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-5 h-5";

  return (
    <div className={`${sizeClasses} rounded-md bg-muted flex items-center justify-center overflow-hidden`}>
      {logoUrl && !logoError ? (
        <img 
          src={logoUrl}
          alt={`${companyName} logo`}
          className="w-full h-full object-contain p-0.5"
          onError={() => setLogoError(true)}
        />
      ) : fallbackUrl && logoError ? (
        <img 
          src={fallbackUrl}
          alt={`${companyName} logo`}
          className={iconSize}
        />
      ) : (
        <Building2 className={`${iconSize} text-muted-foreground`} />
      )}
    </div>
  );
};

const Index = () => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isScraping, setIsScraping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scrapingCompany, setScrapingCompany] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  const [editingCompany, setEditingCompany] = useState<CompanyCareerSite | null>(null);
  const [historyCompany, setHistoryCompany] = useState<{id: string; name: string} | null>(null);
  const [scrapeSettingsCompany, setScrapeSettingsCompany] = useState<CompanyCareerSite | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFindCareerPages, setShowFindCareerPages] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies, refetch: refetchCompanies } = useCompanies();
  
  // Get enabled companies for tabs
  const enabledCompanies = companies?.filter(c => c.is_scrape_enabled === true) || [];
  const enabledCompanyIds = enabledCompanies.map(c => c.id);

  const { data: jobsData, isLoading, refetch } = useJobs({
    search,
    source: activeTab !== "all" ? activeTab : undefined,
    page: currentPage,
    enabledCompanyIds: activeTab === "all" ? enabledCompanyIds : undefined,
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1); // Reset pagination when switching tabs
  };

  // Calculate total job count across all enabled companies
  const totalJobCount = enabledCompanies.reduce((sum, c) => sum + (c.jobs_found_count || 0), 0);

  // Get currently selected company
  const selectedCompany = activeTab !== "all" ? companies?.find(c => c.id === activeTab) : null;

  const handleScrape = async () => {
    if (!companies || companies.length === 0) {
      toast({
        title: "No companies",
        description: "No companies to scrape",
        variant: "destructive",
      });
      return;
    }

    // Determine which companies to scrape based on active tab
    let companiesToScrape;
    if (activeTab === "all") {
      // Scrape only enabled companies when "All" tab is selected
      if (enabledCompanies.length === 0) {
        toast({
          title: "No enabled companies",
          description: "No companies are enabled for scraping.",
          variant: "destructive",
        });
        return;
      }
      companiesToScrape = enabledCompanies.slice(0, 10);
    } else {
      // Scrape only the selected company
      const selectedCompany = companies.find(c => c.id === activeTab);
      if (!selectedCompany) {
        toast({
          title: "Company not found",
          description: "Could not find the selected company",
          variant: "destructive",
        });
        return;
      }
      companiesToScrape = [selectedCompany];
    }

    setIsScraping(true);
    setScrapeProgress({ current: 0, total: companiesToScrape.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < companiesToScrape.length; i++) {
      const company = companiesToScrape[i];
      setScrapingCompany(company.company_name);
      setScrapeProgress({ current: i + 1, total: companiesToScrape.length });

      try {
        await jobsApi.scrapeCompany(company.id, company.career_url);
        successCount++;
      } catch (error) {
        console.error(`Failed to scrape ${company.company_name}:`, error);
        errorCount++;
      }
    }

    setIsScraping(false);
    setScrapingCompany(null);
    setScrapeProgress({ current: 0, total: 0 });
    refetch();
    refetchCompanies();

    toast({
      title: "Scraping complete",
      description: `Successfully scraped ${successCount} ${successCount === 1 ? 'company' : 'companies'}. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
    });
  };

  const getSelectedCompanyName = () => {
    if (activeTab === "all") return "All Companies";
    const company = companies?.find(c => c.id === activeTab);
    return company?.company_name || "Selected Company";
  };

  const handleDeleteJobs = async () => {
    const companyName = getSelectedCompanyName();
    const confirmMessage = activeTab === "all" 
      ? "Are you sure you want to delete ALL jobs? This cannot be undone."
      : `Are you sure you want to delete all jobs from ${companyName}? This cannot be undone.`;
    
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      await jobsApi.deleteJobs(activeTab !== "all" ? activeTab : undefined);
      toast({
        title: "Jobs deleted",
        description: activeTab === "all" 
          ? "All jobs have been deleted." 
          : `All jobs from ${companyName} have been deleted.`,
      });
      refetch();
      refetchCompanies();
    } catch (error) {
      console.error('Failed to delete jobs:', error);
      toast({
        title: "Error",
        description: "Failed to delete jobs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleScrapeEnabled = async (companyId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('company_career_sites')
        .update({ is_scrape_enabled: enabled })
        .eq('id', companyId);

      if (error) throw error;
      refetchCompanies();
      
      // If disabling the currently selected company, switch to "all"
      if (!enabled && activeTab === companyId) {
        setActiveTab("all");
      }
    } catch (error) {
      console.error('Error updating scrape enabled:', error);
      toast({
        title: "Error",
        description: "Failed to update company status",
        variant: "destructive",
      });
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
      refetchCompanies();
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

  const extractMainDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const handleExcludeDomain = async (careerUrl: string) => {
    const domain = extractMainDomain(careerUrl);
    if (!domain) {
      toast({
        title: "Invalid URL",
        description: "Could not extract domain from career URL",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch current excluded_domains setting
      const { data: settingData, error: fetchError } = await supabase
        .from('scraper_settings')
        .select('setting_value')
        .eq('setting_key', 'excluded_domains')
        .single();

      if (fetchError) throw fetchError;

      const currentDomains: string[] = Array.isArray(settingData?.setting_value) ? (settingData.setting_value as string[]) : [];
      
      // Check if already excluded
      if (currentDomains.includes(domain)) {
        toast({
          title: "Already excluded",
          description: `Domain "${domain}" is already in the excluded list.`,
        });
        return;
      }

      // Add domain to excluded list
      const updatedDomains = [...currentDomains, domain];

      const { error: updateError } = await supabase
        .from('scraper_settings')
        .update({ setting_value: updatedDomains })
        .eq('setting_key', 'excluded_domains');

      if (updateError) throw updateError;

      toast({
        title: "Domain excluded",
        description: `"${domain}" has been added to the excluded domains list.`,
      });
    } catch (error: any) {
      toast({
        title: "Error excluding domain",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const jobs = jobsData?.jobs || [];
  const totalCount = jobsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / 12);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-7xl py-8">
        {/* Actions Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <SearchBar value={search} onChange={setSearch} />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowFindCareerPages(true)}
              variant="outline"
              size="sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Find Career Pages
            </Button>
            <AddCompanyModal onCompanyAdded={() => { refetchCompanies(); refetch(); }} />
            <Button 
              onClick={handleScrape} 
              disabled={isScraping || isDeleting}
              variant="outline"
              size="sm"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {activeTab === "all" ? "Bulk Scrape" : `Scrape ${getSelectedCompanyName()}`}
                </>
              )}
            </Button>
            <Button 
              onClick={handleDeleteJobs} 
              disabled={isDeleting || isScraping || totalCount === 0}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete {activeTab === "all" ? "All Jobs" : `${getSelectedCompanyName()} Jobs`}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Scraping Progress */}
        {isScraping && scrapingCompany && (
          <div className="text-sm text-muted-foreground flex items-center gap-2 mb-4">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>
              Scraping {scrapingCompany} ({scrapeProgress.current}/{scrapeProgress.total})
            </span>
          </div>
        )}

        {/* Company Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex h-10 items-center gap-1 p-1 bg-muted/50">
              <TabsTrigger value="all" className="px-4">
                All ({totalJobCount})
              </TabsTrigger>
              {enabledCompanies.map(company => (
                <TabsTrigger key={company.id} value={company.id} className="px-4 gap-2">
                  <CompanyLogo careerUrl={company.career_url} companyName={company.company_name} size="sm" />
                  {company.company_name} ({company.jobs_found_count || 0})
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value={activeTab} className="mt-4">
            {/* Per-Company Actions Bar - Only show for specific company */}
            {selectedCompany && (
              <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border mb-4">
                <div className="flex items-center gap-3">
                  <CompanyLogo careerUrl={selectedCompany.career_url} companyName={selectedCompany.company_name} size="md" />
                  <div>
                    <h3 className="font-semibold text-foreground">{selectedCompany.company_name}</h3>
                    <a 
                      href={selectedCompany.career_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      {selectedCompany.career_url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Enabled</span>
                          <Switch
                            checked={selectedCompany.is_scrape_enabled === true}
                            onCheckedChange={(checked) => toggleScrapeEnabled(selectedCompany.id, checked)}
                            className="scale-90"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Toggle scraping for this company</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <div className="w-px h-6 bg-border" />
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryCompany({ id: selectedCompany.id, name: selectedCompany.company_name })}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View scrape history</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCompany(selectedCompany)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit career URL</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExcludeDomain(selectedCompany.career_url)}
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Exclude this domain from scraping</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setScrapeSettingsCompany(selectedCompany)}
                        >
                          <Sliders className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Configure scraper settings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}

            {/* Job Count */}
            <div className="mb-4">
              <span className="text-lg font-bold text-foreground">
                {totalCount} {totalCount === 1 ? 'job' : 'jobs'}
              </span>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty State */}
            {!isLoading && jobs.length === 0 && (
              <div className="text-center py-20">
                <p className="text-muted-foreground mb-4">No jobs found yet.</p>
                <Button onClick={handleScrape} disabled={isScraping}>
                  {isScraping ? "Scraping..." : `Scrape ${activeTab === "all" ? "All Companies" : getSelectedCompanyName()}`}
                </Button>
              </div>
            )}

            {/* Jobs List - Full Width Cards */}
            {!isLoading && jobs.length > 0 && (
              <>
                <div className="flex flex-col gap-3">
                  {jobs.map((job) => (
                    <JobListItem
                      key={job.id}
                      title={job.job_title}
                      image=""
                      location={job.location || "Netherlands"}
                      dateRange={job.employment_type || "Full-time"}
                      source={job.company_name || "Unknown"}
                      startDate={job.is_remote ? "Remote" : "On-site"}
                      jobUrl={job.job_url}
                      experienceLevel={job.experience_level || undefined}
                      salaryRange={job.salary_range || undefined}
                      companyCareerUrl={job.company_career_url}
                      isInternship={job.is_internship || false}
                      industry={job.industry}
                      description={job.description}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Modal */}
      <CompanyEditModal
        isOpen={!!editingCompany}
        onClose={() => setEditingCompany(null)}
        company={editingCompany}
        onSave={handleSaveCareerUrl}
        isSaving={isSaving}
      />

      {/* Scrape History Modal */}
      <ScrapeHistoryModal
        isOpen={!!historyCompany}
        onClose={() => setHistoryCompany(null)}
        companyId={historyCompany?.id || null}
        companyName={historyCompany?.name || ""}
      />

      {/* Scrape Settings Modal */}
      <CompanyScrapeSettingsModal
        isOpen={!!scrapeSettingsCompany}
        onClose={() => setScrapeSettingsCompany(null)}
        company={scrapeSettingsCompany}
        onSaved={() => refetchCompanies()}
      />

      {/* Find Career Pages Modal */}
      <FindCareerPagesModal
        isOpen={showFindCareerPages}
        onClose={() => setShowFindCareerPages(false)}
        companies={(companies || [])
          .filter(c => {
            // Include companies whose career_url is just their website domain (not yet discovered)
            if (!c.website) return false;
            try {
              const careerHost = new URL(c.career_url).hostname.replace(/^www\./, '');
              const websiteHost = new URL(c.website).hostname.replace(/^www\./, '');
              return careerHost === websiteHost;
            } catch {
              return true;
            }
          })
          .map(c => ({ id: c.id, company_name: c.company_name, website: c.website }))}
        onComplete={() => { refetchCompanies(); refetch(); }}
      />
    </div>
  );
};

export default Index;
