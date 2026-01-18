import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Companies from "./pages/Companies";
import Dashboard from "./pages/Dashboard";
import Api from "./pages/Api";
import Settings from "./pages/Settings";
import Overview from "./pages/Overview";
import Features from "./pages/Features";
import NotFound from "./pages/NotFound";
import { usePWAAnalytics } from "./hooks/usePWAAnalytics";

const queryClient = new QueryClient();

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
            <Route path="/" element={<Overview />} />
            <Route path="/jobs" element={<Index />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/api" element={<Api />} />
            <Route path="/settings" element={<Settings />} />
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
