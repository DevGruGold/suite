import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Landing page for Supabase OAuth redirects.
 * Supabase appends the token as a URL hash fragment (e.g. #access_token=...).
 * We let the Supabase client parse that fragment, then navigate to /dashboard.
 */
export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        // Give the Supabase client a moment to parse the hash and set the session,
        // then navigate to dashboard regardless of outcome.
        const handle = async () => {
            // getSession triggers the client to read and store any hash-based token
            await supabase.auth.getSession();
            navigate('/dashboard', { replace: true });
        };

        handle();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">Signing you in…</p>
            </div>
        </div>
    );
}
