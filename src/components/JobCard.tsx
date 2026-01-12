import { MapPin, Clock, DollarSign, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface JobCardProps {
  title: string;
  company: string;
  logo: string;
  location: string;
  salary: string;
  type: string;
  posted: string;
  tags: string[];
  featured?: boolean;
}

const JobCard = ({
  title,
  company,
  logo,
  location,
  salary,
  type,
  posted,
  tags,
  featured = false,
}: JobCardProps) => {
  return (
    <div 
      className={`group bg-card rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 border ${
        featured ? 'border-accent/30 ring-1 ring-accent/20' : 'border-transparent hover:border-accent/20'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Company Logo */}
        <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          <img src={logo} alt={company} className="w-10 h-10 object-contain" />
        </div>

        {/* Job Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              {featured && (
                <Badge className="bg-accent/10 text-accent hover:bg-accent/20 mb-2">
                  Featured
                </Badge>
              )}
              <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors truncate">
                {title}
              </h3>
              <p className="text-muted-foreground font-medium">{company}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent flex-shrink-0">
              <Bookmark className="w-5 h-5" />
            </Button>
          </div>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {location}
            </span>
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              {salary}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {posted}
            </span>
          </div>

          {/* Tags & Type */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="rounded-full">
                  {tag}
                </Badge>
              ))}
            </div>
            <Badge 
              variant="outline" 
              className={`rounded-full ${
                type === 'Full-time' ? 'border-accent text-accent' : ''
              }`}
            >
              {type}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCard;
