import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePWAAnalytics } from "./hooks/usePWAAnalytics";
import { AuthProvider } from "./hooks/useAuth";
import AdminRoute from "./components/AdminRoute";

const Jobs = lazy(() => import("./pages/Jobs"));
const Map = lazy(() => import("./pages/Map"));
const Admin = lazy(() => import("./pages/Index"));
const Api = lazy(() => import("./pages/Api"));
const Features = lazy(() => import("./pages/Features"));
const Auth = lazy(() => import("./pages/Auth"));
const Saved = lazy(() => import("./pages/Saved"));
const VacancyDetail = lazy(() => import("./pages/VacancyDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
    },
  },
});

function AppShell() {
  usePWAAnalytics();
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}>
        <Routes>
          <Route path="/" element={<Jobs />} />
          <Route path="/vacatures" element={<Jobs />} />
          <Route path="/jobs" element={<Navigate to="/vacatures" replace />} />
          <Route path="/vacatures/:slug" element={<VacancyDetail />} />
          <Route path="/kaart" element={<Map />} />
          <Route path="/map" element={<Navigate to="/kaart" replace />} />
          <Route path="/bewaard" element={<Saved />} />
          <Route path="/inloggen" element={<Auth />} />
          <Route path="/features" element={<Features />} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/admin/api" element={<AdminRoute><Api /></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <AppShell />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
