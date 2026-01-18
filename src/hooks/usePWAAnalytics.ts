import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SESSION_ID_KEY = 'pwa_session_id';

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function isPWA(): boolean {
  // Check if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIOSStandalone = (window.navigator as any).standalone === true;
  return isStandalone || isIOSStandalone;
}

async function logEvent(eventType: string, isPwaMode: boolean) {
  const sessionId = getOrCreateSessionId();
  
  try {
    await supabase.from('pwa_analytics').insert({
      session_id: sessionId,
      is_pwa: isPwaMode,
      event_type: eventType,
      user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.error('Failed to log PWA analytics event:', error);
  }
}

export function usePWAAnalytics() {
  const hasLoggedSession = useRef(false);

  useEffect(() => {
    // Only log once per session
    if (hasLoggedSession.current) return;
    hasLoggedSession.current = true;

    const isPwaMode = isPWA();
    
    // Log session start
    logEvent('session_start', isPwaMode);

    // Listen for install prompt
    const handleBeforeInstallPrompt = () => {
      logEvent('install_prompt_shown', false);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      logEvent('installed', true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
}
