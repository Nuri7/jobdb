import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterBarProps {
  totalEvents: number;
  location: string;
  onLocationChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  onClearAll: () => void;
}

const FilterBar = ({
  totalEvents,
  location,
  onLocationChange,
  startDate,
  onStartDateChange,
  source,
  onSourceChange,
  onClearAll,
}: FilterBarProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
      <h2 className="text-xl font-semibold text-foreground">
        {totalEvents.toLocaleString()} Events
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
            <SelectItem value="netherlands">Netherlands</SelectItem>
          </SelectContent>
        </Select>

        <Select value={startDate} onValueChange={onStartDateChange}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue placeholder="Start Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="next-month">Next Month</SelectItem>
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="songkick">Song Kick</SelectItem>
            <SelectItem value="festivalinfo">Festival Info</SelectItem>
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
