import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Map from "./pages/Map";
import Api from "./pages/Api";
import Features from "./pages/Features";
import NotFound from "./pages/NotFound";
import { usePWAAnalytics } from "./hooks/usePWAAnalytics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch the whole app every time the window regains focus —
      // job data changes at most daily. Focus refetch caused a full spinner on every tab switch.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 min: treat data as fresh, serve from cache on remount
      gcTime: 30 * 60 * 1000,
      retry: 1,
    },
  },
});

const PWAAnalyticsWrapper = ({ children }: { children: React.ReactNode }) => {
  usePWAAnalytics();
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PWAAnalyticsWrapper>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Map />} />
            <Route path="/jobs" element={<Index />} />
            <Route path="/map" element={<Map />} />
            <Route path="/api" element={<Api />} />
            <Route path="/features" element={<Features />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PWAAnalyticsWrapper>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
