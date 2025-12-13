import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layouts/AppLayout";
import Contributors from "./pages/Contributors";
import Credentials from "./pages/Credentials";
import Index from "./pages/Index";
import Treasury from "./pages/Treasury";
import Council from "./pages/Council";
import Governance from "./pages/Governance";
import Licensing from "./pages/Licensing";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          {/* Skip Navigation Link for Accessibility */}
          <a 
            href="#main-content" 
            className="skip-link"
            aria-label="Skip to main content"
          >
            Skip to main content
          </a>
          
          <BrowserRouter>
            <Routes>
              {/* Auth page - standalone without layout */}
              <Route path="/auth" element={<Auth />} />
              
              {/* All routes wrapped in AppLayout for persistent header */}
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/council" element={<Council />} />
                <Route path="/treasury" element={<Treasury />} />
                <Route path="/contributors" element={<Contributors />} />
                <Route path="/credentials" element={<Credentials />} />
                <Route path="/governance" element={<Governance />} />
                <Route path="/licensing" element={<Licensing />} />
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Routes>
          </BrowserRouter>
          
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
