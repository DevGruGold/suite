
import { ActivityPulse } from './ActivityPulse';
import { AgentHierarchy } from '@/components/AgentHierarchy';
import { SystemStatusMonitor } from '@/components/SystemStatusMonitor';
import { useLanguage } from '@/contexts/LanguageContext';

interface DashboardNeuralNetworkProps {
    healthScore: number;
}

export const DashboardNeuralNetwork = ({ healthScore }: DashboardNeuralNetworkProps) => {
    const { t } = useLanguage();

    return (
        <div className="glass-card rounded-xl p-4 space-y-3 ring-2 ring-primary/30 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{t('hero.activity.title')}</h3>
                    <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{t('hero.activity.realtime')}</span>
                </div>
                {/* Dashboard Visualizers */}
                <div className="space-y-6">
                    <AgentHierarchy />
                    <SystemStatusMonitor />
                </div>
            </div>
            <ActivityPulse
                healthScore={healthScore}
                onTaskClick={(taskId) => {
                    // Dispatch custom event to scroll to task in pipeline
                    window.dispatchEvent(new CustomEvent('navigate-to-task', { detail: { taskId } }));
                    console.log('Navigate to task:', taskId);
                }}
                onAgentClick={(agentId) => {
                    // Dispatch custom event to highlight agent
                    window.dispatchEvent(new CustomEvent('highlight-agent', { detail: { agentId } }));
                    console.log('Highlight agent:', agentId);
                }}
            />
        </div>
    );
};
