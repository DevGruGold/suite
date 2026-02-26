import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Coins, Scale, Building2, Shield, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "nav.home", icon: Home },
  { to: "/council", label: "nav.board", icon: Users },
  { to: "/earn", label: "nav.earn", icon: Coins },
  { to: "/governance", label: "nav.governance", icon: Scale },
  { to: "/licensing", label: "nav.enterprise", icon: Building2 },
];

export const DesktopNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchCount = async () => {
      const { count } = await supabase
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      setUnreadCount(count || 0);
    };
    fetchCount();

    const channel = supabase
      .channel("inbox-nav-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_messages", filter: `user_id=eq.${user.id}` },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const allNavItems = isAdmin
    ? [...navItems, { to: "/admin", label: "nav.admin", icon: Shield }]
    : navItems;

  const isInboxActive = location.pathname === "/inbox";

  return (
    <nav className="hidden md:flex items-center gap-1">
      {allNavItems.map((item) => {
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
            <span>{t(item.label)}</span>
          </NavLink>
        );
      })}

      {/* Inbox bell — navigates to /inbox page */}
      <div className="ml-2 pl-2 border-l border-border/50">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-8 w-8 transition-colors",
            isInboxActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => navigate("/inbox")}
          title="Inbox"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
};
