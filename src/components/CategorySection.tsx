import { 
  Code, 
  Palette, 
  TrendingUp, 
  Megaphone, 
  Database, 
  Shield, 
  Smartphone, 
  Users 
} from "lucide-react";

const categories = [
  { name: "Development", icon: Code, count: 1234, color: "bg-blue-500/10 text-blue-500" },
  { name: "Design", icon: Palette, count: 567, color: "bg-pink-500/10 text-pink-500" },
  { name: "Finance", icon: TrendingUp, count: 890, color: "bg-green-500/10 text-green-500" },
  { name: "Marketing", icon: Megaphone, count: 432, color: "bg-orange-500/10 text-orange-500" },
  { name: "Data Science", icon: Database, count: 321, color: "bg-purple-500/10 text-purple-500" },
  { name: "Security", icon: Shield, count: 198, color: "bg-red-500/10 text-red-500" },
  { name: "Mobile", icon: Smartphone, count: 456, color: "bg-cyan-500/10 text-cyan-500" },
  { name: "HR", icon: Users, count: 234, color: "bg-amber-500/10 text-amber-500" },
];

const CategorySection = () => {
  return (
    <section className="py-16 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Browse by Category
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore opportunities across various industries and find the perfect match for your skills
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.name}
                className="group p-6 bg-card rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-300 text-left border border-transparent hover:border-accent/20"
              >
                <div className={`w-12 h-12 rounded-xl ${category.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{category.name}</h3>
                <p className="text-sm text-muted-foreground">{category.count.toLocaleString()} jobs</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CategorySection;
