import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/hooks/useJobs";
import { jobsApi, CompanyCareerSite } from "@/lib/api/jobs";
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";
import Header from "@/components/Header";
import CompanyEditModal from "@/components/CompanyEditModal";
import ScrapeProgressModal from "@/components/ScrapeProgressModal";
import ScrapeHistoryModal from "@/components/ScrapeHistoryModal";
import BulkScrapeModal from "@/components/BulkScrapeModal";
import ScheduleSettingsModal from "@/components/ScheduleSettingsModal";
import ImportCompaniesModal from "@/components/ImportCompaniesModal";
import FindCareerPagesModal from "@/components/FindCareerPagesModal";
import ViewToggle from "@/components/ViewToggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { getCompanyLogoUrl, getCompanyFaviconUrl } from "@/lib/utils/logo";
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
  X,
  Calendar,
  CalendarRange,
  Plus,
  Sparkles,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowDown01,
  ArrowUp01,
  Copy,
  Power,
  Ban,
  Upload
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const [scrapingCompany, setScrapingCompany] = useState<{id: string; name: string} | null>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyCareerSite | null>(null);
  const [historyCompany, setHistoryCompany] = useState<{id: string; name: string} | null>(null);
  const [scheduleCompany, setScheduleCompany] = useState<CompanyCareerSite | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [showBulkScrapeModal, setShowBulkScrapeModal] = useState(false);
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyUrl, setNewCompanyUrl] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [isAddingRandomCompanies, setIsAddingRandomCompanies] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFindCareerPagesModal, setShowFindCareerPagesModal] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const { data: companies, isLoading, refetch } = useCompanies();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredCompanies = (companies?.filter(company => {
    // Text search filter
    const matchesSearch = company.company_name.toLowerCase().includes(search.toLowerCase()) ||
      company.industry?.toLowerCase().includes(search.toLowerCase()) ||
      company.headquarters_city?.toLowerCase().includes(search.toLowerCase());
    
    // Date range filter
    const companyDate = parseISO(company.created_at);
    const matchesDateFrom = !dateFrom || !isBefore(companyDate, startOfDay(dateFrom));
    const matchesDateTo = !dateTo || !isAfter(companyDate, endOfDay(dateTo));
    
    return matchesSearch && matchesDateFrom && matchesDateTo;
  }) || []).sort((a, b) => {
    if (sortBy === 'name') {
      const comparison = a.company_name.localeCompare(b.company_name);
      return sortOrder === 'asc' ? comparison : -comparison;
    } else {
      const dateA = parseISO(a.created_at).getTime();
      const dateB = parseISO(b.created_at).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    }
  });

  const toggleSort = (newSortBy: 'name' | 'date') => {
    if (sortBy === newSortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

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

  const handleAddCompany = async () => {
    if (!newCompanyName.trim() || !newCompanyUrl.trim()) {
      toast({
        title: "Missing fields",
        description: "Company name and career URL are required",
        variant: "destructive",
      });
      return;
    }

    setIsAddingCompany(true);
    try {
      const { error } = await supabase
        .from('company_career_sites')
        .insert({
          company_name: newCompanyName.trim(),
          career_url: newCompanyUrl.trim(),
          industry: newCompanyIndustry.trim() || null,
          is_active: true,
          is_scrape_enabled: false, // Default to off
        });

      if (error) throw error;

      toast({
        title: "Company added",
        description: `${newCompanyName} has been added successfully`,
      });
      setShowAddCompanyModal(false);
      setNewCompanyName("");
      setNewCompanyUrl("");
      setNewCompanyIndustry("");
      refetch();
    } catch (error: any) {
      toast({
        title: "Error adding company",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingCompany(false);
    }
  };

  const handleAddRandomCompanies = async () => {
    setIsAddingRandomCompanies(true);
    try {
      const response = await supabase.functions.invoke('discover-companies', {
        body: { count: 10 }
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (result.success && result.companiesAdded > 0) {
        toast({
          title: "Companies discovered",
          description: `Added ${result.companiesAdded} new companies via Firecrawl`,
        });
        refetch();
      } else if (result.companiesAdded === 0) {
        toast({
          title: "No new companies",
          description: "All discovered companies were already in the database",
        });
      } else {
        throw new Error(result.error || "Failed to discover companies");
      }
    } catch (error: any) {
      toast({
        title: "Error discovering companies",
        description: error.message || "Failed to discover companies",
        variant: "destructive",
      });
    } finally {
      setIsAddingRandomCompanies(false);
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

  // Only include enabled companies in bulk scrape
  const selectedCompaniesData = companies?.filter((c) => selectedCompanies.has(c.id) && c.is_scrape_enabled === true) || [];

  const toggleScrapeEnabled = async (companyId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('company_career_sites')
        .update({ is_scrape_enabled: enabled })
        .eq('id', companyId);

      if (error) throw error;
      refetch();
    } catch (error) {
      console.error('Error updating scrape enabled:', error);
      toast({
        title: "Error",
        description: "Failed to update company status",
        variant: "destructive",
      });
    }
  };

  const enableAllCompanies = async () => {
    try {
      const { error } = await supabase
        .from('company_career_sites')
        .update({ is_scrape_enabled: true })
        .eq('is_scrape_enabled', false);

      if (error) throw error;
      
      toast({
        title: "All companies enabled",
        description: "All companies have been enabled for scraping",
      });
      refetch();
    } catch (error) {
      console.error('Error enabling all companies:', error);
      toast({
        title: "Error",
        description: "Failed to enable all companies",
        variant: "destructive",
      });
    }
  };

  // Extract main domain from URL and add to excluded domains
  const extractMainDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      // Remove 'www.' prefix if present
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const handleExcludeDomain = async (companyId: string, careerUrl: string, companyName: string) => {
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
      
      // Add domain if not already in list
      if (!currentDomains.includes(domain)) {
        const updatedDomains = [...currentDomains, domain];

        const { error: updateError } = await supabase
          .from('scraper_settings')
          .update({ setting_value: updatedDomains })
          .eq('setting_key', 'excluded_domains');

        if (updateError) throw updateError;
      }

      // Delete scrape history associated with this company
      const { error: deleteHistoryError } = await supabase
        .from('scrape_history')
        .delete()
        .eq('company_career_site_id', companyId);

      if (deleteHistoryError) throw deleteHistoryError;

      // Delete all jobs associated with this company
      const { error: deleteJobsError } = await supabase
        .from('job_opportunities')
        .delete()
        .eq('company_career_site_id', companyId);

      if (deleteJobsError) throw deleteJobsError;

      // Delete the company from the database
      const { error: deleteCompanyError } = await supabase
        .from('company_career_sites')
        .delete()
        .eq('id', companyId);

      if (deleteCompanyError) throw deleteCompanyError;

      // Invalidate all related queries to force fresh data
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });

      toast({
        title: "Company excluded",
        description: `${companyName} and its jobs have been removed. Domain "${domain}" added to excluded list.`,
      });
    } catch (error: any) {
      toast({
        title: "Error excluding company",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div></div>
          <div className="flex flex-row gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setShowImportModal(true)}
                  >
                    <Upload className="w-4 h-4 mr-2 text-blue-500" />
                    Import
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import companies from an Excel file</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleAddRandomCompanies}
                    disabled={isAddingRandomCompanies}
                  >
                    {isAddingRandomCompanies ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin text-orange-500" />
                        Discovering...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2 text-yellow-500" />
                        Add Companies
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Uses Firecrawl to discover new companies with career pages</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddCompanyModal(true)}
                  >
                    <Plus className="w-4 h-4 mr-2 text-green-500" />
                    Add Company
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Manually add a company by entering its career page URL</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={enableAllCompanies}
                  >
                    <Power className="w-4 h-4 mr-2 text-emerald-500" />
                    Enable All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Turn on scraping for all companies</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setShowFindCareerPagesModal(true)}
                    disabled={!companies?.some(c => c.career_url === 'pending' || !c.career_url)}
                  >
                    <Search className="w-4 h-4 mr-2 text-blue-500" />
                    Find Career Pages
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Discover career pages for companies without one</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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

        {/* Search and Date Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search companies by name, industry, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            
            <span className="text-muted-foreground">–</span>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            
            {(dateFrom || dateTo) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Stats, Sort and View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{filteredCompanies.length} companies</span>
            <span>•</span>
            <span>
              {filteredCompanies.filter(c => c.crawl_status === "completed").length} scraped
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={sortBy === 'name' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('name')}
              className="gap-1"
            >
              {sortBy === 'name' ? (
                sortOrder === 'asc' ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />
              ) : (
                <ArrowDownAZ className="w-4 h-4" />
              )}
              Name
            </Button>
            <Button
              variant={sortBy === 'date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('date')}
              className="gap-1"
            >
              {sortBy === 'date' ? (
                sortOrder === 'asc' ? <ArrowUp01 className="w-4 h-4" /> : <ArrowDown01 className="w-4 h-4" />
              ) : (
                <ArrowDown01 className="w-4 h-4" />
              )}
              Date
            </Button>
            <ViewToggle view={view} onViewChange={setView} />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Companies Grid/List */}
        {!isLoading && (
          <div className={view === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
            : "flex flex-col gap-3"
          }>
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                className={`bg-card border rounded-lg hover:shadow-lg transition-all ${
                  bulkSelectMode && selectedCompanies.has(company.id)
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border'
                } ${view === "list" ? "p-4 flex items-center gap-4" : "p-5"}`}
                onClick={() => {
                  if (bulkSelectMode) {
                    toggleCompanySelection(company.id);
                  }
                }}
                style={{ cursor: bulkSelectMode ? 'pointer' : 'default' }}
              >
                {view === "list" ? (
                  <>
                    {/* List View */}
                    {bulkSelectMode && (
                      <Checkbox
                        checked={selectedCompanies.has(company.id)}
                        onCheckedChange={() => toggleCompanySelection(company.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <CompanyLogo careerUrl={company.career_url} companyName={company.company_name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">
                          {company.company_name}
                        </h3>
                        {getStatusIcon(company.crawl_status)}
                      </div>
                      <div className="flex items-center gap-1 max-w-md">
                        <a 
                          href={company.career_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {company.career_url}
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(company.career_url);
                            toast({ title: "Copied", description: "Career URL copied to clipboard" });
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
                          title="Copy URL"
                        >
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
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
                        {company.scrape_schedule && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-primary" />
                            <span className="capitalize">{company.scrape_schedule === '12hours' ? 'Every 12h' : company.scrape_schedule}</span>
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/70">
                          Added {format(new Date(company.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    {!bulkSelectMode && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Switch
                          checked={company.is_scrape_enabled === true}
                          onCheckedChange={(checked) => toggleScrapeEnabled(company.id, checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="scale-75"
                        />
                        <button
                          onClick={() => setScheduleCompany(company)}
                          className="p-1.5 rounded-full hover:bg-muted transition-colors"
                          title="Schedule settings"
                        >
                          <Calendar className={`w-3.5 h-3.5 ${company.scrape_schedule ? 'text-primary' : 'text-muted-foreground'}`} />
                        </button>
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExcludeDomain(company.id, company.career_url, company.company_name);
                                }}
                                className="p-1.5 rounded-full hover:bg-red-100 transition-colors"
                                title="Exclude domain"
                              >
                                <Ban className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Add domain to excluded list in Settings</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(company.career_url, '_blank')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={scrapingCompany?.id === company.id}
                          onClick={() => handleScrapeCompany(company.id, company.career_url, company.company_name)}
                        >
                          {scrapingCompany?.id === company.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Grid View */}
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
                        <CompanyLogo careerUrl={company.career_url} companyName={company.company_name} />
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
                          <Switch
                            checked={company.is_scrape_enabled === true}
                            onCheckedChange={(checked) => toggleScrapeEnabled(company.id, checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="scale-75"
                          />
                          <button
                            onClick={() => setScheduleCompany(company)}
                            className="p-1.5 rounded-full hover:bg-muted transition-colors"
                            title="Schedule settings"
                          >
                            <Calendar className={`w-3.5 h-3.5 ${company.scrape_schedule ? 'text-primary' : 'text-muted-foreground'}`} />
                          </button>
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
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExcludeDomain(company.id, company.career_url, company.company_name);
                                  }}
                                  className="p-1.5 rounded-full hover:bg-red-100 transition-colors"
                                  title="Exclude domain"
                                >
                                  <Ban className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Add domain to excluded list in Settings</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {getStatusIcon(company.crawl_status)}
                        </div>
                      )}
                      {bulkSelectMode && getStatusIcon(company.crawl_status)}
                    </div>

                    {/* Career URL */}
                    <div className="flex items-center gap-1 mb-3">
                      <a 
                        href={company.career_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {company.career_url}
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(company.career_url);
                          toast({ title: "Copied", description: "Career URL copied to clipboard" });
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
                        title="Copy URL"
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
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

                    {/* Schedule indicator */}
                    {company.scrape_schedule && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <Calendar className="w-3 h-3 text-primary" />
                        <span className="capitalize">{company.scrape_schedule === '12hours' ? 'Every 12h' : company.scrape_schedule}</span>
                      </div>
                    )}

                    {/* Stats */}
                    {company.jobs_found_count !== null && company.jobs_found_count > 0 && (
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="font-medium text-foreground">{company.jobs_found_count}</span> jobs found
                      </div>
                    )}

                    {/* Added Date */}
                    <div className="text-xs text-muted-foreground/70 mb-4">
                      Added {format(new Date(company.created_at), 'MMM d, yyyy')}
                    </div>

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
                  </>
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

      {/* Schedule Settings Modal */}
      <ScheduleSettingsModal
        isOpen={!!scheduleCompany}
        onClose={() => setScheduleCompany(null)}
        companyId={scheduleCompany?.id || null}
        companyName={scheduleCompany?.company_name || ""}
        currentSchedule={(scheduleCompany as any)?.scrape_schedule || null}
        isEnabled={(scheduleCompany as any)?.is_scrape_enabled ?? true}
        lastScheduledAt={(scheduleCompany as any)?.last_scheduled_scrape_at || null}
        onSaved={refetch}
      />

      {/* Add Company Modal */}
      <Dialog open={showAddCompanyModal} onOpenChange={setShowAddCompanyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Company</DialogTitle>
            <DialogDescription>
              Add a new company to track and scrape job listings from their career page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name *</Label>
              <Input
                id="company-name"
                placeholder="e.g., Adyen"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="career-url">Career Page URL *</Label>
              <Input
                id="career-url"
                placeholder="e.g., https://careers.adyen.com/vacancies"
                value={newCompanyUrl}
                onChange={(e) => setNewCompanyUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry (optional)</Label>
              <Input
                id="industry"
                placeholder="e.g., Fintech"
                value={newCompanyIndustry}
                onChange={(e) => setNewCompanyIndustry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCompanyModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCompany} disabled={isAddingCompany}>
              {isAddingCompany ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Company
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Companies Modal */}
      <ImportCompaniesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onComplete={() => refetch()}
      />

      {/* Find Career Pages Modal */}
      <FindCareerPagesModal
        isOpen={showFindCareerPagesModal}
        onClose={() => setShowFindCareerPagesModal(false)}
        companies={
          companies
            ?.filter(c => c.career_url === 'pending' || !c.career_url)
            .map(c => ({ id: c.id, company_name: c.company_name, website: c.website })) || []
        }
        onComplete={() => refetch()}
      />
    </div>
  );
};

export default Companies;
