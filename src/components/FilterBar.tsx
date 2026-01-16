import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Briefcase, GraduationCap, Building2, Factory } from "lucide-react";

interface Company {
  id: string;
  company_name: string;
  is_scrape_enabled?: boolean | null;
}

interface FilterBarProps {
  totalJobs: number;
  location: string;
  onLocationChange: (value: string) => void;
  jobType: string;
  onJobTypeChange: (value: string) => void;
  experienceLevel: string;
  onExperienceLevelChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  industry: string;
  onIndustryChange: (value: string) => void;
  onClearAll: () => void;
  companies?: Company[];
  locations?: string[];
  industries?: string[];
}

const FilterBar = ({
  totalJobs,
  location,
  onLocationChange,
  jobType,
  onJobTypeChange,
  experienceLevel,
  onExperienceLevelChange,
  source,
  onSourceChange,
  industry,
  onIndustryChange,
  onClearAll,
  companies = [],
  locations = [],
  industries = [],
}: FilterBarProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
      <div className="flex flex-wrap items-center gap-3">

        <Select value={location} onValueChange={onLocationChange}>
          <SelectTrigger className="w-[160px] bg-card font-semibold">
            <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
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
          <SelectTrigger className="w-[150px] bg-card font-semibold">
            <Briefcase className="w-4 h-4 mr-2 text-muted-foreground" />
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

        <Select value={experienceLevel} onValueChange={onExperienceLevelChange}>
          <SelectTrigger className="w-[170px] bg-card font-semibold">
            <GraduationCap className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Experience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="bachelor">Bachelor</SelectItem>
            <SelectItem value="bachelor-master">Bachelor/Master</SelectItem>
            <SelectItem value="master">Master</SelectItem>
            <SelectItem value="junior">Junior</SelectItem>
            <SelectItem value="medior">Medior</SelectItem>
            <SelectItem value="senior">Senior</SelectItem>
            <SelectItem value="principal">Principal</SelectItem>
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger className="w-[190px] bg-card font-semibold">
            <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-[300px]">
              <SelectItem value="all">All Companies</SelectItem>
              {companies
                .filter((company) => company.is_scrape_enabled === true)
                .map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.company_name}
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

        <Select value={industry} onValueChange={onIndustryChange}>
          <SelectTrigger className="w-[180px] bg-card font-semibold">
            <Factory className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-[300px]">
              <SelectItem value="all">All Industries</SelectItem>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind.toLowerCase()}>
                  {ind}
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

      </div>
    </div>
  );
};

export default FilterBar;
