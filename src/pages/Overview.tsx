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
import { Building2, Users, Factory, Info } from "lucide-react";

const industryData = [
  { sector: "Wholesale and Retail Trade", medium: 2500, large: 600, total: 3100 },
  { sector: "Manufacturing", medium: 1800, large: 500, total: 2300 },
  { sector: "Human Health and Social Work Activities", medium: 1500, large: 400, total: 1900 },
  { sector: "Administrative and Support Service Activities", medium: 1200, large: 300, total: 1500 },
  { sector: "Professional, Scientific, and Technical Activities", medium: 1000, large: 250, total: 1250 },
  { sector: "Construction", medium: 800, large: 200, total: 1000 },
  { sector: "Information and Communication", medium: 600, large: 150, total: 750 },
  { sector: "Transportation and Storage", medium: 500, large: 100, total: 600 },
  { sector: "Accommodation and Food Services", medium: 400, large: 80, total: 480 },
  { sector: "Other Sectors (Education, Financial Services, Mining, Energy)", medium: 700, large: 48, total: 748 },
];

const totalMedium = industryData.reduce((sum, item) => sum + item.medium, 0);
const totalLarge = industryData.reduce((sum, item) => sum + item.large, 0);
const grandTotal = industryData.reduce((sum, item) => sum + item.total, 0);

const Overview = () => {
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{grandTotal.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Companies with &gt;50 employees</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medium-Sized</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">~{totalMedium.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">50-249 employees</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Large</CardTitle>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLarge.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">250+ employees</p>
            </CardContent>
          </Card>
        </div>

        {/* Industry Breakdown Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Industry Breakdown</CardTitle>
            <CardDescription>
              Distribution of companies by NACE industry sector (2023 estimates)
            </CardDescription>
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
                {industryData.map((row) => (
                  <TableRow key={row.sector}>
                    <TableCell className="font-medium">{row.sector}</TableCell>
                    <TableCell className="text-right">~{row.medium.toLocaleString()}</TableCell>
                    <TableCell className="text-right">~{row.large.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">~{row.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">~{totalMedium.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{totalLarge.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{grandTotal.toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Key Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" />
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" />
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

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" />
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
