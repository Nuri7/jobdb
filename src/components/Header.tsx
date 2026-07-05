import { Link, useLocation } from "react-router-dom";
import { Briefcase, TrendingUp, MapPin } from "lucide-react";

const navLinkClass = (active: boolean) =>
  `relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
    active ? "text-primary after:scale-x-100" : "text-muted-foreground"
  }`;

const Header = () => {
  const { pathname } = useLocation();

  return (
    <header className="border-b border-border bg-card">
      <div className="container max-w-7xl flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 hover-scale">
          <TrendingUp className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg text-foreground">MarketNL</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/" className={navLinkClass(pathname === "/" || pathname === "/jobs")}>
            <Briefcase className="w-4 h-4" />
            Jobs
          </Link>
          <Link to="/map" className={navLinkClass(pathname === "/map")}>
            <MapPin className="w-4 h-4" />
            Map
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
