import { Link, useLocation } from "react-router-dom";
import { Briefcase, Building2, BarChart3 } from "lucide-react";

const Header = () => {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card">
      <div className="container max-w-7xl flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg text-foreground">JobsNL</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            to="/"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/" ? "text-primary" : "text-muted-foreground"
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
        </nav>
      </div>
    </header>
  );
};

export default Header;
