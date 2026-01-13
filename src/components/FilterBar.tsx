import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Company {
  id: string;
  company_name: string;
}

interface FilterBarProps {
  totalJobs: number;
  location: string;
  onLocationChange: (value: string) => void;
  jobType: string;
  onJobTypeChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  onClearAll: () => void;
  companies?: Company[];
  locations?: string[];
}

const FilterBar = ({
  totalJobs,
  location,
  onLocationChange,
  jobType,
  onJobTypeChange,
  source,
  onSourceChange,
  onClearAll,
  companies = [],
  locations = [],
}: FilterBarProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
      <h2 className="text-xl font-semibold text-foreground">
        {totalJobs.toLocaleString()} Jobs
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={location} onValueChange={onLocationChange}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-[300px]">
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc.toLowerCase()}>
                  {loc}
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

        <Select value={jobType} onValueChange={onJobTypeChange}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full-time">Full-time</SelectItem>
            <SelectItem value="part-time">Part-time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="internship">Internship</SelectItem>
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger className="w-[180px] bg-card">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-[300px]">
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.company_name}
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-muted-foreground">
          Clear all
        </Button>
      </div>
    </div>
  );
};

export default FilterBar;
