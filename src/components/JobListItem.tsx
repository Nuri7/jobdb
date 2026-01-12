import { MapPin, Calendar, Heart, Share2, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface JobListItemProps {
  title: string;
  image: string;
  location: string;
  dateRange: string;
  source: string;
  startDate: string;
  onClick?: () => void;
}

const JobListItem = ({ title, image, location, dateRange, source, startDate, onClick }: JobListItemProps) => {
  const hasImage = image && !image.includes("placeholder");

  return (
    <div 
      className="bg-card rounded-lg border border-border hover:shadow-lg transition-shadow duration-200 p-4 flex items-center gap-4 cursor-pointer"
      onClick={onClick}
    >
      {/* Image */}
      <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-muted overflow-hidden">
        {hasImage ? (
          <img 
            src={image} 
            alt={title} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground text-base truncate">
          {title}
        </h3>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{dateRange}</span>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{source}</span>
        <Badge variant="secondary" className="text-xs font-medium">
          {startDate}
        </Badge>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <Heart className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobListItem;
