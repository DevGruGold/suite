import { useState, useEffect } from "react";
import { Menu, X, Home, Users, Coins, Scale, Building2, Shield, Bell } from "lucide-react";
import { Button } from "./ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
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
      .channel("inbox-mobile-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages", filter: `user_id=eq.${user.id}` }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const baseNavItems = [
    { to: "/", label: "nav.home", icon: Home },
    { to: "/council", label: "nav.board", icon: Users },
    { to: "/earn", label: "nav.earn", icon: Coins },
    { to: "/governance", label: "nav.governance", icon: Scale },
    { to: "/licensing", label: "nav.enterprise", icon: Building2 },
  ];

  const navItems = isAdmin
    ? [...baseNavItems, { to: "/admin", label: "nav.admin", icon: Shield }]
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
            {t(item.label)}
          </Link>
        ))}

        {/* Inbox link with unread count */}
        <button
          className="flex items-center gap-3 text-lg font-medium text-foreground hover:text-primary transition-colors"
          onClick={() => { navigate("/inbox"); onClose(); }}
        >
          <div className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          Inbox
          {unreadCount > 0 && (
            <span className="text-sm text-red-400 font-semibold">({unreadCount})</span>
          )}
        </button>
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

