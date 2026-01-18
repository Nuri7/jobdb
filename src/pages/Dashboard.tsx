import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Briefcase,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Activity,
  Loader2,
  Smartphone,
  Monitor,
  Download,
} from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";

const Dashboard = () => {
  // Fetch scrape history
  const { data: scrapeHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["scrape-history-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scrape_history")
        .select("*, company_career_sites(company_name)")
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Fetch companies
  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ["companies-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_career_sites")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch total jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("job_opportunities")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return { count: count || 0 };
    },
  });

  // Fetch PWA analytics
  const { data: pwaAnalytics, isLoading: pwaLoading } = useQuery({
    queryKey: ["pwa-analytics"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from("pwa_analytics")
        .select("*")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const isLoading = historyLoading || companiesLoading || jobsLoading || pwaLoading;

  // Calculate statistics
  const stats = useMemo(() => {
    if (!scrapeHistory || !companies) {
      return {
        totalScrapes: 0,
        successRate: 0,
        avgJobsPerScrape: 0,
        totalJobsScraped: 0,
        companiesWithSchedule: 0,
        recentScrapes: [],
      };
    }

    const completedScrapes = scrapeHistory.filter((s) => s.status === "completed");
    const failedScrapes = scrapeHistory.filter((s) => s.status === "failed");
    const totalJobs = completedScrapes.reduce((sum, s) => sum + (s.jobs_inserted || 0), 0);
    const companiesWithSchedule = companies.filter((c) => c.scrape_schedule).length;

    return {
      totalScrapes: scrapeHistory.length,
      successRate: scrapeHistory.length > 0 
        ? Math.round((completedScrapes.length / scrapeHistory.length) * 100) 
        : 0,
      avgJobsPerScrape: completedScrapes.length > 0 
        ? Math.round(totalJobs / completedScrapes.length) 
        : 0,
      totalJobsScraped: totalJobs,
      companiesWithSchedule,
      failedCount: failedScrapes.length,
      successCount: completedScrapes.length,
    };
  }, [scrapeHistory, companies]);

  // Jobs scraped per day (last 14 days)
  const jobsPerDay = useMemo(() => {
    if (!scrapeHistory) return [];

    const last14Days = eachDayOfInterval({
      start: subDays(new Date(), 13),
      end: new Date(),
    });

    return last14Days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayScrapes = scrapeHistory.filter((s) => {
        const scrapeDate = new Date(s.started_at);
        return scrapeDate >= dayStart && scrapeDate < dayEnd && s.status === "completed";
      });

      const jobsInserted = dayScrapes.reduce((sum, s) => sum + (s.jobs_inserted || 0), 0);

      return {
        date: format(day, "MMM d"),
        jobs: jobsInserted,
        scrapes: dayScrapes.length,
      };
    });
  }, [scrapeHistory]);

  // Scrapes by status
  const scrapesByStatus = useMemo(() => {
    if (!scrapeHistory) return [];

    const completed = scrapeHistory.filter((s) => s.status === "completed").length;
    const failed = scrapeHistory.filter((s) => s.status === "failed").length;
    const running = scrapeHistory.filter((s) => s.status === "running").length;

    return [
      { name: "Completed", value: completed, color: "hsl(var(--chart-2))" },
      { name: "Failed", value: failed, color: "hsl(var(--chart-5))" },
      { name: "Running", value: running, color: "hsl(var(--chart-3))" },
    ].filter((s) => s.value > 0);
  }, [scrapeHistory]);

  // Top companies by jobs found
  const topCompanies = useMemo(() => {
    if (!companies) return [];

    return [...companies]
      .filter((c) => c.jobs_found_count && c.jobs_found_count > 0)
      .sort((a, b) => (b.jobs_found_count || 0) - (a.jobs_found_count || 0))
      .slice(0, 8)
      .map((c) => ({
        name: c.company_name.length > 15 ? c.company_name.slice(0, 15) + "..." : c.company_name,
        jobs: c.jobs_found_count || 0,
      }));
  }, [companies]);

  // Recent scrapes
  const recentScrapes = useMemo(() => {
    if (!scrapeHistory) return [];
    return scrapeHistory.slice(0, 10);
  }, [scrapeHistory]);

  // PWA vs Browser sessions
  const pwaVsBrowser = useMemo(() => {
    if (!pwaAnalytics) return [];
    
    const sessions = pwaAnalytics.filter((a) => a.event_type === "session_start");
    const pwaCount = sessions.filter((s) => s.is_pwa).length;
    const browserCount = sessions.filter((s) => !s.is_pwa).length;

    return [
      { name: "PWA", value: pwaCount, color: "hsl(var(--primary))" },
      { name: "Browser", value: browserCount, color: "hsl(var(--chart-3))" },
    ].filter((s) => s.value > 0);
  }, [pwaAnalytics]);

  // PWA installations over time
  const pwaInstallsOverTime = useMemo(() => {
    if (!pwaAnalytics) return [];

    const last14Days = eachDayOfInterval({
      start: subDays(new Date(), 13),
      end: new Date(),
    });

    return last14Days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayInstalls = pwaAnalytics.filter((a) => {
        const eventDate = new Date(a.created_at);
        return eventDate >= dayStart && eventDate < dayEnd && a.event_type === "installed";
      });

      const daySessions = pwaAnalytics.filter((a) => {
        const eventDate = new Date(a.created_at);
        return eventDate >= dayStart && eventDate < dayEnd && a.event_type === "session_start";
      });

      return {
        date: format(day, "MMM d"),
        installs: dayInstalls.length,
        sessions: daySessions.length,
      };
    });
  }, [pwaAnalytics]);

  // PWA stats
  const pwaStats = useMemo(() => {
    if (!pwaAnalytics) return { totalSessions: 0, pwaSessions: 0, totalInstalls: 0 };

    const sessions = pwaAnalytics.filter((a) => a.event_type === "session_start");
    const installs = pwaAnalytics.filter((a) => a.event_type === "installed");

    return {
      totalSessions: sessions.length,
      pwaSessions: sessions.filter((s) => s.is_pwa).length,
      totalInstalls: installs.length,
    };
  }, [scrapeHistory]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Scraping statistics and trends overview
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Briefcase className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobsData?.count || 0}</p>
                      <p className="text-xs text-muted-foreground">Total Jobs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-chart-2/10">
                      <Building2 className="w-5 h-5 text-chart-2" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{companies?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Companies</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-chart-3/10">
                      <Activity className="w-5 h-5 text-chart-3" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.totalScrapes}</p>
                      <p className="text-xs text-muted-foreground">Total Scrapes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-chart-4/10">
                      <TrendingUp className="w-5 h-5 text-chart-4" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.successRate}%</p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Jobs Over Time */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Jobs Scraped (Last 14 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={jobsPerDay}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }} 
                          tickLine={false}
                          axisLine={false}
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }} 
                          tickLine={false}
                          axisLine={false}
                          className="text-muted-foreground"
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))", 
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px"
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="jobs"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary) / 0.2)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Scrapes by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Scrapes by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    {scrapesByStatus.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={scrapesByStatus}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {scrapesByStatus.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))", 
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px"
                            }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No data yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Companies */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Top Companies by Jobs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {topCompanies.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topCompanies} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                          <YAxis 
                            type="category" 
                            dataKey="name" 
                            tick={{ fontSize: 11 }} 
                            tickLine={false}
                            axisLine={false}
                            width={100}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))", 
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px"
                            }}
                          />
                          <Bar dataKey="jobs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No data yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Scrapes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Recent Scrapes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {recentScrapes.length > 0 ? (
                      recentScrapes.map((scrape) => (
                        <div
                          key={scrape.id}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            {scrape.status === "completed" ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : scrape.status === "failed" ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {(scrape.company_career_sites as any)?.company_name || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(scrape.started_at), "MMM d, h:mm a")}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={
                                scrape.status === "completed"
                                  ? "default"
                                  : scrape.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {scrape.jobs_inserted || 0} jobs
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        No scrapes yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Schedule Stats */}
            <div className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Scheduled Scraping</p>
                        <p className="text-sm text-muted-foreground">
                          {stats.companiesWithSchedule} companies with automatic scraping enabled
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>{stats.successCount} successful</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span>{stats.failedCount} failed</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* PWA Analytics Section */}
            <div className="mt-8">
              <h2 className="text-xl font-bold text-foreground mb-4">PWA Analytics</h2>
              <p className="text-muted-foreground mb-6">Track how users access and install your app (Last 30 days)</p>
              
              {/* PWA Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pwaStats.pwaSessions}</p>
                        <p className="text-xs text-muted-foreground">PWA Sessions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-chart-3/10">
                        <Monitor className="w-5 h-5 text-chart-3" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pwaStats.totalSessions - pwaStats.pwaSessions}</p>
                        <p className="text-xs text-muted-foreground">Browser Sessions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-chart-2/10">
                        <Download className="w-5 h-5 text-chart-2" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pwaStats.totalInstalls}</p>
                        <p className="text-xs text-muted-foreground">Total Installs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-chart-4/10">
                        <TrendingUp className="w-5 h-5 text-chart-4" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {pwaStats.totalSessions > 0 
                            ? Math.round((pwaStats.pwaSessions / pwaStats.totalSessions) * 100)
                            : 0}%
                        </p>
                        <p className="text-xs text-muted-foreground">PWA Adoption</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* PWA Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions Over Time */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Sessions & Installs (Last 14 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pwaInstallsOverTime}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }} 
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }} 
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))", 
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px"
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="sessions"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--primary))" }}
                            name="Sessions"
                          />
                          <Line
                            type="monotone"
                            dataKey="installs"
                            stroke="hsl(var(--chart-2))"
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--chart-2))" }}
                            name="Installs"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* PWA vs Browser */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">PWA vs Browser</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      {pwaVsBrowser.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pwaVsBrowser}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={90}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {pwaVsBrowser.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px"
                              }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          No session data yet
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
