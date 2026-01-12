import { Briefcase, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="font-display font-bold text-xl text-foreground">VisualJobs</span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
              Find Jobs
            </a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">
              Companies
            </a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">
              Salary Guide
            </a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">
              Resources
            </a>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm">Sign In</Button>
            <Button variant="accent" size="sm">Post a Job</Button>
          </div>

          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-fade-in">
            <nav className="flex flex-col gap-4">
              <a href="#" className="text-sm font-medium text-foreground">Find Jobs</a>
              <a href="#" className="text-sm font-medium text-muted-foreground">Companies</a>
              <a href="#" className="text-sm font-medium text-muted-foreground">Salary Guide</a>
              <a href="#" className="text-sm font-medium text-muted-foreground">Resources</a>
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button variant="ghost" size="sm" className="flex-1">Sign In</Button>
                <Button variant="accent" size="sm" className="flex-1">Post a Job</Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
