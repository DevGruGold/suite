import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
    Bell, Check, Trash2, CheckCheck, Inbox,
    Bot, MessageSquare, AlertTriangle, CheckCircle2,
    Mail, Smartphone, Zap, Filter, RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InboxMessage {
    id: string;
    title: string;
    content: string | null;
    is_read: boolean;
    created_at: string;
    task_id: string | null;
    type: "task_complete" | "task_failed" | "task_blocked" | "agent_message" | "system" | "whatsapp" | "email" | "channel" | null;
    agent_id: string | null;
    agent_name: string | null;
    channel: "internal" | "whatsapp" | "email" | "openclaw" | "system" | null;
    priority: number | null;
    action_url: string | null;
    metadata: Record<string, unknown> | null;
}

type FilterTab = "all" | "unread" | "tasks" | "openclaw" | "system";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMessageIcon(msg: InboxMessage) {
    switch (msg.type) {
        case "task_complete": return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
        case "task_failed":
        case "task_blocked": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
        case "agent_message": return <Bot className="w-4 h-4 text-violet-400" />;
        case "whatsapp": return <Smartphone className="w-4 h-4 text-green-400" />;
        case "email": return <Mail className="w-4 h-4 text-sky-400" />;
        case "channel": return <MessageSquare className="w-4 h-4 text-blue-400" />;
        default: return <Zap className="w-4 h-4 text-primary" />;
    }
}

