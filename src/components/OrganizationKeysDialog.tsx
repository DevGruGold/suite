import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnifiedAPIKeyInput } from "./UnifiedAPIKeyInput";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrganizationKeysDialogProps {
    organizationId: string | null;
    organizationName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const OrganizationKeysDialog = ({
    organizationId,
    organizationName,
    open,
    onOpenChange
}: OrganizationKeysDialogProps) => {
    if (!organizationId) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Manage Keys for {organizationName}</DialogTitle>
                    <DialogDescription>
                        Add API keys specific to this organization. These keys will be used when the organization is selected as the active context.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[60vh] pr-4">
                    <Tabs defaultValue="ai" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="ai">AI Providers</TabsTrigger>
                            <TabsTrigger value="dev">Development</TabsTrigger>
                        </TabsList>

                        <TabsContent value="ai" className="space-y-4 pt-4">
                            <UnifiedAPIKeyInput
                                serviceName="openai"
                                serviceLabel="OpenAI"
                                keyPrefix="sk-"
                                helpUrl="https://platform.openai.com/api-keys"
                                organizationId={organizationId}
                            />
                            <UnifiedAPIKeyInput
                                serviceName="anthropic"
                                serviceLabel="Anthropic"
                                keyPrefix="sk-ant"
                                helpUrl="https://console.anthropic.com/settings/keys"
                                organizationId={organizationId}
                            />
                            <UnifiedAPIKeyInput
                                serviceName="google"
                                serviceLabel="Google Gemini"
                                keyPrefix="AIza"
                                helpUrl="https://aistudio.google.com/app/apikey"
                                organizationId={organizationId}
                            />
                            <UnifiedAPIKeyInput
                                serviceName="deepseek"
                                serviceLabel="DeepSeek"
                                keyPrefix="sk-"
                                helpUrl="https://platform.deepseek.com/api_keys"
                                organizationId={organizationId}
                            />
                        </TabsContent>

                        <TabsContent value="dev" className="space-y-4 pt-4">
                            <UnifiedAPIKeyInput
                                serviceName="github"
                                serviceLabel="GitHub"
                                keyPrefix="ghp_"
                                helpUrl="https://github.com/settings/tokens"
                                organizationId={organizationId}
                                description="Personal Access Token (classic) with repo scope."
                            />
                            {/* Add more dev tools here if needed */}
                        </TabsContent>
                    </Tabs>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
