import { useState } from "react";
import { useJobs, useCompanies } from "@/hooks/useJobs";
import { jobsApi, Job } from "@/lib/api/jobs";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import FilterBar from "@/components/FilterBar";
import JobCard from "@/components/JobCard";
import JobListItem from "@/components/JobListItem";
import JobDetailModal from "@/components/JobDetailModal";
import ViewToggle from "@/components/ViewToggle";
import Pagination from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("all");
  const [startDate, setStartDate] = useState("all");
  const [source, setSource] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingCompany, setScrapingCompany] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const { toast } = useToast();

  const { data: jobsData, isLoading, refetch } = useJobs({
    search,
    location: location !== "all" ? location : undefined,
    source: source !== "all" ? source : undefined,
    page: currentPage,
  });

  const { data: companies } = useCompanies();

  const handleClearAll = () => {
    setLocation("all");
    setStartDate("all");
    setSource("all");
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
      // Scrape first 10 companies when "All Companies" is selected
      companiesToScrape = companies.slice(0, 10);
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

  const jobs = jobsData?.jobs || [];
  const totalCount = jobsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / 12);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-7xl py-8">
        {/* Header with Scrape Button */}
        <div className="flex flex-col items-end gap-2 mb-6">
          <div className="flex items-center justify-between w-full">
            <h1 className="text-2xl font-bold text-foreground">Jobs Directory</h1>
            <Button 
              onClick={handleScrape} 
              disabled={isScraping}
              variant="outline"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scrape {source === "all" ? "All Companies" : getSelectedCompanyName()}
                </>
              )}
            </Button>
          </div>
          {isScraping && scrapingCompany && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>
                Scraping {scrapingCompany} ({scrapeProgress.current}/{scrapeProgress.total})
              </span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4">
          <FilterBar
            totalJobs={totalCount}
            location={location}
            onLocationChange={setLocation}
            startDate={startDate}
            onStartDateChange={setStartDate}
            source={source}
            onSourceChange={setSource}
            onClearAll={handleClearAll}
            companies={companies || []}
          />
          <ViewToggle view={view} onViewChange={setView} />
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

        {/* Jobs Grid/List */}
        {!isLoading && jobs.length > 0 && (
          <>
            {view === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    title={job.job_title}
                    image=""
                    location={job.location || "Netherlands"}
                    dateRange={job.employment_type || "Full-time"}
                    source={job.company_name || "Unknown"}
                    startDate={job.is_remote ? "Remote" : "On-site"}
                    description={job.description || undefined}
                    jobUrl={job.job_url}
                    onClick={() => setSelectedJob(job)}
                  />
                ))}
              </div>
            ) : (
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
                    onClick={() => setSelectedJob(job)}
                  />
                ))}
              </div>
            )}

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

      {/* Job Detail Modal */}
      <JobDetailModal
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        job={selectedJob}
      />
    </div>
  );
};

export default Index;
