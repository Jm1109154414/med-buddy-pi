import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Bell, Settings, FileText } from "lucide-react";

type Device = { id: string; name: string; timezone: string; user_id: string };
type Compartment = { id: string; device_id: string; idx: number; title: string; active: boolean };
type Schedule = { id: string; compartment_id: string; time_of_day: string; days_of_week: number; window_minutes: number };
type DoseEvent = { 
  id: string; 
  device_id: string; 
  compartment_id: string | null; 
  scheduled_at: string; 
  status: 'taken' | 'late' | 'missed' | 'skipped'; 
  actual_at: string | null; 
  delta_weight_g: number | null;
  compartments?: { idx: number; title: string } | null;
};

function isTodayInBitmask(days: number, now: Date): boolean {
  const jsDay = now.getDay();
  const mxMap = [6, 0, 1, 2, 3, 4, 5]; // JS Sun->D(6), Mon->L(0)...
  const bit = mxMap[jsDay];
  return ((days >> bit) & 1) === 1;
}

function parseHHMM(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<DoseEvent[]>([]);

  // Check authentication
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
      } else {
        setUser(user);
        loadDevices(user.id);
      }
      setLoading(false);
    };
    checkUser();
  }, [navigate]);

  // Load user's devices
  const loadDevices = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, timezone, user_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setDevices(data || []);
      if (data && data.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Load compartments and schedules for selected device
  useEffect(() => {
    if (!selectedDeviceId) return;

    const loadDeviceData = async () => {
      try {
        // Load compartments
        const { data: comps, error: compsError } = await supabase
          .from('compartments')
          .select('*')
          .eq('device_id', selectedDeviceId)
          .eq('active', true)
          .order('idx', { ascending: true });

        if (compsError) throw compsError;
        setCompartments(comps || []);

        // Load schedules
        if (comps && comps.length > 0) {
          const compIds = comps.map(c => c.id);
          const { data: scheds, error: schedsError } = await supabase
            .from('schedules')
            .select('id, compartment_id, time_of_day, days_of_week, window_minutes')
            .in('compartment_id', compIds);

          if (schedsError) throw schedsError;
          setSchedules(scheds || []);
        } else {
          setSchedules([]);
        }
      } catch (error: any) {
        console.error('Error loading device data:', error);
      }
    };

    loadDeviceData();
  }, [selectedDeviceId]);

  // Load last 7 days of dose events
  useEffect(() => {
    if (!selectedDeviceId) return;

    const loadEvents = async () => {
      try {
        const from = new Date();
        from.setDate(from.getDate() - 7);

        const { data, error } = await supabase
          .from('dose_events')
          .select('id, device_id, compartment_id, scheduled_at, status, actual_at, delta_weight_g, compartments(idx, title)')
          .eq('device_id', selectedDeviceId)
          .gte('scheduled_at', from.toISOString())
          .order('scheduled_at', { ascending: false });

        if (error) throw error;
        setEvents(data || []);
      } catch (error: any) {
        console.error('Error loading events:', error);
      }
    };

    loadEvents();
  }, [selectedDeviceId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!selectedDeviceId) return;

    const channel = supabase
      .channel('realtime:dose_events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dose_events',
          filter: `device_id=eq.${selectedDeviceId}`,
        },
        () => {
          // Reload events when changes occur
          const from = new Date();
          from.setDate(from.getDate() - 7);

          supabase
            .from('dose_events')
            .select('id, device_id, compartment_id, scheduled_at, status, actual_at, delta_weight_g, compartments(idx, title)')
            .eq('device_id', selectedDeviceId)
            .gte('scheduled_at', from.toISOString())
            .order('scheduled_at', { ascending: false })
            .then(({ data }) => setEvents(data || []));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDeviceId]);

  // Calculate upcoming doses for today
  const upcomingToday = useMemo(() => {
    const now = new Date();
    const list: { title: string; idx: number; time: string; compId: string }[] = [];

    for (const sch of schedules) {
      if (!isTodayInBitmask(sch.days_of_week, now)) continue;

      const comp = compartments.find(c => c.id === sch.compartment_id);
      if (!comp) continue;

      const { h, m } = parseHHMM(sch.time_of_day);
      const schedTime = new Date(now);
      schedTime.setHours(h, m, 0, 0);

      if (schedTime >= now) {
        list.push({
          title: comp.title,
          idx: comp.idx,
          time: sch.time_of_day,
          compId: comp.id,
        });
      }
    }

    return list.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 6);
  }, [schedules, compartments]);

  // Calculate adherence for last 7 days
  const adherence = useMemo(() => {
    const total = events.filter(e => ['taken', 'late', 'missed'].includes(e.status)).length;
    const taken = events.filter(e => e.status === 'taken').length;
    return total > 0 ? Math.round((taken / total) * 100) : 0;
  }, [events]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      taken: "default",
      late: "secondary",
      missed: "destructive",
      skipped: "secondary",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Bienvenido, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/notifications")}>
              <Bell className="mr-2 h-4 w-4" />
              Notificaciones
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>

        {devices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No tienes dispositivos registrados</p>
              <Button onClick={() => navigate("/device")}>
                Registrar tu primer dispositivo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex gap-3 items-center mb-6">
              <label className="text-sm font-medium">Dispositivo:</label>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-6 md:grid-cols-3 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Adherencia Semanal</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-primary">{adherence}%</div>
                  <p className="text-sm text-muted-foreground mt-2">Últimos 7 días</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Próximas Tomas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold">{upcomingToday.length}</div>
                  <p className="text-sm text-muted-foreground mt-2">Hoy pendientes</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Accesos Rápidos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start" 
                    onClick={() => navigate("/device")}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Dispositivos
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start" 
                    onClick={() => navigate(`/reports?deviceId=${selectedDeviceId}`)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Reportes
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Próximas Tomas (Hoy)</CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingToday.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No hay tomas programadas para hoy</p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingToday.map((dose, i) => (
                        <div key={i} className="flex justify-between items-center p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">
                              Comp. {dose.idx}: {dose.title}
                            </p>
                            <p className="text-sm text-muted-foreground">{dose.time}</p>
                          </div>
                          <Badge variant="secondary">Programada</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Últimas Confirmaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  {events.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No hay eventos recientes</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {events.slice(0, 10).map((event) => (
                        <div key={event.id} className="flex justify-between items-center p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">
                              Comp. {event.compartments?.idx || '?'}: {event.compartments?.title || 'N/A'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(event.scheduled_at).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            {event.delta_weight_g && (
                              <p className="text-xs text-muted-foreground">
                                Δ Peso: {event.delta_weight_g.toFixed(2)}g
                              </p>
                            )}
                          </div>
                          {getStatusBadge(event.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
