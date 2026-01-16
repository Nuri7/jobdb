// Industry color mapping for visual distinction across the platform
export const industryColorMap: Record<string, { bg: string; text: string; border: string }> = {
  technology: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  tech: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  software: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  it: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  finance: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  financial: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  banking: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  healthcare: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  health: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  medical: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  retail: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  ecommerce: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  manufacturing: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
  industrial: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
  consulting: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  professional: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  education: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  energy: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  logistics: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  transport: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  media: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
  entertainment: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
  telecom: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  telecommunications: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  insurance: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  legal: { bg: "bg-stone-50", text: "text-stone-700", border: "border-stone-200" },
  hospitality: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200" },
  food: { bg: "bg-lime-50", text: "text-lime-700", border: "border-lime-200" },
};

const defaultColors = { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" };

export const getIndustryColors = (industry: string) => {
  const lowerIndustry = industry.toLowerCase();
  for (const [key, colors] of Object.entries(industryColorMap)) {
    if (lowerIndustry.includes(key)) {
      return colors;
    }
  }
  return defaultColors;
};
