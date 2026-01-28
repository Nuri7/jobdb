import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Play, Building2, Briefcase, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = `https://khsaaiguqwtxtkvzqbrm.supabase.co/functions/v1/api`;

interface Job {
  id: string;
  title: string;
  url: string;
  location: string | null;
  employment_type: string | null;
  is_remote: boolean | null;
  company: {
    name: string;
    career_url: string;
    company_logo: string;
  };
}

interface Company {
  id: string;
  name: string;
  career_url: string;
  company_logo: string;
  industry: string | null;
  is_scrape_enabled: boolean;
}

export default function ApiDemoTab() {
  const [apiKey, setApiKey] = useState('');
  
  // Fetch Jobs state
  const [jobSearch, setJobSearch] = useState('');
  const [jobLimit, setJobLimit] = useState('5');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsMeta, setJobsMeta] = useState<{ total: number } | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  
  // Add Company state
  const [companyName, setCompanyName] = useState('');
  const [careerUrl, setCareerUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [addedCompany, setAddedCompany] = useState<Company | null>(null);
  const [addingCompany, setAddingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const fetchJobs = async () => {
    setLoadingJobs(true);
    setJobsError(null);
    setJobs([]);
    setJobsMeta(null);
    
    try {
      const params = new URLSearchParams();
      if (jobSearch) params.set('search', jobSearch);
      params.set('limit', jobLimit || '5');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }
      
      const response = await fetch(`${API_BASE_URL}/jobs?${params.toString()}`, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setJobs(result.data || []);
      setJobsMeta(result.meta || null);
      toast.success(`Fetched ${result.data?.length || 0} jobs`);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to fetch jobs');
    } finally {
      setLoadingJobs(false);
    }
  };

  const addCompany = async () => {
    if (!companyName.trim() || !careerUrl.trim()) {
      toast.error('Company name and career URL are required');
      return;
    }
    
    if (!apiKey) {
      toast.error('API key is required for POST requests');
      return;
    }
    
    setAddingCompany(true);
    setCompanyError(null);
    setAddedCompany(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          name: companyName.trim(),
          career_url: careerUrl.trim(),
          industry: industry.trim() || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setAddedCompany(result.data);
      setCompanyName('');
      setCareerUrl('');
      setIndustry('');
      toast.success(result.message || 'Company added successfully!');
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to add company');
    } finally {
      setAddingCompany(false);
    }
  };

  const getJobsCode = () => {
    const params = [];
    if (jobSearch) params.push(`search=${encodeURIComponent(jobSearch)}`);
    params.push(`limit=${jobLimit || '5'}`);
    const queryString = params.length > 0 ? `?${params.join('&')}` : '';
    
    return `fetch("${API_BASE_URL}/jobs${queryString}", {
  headers: {
    "X-API-Key": "${apiKey || 'YOUR_API_KEY'}"
  }
})
  .then(res => res.json())
  .then(data => console.log(data));`;
  };

  const getAddCompanyCode = () => {
    return `fetch("${API_BASE_URL}/companies", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${apiKey || 'YOUR_API_KEY'}"
  },
  body: JSON.stringify({
    name: "${companyName || 'Company Name'}",
    career_url: "${careerUrl || 'https://company.com/careers'}",
    industry: "${industry || 'Technology'}"
  })
})
  .then(res => res.json())
  .then(data => console.log(data));`;
  };

  return (
    <div className="space-y-6">
      {/* API Key Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">API Key</Badge>
            Your Credentials
          </CardTitle>
          <CardDescription>
            Enter your API key to test authenticated endpoints. GET requests work without a key, but POST requires one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                type="password"
                placeholder="jd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
          {!apiKey && (
            <p className="text-xs text-muted-foreground mt-2">
              💡 You can still test GET /jobs without a key. For POST /companies, create a key in the "API Keys" tab.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Fetch Jobs Demo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Fetch Jobs
            <Badge variant="outline" className="ml-auto font-mono">GET /jobs</Badge>
          </CardTitle>
          <CardDescription>
            Search and retrieve job listings with optional filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="jobSearch">Search Term</Label>
              <Input
                id="jobSearch"
                placeholder="e.g., developer, designer, manager..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="jobLimit">Limit</Label>
              <Input
                id="jobLimit"
                type="number"
                min="1"
                max="100"
                value={jobLimit}
                onChange={(e) => setJobLimit(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={fetchJobs} disabled={loadingJobs}>
              {loadingJobs ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Request
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(getJobsCode(), 'jobs')}
            >
              {copiedCode === 'jobs' ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy Code
            </Button>
          </div>

          {/* Code Preview */}
          <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono">
            {getJobsCode()}
          </pre>

          {/* Results */}
          {jobsError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <strong>Error:</strong> {jobsError}
            </div>
          )}
          
          {jobs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Results</h4>
                {jobsMeta && (
                  <Badge variant="secondary">
                    {jobs.length} of {jobsMeta.total} total
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {jobs.map((job) => (
                  <div key={job.id} className="p-3 flex items-start gap-3">
                    <img
                      src={job.company?.company_logo || `https://www.google.com/s2/favicons?domain=example.com&sz=32`}
                      alt=""
                      className="w-8 h-8 rounded shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline text-sm line-clamp-1"
                      >
                        {job.title}
                      </a>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        <span>{job.company?.name}</span>
                        {job.location && <span>• {job.location}</span>}
                        {job.is_remote && <Badge variant="outline" className="text-[10px] px-1 py-0">Remote</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Company Demo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add Company
            <Badge variant="outline" className="ml-auto font-mono">POST /companies</Badge>
          </CardTitle>
          <CardDescription>
            Add a new company to the directory. It will be auto-enabled for scraping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                placeholder="e.g., Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="careerUrl">Career Page URL *</Label>
              <Input
                id="careerUrl"
                placeholder="https://acme.com/careers"
                value={careerUrl}
                onChange={(e) => setCareerUrl(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="industry">Industry (optional)</Label>
              <Input
                id="industry"
                placeholder="e.g., Technology, Healthcare, Finance..."
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={addCompany} disabled={addingCompany || !apiKey}>
              {addingCompany ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Request
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(getAddCompanyCode(), 'company')}
            >
              {copiedCode === 'company' ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy Code
            </Button>
            {!apiKey && (
              <span className="text-xs text-muted-foreground">API key required</span>
            )}
          </div>

          {/* Code Preview */}
          <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono">
            {getAddCompanyCode()}
          </pre>

          {/* Results */}
          {companyError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <strong>Error:</strong> {companyError}
            </div>
          )}
          
          {addedCompany && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500">Success</Badge>
                <span className="text-sm font-medium">Company created</span>
              </div>
              <div className="flex items-start gap-3">
                <img
                  src={addedCompany.company_logo}
                  alt=""
                  className="w-10 h-10 rounded shrink-0"
                />
                <div className="flex-1">
                  <p className="font-medium">{addedCompany.name}</p>
                  <p className="text-xs text-muted-foreground">{addedCompany.career_url}</p>
                  <div className="flex gap-2 mt-1">
                    {addedCompany.industry && (
                      <Badge variant="outline" className="text-xs">{addedCompany.industry}</Badge>
                    )}
                    {addedCompany.is_scrape_enabled && (
                      <Badge variant="secondary" className="text-xs">Scraping Enabled</Badge>
                    )}
                  </div>
                </div>
              </div>
              <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                {JSON.stringify(addedCompany, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
