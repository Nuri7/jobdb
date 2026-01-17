import { Link, useLocation } from "react-router-dom";
import { Briefcase, Building2, BarChart3, Settings, Code, PieChart, TrendingUp } from "lucide-react";

const Header = () => {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card">
      <div className="container max-w-7xl flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg text-foreground">MarketNL</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            to="/"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <PieChart className="w-4 h-4" />
            Overview
          </Link>
          <Link
            to="/jobs"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/jobs" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Jobs
          </Link>
          <Link
            to="/companies"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/companies" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Companies
          </Link>
          <Link
            to="/dashboard"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/dashboard" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            to="/api"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/api" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Code className="w-4 h-4" />
            API
          </Link>
          <Link
            to="/settings"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/settings" ? "text-primary" : "text-muted-foreground"
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
