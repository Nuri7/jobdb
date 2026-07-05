import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Building2,
  Bot,
  Clock,
  Download,
  Globe,
  Smartphone,
  Monitor,
  Share2,
  MoreVertical,
  Plus,
  ArrowUp,
  BarChart3,
  Filter,
  Zap,
  Database,
  Key,
  RefreshCw,
} from "lucide-react";
import pwaInstallIos from "@/assets/pwa-install-ios.mp4";
import pwaInstallAndroid from "@/assets/pwa-install-android.mp4";
import pwaInstallDesktop from "@/assets/pwa-install-desktop.mp4";

const features = [
  {
    icon: Search,
    title: "Intelligent Job Search",
    description: "AI-powered search with synonym expansion finds related roles automatically. Search for 'developer' and find 'engineer', 'programmer', and more.",
    color: "hsl(221, 83%, 53%)",
  },
  {
    icon: Bot,
    title: "Automated Scraping",
    description: "AI-driven web scraping extracts job listings from company career pages, parsing titles, locations, salaries, and experience levels.",
    color: "hsl(262, 83%, 58%)",
  },
  {
    icon: Building2,
    title: "Company Discovery",
    description: "Automatically discover Dutch companies with career pages using targeted search queries. Filter by industry and company size.",
    color: "hsl(142, 71%, 45%)",
  },
  {
    icon: Clock,
    title: "Scheduled Updates",
    description: "Configure automatic scraping schedules per company—daily, twice daily, or weekly—to keep job listings fresh.",
    color: "hsl(24, 95%, 53%)",
  },
  {
    icon: Filter,
    title: "Advanced Filtering",
    description: "Filter jobs by location, experience level, industry, employment type, and company. Dynamic dropdowns with real data.",
    color: "hsl(340, 82%, 52%)",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track scraping performance, job volume trends, and company activity with interactive charts and statistics.",
    color: "hsl(199, 89%, 48%)",
  },
  {
    icon: Key,
    title: "Public API",
    description: "RESTful API with authentication for programmatic access to jobs, companies, and statistics. Full documentation included.",
    color: "hsl(47, 96%, 53%)",
  },
  {
    icon: Database,
    title: "Synonym Management",
    description: "Create and manage job title synonym groups to enhance search accuracy. 'Product Owner' finds 'PO', 'Product Manager', etc.",
    color: "hsl(280, 65%, 60%)",
  },
  {
    icon: RefreshCw,
    title: "Real-time Progress",
    description: "Watch scraping progress in real-time with live updates on pages processed and jobs discovered.",
    color: "hsl(160, 60%, 45%)",
  },
];

const Features = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl py-8">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4">
            <Zap className="h-3 w-3 mr-1" />
            Progressive Web App
          </Badge>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            FairJobs Features
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A comprehensive job market intelligence platform for the Dutch market, with AI-powered scraping and intelligent search.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <feature.icon
                      className="h-5 w-5"
                      style={{ color: feature.color }}
                    />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* PWA Install Section */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2 flex items-center justify-center gap-3">
              <Download className="h-8 w-8 text-primary" />
              Install FairJobs
            </h2>
            <p className="text-muted-foreground">
              Install FairJobs on your device for quick access and offline support
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* iOS Instructions */}
            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 overflow-hidden">
              <div className="relative aspect-[9/16] max-h-[280px] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                <video 
                  src={pwaInstallIos} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                    <Smartphone className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">iPhone & iPad</CardTitle>
                    <CardDescription className="text-xs">Safari Browser</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      1
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Open in <strong>Safari</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      2
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Tap <Share2 className="h-3 w-3 inline" /> <strong>Share</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      3
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>"Add to Home Screen"</strong>
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-[10px] text-muted-foreground">
                    💡 Must use Safari
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Android Instructions */}
            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 overflow-hidden">
              <div className="relative aspect-[9/16] max-h-[280px] overflow-hidden bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-950">
                <video 
                  src={pwaInstallAndroid} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-950">
                    <Smartphone className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Android</CardTitle>
                    <CardDescription className="text-xs">Chrome Browser</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center text-[10px] font-bold text-green-600">
                      1
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Open in <strong>Chrome</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center text-[10px] font-bold text-green-600">
                      2
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Tap <MoreVertical className="h-3 w-3 inline" /> menu
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center text-[10px] font-bold text-green-600">
                      3
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>"Install app"</strong>
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-[10px] text-muted-foreground">
                    💡 Banner may appear automatically
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Desktop Instructions */}
            <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 overflow-hidden">
              <div className="relative aspect-[16/9] max-h-[280px] overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-950">
                <video 
                  src={pwaInstallDesktop} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-950">
                    <Monitor className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Desktop</CardTitle>
                    <CardDescription className="text-xs">Chrome, Edge, or Brave</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600">
                      1
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Open in Chrome, Edge, or Brave
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600">
                      2
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Click <Plus className="h-3 w-3 inline" /> in address bar
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600">
                      3
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click <strong>"Install"</strong>
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-[10px] text-muted-foreground">
                    💡 Firefox doesn't support PWA
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Benefits Section */}
        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/50">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Why Install the App?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Zap className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium text-sm">Faster Loading</p>
                  <p className="text-xs text-muted-foreground">Cached resources for speed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Globe className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium text-sm">Works Offline</p>
                  <p className="text-xs text-muted-foreground">Browse cached jobs anytime</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Smartphone className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium text-sm">Home Screen Access</p>
                  <p className="text-xs text-muted-foreground">Launch like a native app</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <ArrowUp className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="font-medium text-sm">Auto Updates</p>
                  <p className="text-xs text-muted-foreground">Always the latest version</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Features;
