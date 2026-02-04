import { useState } from "react";
import { useJobs, useCompanies } from "@/hooks/useJobs";
import { jobsApi } from "@/lib/api/jobs";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import JobListItem from "@/components/JobListItem";
import Pagination from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isScraping, setIsScraping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scrapingCompany, setScrapingCompany] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  const { data: companies } = useCompanies();
  
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
          description: "No companies are enabled for scraping. Enable companies in the Companies page.",
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
                <TabsTrigger key={company.id} value={company.id} className="px-4">
                  {company.company_name} ({company.jobs_found_count || 0})
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value={activeTab} className="mt-4">
            {/* Selected Company Career URL */}
            {activeTab !== "all" && companies?.find(c => c.id === activeTab)?.career_url && (
              <div className="text-sm text-muted-foreground mb-4">
                <span className="font-medium">Career page:</span>{" "}
                <a 
                  href={companies.find(c => c.id === activeTab)?.career_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {companies.find(c => c.id === activeTab)?.career_url}
                </a>
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
    </div>
  );
};

export default Index;
