import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Flame, Clock, FileSearch, Filter, MapPin, Briefcase } from "lucide-react";

const Settings = () => {
  const firecrawlConfig = {
    listingPage: {
      formats: ['markdown', 'links', 'html'],
      onlyMainContent: false,
      waitFor: 3000,
    },
    jobDetailPage: {
      formats: ['markdown'],
      onlyMainContent: true,
    },
    limits: {
      maxPages: 20,
      maxJobs: 150,
    },
  };

  const paginationPatterns = [
    '?page=N',
    '?p=N',
    '?offset=N',
    '?start=N',
    '/page/N',
    '/pagina/N',
    '?pageNumber=N',
    '?pg=N',
  ];

  const jobUrlPatterns = [
    'job', 'vacanc', 'position', 'opening', 'vacature', 'werk',
    '/NNNNN (5+ digit IDs)', 'id=N', 'job_id / job-id',
  ];

  const excludedPatterns = [
    'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
    '.pdf', 'login', 'signup', 'register', '/locations', '/career-types',
    '/about', '/contact', 'pagination URLs',
  ];

  const locationKeywords = [
    'location', 'plaats', 'locatie', 'city', 'standort',
    'amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven',
    'den haag', 'leiden', 'delft', 'groningen', 'maastricht',
  ];

  const employmentPatterns = {
    fullTime: 'full-time, full time',
    partTime: 'part-time, part time',
    contract: 'contract, freelance, interim, temporary',
  };

  const remoteKeywords = ['remote', 'thuiswerk', 'hybrid', 'work from home', 'wfh'];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-5xl py-8">
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Firecrawl scraper configuration and extraction rules</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Firecrawl API Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <CardTitle>Firecrawl API Configuration</CardTitle>
              </div>
              <CardDescription>Settings used when making requests to Firecrawl API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Listing Page Scrape</h4>
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
                  <pre className="whitespace-pre-wrap text-muted-foreground">
{JSON.stringify({
  url: '<career_page_url>',
  formats: firecrawlConfig.listingPage.formats,
  onlyMainContent: firecrawlConfig.listingPage.onlyMainContent,
  waitFor: firecrawlConfig.listingPage.waitFor,
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
  formats: firecrawlConfig.jobDetailPage.formats,
  onlyMainContent: firecrawlConfig.jobDetailPage.onlyMainContent,
}, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Limits */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <CardTitle>Scraping Limits</CardTitle>
              </div>
              <CardDescription>Limits to prevent timeouts and excessive API usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Max Listing Pages</p>
                  <p className="text-2xl font-bold">{firecrawlConfig.limits.maxPages}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Max Jobs per Scrape</p>
                  <p className="text-2xl font-bold">{firecrawlConfig.limits.maxJobs}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pagination Detection */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-green-500" />
                <CardTitle>Pagination Detection</CardTitle>
              </div>
              <CardDescription>URL patterns used to identify pagination links</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {paginationPatterns.map((pattern) => (
                  <Badge key={pattern} variant="secondary" className="font-mono">
                    {pattern}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Job URL Filtering */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-purple-500" />
                <CardTitle>Job URL Filtering</CardTitle>
              </div>
              <CardDescription>Patterns used to identify and filter job detail page URLs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2 text-green-600">Include Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {jobUrlPatterns.map((pattern) => (
                    <Badge key={pattern} variant="outline" className="font-mono border-green-500/50 text-green-700">
                      {pattern}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium mb-2 text-red-600">Exclude Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {excludedPatterns.map((pattern) => (
                    <Badge key={pattern} variant="outline" className="font-mono border-red-500/50 text-red-700">
                      {pattern}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Extraction */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-amber-500" />
                <CardTitle>Data Extraction Rules</CardTitle>
              </div>
              <CardDescription>Patterns used to extract job metadata from page content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium">Location Keywords</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {locationKeywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="font-mono">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Employment Type Detection</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-700">Full-time</Badge>
                    <span className="text-sm text-muted-foreground font-mono">{employmentPatterns.fullTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500/20 text-blue-700">Part-time</Badge>
                    <span className="text-sm text-muted-foreground font-mono">{employmentPatterns.partTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-500/20 text-purple-700">Contract</Badge>
                    <span className="text-sm text-muted-foreground font-mono">{employmentPatterns.contract}</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Remote Work Detection</h4>
                <div className="flex flex-wrap gap-2">
                  {remoteKeywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="font-mono">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Title Cleanup */}
          <Card>
            <CardHeader>
              <CardTitle>Job Title Cleanup</CardTitle>
              <CardDescription>Suffixes automatically removed from job titles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
                <p className="text-muted-foreground mb-2">Removed patterns:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>- ABN AMRO | Adyen | ING | Careers | Jobs | Vacancies...</li>
                  <li>at [Company Name]</li>
                  <li>| [Anything after pipe]</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Settings;
