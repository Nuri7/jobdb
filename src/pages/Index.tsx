import { useState } from "react";
import { useJobs, useCompanies, useLocations, useIndustries } from "@/hooks/useJobs";
import { jobsApi } from "@/lib/api/jobs";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import FilterBar from "@/components/FilterBar";
import JobListItem from "@/components/JobListItem";
import Pagination from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("all");
  const [jobType, setJobType] = useState("all");
  const [experienceLevel, setExperienceLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isScraping, setIsScraping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scrapingCompany, setScrapingCompany] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  const { data: companies } = useCompanies();
  
  // Get enabled company IDs for filtering
  const enabledCompanyIds = companies?.filter(c => c.is_scrape_enabled === true).map(c => c.id) || [];

  const { data: jobsData, isLoading, refetch } = useJobs({
    search,
    location: location !== "all" ? location : undefined,
    source: source !== "all" ? source : undefined,
    jobType: jobType !== "all" ? jobType : undefined,
    experienceLevel: experienceLevel !== "all" ? experienceLevel : undefined,
    industry: industry !== "all" ? industry : undefined,
    page: currentPage,
    enabledCompanyIds: source === "all" ? enabledCompanyIds : undefined,
  });

  const { data: locations } = useLocations();
  const { data: industries } = useIndustries();

  const handleClearAll = () => {
    setLocation("all");
    setJobType("all");
    setExperienceLevel("all");
    setSource("all");
    setIndustry("all");
    setSearch("");
  };

  const handleScrape = async () => {
    if (!companies || companies.length === 0) {
      toast({
        title: "No companies",
        description: "No companies to scrape",
        variant: "destructive",
      });
      return;
    }

    // Determine which companies to scrape based on selection
    let companiesToScrape;
    if (source === "all") {
      // Scrape only enabled companies when "All Companies" is selected
      const enabledCompanies = companies.filter(c => c.is_scrape_enabled === true);
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
      const selectedCompany = companies.find(c => c.id === source);
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
    if (source === "all") return "All Companies";
    const company = companies?.find(c => c.id === source);
    return company?.company_name || "Selected Company";
  };

  const handleDeleteJobs = async () => {
    const companyName = getSelectedCompanyName();
    const confirmMessage = source === "all" 
      ? "Are you sure you want to delete ALL jobs? This cannot be undone."
      : `Are you sure you want to delete all jobs from ${companyName}? This cannot be undone.`;
    
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      await jobsApi.deleteJobs(source !== "all" ? source : undefined);
      toast({
        title: "Jobs deleted",
        description: source === "all" 
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
        {/* Filters Row with Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <FilterBar
            totalJobs={totalCount}
            location={location}
            onLocationChange={setLocation}
            jobType={jobType}
            onJobTypeChange={setJobType}
            experienceLevel={experienceLevel}
            onExperienceLevelChange={setExperienceLevel}
            source={source}
            onSourceChange={setSource}
            industry={industry}
            onIndustryChange={setIndustry}
            onClearAll={handleClearAll}
            companies={companies || []}
            locations={locations || []}
            industries={industries || []}
          />
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
                  {source === "all" ? "Bulk Scrape" : `Scrape ${getSelectedCompanyName()}`}
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
                  Delete {source === "all" ? "All Jobs" : `${getSelectedCompanyName()} Jobs`}
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

        {/* Job Count & Search */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-lg font-bold text-foreground">
            {totalCount} {totalCount === 1 ? 'job' : 'jobs'}
          </span>
          <SearchBar value={search} onChange={setSearch} />
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
              {isScraping ? "Scraping..." : `Scrape ${source === "all" ? "All Companies" : getSelectedCompanyName()}`}
            </Button>
          </div>
        )}

        {/* Jobs List - Full Width Cards */}
        {!isLoading && jobs.length > 0 && (
          <>
            <div className="flex flex-col gap-3 mt-6">
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
      </div>

    </div>
  );
};

export default Index;
