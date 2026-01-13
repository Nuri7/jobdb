import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewToggleProps {
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
}

const ViewToggle = ({ view, onViewChange }: ViewToggleProps) => {
  return (
    <div className="flex items-center gap-1 border border-border rounded-lg p-1">
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${view === "grid" ? "bg-orange-500 text-white hover:bg-orange-600 hover:text-white" : ""}`}
        onClick={() => onViewChange("grid")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${view === "list" ? "bg-orange-500 text-white hover:bg-orange-600 hover:text-white" : ""}`}
        onClick={() => onViewChange("list")}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default ViewToggle;
