import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, XCircle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type HealthStatus = {
  ok: boolean;
  hasVapidPublic: boolean;
  hasVapidPrivate: boolean;
  hasReportsBucket: boolean;
};

export default function DevQuickstart() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [compartments, setCompartments] = useState<any[]>([]);
  const [pushSubs, setPushSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Check health endpoint
      const { data: healthData } = await supabase.functions.invoke('health');
      setHealth(healthData);

      // Load devices
      const { data: devData } = await supabase.from('devices').select('id, name, serial, timezone, created_at, user_id').order('created_at');
      setDevices(devData || []);

      // Load compartments if devices exist
      if (devData && devData.length > 0) {
        const { data: compData } = await supabase
          .from('compartments')
          .select('*')
          .eq('device_id', devData[0].id)
          .order('idx');
        setCompartments(compData || []);
      }

      // Load push subscriptions
      const { data: pushData } = await supabase.from('push_subscriptions').select('*');
      setPushSubs(pushData || []);
    } catch (error) {
      console.error('Error loading quickstart data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `Comando ${label} copiado al portapapeles`,
    });
  };

  const hasVapidPublic = !!import.meta.env.VITE_VAPID_PUBLIC;
  const hasReportsBucket = health?.hasReportsBucket ?? false;
  const hasServerVapid = health?.hasVapidPublic && health?.hasVapidPrivate;
  const hasDevice = devices.length > 0;
  const hasPushSub = pushSubs.length > 0;

  const deviceId = devices[0]?.id || 'YOUR_DEVICE_ID';
  const deviceSerial = devices[0]?.serial || 'RPI-12345';
  const deviceSecret = 'YOUR_DEVICE_SECRET'; // Never expose real secret
  const compartmentId = compartments[0]?.id || 'YOUR_COMPARTMENT_ID';

  const alarmStartCurl = `curl -X POST '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alarm-start' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "serial": "${deviceSerial}",
    "secret": "${deviceSecret}",
    "compartmentId": "${compartmentId}",
    "scheduledAt": "${new Date().toISOString()}",
    "title": "Aspirina 500mg"
  }'`;

  const eventsDoseCurl = `curl -X POST '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/events-dose' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "serial": "${deviceSerial}",
    "secret": "${deviceSecret}",
    "compartmentId": "${compartmentId}",
    "scheduledAt": "${new Date().toISOString()}",
    "status": "taken",
    "actualAt": "${new Date().toISOString()}",
    "deltaWeightG": 0.48
  }'`;

  const weightsBulkCurl = `curl -X POST '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weights-bulk' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "serial": "${deviceSerial}",
    "secret": "${deviceSecret}",
    "readings": [
      {
        "measuredAt": "${new Date().toISOString()}",
        "weightG": 125.43,
        "raw": { "adc": 12345 }
      }
    ]
  }'`;

  const CheckItem = ({ label, status }: { label: string; status: boolean }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      {status ? (
        <CheckCircle2 className="h-5 w-5 text-green-600" />
      ) : (
        <XCircle className="h-5 w-5 text-destructive" />
      )}
      <span className={status ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mr-4">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">QuickStart / DevTools</h1>
          <p className="text-muted-foreground">Checklist y herramientas de desarrollo</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>✓ Checklist de Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CheckItem label="Bucket 'reports' existe" status={hasReportsBucket} />
            <CheckItem label="VITE_VAPID_PUBLIC presente (cliente)" status={hasVapidPublic} />
            <CheckItem label="VAPID_PUBLIC/PRIVATE presentes (server)" status={hasServerVapid} />
            <CheckItem label="Al menos 1 dispositivo registrado" status={hasDevice} />
            <CheckItem label="Al menos 1 push subscription activa" status={hasPushSub} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Estado del Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Dispositivos registrados</p>
              <p className="text-2xl font-bold">{devices.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Compartimentos configurados</p>
              <p className="text-2xl font-bold">{compartments.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subscripciones push activas</p>
              <p className="text-2xl font-bold">{pushSubs.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔧 Comandos cURL de Prueba</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">alarm-start (Notificación Push)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(alarmStartCurl, "alarm-start")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
              {alarmStartCurl}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">events-dose (Confirmar Toma)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(eventsDoseCurl, "events-dose")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
              {eventsDoseCurl}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">weights-bulk (Enviar Lecturas)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(weightsBulkCurl, "weights-bulk")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
              {weightsBulkCurl}
            </pre>
          </div>

          {!hasDevice && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Nota:</strong> Los comandos cURL usan placeholders. Registra un dispositivo primero en{" "}
                <a href="/device" className="underline">
                  /device
                </a>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🚀 Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/dev/config-check")} variant="default">
            Verificador de Configuración
          </Button>
          <Button onClick={() => navigate("/notifications")}>
            Activar Notificaciones
          </Button>
          <Button onClick={() => navigate("/device")} variant="outline">
            Registrar Dispositivo
          </Button>
          <Button onClick={() => navigate("/reports")} variant="outline">
            Generar Reporte
          </Button>
          <Button onClick={loadData} variant="outline">
            Refrescar Checklist
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
