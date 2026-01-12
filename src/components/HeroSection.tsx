import { Search, MapPin, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const HeroSection = () => {
  return (
    <section className="bg-hero-gradient relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-accent/50 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 text-accent-foreground text-sm font-medium mb-6">
            <Briefcase className="w-4 h-4" />
            Over 10,000+ jobs available
          </span>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6">
            Find Your Dream Job <br />
            <span className="text-gradient">With Confidence</span>
          </h1>
          
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-10">
            Discover thousands of job opportunities with all the information you need. 
            Your future career starts here.
          </p>

          {/* Search Form */}
          <div className="bg-card rounded-2xl p-3 shadow-card-hover max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="text"
                  placeholder="Job title, keywords, or company"
                  className="pl-12 h-14 border-0 bg-secondary text-foreground placeholder:text-muted-foreground rounded-xl"
                />
              </div>
              <div className="flex-1 relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="text"
                  placeholder="City, state, or remote"
                  className="pl-12 h-14 border-0 bg-secondary text-foreground placeholder:text-muted-foreground rounded-xl"
                />
              </div>
              <Button variant="accent" size="lg" className="h-14 px-8 rounded-xl">
                <Search className="w-5 h-5 mr-2" />
                Search Jobs
              </Button>
            </div>
          </div>

          {/* Popular searches */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <span className="text-primary-foreground/60 text-sm">Popular:</span>
            {["Remote", "Software Engineer", "Designer", "Marketing", "Data Science"].map((term) => (
              <button 
                key={term}
                className="px-3 py-1 rounded-full bg-primary-foreground/10 text-primary-foreground/80 text-sm hover:bg-primary-foreground/20 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
