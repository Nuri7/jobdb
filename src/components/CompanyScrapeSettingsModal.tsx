import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

interface ScrapeConfig {
  scrape_mode?: "individual" | "single_page" | "actions";
  extraction_prompt?: string;
  click_selectors?: string[];
  wait_time?: number;
  job_url_patterns?: string[];
  excluded_url_patterns?: string[];
  notes?: string;
}

interface Company {
  id: string;
  company_name: string;
  career_url: string;
  scrape_config?: ScrapeConfig | null;
}

interface CompanyScrapeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  onSaved: () => void;
}

const DEFAULT_EXTRACTION_PROMPT = `Extract job details from this career page content. Look for:

1. **Job Title**: The main position title, clean of company names and special characters
2. **Location**: City name (especially Dutch cities like Amsterdam, Rotterdam, Utrecht, Nijmegen, etc.). Check the URL path for city names if not in content.
3. **Employment Type**: Full-time, Part-time, or Contract
4. **Remote/Hybrid**: Is remote or hybrid work mentioned?
5. **Department**: Team or department name if mentioned
6. **Experience Level**: Junior, Medior, Senior, Principal, or years of experience
7. **Salary Range**: Any salary or compensation information (look for € amounts)
8. **Internship**: Is this an internship, traineeship, or student position?

Return structured data with these fields. For location, prioritize Dutch city names found in content or URL.`;

