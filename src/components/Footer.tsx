import { Briefcase, Twitter, Linkedin, Github } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <a href="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-accent-foreground" />
              </div>
              <span className="font-display font-bold text-xl">VisualJobs</span>
            </a>
            <p className="text-primary-foreground/70 max-w-xs mb-6">
              Connecting talented professionals with amazing companies worldwide.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4">For Job Seekers</h4>
            <ul className="space-y-3 text-primary-foreground/70">
              <li><a href="#" className="hover:text-accent transition-colors">Browse Jobs</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Companies</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Salary Guide</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Career Advice</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">For Employers</h4>
            <ul className="space-y-3 text-primary-foreground/70">
              <li><a href="#" className="hover:text-accent transition-colors">Post a Job</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Talent Search</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Employer Branding</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-3 text-primary-foreground/70">
              <li><a href="#" className="hover:text-accent transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-accent transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-primary-foreground/10">
        <div className="container py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-primary-foreground/60">
            © 2025 VisualJobs. All rights reserved.
          </p>
          <p className="text-sm text-primary-foreground/60">
            Made with ❤️ for job seekers everywhere
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
