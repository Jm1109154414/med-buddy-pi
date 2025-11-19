import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Device {
  id: string;
  name: string;
  serial: string;
  timezone: string;
  created_at: string;
}

export default function Device() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [serial, setSerial] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, serial, timezone, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);

    try {
      const { data, error } = await supabase.functions.invoke("devices-register", {
        body: { serial, secret, name, timezone },
      });

      if (error) throw error;

      toast({
        title: "Dispositivo registrado",
        description: `${name} ha sido registrado exitosamente`,
      });

      setDialogOpen(false);
      setSerial("");
      setSecret("");
      setName("");
      setTimezone("America/Mexico_City");
      fetchDevices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dispositivos</h1>
          <p className="text-muted-foreground">Gestiona tus pastilleros</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Registrar Dispositivo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleRegister}>
              <DialogHeader>
                <DialogTitle>Registrar Nuevo Dispositivo</DialogTitle>
                <DialogDescription>
                  Ingresa los datos de tu Raspberry Pi
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="serial">Serial</Label>
                  <Input
                    id="serial"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    placeholder="ej: RPI-12345"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="secret">Secret</Label>
                  <Input
                    id="secret"
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Clave secreta del dispositivo"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ej: Pastillero Principal"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Zona Horaria</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Mexico_City">Ciudad de México</SelectItem>
                      <SelectItem value="America/Cancun">Cancún</SelectItem>
                      <SelectItem value="America/Tijuana">Tijuana</SelectItem>
                      <SelectItem value="America/Monterrey">Monterrey</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={registering}>
                  {registering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {devices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No tienes dispositivos registrados</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar tu primer dispositivo
              </Button>
            </CardContent>
          </Card>
        ) : (
          devices.map((device) => (
            <Card key={device.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{device.name}</CardTitle>
                    <CardDescription>Serial: {device.serial}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/compartments?deviceId=${device.id}`)}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configurar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Zona Horaria:</span>
                    <span className="font-medium">{device.timezone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Registrado:</span>
                    <span className="font-medium">
                      {new Date(device.created_at).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/schedules?deviceId=${device.id}`)}
                  >
                    Horarios
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/reports?deviceId=${device.id}`)}
                  >
                    Reportes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
