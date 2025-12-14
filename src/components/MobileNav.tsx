import { useState } from "react";
import { Menu, X, Home, Users, Coins, Scale, Building2, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface MobileNavTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function MobileNavTrigger({ isOpen, onToggle }: MobileNavTriggerProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      className="bg-card/90 backdrop-blur-sm border-border/60 shadow-md"
    >
      {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </Button>
  );
}

interface MobileNavOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNavOverlay({ isOpen, onClose }: MobileNavOverlayProps) {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  const baseNavItems = [
    { to: "/", label: t('nav.home'), icon: Home },
    { to: "/council", label: "Board", icon: Users },
    { to: "/earn", label: "Earn", icon: Coins },
    { to: "/governance", label: "Governance", icon: Scale },
    { to: "/licensing", label: "Enterprise", icon: Building2 },
  ];

  const navItems = isAdmin
    ? [...baseNavItems, { to: "/admin", label: "Admin", icon: Shield }]
    : baseNavItems;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-background/98 backdrop-blur-md md:hidden animate-fade-in">
      <nav className="flex flex-col items-center justify-center h-full space-y-6">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 text-lg font-medium text-foreground hover:text-primary transition-colors"
            onClick={onClose}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// Legacy component for backwards compatibility
export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <MobileNavTrigger isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      </div>
      <MobileNavOverlay isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
