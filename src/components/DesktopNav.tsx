import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Users, Coins, Scale, Building2, Shield, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { InboxModal } from "@/components/InboxModal";
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
  const { isAdmin, user } = useAuth();
  const { t } = useLanguage();
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Initial count
    const fetchCount = async () => {
      const { count } = await supabase
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };
    fetchCount();

    // Subscription
    const channel = supabase
      .channel('inbox-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_messages', filter: `user_id=eq.${user.id}` },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const allNavItems = isAdmin
    ? [...navItems, { to: "/admin", label: "nav.admin", icon: Shield }]
    : navItems;

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

      <div className="ml-2 pl-2 border-l border-border/50">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          onClick={() => setIsInboxOpen(true)}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse ring-2 ring-background" />
          )}
        </Button>
      </div>

      <InboxModal isOpen={isInboxOpen} onOpenChange={setIsInboxOpen} />
    </nav>
  );
};
