import { useState } from "react";
import SearchBar from "@/components/SearchBar";
import FilterBar from "@/components/FilterBar";
import JobCard from "@/components/JobCard";
import JobListItem from "@/components/JobListItem";
import ViewToggle from "@/components/ViewToggle";
import Pagination from "@/components/Pagination";

const mockJobs = [
  {
    id: 1,
    title: "Senior Frontend Developer",
    image: "",
    location: "Amsterdam, Netherlands",
    dateRange: "Full-time",
    source: "LinkedIn",
    startDate: "Immediate",
  },
  {
    id: 2,
    title: "Backend Engineer",
    image: "",
    location: "Utrecht, Netherlands",
    dateRange: "Full-time",
    source: "Indeed",
    startDate: "January 15",
  },
  {
    id: 3,
    title: "DevOps Engineer",
    image: "",
    location: "Rotterdam, Netherlands",
    dateRange: "Full-time",
    source: "LinkedIn",
    startDate: "January 20",
  },
  {
    id: 4,
    title: "Product Manager",
    image: "",
    location: "Amsterdam, Netherlands",
    dateRange: "Full-time",
    source: "Glassdoor",
    startDate: "February 1",
  },
  {
    id: 5,
    title: "UX Designer",
    image: "",
    location: "The Hague, Netherlands",
    dateRange: "Full-time",
    source: "Indeed",
    startDate: "January 25",
  },
  {
    id: 6,
    title: "Data Scientist",
    image: "",
    location: "Eindhoven, Netherlands",
    dateRange: "Full-time",
    source: "LinkedIn",
    startDate: "February 10",
  },
  {
    id: 7,
    title: "Full Stack Developer",
    image: "",
    location: "Amsterdam, Netherlands",
    dateRange: "Full-time",
    source: "Indeed",
    startDate: "January 30",
  },
  {
    id: 8,
    title: "Mobile Developer",
    image: "",
    location: "Utrecht, Netherlands",
    dateRange: "Contract",
    source: "Glassdoor",
    startDate: "February 5",
  },
];

const Index = () => {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("all");
  const [startDate, setStartDate] = useState("all");
  const [source, setSource] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);

  const handleClearAll = () => {
    setLocation("all");
    setStartDate("all");
    setSource("all");
  };

  const filteredJobs = mockJobs.filter((job) => {
    if (search && !job.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const totalPages = 50;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-8">
        {/* Search */}
        <div className="mb-6">
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4">
          <FilterBar
            totalJobs={1250}
            location={location}
            onLocationChange={setLocation}
            startDate={startDate}
            onStartDateChange={setStartDate}
            source={source}
            onSourceChange={setSource}
            onClearAll={handleClearAll}
          />
          <ViewToggle view={view} onViewChange={setView} />
        </div>

        {/* Jobs Grid/List */}
        {view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                title={job.title}
                image={job.image}
                location={job.location}
                dateRange={job.dateRange}
                source={job.source}
                startDate={job.startDate}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-6">
            {filteredJobs.map((job) => (
              <JobListItem
                key={job.id}
                title={job.title}
                image={job.image}
                location={job.location}
                dateRange={job.dateRange}
                source={job.source}
                startDate={job.startDate}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
};

export default Index;
