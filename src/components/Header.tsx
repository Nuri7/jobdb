import { Link, useLocation } from "react-router-dom";
import { Bookmark, BriefcaseBusiness, LogIn, LogOut, MapPin, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const navLinkClass = (active: boolean) =>
  `relative flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:-translate-y-0.5 after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:-bottom-1 after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left ${
    active ? "text-primary after:scale-x-100" : "text-muted-foreground"
  }`;

const Header = () => {
  const { pathname } = useLocation();
  const { user, isAdmin, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card">
      <div className="container max-w-7xl flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 hover-scale">
          <BriefcaseBusiness className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg text-foreground">FairJobs</span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <Link to="/vacatures" className={navLinkClass(pathname === "/" || pathname.startsWith("/vacatures"))}>
            <BriefcaseBusiness className="w-4 h-4" /><span className="hidden sm:inline">Vacatures</span>
          </Link>
          <Link to="/kaart" className={navLinkClass(pathname === "/kaart")}>
            <MapPin className="w-4 h-4" /><span className="hidden sm:inline">Kaart</span>
          </Link>
          {user && <Link to="/bewaard" className={navLinkClass(pathname === "/bewaard")}><Bookmark className="w-4 h-4" /><span className="hidden sm:inline">Bewaard</span></Link>}
          {isAdmin && <Link to="/admin" className={navLinkClass(pathname.startsWith("/admin"))}><Settings className="w-4 h-4" /><span className="hidden sm:inline">Beheer</span></Link>}
          {user ? <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Uitloggen</span></Button> : <Button variant="outline" size="sm" asChild><Link to="/inloggen"><LogIn className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Inloggen</span></Link></Button>}
        </nav>
      </div>
    </header>
  );
};

export default Header;
