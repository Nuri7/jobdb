import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Settings,
  ChevronDown,
  ChevronUp,
  Flame,
  Save,
  Loader2,
  Zap,
  Search,
  Globe,
  Shield,
  Plus,
  X,
  Layers,
} from "lucide-react";

export interface DiscoverySpeedSettings {
  skipValidation: boolean;
  probeTimeout: number;
  mapLimit: number;
  searchLimit: number;
  batchSize: number;
  concurrency: number;
}

interface CareerDiscoveryConfigProps {
  companiesCount: number;
  onSettingsChange?: (settings: DiscoverySpeedSettings) => void;
}

export default function CareerDiscoveryConfig({ companiesCount, onSettingsChange }: CareerDiscoveryConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [newPattern, setNewPattern] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const { toast } = useToast();

  // Speed settings
  const [skipValidation, setSkipValidation] = useState(false);
  const [probeTimeout, setProbeTimeout] = useState(5000);
  const [mapLimit, setMapLimit] = useState(50);
  const [searchLimit, setSearchLimit] = useState(10);
  const [batchSize, setBatchSize] = useState(1);
  const [concurrency, setConcurrency] = useState(1);

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange?.({ skipValidation, probeTimeout, mapLimit, searchLimit, batchSize, concurrency });
  }, [skipValidation, probeTimeout, mapLimit, searchLimit, batchSize, concurrency]);

  useEffect(() => {
    if (isOpen && Object.keys(settings).length === 0) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('scraper_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'career_page_url_patterns',
        'career_page_map_keywords',
        'excluded_domains',
        'wait_time',
      ]);

    if (error) {
      toast({ title: "Error loading settings", description: error.message, variant: "destructive" });
    } else if (data) {
      const mapped: Record<string, any> = {};
      data.forEach(s => { mapped[s.setting_key] = s.setting_value; });
      setSettings(mapped);
    }
    setLoading(false);
  };

  const saveSetting = async (key: string, value: any) => {
    setSaving(true);
    const { error } = await supabase
      .from('scraper_settings')
      .update({ setting_value: value })
      .eq('setting_key', key);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      setSettings(prev => ({ ...prev, [key]: value }));
      toast({ title: "Saved", description: `${key} updated` });
    }
    setSaving(false);
  };

  const patterns: string[] = settings.career_page_url_patterns || [];
  const mapKeywords: string = settings.career_page_map_keywords || '';
  const excludedDomains: string[] = settings.excluded_domains || [];
  const waitTime: number = settings.wait_time || 3000;

  const estimatedSeconds = companiesCount * (skipValidation ? 3 : 12) / concurrency / Math.max(batchSize, 1);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
          <Settings className="w-3.5 h-3.5" />
          Config
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 border border-border rounded-lg p-4 bg-card">
            {/* Batch & Concurrency */}
            <Card className="border-primary/20">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-500" />
                  <CardTitle className="text-sm">Batch & Processing</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {companiesCount} companies • ~{Math.ceil(estimatedSeconds)}s estimated
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Batch size</Label>
                    <p className="text-[10px] text-muted-foreground">Companies per API call</p>
                    <Input
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={20}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Concurrency</Label>
                    <p className="text-[10px] text-muted-foreground">Parallel API calls</p>
                    <Input
                      type="number"
                      value={concurrency}
                      onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={5}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Batch=1 + Concurrency=1 = consecutive (safest). Higher values = faster but may hit rate limits.
                </p>
              </CardContent>
            </Card>

            {/* Speed Settings */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <CardTitle className="text-sm">Speed Optimization</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Skip content validation</Label>
                    <p className="text-xs text-muted-foreground">Accept first matching URL without scraping to verify</p>
                  </div>
                  <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Probe timeout (ms)</Label>
                    <Input
                      type="number"
                      value={probeTimeout}
                      onChange={(e) => setProbeTimeout(parseInt(e.target.value) || 3000)}
                      min={1000}
                      max={15000}
                      step={500}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Map URL limit</Label>
                    <Input
                      type="number"
                      value={mapLimit}
                      onChange={(e) => setMapLimit(parseInt(e.target.value) || 30)}
                      min={10}
                      max={200}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Search results limit</Label>
                    <Input
                      type="number"
                      value={searchLimit}
                      onChange={(e) => setSearchLimit(parseInt(e.target.value) || 10)}
                      min={3}
                      max={30}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Career URL Patterns */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-500" />
                  <CardTitle className="text-sm">Career URL Patterns</CardTitle>
                </div>
                <CardDescription className="text-xs">URL path segments that indicate a career page</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {patterns.map((p) => (
                    <Badge key={p} variant="secondary" className="gap-1 text-xs">
                      {p}
                      <button
                        onClick={() => {
                          const updated = patterns.filter(x => x !== p);
                          saveSetting('career_page_url_patterns', updated);
                        }}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    placeholder="Add pattern..."
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPattern.trim()) {
                        saveSetting('career_page_url_patterns', [...patterns, newPattern.trim()]);
                        setNewPattern("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={!newPattern.trim() || saving}
                    onClick={() => {
                      saveSetting('career_page_url_patterns', [...patterns, newPattern.trim()]);
                      setNewPattern("");
                    }}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Map Keywords */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-500" />
                  <CardTitle className="text-sm">Map Search Keywords</CardTitle>
                </div>
                <CardDescription className="text-xs">Keywords sent to Firecrawl Map API to find career URLs on a website</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex gap-2">
                  <Input
                    value={mapKeywords}
                    onChange={(e) => setSettings(prev => ({ ...prev, career_page_map_keywords: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={saving || mapKeywords === (settings.career_page_map_keywords || '')}
                    onClick={() => saveSetting('career_page_map_keywords', mapKeywords)}
                  >
                    <Save className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Excluded Domains */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-500" />
                  <CardTitle className="text-sm">Excluded Domains</CardTitle>
                </div>
                <CardDescription className="text-xs">Job boards and domains to ignore during discovery</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {excludedDomains.map((d) => (
                    <Badge key={d} variant="outline" className="gap-1 text-xs text-red-600 border-red-300">
                      {d}
                      <button
                        onClick={() => {
                          const updated = excludedDomains.filter(x => x !== d);
                          saveSetting('excluded_domains', updated);
                        }}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="Add domain..."
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDomain.trim()) {
                        saveSetting('excluded_domains', [...excludedDomains, newDomain.trim()]);
                        setNewDomain("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={!newDomain.trim() || saving}
                    onClick={() => {
                      saveSetting('excluded_domains', [...excludedDomains, newDomain.trim()]);
                      setNewDomain("");
                    }}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Firecrawl API Payloads */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <CardTitle className="text-sm">Firecrawl API Payloads</CardTitle>
                </div>
                <CardDescription className="text-xs">Exact requests sent to Firecrawl during discovery</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">1. Direct Domain Probe (HEAD)</p>
                  <pre className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto text-muted-foreground">
{`HEAD https://werkenbij{company}.nl/vacatures
     https://careers.{company}.com
     https://jobs.{company}.nl
     ... (12 patterns per identifier)
Timeout: ${probeTimeout}ms`}
                  </pre>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">2. Firecrawl Map API</p>
                  <pre className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto text-muted-foreground">
{JSON.stringify({
  url: "<company_website>",
  search: mapKeywords,
  limit: mapLimit,
  includeSubdomains: true,
}, null, 2)}
                  </pre>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">3. Dedicated Domain Search</p>
                  <pre className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto text-muted-foreground">
{JSON.stringify({
  query: '("werkenbij{company}") OR "werken bij {company}" site:.nl vacatures',
  limit: searchLimit,
  lang: "nl",
  country: "nl",
}, null, 2)}
                  </pre>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">4. Content Validation Scrape {skipValidation && <Badge variant="outline" className="text-xs ml-1 text-yellow-600 border-yellow-400">Skipped</Badge>}</p>
                  <pre className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto text-muted-foreground">
{JSON.stringify({
  url: "<candidate_url>",
  formats: ["markdown"],
  onlyMainContent: true,
  waitFor: waitTime,
}, null, 2)}
                  </pre>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">5. Fallback Search</p>
                  <pre className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto text-muted-foreground">
{JSON.stringify({
  query: "werken bij {company} vacatures",
  limit: searchLimit,
  lang: "nl",
  country: "nl",
}, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
