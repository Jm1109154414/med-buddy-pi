import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft, Plus, Trash2 } from "lucide-react";

interface Compartment {
  id: string;
  idx: number;
  title: string;
}

interface Schedule {
  id?: string;
  compartment_id: string;
  time_of_day: string;
  days_of_week: number;
  window_minutes: number;
  enable_led: boolean;
  enable_buzzer: boolean;
}

const DAYS = [
  { label: "L", bit: 1 },
  { label: "M", bit: 2 },
  { label: "X", bit: 4 },
  { label: "J", bit: 8 },
  { label: "V", bit: 16 },
  { label: "S", bit: 32 },
  { label: "D", bit: 64 },
];

export default function Schedules() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deviceId = searchParams.get("deviceId");

  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deviceId) {
      fetchData();
    }
  }, [deviceId]);

  const fetchData = async () => {
    try {
      const { data: comps, error: compsError } = await supabase
        .from("compartments")
        .select("id, idx, title")
        .eq("device_id", deviceId)
        .eq("active", true)
        .order("idx", { ascending: true });

      if (compsError) throw compsError;
      setCompartments(comps || []);

      const { data: scheds, error: schedsError } = await supabase
        .from("schedules")
        .select("*")
        .in("compartment_id", (comps || []).map(c => c.id));

      if (schedsError) throw schedsError;
      setSchedules(scheds || []);
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

  const addSchedule = (compartmentId: string) => {
    setSchedules([
      ...schedules,
      {
        compartment_id: compartmentId,
        time_of_day: "08:00",
        days_of_week: 127, // todos los días
        window_minutes: 10,
        enable_led: true,
        enable_buzzer: true,
      },
    ]);
  };

  const removeSchedule = (index: number) => {
    setSchedules(schedules.filter((_, i) => i !== index));
  };

  const updateSchedule = (index: number, field: keyof Schedule, value: any) => {
    setSchedules((prev) =>
      prev.map((sched, i) => (i === index ? { ...sched, [field]: value } : sched))
    );
  };

  const toggleDay = (index: number, bit: number) => {
    const sched = schedules[index];
    const newDays = sched.days_of_week ^ bit;
    updateSchedule(index, "days_of_week", newDays);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing schedules
      const compartmentIds = compartments.map(c => c.id);
      await supabase
        .from("schedules")
        .delete()
        .in("compartment_id", compartmentIds);

      // Insert new schedules
      if (schedules.length > 0) {
        const { error } = await supabase
          .from("schedules")
          .insert(schedules.map(({ id, ...rest }) => rest));

        if (error) throw error;
      }

      toast({
        title: "Guardado",
        description: "Los horarios se han actualizado correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!deviceId) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <p className="text-destructive">ID de dispositivo no proporcionado</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Horarios</h1>
          <p className="text-muted-foreground">Configura los horarios de cada compartimento</p>
        </div>
      </div>

      <div className="space-y-6">
        {compartments.map((comp) => {
          const compSchedules = schedules
            .map((s, i) => ({ ...s, originalIndex: i }))
            .filter((s) => s.compartment_id === comp.id);

          return (
            <Card key={comp.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Compartimento {comp.idx}: {comp.title}</CardTitle>
                    <CardDescription>{compSchedules.length} horarios configurados</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => addSchedule(comp.id)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar Horario
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {compSchedules.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No hay horarios configurados</p>
                ) : (
                  <div className="space-y-4">
                    {compSchedules.map((sched) => (
                      <div key={sched.originalIndex} className="border rounded-lg p-4 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                            <div className="space-y-2">
                              <Label>Hora</Label>
                              <Input
                                type="time"
                                value={sched.time_of_day}
                                onChange={(e) =>
                                  updateSchedule(sched.originalIndex, "time_of_day", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Ventana (min)</Label>
                              <Input
                                type="number"
                                value={sched.window_minutes}
                                onChange={(e) =>
                                  updateSchedule(
                                    sched.originalIndex,
                                    "window_minutes",
                                    parseInt(e.target.value)
                                  )
                                }
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={sched.enable_led}
                                onCheckedChange={(checked) =>
                                  updateSchedule(sched.originalIndex, "enable_led", checked)
                                }
                              />
                              <Label>LED</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={sched.enable_buzzer}
                                onCheckedChange={(checked) =>
                                  updateSchedule(sched.originalIndex, "enable_buzzer", checked)
                                }
                              />
                              <Label>Buzzer</Label>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSchedule(sched.originalIndex)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label>Días de la semana</Label>
                          <div className="flex gap-2">
                            {DAYS.map((day) => (
                              <Button
                                key={day.bit}
                                variant={(sched.days_of_week & day.bit) !== 0 ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleDay(sched.originalIndex, day.bit)}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end mt-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Guardar Todo
        </Button>
      </div>
    </div>
  );
}
