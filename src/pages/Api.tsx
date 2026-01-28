import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Key, RefreshCw, Trash2, Eye, EyeOff, Code, ExternalLink, Settings, Plus, X, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import ApiDemoTab from '@/components/ApiDemoTab';

const API_BASE_URL = `https://khsaaiguqwtxtkvzqbrm.supabase.co/functions/v1/api`;

// Simple hash function for API keys (in production, use a proper crypto library)
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'jd_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface SynonymGroup {
  id: string;
  group_name: string;
  terms: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function Api() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTerms, setNewGroupTerms] = useState('');
  const [editingGroup, setEditingGroup] = useState<SynonymGroup | null>(null);
  const [editTerms, setEditTerms] = useState('');

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  const { data: synonymGroups = [], isLoading: loadingSynonyms } = useQuery({
    queryKey: ['job-synonyms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_synonyms')
        .select('*')
        .order('group_name');
      if (error) throw error;
      return data as SynonymGroup[];
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const key = generateApiKey();
      const keyHash = await hashApiKey(key);
      const keyPrefix = key.substring(0, 10) + '...';
      
      const { error } = await supabase
        .from('api_keys')
        .insert({ key_hash: keyHash, key_prefix: keyPrefix, name: name || 'Default' });
      
      if (error) throw error;
      return key;
    },
    onSuccess: (key) => {
      setGeneratedKey(key);
      setShowKey(true);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created! Copy it now - you won\'t see it again.');
    },
    onError: () => {
      toast.error('Failed to create API key');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key deleted');
    },
  });

  const createSynonymMutation = useMutation({
    mutationFn: async ({ groupName, terms }: { groupName: string; terms: string[] }) => {
      const { error } = await supabase
        .from('job_synonyms')
        .insert({ group_name: groupName, terms });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewGroupName('');
      setNewGroupTerms('');
      queryClient.invalidateQueries({ queryKey: ['job-synonyms'] });
      toast.success('Synonym group created');
    },
    onError: () => {
      toast.error('Failed to create synonym group');
    },
  });

  const updateSynonymMutation = useMutation({
    mutationFn: async ({ id, terms, is_active }: { id: string; terms?: string[]; is_active?: boolean }) => {
      const updateData: { terms?: string[]; is_active?: boolean } = {};
      if (terms !== undefined) updateData.terms = terms;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      const { error } = await supabase
        .from('job_synonyms')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingGroup(null);
      setEditTerms('');
      queryClient.invalidateQueries({ queryKey: ['job-synonyms'] });
      toast.success('Synonym group updated');
    },
    onError: () => {
      toast.error('Failed to update synonym group');
    },
  });

  const deleteSynonymMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_synonyms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-synonyms'] });
      toast.success('Synonym group deleted');
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const parseTerms = (input: string): string[] => {
    return input.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
  };

  const handleAddSynonymGroup = () => {
    const terms = parseTerms(newGroupTerms);
    if (!newGroupName.trim() || terms.length < 2) {
      toast.error('Enter a group name and at least 2 comma-separated terms');
      return;
    }
    createSynonymMutation.mutate({ groupName: newGroupName.trim(), terms });
  };

  const handleSaveEdit = () => {
    if (!editingGroup) return;
    const terms = parseTerms(editTerms);
    if (terms.length < 2) {
      toast.error('Enter at least 2 comma-separated terms');
      return;
    }
    updateSynonymMutation.mutate({ id: editingGroup.id, terms });
  };

  const endpoints = [
    {
      method: 'GET',
      path: '/jobs',
      description: 'List job opportunities with intelligent search',
      params: [
        { name: 'limit', type: 'number', desc: 'Results per page (max 100, default 50)' },
        { name: 'offset', type: 'number', desc: 'Pagination offset' },
        { name: 'search', type: 'string', desc: 'Intelligent search (uses synonyms + AI expansion)' },
        { name: 'location', type: 'string', desc: 'Filter by location' },
        { name: 'company', type: 'string', desc: 'Filter by company name' },
        { name: 'job_type', type: 'string', desc: 'Filter by type (full-time, part-time, contract)' },
        { name: 'experience_level', type: 'string', desc: 'Filter by experience level' },
        { name: 'remote', type: 'boolean', desc: 'Filter remote jobs' },
        { name: 'internship', type: 'boolean', desc: 'Filter internships' },
      ],
    },
    {
      method: 'GET',
      path: '/companies',
      description: 'List companies in the directory',
      params: [
        { name: 'limit', type: 'number', desc: 'Results per page (max 100, default 50)' },
        { name: 'offset', type: 'number', desc: 'Pagination offset' },
        { name: 'search', type: 'string', desc: 'Search in company names' },
        { name: 'industry', type: 'string', desc: 'Filter by industry' },
      ],
    },
    {
      method: 'POST',
      path: '/companies',
      description: 'Add a new company (auto-enabled for scraping)',
      params: [
        { name: 'name', type: 'string', desc: 'Company name (required, in body)' },
        { name: 'career_url', type: 'string', desc: 'Career page URL (required, in body)' },
        { name: 'industry', type: 'string', desc: 'Industry category (optional, in body)' },
      ],
    },
    {
      method: 'GET',
      path: '/stats',
      description: 'Get aggregate statistics',
      params: [],
    },
    {
      method: 'GET',
      path: '/synonyms',
      description: 'List all search synonym groups',
      params: [],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">API Access</h1>
          <p className="text-muted-foreground">
            Access job listings and company data programmatically via our REST API.
          </p>
        </div>

        <Tabs defaultValue="keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="keys" className="gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-2">
              <Code className="h-4 w-4" />
              Documentation
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="demo" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Demo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keys" className="space-y-6">
            {/* Create New Key */}
            <Card>
              <CardHeader>
                <CardTitle>Create API Key</CardTitle>
                <CardDescription>
                  Generate a new API key to authenticate your requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="keyName">Key Name (optional)</Label>
                    <Input
                      id="keyName"
                      placeholder="e.g., Production, Development"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => createKeyMutation.mutate(newKeyName)}
                      disabled={createKeyMutation.isPending}
                    >
                      {createKeyMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Key className="h-4 w-4 mr-2" />
                      )}
                      Generate Key
                    </Button>
                  </div>
                </div>

                {generatedKey && (
                  <div className="p-4 bg-muted rounded-lg border-2 border-primary/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-primary">Your new API key:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all">
                        {showKey ? generatedKey : '•'.repeat(32)}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      ⚠️ Copy this key now. You won't be able to see it again.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Existing Keys */}
            <Card>
              <CardHeader>
                <CardTitle>Your API Keys</CardTitle>
                <CardDescription>
                  Manage your existing API keys.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No API keys yet. Create one above to get started.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{key.name}</span>
                            <Badge variant={key.is_active ? 'default' : 'secondary'}>
                              {key.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <code className="text-sm text-muted-foreground font-mono">
                            {key.key_prefix}
                          </code>
                          <div className="text-xs text-muted-foreground">
                            Created {new Date(key.created_at).toLocaleDateString()}
                            {key.last_used_at && (
                              <> · Last used {new Date(key.last_used_at).toLocaleDateString()}</>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteKeyMutation.mutate(key.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docs" className="space-y-6">
            {/* Base URL */}
            <Card>
              <CardHeader>
                <CardTitle>Base URL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {API_BASE_URL}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(API_BASE_URL)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Authentication */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication</CardTitle>
                <CardDescription>
                  Include your API key in the request header.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`curl "${API_BASE_URL}/jobs" \\
  -H "X-API-Key: your_api_key_here"`}
                </pre>
              </CardContent>
            </Card>

            {/* Endpoints */}
            {endpoints.map((endpoint) => (
              <Card key={endpoint.path}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {endpoint.method}
                    </Badge>
                    <code className="font-mono">{endpoint.path}</code>
                  </CardTitle>
                  <CardDescription>{endpoint.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {endpoint.params.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Query Parameters</h4>
                      <div className="space-y-2">
                        {endpoint.params.map((param) => (
                          <div key={param.name} className="flex gap-4 text-sm">
                            <code className="font-mono text-primary min-w-[120px]">
                              {param.name}
                            </code>
                            <Badge variant="secondary" className="text-xs">
                              {param.type}
                            </Badge>
                            <span className="text-muted-foreground">{param.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <h4 className="font-medium mb-2">Example Request</h4>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`curl "${API_BASE_URL}${endpoint.path}${endpoint.params.length > 0 ? '?limit=10' : ''}" \\
  -H "X-API-Key: your_api_key_here"`}
                    </pre>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`${API_BASE_URL}${endpoint.path}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Try it (no auth)
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Response Format */}
            <Card>
              <CardHeader>
                <CardTitle>Response Format</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Standard Response (jobs, companies)</h4>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`{
  "data": [...],
  "meta": {
    "total": 279,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}`}
                  </pre>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Synonyms Response</h4>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`{
  "data": [
    {
      "group_name": "Product Management",
      "terms": ["product owner", "product manager", "po", "pm"],
      "is_active": true
    },
    ...
  ]
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>

            {/* Intelligent Search Info */}
            <Card>
              <CardHeader>
                <CardTitle>Intelligent Search</CardTitle>
                <CardDescription>
                  The /jobs endpoint features intelligent search powered by synonym mapping.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  When searching for jobs, the API automatically expands your query to include related terms 
                  from configured synonym groups. For example, searching for "product owner" will also return 
                  jobs with "product manager" in the title.
                </p>
                <div>
                  <h4 className="font-medium mb-2">Currently Configured Groups ({synonymGroups.filter(s => s.is_active).length} active)</h4>
                  <div className="space-y-2">
                    {synonymGroups.filter(s => s.is_active).slice(0, 5).map((group) => (
                      <div key={group.id} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0">{group.group_name}</Badge>
                        <span className="text-muted-foreground">
                          {group.terms.join(', ')}
                        </span>
                      </div>
                    ))}
                    {synonymGroups.filter(s => s.is_active).length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        +{synonymGroups.filter(s => s.is_active).length - 5} more groups...
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Manage synonym groups in the <strong>Settings</strong> tab or fetch them via <code className="bg-muted px-1 rounded">GET /synonyms</code>.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            {/* Synonym Groups Info */}
            <Card>
              <CardHeader>
                <CardTitle>Search Synonyms</CardTitle>
                <CardDescription>
                  Configure synonym groups to improve search accuracy. When a user searches for one term, 
                  the API will also match related terms from the same group. For example, searching "product owner" 
                  will also find jobs with "product manager" in the title.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                  <Code className="h-4 w-4 shrink-0" />
                  <span>
                    These settings are also available via the API: <code className="bg-background px-1.5 py-0.5 rounded font-mono text-xs">GET /synonyms</code>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto shrink-0"
                    onClick={() => window.open(`${API_BASE_URL}/synonyms`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Try it
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Add New Synonym Group */}
            <Card>
              <CardHeader>
                <CardTitle>Add Synonym Group</CardTitle>
                <CardDescription>
                  Create a new group of related job title terms.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="groupName">Group Name</Label>
                    <Input
                      id="groupName"
                      placeholder="e.g., Product Management"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="groupTerms">Terms (comma-separated)</Label>
                    <Input
                      id="groupTerms"
                      placeholder="e.g., product owner, product manager, po, pm"
                      value={newGroupTerms}
                      onChange={(e) => setNewGroupTerms(e.target.value)}
                    />
                  </div>
                </div>
                <Button 
                  onClick={handleAddSynonymGroup}
                  disabled={createSynonymMutation.isPending}
                >
                  {createSynonymMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Group
                </Button>
              </CardContent>
            </Card>

            {/* Existing Synonym Groups */}
            <Card>
              <CardHeader>
                <CardTitle>Synonym Groups</CardTitle>
                <CardDescription>
                  {synonymGroups.filter(s => s.is_active).length} active groups, {synonymGroups.length} total
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSynonyms ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : synonymGroups.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No synonym groups yet. Create one above.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {synonymGroups.map((group) => (
                      <div
                        key={group.id}
                        className="p-4 border rounded-lg space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{group.group_name}</span>
                            <Badge variant={group.is_active ? 'default' : 'secondary'}>
                              {group.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={group.is_active}
                              onCheckedChange={(checked) => 
                                updateSynonymMutation.mutate({ id: group.id, is_active: checked })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteSynonymMutation.mutate(group.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {editingGroup?.id === group.id ? (
                          <div className="flex gap-2">
                            <Input
                              value={editTerms}
                              onChange={(e) => setEditTerms(e.target.value)}
                              placeholder="Enter comma-separated terms"
                              className="flex-1"
                            />
                            <Button size="sm" onClick={handleSaveEdit}>
                              Save
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => setEditingGroup(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="flex flex-wrap gap-1 cursor-pointer hover:bg-muted/50 p-2 rounded -m-2"
                            onClick={() => {
                              setEditingGroup(group);
                              setEditTerms(group.terms.join(', '));
                            }}
                          >
                            {group.terms.map((term, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {term}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="demo">
            <ApiDemoTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
