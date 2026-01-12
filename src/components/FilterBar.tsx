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
  startDate: string;
  onStartDateChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  onClearAll: () => void;
  companies?: Company[];
}

const FilterBar = ({
  totalJobs,
  location,
  onLocationChange,
  startDate,
  onStartDateChange,
  source,
  onSourceChange,
  onClearAll,
  companies = [],
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
            <SelectItem value="all">All Locations</SelectItem>
            <SelectItem value="amsterdam">Amsterdam</SelectItem>
            <SelectItem value="utrecht">Utrecht</SelectItem>
            <SelectItem value="rotterdam">Rotterdam</SelectItem>
            <SelectItem value="eindhoven">Eindhoven</SelectItem>
            <SelectItem value="the hague">The Hague</SelectItem>
          </SelectContent>
        </Select>

        <Select value={startDate} onValueChange={onStartDateChange}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full-time">Full-time</SelectItem>
            <SelectItem value="part-time">Part-time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
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