function getChannelBadge(msg: InboxMessage) {
    const variants: Record<string, string> = {
        openclaw: "bg-orange-500/15 text-orange-300 border-orange-500/30",
        whatsapp: "bg-green-500/15 text-green-300 border-green-500/30",
        email: "bg-sky-500/15 text-sky-300 border-sky-500/30",
        internal: "bg-violet-500/15 text-violet-300 border-violet-500/30",
        system: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    };
    const ch = msg.channel || "internal";
    return (
        <span className={cn("text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border", variants[ch] || variants.internal)}>
            {ch}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InboxPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchMessages = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        const { data } = await supabase
            .from("inbox_messages")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(200);

        if (data) setMessages(data as InboxMessage[]);
        setIsLoading(false);
    }, [user]);

    const refresh = async () => {
        setIsRefreshing(true);
        await fetchMessages();
        setIsRefreshing(false);
    };

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // ── Real-time subscription ─────────────────────────────────────────────────

    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel("inbox-realtime")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "inbox_messages",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    if (payload.eventType === "INSERT") {
                        setMessages((prev) => [payload.new as InboxMessage, ...prev]);
                    } else if (payload.eventType === "UPDATE") {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === payload.new.id ? { ...m, ...(payload.new as InboxMessage) } : m
                            )
                        );
                    } else if (payload.eventType === "DELETE") {
                        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user]);

    // ── Mutations ─────────────────────────────────────────────────────────────

    const markAsRead = async (id: string) => {
        await supabase.from("inbox_messages").update({ is_read: true }).eq("id", id);
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)));
    };

    const markAllAsRead = async () => {
        if (!user) return;
        await supabase
            .from("inbox_messages")
            .update({ is_read: true })
            .eq("user_id", user.id)
            .eq("is_read", false);
        setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    };

    const deleteMessage = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await supabase.from("inbox_messages").delete().eq("id", id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const filtered = messages.filter((m) => {
        if (activeFilter === "unread") return !m.is_read;
        if (activeFilter === "tasks") return m.type === "task_complete" || m.type === "task_failed" || m.type === "task_blocked";
        if (activeFilter === "openclaw") return m.channel === "openclaw";
        if (activeFilter === "system") return m.type === "system" || m.channel === "system";
        return true;
    });

    const unreadCount = messages.filter((m) => !m.is_read).length;

    const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
        { key: "all", label: "All", count: messages.length },
        { key: "unread", label: "Unread", count: unreadCount },
        { key: "tasks", label: "Tasks", count: messages.filter(m => m.type?.startsWith("task")).length },
        { key: "openclaw", label: "OpenClaw", count: messages.filter(m => m.channel === "openclaw").length },
        { key: "system", label: "System", count: messages.filter(m => m.type === "system").length },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-background">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                <Inbox className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
                                <p className="text-sm text-muted-foreground">
                                    {unreadCount > 0
                                        ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
                                        : "All caught up"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={refresh}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                            </Button>
                            {unreadCount > 0 && (
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={markAllAsRead}>
                                    <CheckCheck className="w-3.5 h-3.5" />
                                    Mark all read
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 mt-4 overflow-x-auto no-scrollbar pb-0.5">
                        {filterTabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                                    activeFilter === tab.key
                                        ? "bg-primary/15 text-primary border border-primary/30"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                                )}
                            >
                                <Filter className="w-3 h-3 opacity-60" />
                                {tab.label}
                                {(tab.count ?? 0) > 0 && (
                                    <span className={cn(
                                        "ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-bold",
                                        activeFilter === tab.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                    )}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Message list */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                {isLoading ? (
                    <div className="space-y-3 pt-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-24 rounded-xl border border-border/30 bg-card/40 animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-24 flex flex-col items-center gap-4 text-muted-foreground">
                        <div className="p-5 rounded-2xl bg-muted/30 border border-border/30">
                            <Bell className="w-10 h-10 opacity-20" />
                        </div>
                        <div>
                            <p className="font-medium text-foreground/60">No messages here</p>
                            <p className="text-sm mt-1 opacity-60">
                                {activeFilter === "unread"
                                    ? "You're all caught up — no unread messages."
                                    : "Notifications from your agents will appear here."}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2 pt-1">
                        {filtered.map((msg) => (
                            <div
                                key={msg.id}
                                className={cn(
                                    "group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer",
                                    msg.is_read
                                        ? "bg-card/30 border-border/30 hover:bg-card/60 opacity-70 hover:opacity-100"
                                        : "bg-card border-border shadow-sm hover:shadow-md",
                                    !msg.is_read && msg.priority && msg.priority >= 4
                                        ? "border-l-4 border-l-amber-500"
                                        : !msg.is_read ? "border-l-4 border-l-primary" : ""
                                )}
                                onClick={() => !msg.is_read && markAsRead(msg.id)}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div className={cn(
                                        "mt-0.5 p-2 rounded-lg border flex-shrink-0",
                                        msg.is_read ? "bg-muted/40 border-border/30" : "bg-card border-border"
                                    )}>
                                        {getMessageIcon(msg)}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <h3 className={cn(
                                                "font-medium text-sm leading-snug truncate",
                                                !msg.is_read ? "text-foreground" : "text-foreground/70"
                                            )}>
                                                {msg.title}
                                            </h3>
                                            <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                                            </span>
                                        </div>

                                        {/* Meta badges */}
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            {getChannelBadge(msg)}
                                            {msg.agent_name && (
                                                <span className="text-[9px] text-muted-foreground/70 font-medium flex items-center gap-0.5">
                                                    <Bot className="w-2.5 h-2.5" />
                                                    {msg.agent_name}
                                                </span>
                                            )}
                                            {!msg.is_read && (
                                                <span className="ml-auto w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                            )}
                                        </div>

                                        {msg.content && (
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-wrap">
                                                {msg.content}
                                            </p>
                                        )}

                                        {/* Task link */}
                                        {msg.task_id && (
                                            <button
                                                className="mt-1.5 text-[10px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/dashboard?task=${msg.task_id}`);
                                                }}
                                            >
                                                View task →
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Hover actions */}
                                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!msg.is_read && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                                            title="Mark as read"
                                            onClick={(e) => { e.stopPropagation(); markAsRead(msg.id); }}
                                        >
                                            <Check className="w-3 h-3" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                        title="Delete"
                                        onClick={(e) => deleteMessage(msg.id, e)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
