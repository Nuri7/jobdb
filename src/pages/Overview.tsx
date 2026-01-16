import { useState } from "react";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Users, Factory, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const industryData = [
  { sector: "Wholesale and Retail Trade", shortName: "Retail/Trade", medium: 2500, large: 600, total: 3100 },
  { sector: "Manufacturing", shortName: "Manufacturing", medium: 1800, large: 500, total: 2300 },
  { sector: "Human Health and Social Work Activities", shortName: "Healthcare", medium: 1500, large: 400, total: 1900 },
  { sector: "Administrative and Support Service Activities", shortName: "Admin Services", medium: 1200, large: 300, total: 1500 },
  { sector: "Professional, Scientific, and Technical Activities", shortName: "Professional", medium: 1000, large: 250, total: 1250 },
  { sector: "Construction", shortName: "Construction", medium: 800, large: 200, total: 1000 },
  { sector: "Information and Communication", shortName: "IT/Comms", medium: 600, large: 150, total: 750 },
  { sector: "Transportation and Storage", shortName: "Transport", medium: 500, large: 100, total: 600 },
  { sector: "Accommodation and Food Services", shortName: "Hospitality", medium: 400, large: 80, total: 480 },
  { sector: "Other Sectors (Education, Financial Services, Mining, Energy)", shortName: "Other", medium: 700, large: 48, total: 748 },
];

const COLORS = [
  "hsl(221, 83%, 53%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(262, 83%, 58%)",  // purple
  "hsl(24, 95%, 53%)",   // orange
  "hsl(340, 82%, 52%)",  // pink
  "hsl(47, 96%, 53%)",   // yellow
  "hsl(199, 89%, 48%)",  // cyan
  "hsl(280, 65%, 60%)",  // violet
  "hsl(160, 60%, 45%)",  // teal
  "hsl(0, 0%, 45%)",     // gray
];

const totalMedium = industryData.reduce((sum, item) => sum + item.medium, 0);
const totalLarge = industryData.reduce((sum, item) => sum + item.large, 0);
const grandTotal = industryData.reduce((sum, item) => sum + item.total, 0);

// Prepare data for pie chart
const pieData = industryData.map((item, index) => ({
  name: item.shortName,
  value: item.total,
  index,
}));

// Prepare data for bar chart
const barData = industryData.map((item) => ({
  name: item.shortName,
  "Medium (50-249)": item.medium,
  "Large (250+)": item.large,
}));

// Prepare data for donut chart (medium vs large)
const sizeData = [
  { name: "Medium (50-249)", value: totalMedium, color: "hsl(221, 83%, 53%)" },
  { name: "Large (250+)", value: totalLarge, color: "hsl(262, 83%, 58%)" },
];

const Overview = () => {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const filteredData = selectedSector
    ? industryData.filter((item) => item.shortName === selectedSector)
    : industryData;

  const handlePieClick = (data: { name: string }) => {
    if (selectedSector === data.name) {
      setSelectedSector(null);
    } else {
      setSelectedSector(data.name);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Market Overview</h1>
          <p className="text-muted-foreground">
            Breakdown of Companies with More Than 50 Employees in the Netherlands by Industry Sector
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{grandTotal.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Companies with &gt;50 employees</p>
            </CardContent>
          </Card>
          <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:100ms]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medium-Sized</CardTitle>
              <Users className="h-4 w-4 transition-transform duration-300" style={{ color: "hsl(221, 83%, 53%)" }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">~{totalMedium.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">50-249 employees</p>
            </CardContent>
          </Card>
          <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:200ms]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Large</CardTitle>
              <Factory className="h-4 w-4 transition-transform duration-300" style={{ color: "hsl(262, 83%, 58%)" }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLarge.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">250+ employees</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {/* Pie Chart - Clickable */}
          <Card className="lg:col-span-1 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in">
            <CardHeader>
              <CardTitle>Industry Distribution</CardTitle>
              <CardDescription>Click a sector to filter the table</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                    onClick={handlePieClick}
                    style={{ cursor: "pointer" }}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        opacity={selectedSector && selectedSector !== entry.name ? 0.3 : 1}
                        stroke={selectedSector === entry.name ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={selectedSector === entry.name ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`~${value.toLocaleString()} companies`, "Total"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: "10px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Donut Chart - Medium vs Large */}
          <Card className="lg:col-span-1 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:100ms]">
            <CardHeader>
              <CardTitle>Size Distribution</CardTitle>
              <CardDescription>Medium vs Large companies</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sizeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sizeData.map((entry, index) => (
                      <Cell key={`size-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `~${value.toLocaleString()} (${((value / grandTotal) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center mt-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold" style={{ color: "hsl(221, 83%, 53%)" }}>
                    {((totalMedium / grandTotal) * 100).toFixed(1)}%
                  </span>{" "}
                  Medium |{" "}
                  <span className="font-semibold" style={{ color: "hsl(262, 83%, 58%)" }}>
                    {((totalLarge / grandTotal) * 100).toFixed(1)}%
                  </span>{" "}
                  Large
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bar Chart */}
          <Card className="lg:col-span-1 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:200ms]">
            <CardHeader>
              <CardTitle>Size Comparison</CardTitle>
              <CardDescription>By sector</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={9}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: number) => [`~${value.toLocaleString()}`, ""]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="Medium (50-249)" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Large (250+)" fill="hsl(262, 83%, 58%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Industry Breakdown Table */}
        <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Industry Breakdown</CardTitle>
                <CardDescription>
                  Distribution of companies by NACE industry sector (2023 estimates)
                </CardDescription>
              </div>
              {selectedSector && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSector(null)}
                  className="flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear filter
                  <Badge variant="secondary" className="ml-1">
                    {selectedSector}
                  </Badge>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Industry Sector (NACE Equivalent)</TableHead>
                  <TableHead className="text-right">Medium (50-249)</TableHead>
                  <TableHead className="text-right">Large (250+)</TableHead>
                  <TableHead className="text-right">Total &gt;50</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((row) => (
                  <TableRow key={row.sector}>
                    <TableCell className="font-medium">{row.sector}</TableCell>
                    <TableCell className="text-right">~{row.medium.toLocaleString()}</TableCell>
                    <TableCell className="text-right">~{row.large.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">~{row.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!selectedSector && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">~{totalMedium.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{totalLarge.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{grandTotal.toLocaleString()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Key Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: "hsl(199, 89%, 48%)" }} />
                Data Sources & Limitations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                These numbers are approximate, based on CBS StatLine business demography (employer enterprises by size class and SIC 2008) and Eurostat structural business statistics (SBS) for 2023.
              </p>
              <p>
                Exact breakdowns require querying the full SBS database (dataset sbs_sc_ovw), which shows concentration in trade and manufacturing for larger firms.
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:100ms]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: "hsl(142, 71%, 45%)" }} />
                Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Larger companies (&gt;250 employees) represent only 0.1% of all Dutch enterprises but account for 39.9% of employment.
              </p>
              <p>
                Sectors like trade and health have higher vacancy rates, indicating growth in larger firms. The numbers have seen slight growth in professional services and health sectors since 2021.
              </p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 animate-fade-in [animation-delay:200ms]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: "hsl(24, 95%, 53%)" }} />
                Context
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                For reference, the Netherlands has about 2 million total companies, with most being micro or small (&lt;50 employees). Sectors with the highest total companies are professional services (21.2%), trade (14.3%), and construction (12.2%). For more granular data or specific sector information, check CBS StatLine or Eurostat directly for the latest 2024/2025 updates.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Overview;
