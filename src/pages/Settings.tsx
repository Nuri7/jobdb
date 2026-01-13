import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Flame, Clock, FileSearch, Filter, MapPin, Briefcase, Save, Loader2, Plus, X, RotateCcw, Code, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ScraperSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string | null;
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

const DEFAULT_DISCOVERY_QUERIES = [
  'top Dutch companies careers page',
  'Netherlands tech startups hiring jobs',
  'Amsterdam companies career opportunities',
  'Dutch unicorn startups jobs page',
  'Rotterdam companies vacancies',
  'Netherlands fintech companies careers',
  'Dutch software companies job openings',
  'Netherlands e-commerce companies hiring',
  'Dutch healthcare companies careers',
  'Amsterdam startups career page',
];

const DEFAULT_SETTINGS: Record<string, any> = {
  max_pages: 20,
  max_jobs: 150,
  wait_time: 3000,
  extraction_prompt: DEFAULT_EXTRACTION_PROMPT,
  discovery_search_queries: DEFAULT_DISCOVERY_QUERIES,
  job_url_patterns: ['job', 'vacanc', 'position', 'opening', 'vacature', 'werk'],
  excluded_domains: ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'],
  excluded_url_patterns: ['/locations', '/career-types', '/about', '/contact', '/teams', '/departments', '/benefits', '/culture', '/events', '/news', '/blog'],
  required_content_keywords: ['apply', 'sollicit', 'submit', 'responsibilities', 'requirements', 'qualifications', 'experience', 'skills'],
  location_keywords: ['amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven', 'den haag', 'leiden', 'delft', 'groningen', 'maastricht', 'nijmegen', 'arnhem', 'breda', 'tilburg', 'almere', 'enschede', 'haarlem', 'amersfoort', 'apeldoorn', 'zwolle', 'dordrecht', 'zoetermeer', 'deventer', 'hilversum', 'alkmaar', 'venlo', 'leeuwarden', 'heerlen', 'helmond', 'oss', 'amstelveen', 'schiphol', 'hoofddorp'],
  remote_keywords: ['remote', 'thuiswerk', 'hybrid', 'work from home', 'wfh'],
  location_patterns: ['location', 'plaats', 'locatie', 'city', 'standort'],
  salary_patterns: ['salary', 'salaris', 'compensation', 'loon', 'vergoeding'],
  internship_title_keywords: ['internship', 'intern', 'stage', 'stagiair', 'werkstudent', 'traineeship'],
  experience_level_keywords: {
    internship: ['intern', 'stage', 'trainee', 'werkstudent'],
    junior: ['junior', 'entry-level', 'starter', 'graduate'],
    medior: ['medior', 'mid-level', 'regular'],
    senior: ['senior', 'experienced', 'lead'],
    principal: ['principal', 'staff', 'architect', 'expert']
  },
  employment_type_keywords: {
    fulltime: ['full-time', 'full time', 'fulltime'],
    parttime: ['part-time', 'part time', 'parttime'],
    contract: ['contract', 'freelance', 'interim', 'temporary']
  }
};

