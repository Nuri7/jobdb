const stats = [
  { value: "10K+", label: "Active Jobs" },
  { value: "5K+", label: "Companies" },
  { value: "50K+", label: "Job Seekers" },
  { value: "15K+", label: "Successful Hires" },
];

const StatsSection = () => {
  return (
    <section className="py-16 bg-background">
      <div className="container">
        <div className="bg-primary rounded-3xl p-8 md:p-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-accent mb-2">
                  {stat.value}
                </div>
                <div className="text-primary-foreground/70 font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
