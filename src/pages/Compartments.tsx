import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft } from "lucide-react";

interface Compartment {
  id: string;
  idx: number;
  title: string;
  expected_pill_weight_g: number | null;
  active: boolean;
  servo_angle_deg: number | null;
}

export default function Compartments() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deviceId = searchParams.get("deviceId");

  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deviceId) {
      fetchCompartments();
    }
  }, [deviceId]);

  const fetchCompartments = async () => {
    try {
      const { data, error } = await supabase
        .from("compartments")
        .select("*")
        .eq("device_id", deviceId)
        .order("idx", { ascending: true });

      if (error) throw error;
      setCompartments(data || []);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = compartments.map((comp) => ({
        id: comp.id,
        title: comp.title,
        expected_pill_weight_g: comp.expected_pill_weight_g,
        active: comp.active,
        servo_angle_deg: comp.servo_angle_deg,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("compartments")
          .update(update)
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({
        title: "Guardado",
        description: "Los compartimentos se han actualizado correctamente",
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

  const updateCompartment = (idx: number, field: keyof Compartment, value: any) => {
    setCompartments((prev) =>
      prev.map((comp) =>
        comp.idx === idx ? { ...comp, [field]: value } : comp
      )
    );
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
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mr-4">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Compartimentos</h1>
          <p className="text-muted-foreground">Configura los 3 compartimentos de tu pastillero ESP32</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {compartments.filter(c => c.idx <= 3).map((comp) => (
          <Card key={comp.id}>
            <CardHeader>
              <CardTitle>Compartimento {comp.idx}</CardTitle>
              <CardDescription>
                <div className="flex items-center justify-between mt-2">
                  <span>Activo</span>
                  <Switch
                    checked={comp.active}
                    onCheckedChange={(checked) =>
                      updateCompartment(comp.idx, "active", checked)
                    }
                  />
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`title-${comp.idx}`}>Título</Label>
                <Input
                  id={`title-${comp.idx}`}
                  value={comp.title}
                  onChange={(e) =>
                    updateCompartment(comp.idx, "title", e.target.value)
                  }
                  placeholder="ej: Aspirina"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`angle-${comp.idx}`}>Ángulo Servo (0-180°)</Label>
                <Input
                  id={`angle-${comp.idx}`}
                  type="number"
                  min="0"
                  max="180"
                  value={comp.servo_angle_deg ?? comp.idx === 1 ? 0 : comp.idx === 2 ? 90 : 180}
                  onChange={(e) =>
                    updateCompartment(
                      comp.idx,
                      "servo_angle_deg",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  placeholder={`${comp.idx === 1 ? '0' : comp.idx === 2 ? '90' : '180'}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`weight-${comp.idx}`}>Peso esperado (g)</Label>
                <Input
                  id={`weight-${comp.idx}`}
                  type="number"
                  step="0.01"
                  value={comp.expected_pill_weight_g || ""}
                  onChange={(e) =>
                    updateCompartment(
                      comp.idx,
                      "expected_pill_weight_g",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="0.50"
                />
              </div>
            </CardContent>
          </Card>
        ))}
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
