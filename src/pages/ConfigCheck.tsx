import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerPush, isPushEnabled } from "@/lib/push-notifications";
import { useToast } from "@/hooks/use-toast";

type HealthData = {
  ok: boolean;
  hasVapidPublic: boolean;
  hasVapidPrivate: boolean;
  hasReportsBucket: boolean;
  pushSubsCount?: number;
  devicesCount?: number;
};

export default function ConfigCheck() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [swState, setSwState] = useState<string>("");
  const [hasPushManager, setHasPushManager] = useState(false);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>("default");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [processing, setProcessing] = useState(false);

  const vapidPublic = (import.meta.env.VITE_VAPID_PUBLIC as string) || "";
  const hasVapidFrontend = vapidPublic && vapidPublic !== "TU_CLAVE_PUBLICA_VAPID_AQUI";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Check Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          setSwState(reg.active ? 'activated' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered');
        } else {
          setSwState('not_registered');
        }
      } catch (e) {
        setSwState('error');
      }
    } else {
      setSwState('not_available');
    }

    // Check PushManager
    setHasPushManager('PushManager' in window);

    // Check notification permission
    if ('Notification' in window) {
      setNotificationPerm(Notification.permission);
    }

    // Check existing subscription
    const pushEnabled = await isPushEnabled();
    setHasSubscription(pushEnabled);

    // Get health data from server
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health`,
        { headers }
      );
      const data = await response.json();
      setHealth(data);
    } catch (e) {
      console.error('Error loading health:', e);
    }

    setLoading(false);
  };

  const handleActivateNotifications = async () => {
    if (!hasVapidFrontend) {
      toast({
        title: "Error",
        description: "VITE_VAPID_PUBLIC no está configurada correctamente",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const sub = await registerPush();
      if (sub) {
        toast({
          title: "Éxito",
          description: "Notificaciones activadas correctamente",
        });
        await loadData();
      } else {
        toast({
          title: "Error",
          description: "No se pudo activar las notificaciones",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleResubscribe = async () => {
    setProcessing(true);
    try {
      if ('serviceWorker' in navigator) {
        // No esperes a serviceWorker.ready: usa getRegistration o registra si no existe
        let reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js');
        }
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          try { await existingSub.unsubscribe(); } catch (_) {}
        }
      }
      
      const sub = await registerPush();
      if (sub) {
        toast({
          title: "Éxito",
          description: "Re-suscripción completada",
        });
        await loadData();
      } else {
        toast({
          title: "Error",
          description: "No se pudo completar la re-suscripción",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSelfTest = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-self-test', {
        body: {},
      });

      if (error) throw error;

      toast({
        title: "Prueba enviada",
        description: `Enviadas: ${data.sent}, Eliminadas: ${data.removed}`,
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const CheckItem = ({ label, status, detail }: { label: string; status: boolean; detail?: string }) => (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
      {status ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {detail && <div className="text-xs text-muted-foreground mt-1 break-all">{detail}</div>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dev/quickstart')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Verificador de Configuración</h1>
            <p className="text-muted-foreground">Estado completo de Web Push y reportes</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={loadData}
            disabled={loading}
            className="ml-auto"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {!hasVapidFrontend && (
          <Alert variant="destructive">
            <AlertDescription>
              <strong>VITE_VAPID_PUBLIC no está configurada.</strong> Ve a Settings → Environment → Frontend vars y agrega VITE_VAPID_PUBLIC con tu clave pública VAPID.
            </AlertDescription>
          </Alert>
        )}

        {health && !health.hasReportsBucket && (
          <Alert>
            <AlertDescription>
              <strong>Bucket 'reports' no existe.</strong> Ejecuta este SQL en tu base de datos:
              <code className="block mt-2 p-2 bg-muted rounded text-xs">
                select storage.create_bucket('reports', public := false, file_size_limit := 26214400);
              </code>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Frontend (Cliente)</CardTitle>
              <CardDescription>Configuración del navegador</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CheckItem
                label="VITE_VAPID_PUBLIC configurada"
                status={hasVapidFrontend}
                detail={hasVapidFrontend ? `${vapidPublic.substring(0, 10)}...` : "No configurada o es placeholder"}
              />
              <CheckItem
                label="Service Worker disponible"
                status={'serviceWorker' in navigator}
                detail={swState}
              />
              <CheckItem
                label="PushManager disponible"
                status={hasPushManager}
              />
              <CheckItem
                label="Permiso de notificación"
                status={notificationPerm === 'granted'}
                detail={notificationPerm}
              />
              <CheckItem
                label="Suscripción activa"
                status={hasSubscription}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backend (Servidor)</CardTitle>
              <CardDescription>Configuración de Edge Functions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {health ? (
                <>
                  <CheckItem
                    label="VAPID_PUBLIC (servidor)"
                    status={health.hasVapidPublic}
                  />
                  <CheckItem
                    label="VAPID_PRIVATE (servidor)"
                    status={health.hasVapidPrivate}
                  />
                  <CheckItem
                    label="Bucket 'reports' existe"
                    status={health.hasReportsBucket}
                  />
                  {health.pushSubsCount !== undefined && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="font-medium text-sm">Suscripciones push</div>
                      <Badge variant="secondary" className="mt-2">{health.pushSubsCount}</Badge>
                    </div>
                  )}
                  {health.devicesCount !== undefined && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="font-medium text-sm">Dispositivos registrados</div>
                      <Badge variant="secondary" className="mt-2">{health.devicesCount}</Badge>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Cargando datos del servidor...</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
            <CardDescription>Pruebas y configuración de notificaciones</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              onClick={handleActivateNotifications}
              disabled={processing || !hasVapidFrontend || hasSubscription}
            >
              Activar notificaciones
            </Button>
            <Button
              variant="outline"
              onClick={handleResubscribe}
              disabled={processing || !hasVapidFrontend}
            >
              Re-suscribirme
            </Button>
            <Button
              variant="secondary"
              onClick={handleSelfTest}
              disabled={processing || !hasSubscription}
            >
              Notificación de prueba (self)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
