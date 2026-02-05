import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Check, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface InboxMessage {
    id: string;
    title: string;
    content: string;
    is_read: boolean;
    created_at: string;
    task_id: string | null;
}

interface InboxModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function InboxModal({ isOpen, onOpenChange }: InboxModalProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && user) {
            fetchMessages();
        }
    }, [isOpen, user]);

    const fetchMessages = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('inbox_messages')
            .select('*')
            .eq('user_id', user?.id)
            .order('created_at', { ascending: false });

        if (data) {
            setMessages(data as InboxMessage[]);
        }
        setIsLoading(false);
    };

    const markAsRead = async (id: string) => {
        await supabase
            .from('inbox_messages')
            .update({ is_read: true })
            .eq('id', id);

        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    };

    const markAllAsRead = async () => {
        if (!user) return;
        await supabase
            .from('inbox_messages')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
    }

    const deleteMessage = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await supabase.from('inbox_messages').delete().eq('id', id);
        setMessages(prev => prev.filter(m => m.id !== id));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] md:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                            <Bell className="w-5 h-5 text-primary" />
                            Inbox
                        </DialogTitle>
                        {messages.some(m => !m.is_read) && (
                            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                                Mark all read
                            </Button>
                        )}
                    </div>
                    <DialogDescription>
                        Notifications from your agents and tasks.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6">
                    <div className="space-y-4 pb-6">
                        {isLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading messages...</div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-2">
                                <Bell className="w-8 h-8 opacity-20" />
                                <p>No new messages</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "p-4 rounded-lg border transition-all duration-200 hover:bg-muted/50 relative group cursor-pointer",
                                        msg.is_read ? "bg-background/50 border-border/40 opacity-70" : "bg-card border-border shadow-sm border-l-4 border-l-primary"
                                    )}
                                    onClick={() => !msg.is_read && markAsRead(msg.id)}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className={cn("font-medium text-sm", !msg.is_read && "text-primary")}>
                                            {msg.title}
                                        </h4>
                                        <span className="text-[10px] text-muted-foreground">
                                            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">
                                        {msg.content}
                                    </p>

                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => deleteMessage(msg.id, e)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                        {!msg.is_read && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markAsRead(msg.id);
                                                }}
                                            >
                                                <Check className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