export const CompanyScrapeSettingsModal = ({
  isOpen,
  onClose,
  company,
  onSaved,
}: CompanyScrapeSettingsModalProps) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [scrapeMode, setScrapeMode] = useState<"individual" | "single_page" | "actions">("individual");
  const [extractionPrompt, setExtractionPrompt] = useState("");
  const [clickSelectors, setClickSelectors] = useState<string[]>([]);
  const [newSelector, setNewSelector] = useState("");
  const [waitTime, setWaitTime] = useState<number | undefined>(undefined);
  const [jobUrlPatterns, setJobUrlPatterns] = useState<string[]>([]);
  const [newJobPattern, setNewJobPattern] = useState("");
  const [excludedUrlPatterns, setExcludedUrlPatterns] = useState<string[]>([]);
  const [newExcludedPattern, setNewExcludedPattern] = useState("");
  const [notes, setNotes] = useState("");

  // Load config when company changes
  useEffect(() => {
    if (company?.scrape_config) {
      const config = company.scrape_config as ScrapeConfig;
      setScrapeMode(config.scrape_mode || "individual");
      setExtractionPrompt(config.extraction_prompt || "");
      setClickSelectors(config.click_selectors || []);
      setWaitTime(config.wait_time);
      setJobUrlPatterns(config.job_url_patterns || []);
      setExcludedUrlPatterns(config.excluded_url_patterns || []);
      setNotes(config.notes || "");
    } else {
      // Reset to defaults
      setScrapeMode("individual");
      setExtractionPrompt("");
      setClickSelectors([]);
      setWaitTime(undefined);
      setJobUrlPatterns([]);
      setExcludedUrlPatterns([]);
      setNotes("");
    }
  }, [company]);

  const handleAddSelector = () => {
    if (newSelector.trim() && !clickSelectors.includes(newSelector.trim())) {
      setClickSelectors([...clickSelectors, newSelector.trim()]);
      setNewSelector("");
    }
  };

  const handleRemoveSelector = (selector: string) => {
    setClickSelectors(clickSelectors.filter(s => s !== selector));
  };

  const handleAddJobPattern = () => {
    if (newJobPattern.trim() && !jobUrlPatterns.includes(newJobPattern.trim())) {
      setJobUrlPatterns([...jobUrlPatterns, newJobPattern.trim()]);
      setNewJobPattern("");
    }
  };

  const handleRemoveJobPattern = (pattern: string) => {
    setJobUrlPatterns(jobUrlPatterns.filter(p => p !== pattern));
  };

  const handleAddExcludedPattern = () => {
    if (newExcludedPattern.trim() && !excludedUrlPatterns.includes(newExcludedPattern.trim())) {
      setExcludedUrlPatterns([...excludedUrlPatterns, newExcludedPattern.trim()]);
      setNewExcludedPattern("");
    }
  };

  const handleRemoveExcludedPattern = (pattern: string) => {
    setExcludedUrlPatterns(excludedUrlPatterns.filter(p => p !== pattern));
  };

  const handleSave = async () => {
    if (!company) return;

    setIsSaving(true);
    try {
      // Build config object, only including non-empty values
      const config: ScrapeConfig = {};
      
      if (scrapeMode !== "individual") {
        config.scrape_mode = scrapeMode;
      }
      if (extractionPrompt.trim()) {
        config.extraction_prompt = extractionPrompt.trim();
      }
      if (clickSelectors.length > 0) {
        config.click_selectors = clickSelectors;
      }
      if (waitTime !== undefined && waitTime > 0) {
        config.wait_time = waitTime;
      }
      if (jobUrlPatterns.length > 0) {
        config.job_url_patterns = jobUrlPatterns;
      }
      if (excludedUrlPatterns.length > 0) {
        config.excluded_url_patterns = excludedUrlPatterns;
      }
      if (notes.trim()) {
        config.notes = notes.trim();
      }

      // If all empty, set to null
      const finalConfig: Json = Object.keys(config).length > 0 ? (config as Json) : null;

      const { error } = await supabase
        .from('company_career_sites')
        .update({ scrape_config: finalConfig })
        .eq('id', company.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: `Scraper settings for ${company.company_name} have been updated.`,
      });
      onSaved();
      onClose();
    } catch (error: any) {
      console.error('Error saving scrape config:', error);
      toast({
        title: "Error saving settings",
        description: error.message || "Failed to save scraper settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setScrapeMode("individual");
    setExtractionPrompt("");
    setClickSelectors([]);
    setWaitTime(undefined);
    setJobUrlPatterns([]);
    setExcludedUrlPatterns([]);
    setNotes("");
  };

  if (!company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scraper Settings: {company.company_name}</DialogTitle>
          <DialogDescription>
            Configure custom scraping behavior for this company's career page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Scrape Mode */}
          <div className="space-y-2">
            <Label htmlFor="scrape-mode">Scrape Mode</Label>
            <Select value={scrapeMode} onValueChange={(value: "individual" | "single_page" | "actions") => setScrapeMode(value)}>
              <SelectTrigger id="scrape-mode">
                <SelectValue placeholder="Select scrape mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">
                  <div className="flex flex-col items-start">
                    <span>Individual Pages</span>
                    <span className="text-xs text-muted-foreground">Scrape each job URL separately (default)</span>
                  </div>
                </SelectItem>
                <SelectItem value="single_page">
                  <div className="flex flex-col items-start">
                    <span>Single Page</span>
                    <span className="text-xs text-muted-foreground">All jobs on one page, extract from content</span>
                  </div>
                </SelectItem>
                <SelectItem value="actions">
                  <div className="flex flex-col items-start">
                    <span>Actions Mode</span>
                    <span className="text-xs text-muted-foreground">Click to expand content before scraping</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Click Selectors (only for actions mode) */}
          {scrapeMode === "actions" && (
            <div className="space-y-2">
              <Label>Click Selectors</Label>
              <p className="text-xs text-muted-foreground mb-2">
                CSS selectors to click before scraping (e.g., to expand accordions)
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {clickSelectors.map((selector) => (
                  <Badge key={selector} variant="secondary" className="gap-1">
                    <code className="text-xs">{selector}</code>
                    <button onClick={() => handleRemoveSelector(selector)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSelector}
                  onChange={(e) => setNewSelector(e.target.value)}
                  placeholder='e.g., [class*="view-detail"]'
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSelector())}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddSelector}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Wait Time */}
          <div className="space-y-2">
            <Label htmlFor="wait-time">Custom Wait Time (ms)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Override the default wait time for slow-loading pages
            </p>
            <Input
              id="wait-time"
              type="number"
              value={waitTime || ""}
              onChange={(e) => setWaitTime(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g., 5000 (default: 3000)"
              min={1000}
              max={30000}
              step={500}
            />
          </div>

          {/* Extraction Prompt */}
          <div className="space-y-2">
            <Label htmlFor="extraction-prompt">Custom Extraction Prompt</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Custom AI prompt for extracting job data (leave empty to use global default)
            </p>
            <Textarea
              id="extraction-prompt"
              value={extractionPrompt}
              onChange={(e) => setExtractionPrompt(e.target.value)}
              placeholder={DEFAULT_EXTRACTION_PROMPT}
              rows={6}
              className="font-mono text-xs"
            />
          </div>

          {/* Job URL Patterns */}
          <div className="space-y-2">
            <Label>Custom Job URL Patterns</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Additional patterns to identify job URLs for this company
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {jobUrlPatterns.map((pattern) => (
                <Badge key={pattern} variant="secondary" className="gap-1">
                  {pattern}
                  <button onClick={() => handleRemoveJobPattern(pattern)} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newJobPattern}
                onChange={(e) => setNewJobPattern(e.target.value)}
                placeholder="e.g., position, opening"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddJobPattern())}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddJobPattern}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Excluded URL Patterns */}
          <div className="space-y-2">
            <Label>Excluded URL Patterns</Label>
            <p className="text-xs text-muted-foreground mb-2">
              URL patterns to exclude from scraping for this company
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {excludedUrlPatterns.map((pattern) => (
                <Badge key={pattern} variant="outline" className="gap-1 text-destructive">
                  {pattern}
                  <button onClick={() => handleRemoveExcludedPattern(pattern)} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newExcludedPattern}
                onChange={(e) => setNewExcludedPattern(e.target.value)}
                placeholder="e.g., /team, /about"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExcludedPattern())}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddExcludedPattern}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Internal notes about this company's website structure
            </p>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., This site uses accordions for job details, need to click 'View Detail' buttons"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button type="button" variant="ghost" onClick={handleReset} disabled={isSaving}>
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
