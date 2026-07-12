import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as d3 from "d3";
import { feature } from "topojson-client";
import nldTopo from "@/assets/nld.topo.json"; // bundled locally — avoids a ~1.5s CDN fetch on first paint
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";

type CityRow = { city: string; province: string | null; count: number };
type GeoData = {
  cities: CityRow[];
  provinces: { province: string; count: number }[];
  total: number;
  located: number;
};

const COORDS: Record<string, [number, number]> = {
  amsterdam: [52.3676, 4.9041], rotterdam: [51.9244, 4.4777], utrecht: [52.0907, 5.1214],
  eindhoven: [51.4416, 5.4697], "den haag": [52.0705, 4.3007], breda: [51.5719, 4.7683],
  zwolle: [52.5168, 6.083], groningen: [53.2194, 6.5665], arnhem: [51.9851, 5.8987],
  apeldoorn: [52.2112, 5.9699], amersfoort: [52.1561, 5.3878], zoetermeer: [52.0575, 4.4931],
  tilburg: [51.5555, 5.0913], nijmegen: [51.8126, 5.8372], enschede: [52.2215, 6.8937],
  amstelveen: [52.3114, 4.8701], almere: [52.3508, 5.2647], dordrecht: [51.8133, 4.6901],
  leeuwarden: [53.2012, 5.7999], deventer: [52.2551, 6.1639], leiden: [52.1601, 4.497],
  hilversum: [52.2292, 5.1669], zaandam: [52.4389, 4.8267], alkmaar: [52.6324, 4.7534],
  delft: [52.0116, 4.3571], venlo: [51.3704, 6.1724], haarlem: [52.3874, 4.6462],
  maastricht: [50.8514, 5.691], "den bosch": [51.6978, 5.3037], schiedam: [51.9199, 4.3987],
  hoofddorp: [52.3061, 4.6907], nieuwegein: [52.0292, 5.0806], assen: [52.9959, 6.5642],
  oss: [51.7649, 5.5185], meppel: [52.6957, 6.194], hengelo: [52.2659, 6.793],
  "capelle aan den ijssel": [51.9294, 4.5772], doetinchem: [51.965, 6.288], helmond: [51.4793, 5.657],
  harderwijk: [52.341, 5.6208], zeist: [52.0895, 5.2333], roosendaal: [51.5308, 4.4653],
  ede: [52.0402, 5.6649], emmen: [52.785, 6.8977], houten: [52.0289, 5.1683],
  heerlen: [50.8882, 5.9795], sittard: [51.001, 5.8694], roermond: [51.1942, 5.9871],
  vlissingen: [51.4426, 3.5735], middelburg: [51.4988, 3.6136], veenendaal: [52.0264, 5.5544],
  almelo: [52.3564, 6.6626], gouda: [52.0115, 4.7104], purmerend: [52.505, 4.9592],
  woerden: [52.0857, 4.8836], lelystad: [52.5185, 5.4714], "alphen aan den rijn": [52.1252, 4.6547],
};

