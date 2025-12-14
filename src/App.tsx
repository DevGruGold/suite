import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AudioProvider } from "@/contexts/AudioContext";
import ProtectedLayout from "@/components/layouts/ProtectedLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Credentials from "./pages/Credentials";
import Council from "./pages/Council";
import Governance from "./pages/Governance";
import Licensing from "./pages/Licensing";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Earn from "./pages/Earn";
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <AudioProvider>
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
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                
                {/* Protected routes - require authentication */}
                <Route element={<ProtectedLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/council" element={<Council />} />
                  <Route path="/earn" element={<Earn />} />
                  <Route path="/governance" element={<Governance />} />
                  <Route path="/licensing" element={<Licensing />} />
                  <Route path="/credentials" element={<Credentials />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/admin" element={<Admin />} />
                  {/* Legacy redirects */}
                  <Route path="/treasury" element={<Earn />} />
                  <Route path="/contributors" element={<Earn />} />
                </Route>
              </Routes>
            </BrowserRouter>
            
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </AudioProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
