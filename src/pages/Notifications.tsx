import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bell, BellOff, AlertCircle } from "lucide-react";
import { registerPush, unregisterPush, isPushEnabled } from "@/lib/push-notifications";
import { Alert, AlertDescription } from "@/components/ui/alert";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC;

export default function Notifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const status = await isPushEnabled();
    setEnabled(status);
    setChecking(false);
  };

  const handleEnable = async () => {
    if (!VAPID_PUBLIC_KEY) {
      toast({
        title: "Error",
        description: "Falta configurar VITE_VAPID_PUBLIC en variables de entorno",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const sub = await registerPush(VAPID_PUBLIC_KEY);
      if (sub) {
        setEnabled(true);
        toast({
          title: "Notificaciones activadas",
          description: "Recibirás recordatorios cuando sea hora de tomar tus medicamentos",
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudieron activar las notificaciones. Verifica los permisos.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error activando notificaciones",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDisable = async () => {
    setProcessing(true);
    try {
      const success = await unregisterPush();
      if (success) {
        setEnabled(false);
        toast({
          title: "Notificaciones desactivadas",
          description: "Ya no recibirás recordatorios push",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error desactivando notificaciones",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mr-4">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Notificaciones</h1>
          <p className="text-muted-foreground">Gestiona las notificaciones de tu pastillero</p>
        </div>
      </div>

      {!VAPID_PUBLIC_KEY && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Configuración incompleta:</strong> Falta la variable VITE_VAPID_PUBLIC. 
            Genera las claves con <code className="bg-background px-1 rounded">npx web-push generate-vapid-keys</code> y 
            configura VITE_VAPID_PUBLIC en el cliente.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notificaciones Push</CardTitle>
          <CardDescription>
            Recibe alertas en tiempo real cuando sea hora de tomar tus medicamentos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              {enabled ? (
                <Bell className="h-5 w-5 text-primary" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">
                  {enabled ? "Notificaciones Activadas" : "Notificaciones Desactivadas"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? "Recibirás alertas cuando tu pastillero inicie una alarma"
                    : "Activa las notificaciones para recibir recordatorios"}
                </p>
              </div>
            </div>
            <Button
              onClick={enabled ? handleDisable : handleEnable}
              disabled={checking || processing || !VAPID_PUBLIC_KEY}
              variant={enabled ? "outline" : "default"}
            >
              {enabled ? "Desactivar" : "Activar"}
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Características de las notificaciones:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Alertas instantáneas cuando el pastillero inicia una alarma</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Acción rápida para posponer 5 minutos directamente desde la notificación</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Información del compartimento y horario programado</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Funciona incluso cuando la app está cerrada</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm">
              <strong className="text-primary">Nota:</strong> Para recibir notificaciones, tu
              navegador debe tener permisos de notificación activos. Si no funcionan, verifica los
              permisos en la configuración de tu navegador.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