const JobsMap = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [hover, setHover] = useState<{ city: string; count: number; x: number; y: number } | null>(null);

  useEffect(() => {
    // rpc name isn't in the generated Supabase types yet
    (supabase as any).rpc("job_geo_counts").then(({ data }: { data: unknown }) =>
      setGeo(data as GeoData)
    );
  }, []);

  useEffect(() => {
    if (!geo || !svgRef.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const landStroke = dark ? "#3a3a34" : "#d9d7cd";
    const bubble = dark ? "#3987e5" : "#2a78d6";
    const bubbleStroke = dark ? "#1a1a19" : "#ffffff";
    const labelCol = dark ? "#f5f5f0" : "#0b0b0b";

    const provCount = new Map(geo.provinces.map((p) => [p.province, p.count]));
    const maxProv = d3.max(geo.provinces, (p) => p.count) || 1;
    const provColor = d3
      .scaleSequential(dark ? (t) => d3.interpolateBlues(0.25 + t * 0.6) : d3.interpolateBlues)
      .domain([0, maxProv]);

    const W = 680, H = 620;
    const svg = d3.select(svgRef.current).attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%");
    svg.selectAll("*").remove();

    const cities = geo.cities.filter((c) => COORDS[c.city]).slice(0, 60);
    const r = d3.scaleSqrt().domain([0, d3.max(cities, (c) => c.count) || 1]).range([2.5, 38]);

    Promise.resolve(nldTopo as any).then((topo) => {
      const feats = (feature(topo, topo.objects.nld) as any).features.filter(
        (f: any) => f.properties.name && !["Saba", "St. Eustatius", "Bonaire"].includes(f.properties.name)
      );
      const proj = d3.geoMercator().fitExtent([[24, 18], [W - 24, H - 18]], { type: "FeatureCollection", features: feats } as any);
      const path = d3.geoPath(proj);

      svg.append("g").selectAll("path").data(feats).join("path")
        .attr("d", path as any)
        .attr("fill", (d: any) => provColor(provCount.get(d.properties.name) || 0))
        .attr("fill-opacity", 0.55)
        .attr("stroke", landStroke).attr("stroke-width", 0.5);

      const g = svg.append("g");
      g.selectAll("circle").data(cities).join("circle")
        .attr("cx", (d) => proj([COORDS[d.city][1], COORDS[d.city][0]])![0])
        .attr("cy", (d) => proj([COORDS[d.city][1], COORDS[d.city][0]])![1])
        .attr("r", (d) => r(d.count))
        .attr("fill", bubble).attr("fill-opacity", 0.62)
        .attr("stroke", bubbleStroke).attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("mousemove", (e, d) => {
          const rect = svgRef.current!.getBoundingClientRect();
          setHover({ city: d.city, count: d.count, x: e.clientX - rect.left, y: e.clientY - rect.top });
        })
        .on("mouseleave", () => setHover(null))
        .on("click", (_e, d) => navigate(`/jobs?location=${encodeURIComponent(d.city)}`));

      const lg = svg.append("g");
      cities.filter((c) => c.count >= 280).forEach((d) => {
        const p = proj([COORDS[d.city][1], COORDS[d.city][0]])!;
        lg.append("text").attr("x", p[0]).attr("y", p[1] - r(d.count) - 3)
          .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 500)
          .attr("fill", labelCol).style("text-transform", "capitalize").style("pointer-events", "none")
          .text(d.city);
      });
    });
  }, [geo, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-7xl py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" /> Jobs by location
          </h1>
          <p className="text-muted-foreground mt-1">
            Open vacancies across the Netherlands — bubble size is job count, click a city to see its jobs.
          </p>
        </div>

        {!geo ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading map…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-4 relative">
                  <svg ref={svgRef} role="img" aria-label="Map of the Netherlands with a bubble per city sized by open jobs" />
                  {hover && (
                    <div
                      className="absolute pointer-events-none bg-popover border rounded-md px-2 py-1 text-sm shadow-sm capitalize"
                      style={{ left: hover.x + 12, top: hover.y - 6, zIndex: 5 }}
                    >
                      <span className="font-medium">{hover.city}</span> · {hover.count.toLocaleString()} jobs
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Located jobs</div>
                  <div className="text-2xl font-medium">{geo.located.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Cities</div>
                  <div className="text-2xl font-medium">{geo.cities.length.toLocaleString()}</div>
                </div>
              </div>
              <Card>
                <CardContent className="p-0 max-h-[520px] overflow-auto">
                  {geo.cities.slice(0, 40).map((c, i) => (
                    <button
                      key={c.city}
                      onClick={() => navigate(`/jobs?location=${encodeURIComponent(c.city)}`)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 text-left border-b last:border-b-0"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                        <span className="capitalize truncate">{c.city}</span>
                        {c.province && <span className="text-xs text-muted-foreground truncate">{c.province}</span>}
                      </span>
                      <span className="font-medium tabular-nums">{c.count.toLocaleString()}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobsMap;
