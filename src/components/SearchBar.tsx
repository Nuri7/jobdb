import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

const SearchBar = ({ value, onChange }: SearchBarProps) => {
  return (
    <div className="relative max-w-md">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search job titles..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-12 h-12 text-base rounded-lg border-border bg-card"
      />
    </div>
  );
};

export default SearchBar;
