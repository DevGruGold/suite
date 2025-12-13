import { useState } from "react";
import { Menu, X, Home, Users, Coins, Scale, Building2 } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  const toggleMenu = () => setIsOpen(!isOpen);

  const navItems = [
    { to: "/", label: t('nav.home'), icon: Home },
    { to: "/council", label: "Board", icon: Users },
    { to: "/earn", label: "Earn", icon: Coins },
    { to: "/governance", label: "Governance", icon: Scale },
    { to: "/licensing", label: "Enterprise", icon: Building2 },
  ];

  return (
    <div className="relative">
      <div className="fixed top-4 right-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleMenu}
          className="bg-card/90 backdrop-blur-sm border-border/60 shadow-md"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-40 bg-background/98 backdrop-blur-md md:hidden animate-fade-in">
          <nav className="flex flex-col items-center justify-center h-full space-y-6">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 text-lg font-medium text-foreground hover:text-primary transition-colors"
                onClick={toggleMenu}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}