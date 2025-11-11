import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function NotificationSnooze() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const deviceId = searchParams.get('deviceId');
    const compartmentId = searchParams.get('compartmentId');
    const scheduledAt = searchParams.get('scheduledAt');

    (async () => {
      try {
        if (!deviceId) {
          throw new Error('No device ID provided');
        }

        const { error } = await supabase.functions.invoke('commands-create', {
          body: {
            deviceId,
            type: 'snooze',
            payload: { 
              minutes: 5, 
              compartmentId, 
              scheduledAt 
            },
          },
        });

        if (error) throw error;

        toast({
          title: "Alarma pospuesta",
          description: "La alarma se ha pospuesto 5 minutos",
        });
      } catch (error: any) {
        console.error('Snooze error:', error);
        toast({
          title: "Error",
          description: error.message || "No se pudo posponer la alarma",
          variant: "destructive",
        });
      } finally {
        // Always redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1000);
      }
    })();
  }, [searchParams, navigate, toast]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-lg text-muted-foreground">Posponiendo alarma 5 minutos...</p>
      </div>
    </div>
  );
}
