import JobCard from "./JobCard";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const jobs = [
  {
    title: "Senior Frontend Developer",
    company: "TechCorp Inc.",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=techcorp",
    location: "San Francisco, CA",
    salary: "$120k - $150k",
    type: "Full-time",
    posted: "2 hours ago",
    tags: ["React", "TypeScript", "Tailwind"],
    featured: true,
  },
  {
    title: "Product Designer",
    company: "DesignHub",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=designhub",
    location: "Remote",
    salary: "$90k - $120k",
    type: "Full-time",
    posted: "5 hours ago",
    tags: ["Figma", "UI/UX", "Prototyping"],
    featured: true,
  },
  {
    title: "Data Scientist",
    company: "DataFlow",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=dataflow",
    location: "New York, NY",
    salary: "$130k - $160k",
    type: "Full-time",
    posted: "1 day ago",
    tags: ["Python", "ML", "TensorFlow"],
  },
  {
    title: "DevOps Engineer",
    company: "CloudScale",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=cloudscale",
    location: "Austin, TX",
    salary: "$110k - $140k",
    type: "Full-time",
    posted: "1 day ago",
    tags: ["AWS", "Kubernetes", "Docker"],
  },
  {
    title: "Marketing Manager",
    company: "GrowthLabs",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=growthlabs",
    location: "Chicago, IL",
    salary: "$85k - $110k",
    type: "Full-time",
    posted: "2 days ago",
    tags: ["SEO", "Analytics", "Content"],
  },
  {
    title: "Mobile Developer",
    company: "AppWorks",
    logo: "https://api.dicebear.com/7.x/shapes/svg?seed=appworks",
    location: "Remote",
    salary: "$100k - $130k",
    type: "Contract",
    posted: "3 days ago",
    tags: ["React Native", "iOS", "Android"],
  },
];

const JobListSection = () => {
  return (
    <section className="py-16 bg-secondary/50">
      <div className="container">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Featured Jobs
            </h2>
            <p className="text-muted-foreground text-lg">
              Handpicked opportunities from top companies
            </p>
          </div>
          <Button variant="outline" className="hidden md:flex items-center gap-2">
            View All Jobs
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {jobs.map((job, index) => (
            <div 
              key={index} 
              className="animate-fade-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <JobCard {...job} />
            </div>
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Button variant="outline" className="w-full">
            View All Jobs
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default JobListSection;
