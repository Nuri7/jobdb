import { MapPin, Calendar, Heart, Share2, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface JobCardProps {
  title: string;
  image: string;
  location: string;
  dateRange: string;
  source: string;
  startDate: string;
}

const JobCard = ({ title, image, location, dateRange, source, startDate }: JobCardProps) => {
  const hasImage = image && !image.includes("placeholder");

  return (
    <div className="bg-card rounded-lg overflow-hidden border border-border hover:shadow-lg transition-shadow duration-200">
      {/* Image */}
      <div className="aspect-square relative bg-muted">
        {hasImage ? (
          <img 
            src={image} 
            alt={title} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Briefcase className="w-16 h-16 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Actions */}
        <div className="flex justify-end gap-2 mb-2">
          <button className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <Heart className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-foreground text-base mb-3 line-clamp-2 min-h-[48px]">
          {title}
        </h3>

        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{location}</span>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>{dateRange}</span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">{source}</span>
          <Badge variant="secondary" className="text-xs font-medium">
            {startDate}
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default JobCard;
