import { Link, useLocation } from "react-router-dom";
import { Briefcase, BarChart3, Settings, Code, PieChart, TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const Header = () => {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card">
      <div className="container max-w-7xl flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 hover-scale">
          <TrendingUp className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg text-foreground">MarketNL</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            to="/"
            className={`relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
              location.pathname === "/" ? "text-primary after:scale-x-100" : "text-muted-foreground"
            }`}
          >
            <PieChart className="w-4 h-4" />
            Overview
          </Link>
          <Link
            to="/jobs"
            className={`relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
              location.pathname === "/jobs" ? "text-primary after:scale-x-100" : "text-muted-foreground"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Jobs
          </Link>
          <Link
            to="/dashboard"
            className={`relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
              location.pathname === "/dashboard" ? "text-primary after:scale-x-100" : "text-muted-foreground"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </Link>
          
          <Separator orientation="vertical" className="h-5" />
          
          <Link
            to="/api"
            className={`relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
              location.pathname === "/api" ? "text-primary after:scale-x-100" : "text-muted-foreground"
            }`}
          >
            <Code className="w-4 h-4" />
            API
          </Link>
          <Link
            to="/settings"
            className={`relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
              location.pathname === "/settings" ? "text-primary after:scale-x-100" : "text-muted-foreground"
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
