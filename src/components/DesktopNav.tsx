import { NavLink, useLocation } from "react-router-dom";
import { Home, Users, Coins, Scale, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/council", label: "Board", icon: Users },
  { to: "/earn", label: "Earn", icon: Coins },
  { to: "/governance", label: "Governance", icon: Scale },
  { to: "/licensing", label: "Enterprise", icon: Building2 },
];

export const DesktopNav = () => {
  const location = useLocation();

  return (
    <nav className="hidden md:flex items-center gap-1">
      {navItems.map((item) => {
        const isActive = location.pathname === item.to;
        const Icon = item.icon;
        
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};