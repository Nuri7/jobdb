import { useState } from "react";
import SearchBar from "@/components/SearchBar";
import FilterBar from "@/components/FilterBar";
import EventCard from "@/components/EventCard";
import Pagination from "@/components/Pagination";

const mockEvents = [
  {
    id: 1,
    title: "Eurosonic Noorderslag (ESNS)",
    image: "https://cdn.gic.nl/app/uploads/2023/04/08140430/e37113d5-1e50-5163-9c49-cfca848de086-scaled.jpg",
    location: "Nederland",
    dateRange: "January 13 to December 31",
    source: "Festival Info",
    startDate: "January 13",
  },
  {
    id: 2,
    title: "The Dirty Daddies",
    image: "https://patronaat.nl/app/uploads/2023/02/thedirtydaddies-sinnersarewinnerstour-haarlem-4x5-1-e1679145700652-720x720.jpg",
    location: "Utrecht, Netherlands",
    dateRange: "January 15 to January 15",
    source: "Song Kick",
    startDate: "January 15",
  },
  {
    id: 3,
    title: "Meis",
    image: "",
    location: "Amsterdam, Netherlands",
    dateRange: "January 16 to January 16",
    source: "Song Kick",
    startDate: "January 16",
  },
  {
    id: 4,
    title: "Buena Vista Orchestra",
    image: "",
    location: "Utrecht, Netherlands",
    dateRange: "January 17 to January 17",
    source: "Song Kick",
    startDate: "January 17",
  },
  {
    id: 5,
    title: "Liszt Utrecht",
    image: "https://www.tivolivredenburg.nl/wp-content/uploads/2022/03/Liszt-Utrecht-Webbeeld-5.jpg",
    location: "Nederland",
    dateRange: "January 17 to December 31",
    source: "Festival Info",
    startDate: "January 17",
  },
  {
    id: 6,
    title: "Ruben Hein",
    image: "https://www.spotgroningen.nl/wp-content/uploads/2024/07/P.S.-ft-Matangi-Ruben-Hein-Frank-Ruiter-1-scaled-e1720101139634.jpg",
    location: "Aartswoud, Netherlands",
    dateRange: "January 17 to January 17",
    source: "Song Kick",
    startDate: "January 17",
  },
  {
    id: 7,
    title: "DeWolff",
    image: "https://en.concerts-metal.com/images/flyers/202312/1701682957--DeWolff---Tour-2024.jpg",
    location: "Amsterdam, Netherlands",
    dateRange: "January 20 to January 20",
    source: "Song Kick",
    startDate: "January 20",
  },
  {
    id: 8,
    title: "Benjamin Amaru",
    image: "",
    location: "Amsterdam, Netherlands",
    dateRange: "January 23 to January 23",
    source: "Song Kick",
    startDate: "January 23",
  },
  {
    id: 9,
    title: "Frans Pollux",
    image: "https://ziggodome.nl/_next/image/?url=https%3A%2F%2Fcdn.ziggodome.nl%2Fassets%2Fimages%2Fevent%2Fbackground%2F1737370274670-franslexwebsite.jpg&w=3840&q=85",
    location: "Amsterdam, Netherlands",
    dateRange: "January 24 to January 24",
    source: "Song Kick",
    startDate: "January 24",
  },
  {
    id: 10,
    title: "Fabrizio Paterlini",
    image: "https://yabangee.com/wp-content/uploads/Fabrizio_Paterlini.jpg",
    location: "Utrecht, Netherlands",
    dateRange: "January 27 to January 27",
    source: "Song Kick",
    startDate: "January 27",
  },
  {
    id: 11,
    title: "Amsterdam Music Festival",
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
    location: "Amsterdam, Netherlands",
    dateRange: "February 1 to February 3",
    source: "Festival Info",
    startDate: "February 1",
  },
  {
    id: 12,
    title: "Rotterdam Jazz Days",
    image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800",
    location: "Rotterdam, Netherlands",
    dateRange: "February 5 to February 7",
    source: "Festival Info",
    startDate: "February 5",
  },
];

const Index = () => {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("all");
  const [startDate, setStartDate] = useState("all");
  const [source, setSource] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const handleClearAll = () => {
    setLocation("all");
    setStartDate("all");
    setSource("all");
  };

  const filteredEvents = mockEvents.filter((event) => {
    if (search && !event.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const totalPages = 353;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-8">
        {/* Search */}
        <div className="mb-6">
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {/* Filters */}
        <FilterBar
          totalEvents={4234}
          location={location}
          onLocationChange={setLocation}
          startDate={startDate}
          onStartDateChange={setStartDate}
          source={source}
          onSourceChange={setSource}
          onClearAll={handleClearAll}
        />

        {/* Events Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              title={event.title}
              image={event.image}
              location={event.location}
              dateRange={event.dateRange}
              source={event.source}
              startDate={event.startDate}
            />
          ))}
        </div>

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