const Settings = () => {
  const [settings, setSettings] = useState<ScraperSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('scraper_settings')
      .select('*')
      .order('setting_key');

    if (error) {
      toast({ title: "Error loading settings", description: error.message, variant: "destructive" });
    } else if (data) {
      setSettings(data);
      const initialValues: Record<string, any> = {};
      data.forEach(s => {
        initialValues[s.setting_key] = s.setting_value;
      });
      setEditedValues(initialValues);
    }
    setLoading(false);
  };

  const getSetting = (key: string) => {
    return editedValues[key];
  };

  const updateSetting = (key: string, value: any) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleArrayAdd = (key: string, newItem: string) => {
    if (!newItem.trim()) return;
    const current = getSetting(key) || [];
    if (!current.includes(newItem.trim())) {
      updateSetting(key, [...current, newItem.trim()]);
    }
  };

  const handleArrayRemove = (key: string, item: string) => {
    const current = getSetting(key) || [];
    updateSetting(key, current.filter((i: string) => i !== item));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(editedValues)) {
        const { error } = await supabase
          .from('scraper_settings')
          .update({ setting_value: value })
          .eq('setting_key', key);

        if (error) throw error;
      }
      toast({ title: "Settings saved", description: "Your scraper settings have been updated." });
      fetchSettings();
    } catch (error: any) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const hasChanges = () => {
    return settings.some(s => JSON.stringify(s.setting_value) !== JSON.stringify(editedValues[s.setting_key]));
  };

  const resetToDefaults = async () => {
    setResetting(true);
    try {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { error } = await supabase
          .from('scraper_settings')
          .update({ setting_value: value })
          .eq('setting_key', key);

        if (error) throw error;
      }
      toast({ title: "Settings reset", description: "Scraper settings have been restored to defaults." });
      fetchSettings();
    } catch (error: any) {
      toast({ title: "Error resetting settings", description: error.message, variant: "destructive" });
    }
    setResetting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-5xl py-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-5xl py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Firecrawl scraper configuration and extraction rules</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToDefaults} disabled={resetting || saving}>
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Reset to Defaults
            </Button>
            <Button onClick={saveSettings} disabled={saving || !hasChanges()}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Scraping Limits */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <CardTitle>Scraping Limits</CardTitle>
              </div>
              <CardDescription>Limits to prevent timeouts and excessive API usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="max_pages">Max Listing Pages</Label>
                  <Input
                    id="max_pages"
                    type="number"
                    value={getSetting('max_pages') || 20}
                    onChange={(e) => updateSetting('max_pages', parseInt(e.target.value) || 20)}
                    min={1}
                    max={100}
                  />
                  <p className="text-xs text-muted-foreground">Maximum pagination pages to follow</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_jobs">Max Jobs per Scrape</Label>
                  <Input
                    id="max_jobs"
                    type="number"
                    value={getSetting('max_jobs') || 150}
                    onChange={(e) => updateSetting('max_jobs', parseInt(e.target.value) || 150)}
                    min={1}
                    max={500}
                  />
                  <p className="text-xs text-muted-foreground">Maximum job detail pages to scrape</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wait_time">Wait Time (ms)</Label>
                  <Input
                    id="wait_time"
                    type="number"
                    value={getSetting('wait_time') || 3000}
                    onChange={(e) => updateSetting('wait_time', parseInt(e.target.value) || 3000)}
                    min={1000}
                    max={10000}
                    step={500}
                  />
                  <p className="text-xs text-muted-foreground">JavaScript rendering wait time</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Firecrawl API Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <CardTitle>Firecrawl API Configuration</CardTitle>
              </div>
              <CardDescription>Request payloads sent to Firecrawl API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Listing Page Scrape</h4>
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
                  <pre className="whitespace-pre-wrap text-muted-foreground">
{JSON.stringify({
  url: '<career_page_url>',
  formats: ['markdown', 'links', 'html'],
  onlyMainContent: false,
  waitFor: getSetting('wait_time') || 3000,
}, null, 2)}
                  </pre>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Job Detail Page Scrape</h4>
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
                  <pre className="whitespace-pre-wrap text-muted-foreground">
{JSON.stringify({
  url: '<job_detail_url>',
  formats: ['markdown'],
  onlyMainContent: true,
}, null, 2)}
                  </pre>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Code className="w-4 h-4 text-cyan-500" />
                  Extraction Prompt
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  This prompt guides how job data is extracted from scraped content. Customize it to improve location detection, title parsing, and metadata extraction.
                </p>
                <Textarea
                  value={getSetting('extraction_prompt') || DEFAULT_EXTRACTION_PROMPT}
                  onChange={(e) => updateSetting('extraction_prompt', e.target.value)}
                  placeholder="Enter extraction instructions..."
                  className="font-mono text-sm min-h-[200px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Company Discovery Search Queries */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-500" />
                <CardTitle>Company Discovery Search Queries</CardTitle>
              </div>
              <CardDescription>Search queries used by Firecrawl to discover new companies with career pages (one query is randomly selected per discovery run)</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('discovery_search_queries') || []}
                onAdd={(item) => handleArrayAdd('discovery_search_queries', item)}
                onRemove={(item) => handleArrayRemove('discovery_search_queries', item)}
                placeholder="Add search query..."
                variant="outline"
                className="border-indigo-500/50 text-indigo-700"
              />
            </CardContent>
          </Card>

          {/* Job URL Patterns */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-purple-500" />
                <CardTitle>Job URL Detection Patterns</CardTitle>
              </div>
              <CardDescription>Keywords used to identify job detail page URLs</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('job_url_patterns') || []}
                onAdd={(item) => handleArrayAdd('job_url_patterns', item)}
                onRemove={(item) => handleArrayRemove('job_url_patterns', item)}
                placeholder="Add pattern..."
                variant="outline"
                className="border-green-500/50 text-green-700"
              />
            </CardContent>
          </Card>

          {/* Excluded Domains */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-red-500" />
                <CardTitle>Excluded Domains</CardTitle>
              </div>
              <CardDescription>Domains to skip when scraping links</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('excluded_domains') || []}
                onAdd={(item) => handleArrayAdd('excluded_domains', item)}
                onRemove={(item) => handleArrayRemove('excluded_domains', item)}
                placeholder="Add domain..."
                variant="outline"
                className="border-red-500/50 text-red-700"
              />
            </CardContent>
          </Card>

          {/* Excluded URL Patterns */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-red-500" />
                <CardTitle>Excluded URL Patterns</CardTitle>
              </div>
              <CardDescription>URL path patterns to exclude (e.g., /locations, /about)</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('excluded_url_patterns') || []}
                onAdd={(item) => handleArrayAdd('excluded_url_patterns', item)}
                onRemove={(item) => handleArrayRemove('excluded_url_patterns', item)}
                placeholder="Add pattern (e.g. /events)..."
                variant="outline"
                className="border-red-500/50 text-red-700"
              />
            </CardContent>
          </Card>

          {/* Required Content Keywords */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-green-500" />
                <CardTitle>Required Content Keywords</CardTitle>
              </div>
              <CardDescription>Job pages must contain at least one of these keywords to be considered valid</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('required_content_keywords') || []}
                onAdd={(item) => handleArrayAdd('required_content_keywords', item)}
                onRemove={(item) => handleArrayRemove('required_content_keywords', item)}
                placeholder="Add keyword..."
                variant="outline"
                className="border-green-500/50 text-green-700"
              />
            </CardContent>
          </Card>

          {/* Location Keywords */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-500" />
                <CardTitle>Location Detection Keywords</CardTitle>
              </div>
              <CardDescription>Keywords to detect job locations from content</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('location_keywords') || []}
                onAdd={(item) => handleArrayAdd('location_keywords', item)}
                onRemove={(item) => handleArrayRemove('location_keywords', item)}
                placeholder="Add location..."
                variant="secondary"
              />
            </CardContent>
          </Card>

          {/* Remote Keywords */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-500" />
                <CardTitle>Remote Work Detection Keywords</CardTitle>
              </div>
              <CardDescription>Keywords to identify remote/hybrid positions</CardDescription>
            </CardHeader>
            <CardContent>
              <EditableTagList
                tags={getSetting('remote_keywords') || []}
                onAdd={(item) => handleArrayAdd('remote_keywords', item)}
                onRemove={(item) => handleArrayRemove('remote_keywords', item)}
                placeholder="Add keyword..."
                variant="secondary"
              />
            </CardContent>
          </Card>

          {/* Extraction Patterns - Editable */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-cyan-500" />
                <CardTitle>Job Data Extraction Patterns</CardTitle>
              </div>
              <CardDescription>Editable patterns used to parse job details from scraped pages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Location Patterns */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  Location Label Keywords
                </h4>
                <p className="text-xs text-muted-foreground mb-2">Keywords that precede location values (e.g., "Location: Amsterdam")</p>
                <EditableTagList
                  tags={getSetting('location_patterns') || ['location', 'plaats', 'locatie', 'city', 'standort']}
                  onAdd={(item) => handleArrayAdd('location_patterns', item)}
                  onRemove={(item) => handleArrayRemove('location_patterns', item)}
                  placeholder="Add keyword..."
                  variant="secondary"
                />
              </div>

              <Separator />

              {/* Salary Patterns */}
              <div>
                <h4 className="font-medium mb-2">Salary Label Keywords</h4>
                <p className="text-xs text-muted-foreground mb-2">Keywords that precede salary values (e.g., "Salary: €50.000")</p>
                <EditableTagList
                  tags={getSetting('salary_patterns') || ['salary', 'salaris', 'compensation', 'loon', 'vergoeding']}
                  onAdd={(item) => handleArrayAdd('salary_patterns', item)}
                  onRemove={(item) => handleArrayRemove('salary_patterns', item)}
                  placeholder="Add keyword..."
                  variant="secondary"
                />
              </div>

              <Separator />

              {/* Internship Title Keywords */}
              <div>
                <h4 className="font-medium mb-2">Internship Title Keywords</h4>
                <p className="text-xs text-muted-foreground mb-2">Keywords in job title that indicate an internship position</p>
                <EditableTagList
                  tags={getSetting('internship_title_keywords') || ['internship', 'intern', 'stage', 'stagiair', 'werkstudent', 'traineeship']}
                  onAdd={(item) => handleArrayAdd('internship_title_keywords', item)}
                  onRemove={(item) => handleArrayRemove('internship_title_keywords', item)}
                  placeholder="Add keyword..."
                  variant="outline"
                  className="border-purple-500/50 text-purple-700"
                />
              </div>

              <Separator />

              {/* Experience Level Keywords */}
              <div>
                <h4 className="font-medium mb-3">Experience Level Keywords</h4>
                <p className="text-xs text-muted-foreground mb-4">Keywords that indicate different experience levels</p>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-500/20 text-purple-700">Internship</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('experience_level_keywords') || {}).internship || ['intern', 'stage', 'trainee', 'werkstudent']}
                      onAdd={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          internship: [...(current.internship || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          internship: (current.internship || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-green-500/20 text-green-700">Junior</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('experience_level_keywords') || {}).junior || ['junior', 'entry-level', 'starter', 'graduate']}
                      onAdd={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          junior: [...(current.junior || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          junior: (current.junior || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500/20 text-blue-700">Medior</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('experience_level_keywords') || {}).medior || ['medior', 'mid-level', 'regular']}
                      onAdd={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          medior: [...(current.medior || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          medior: (current.medior || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-orange-500/20 text-orange-700">Senior</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('experience_level_keywords') || {}).senior || ['senior', 'experienced', 'lead']}
                      onAdd={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          senior: [...(current.senior || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          senior: (current.senior || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-red-500/20 text-red-700">Principal</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('experience_level_keywords') || {}).principal || ['principal', 'staff', 'architect', 'expert']}
                      onAdd={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          principal: [...(current.principal || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('experience_level_keywords') || {};
                        updateSetting('experience_level_keywords', {
                          ...current,
                          principal: (current.principal || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Employment Type Keywords */}
              <div>
                <h4 className="font-medium mb-3">Employment Type Keywords</h4>
                <p className="text-xs text-muted-foreground mb-4">Keywords that indicate different employment types</p>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-green-500/20 text-green-700">Full-time</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('employment_type_keywords') || {}).fulltime || ['full-time', 'full time', 'fulltime']}
                      onAdd={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          fulltime: [...(current.fulltime || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          fulltime: (current.fulltime || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500/20 text-blue-700">Part-time</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('employment_type_keywords') || {}).parttime || ['part-time', 'part time', 'parttime']}
                      onAdd={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          parttime: [...(current.parttime || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          parttime: (current.parttime || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>

                  <div>
                    <Label className="text-sm flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-500/20 text-purple-700">Contract</Badge>
                    </Label>
                    <EditableTagList
                      tags={(getSetting('employment_type_keywords') || {}).contract || ['contract', 'freelance', 'interim', 'temporary']}
                      onAdd={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          contract: [...(current.contract || []), item]
                        });
                      }}
                      onRemove={(item) => {
                        const current = getSetting('employment_type_keywords') || {};
                        updateSetting('employment_type_keywords', {
                          ...current,
                          contract: (current.contract || []).filter((i: string) => i !== item)
                        });
                      }}
                      placeholder="Add keyword..."
                      variant="secondary"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Static Configuration Info */}
          <Card>
            <CardHeader>
              <CardTitle>Static Configuration</CardTitle>
              <CardDescription>These patterns are hardcoded in the scraper</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Pagination URL Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {['?page=N', '?p=N', '?offset=N', '?start=N', '/page/N', '/pagina/N', '?pageNumber=N', '?pg=N'].map((pattern) => (
                    <Badge key={pattern} variant="secondary" className="font-mono">
                      {pattern}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Job Title Cleanup Patterns</h4>
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>- ABN AMRO | Adyen | ING | Careers | Jobs | Vacancies...</li>
                    <li>at [Company Name]</li>
                    <li>| [Anything after pipe]</li>
                  </ul>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Employment Type Detection</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-700">Full-time</Badge>
                    <span className="text-sm text-muted-foreground font-mono">full-time, full time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500/20 text-blue-700">Part-time</Badge>
                    <span className="text-sm text-muted-foreground font-mono">part-time, part time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-500/20 text-purple-700">Contract</Badge>
                    <span className="text-sm text-muted-foreground font-mono">contract, freelance, interim, temporary</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

// Editable tag list component
interface EditableTagListProps {
  tags: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder?: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}

const EditableTagList = ({ tags, onAdd, onRemove, placeholder = "Add item...", variant = "secondary", className = "" }: EditableTagListProps) => {
  const [newItem, setNewItem] = useState("");

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant={variant} className={`font-mono pr-1 ${className}`}>
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="ml-1 hover:bg-black/10 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="max-w-xs"
        />
        <Button variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default Settings;
