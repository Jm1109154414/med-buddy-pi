import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, FileText, ArrowLeft } from "lucide-react";

interface DoseEvent {
  id: string;
  scheduled_at: string;
  status: string;
  actual_at: string | null;
  compartments: { idx: number; title: string } | null;
}

interface Report {
  id: string;
  type: string;
  range_start: string;
  range_end: string;
  created_at: string;
  file_path: string;
}

export default function Reports() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deviceId = searchParams.get("deviceId");

  const [reportType, setReportType] = useState<"weekly" | "monthly">("weekly");
  const [events, setEvents] = useState<DoseEvent[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (deviceId) {
      fetchData();
    }
  }, [deviceId]);

  const fetchData = async () => {
    try {
      // Fetch recent events
      const queryParams = new URLSearchParams({
        deviceId: deviceId!,
        pageSize: '20'
      });
      const { data: eventsData, error: eventsError } = await supabase.functions.invoke(
        `doses-query?${queryParams.toString()}`,
        { method: 'GET' }
      );

      if (eventsError) throw eventsError;
      setEvents(eventsData.items || []);

      // Fetch reports
      const { data: reportsData, error: reportsError } = await supabase
        .from("reports")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (reportsError) throw reportsError;
      setReports(reportsData || []);
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("reports-generate", {
        body: { deviceId, type: reportType },
      });

      if (error) {
        console.error('Report generation error:', error);
        throw new Error(error.message || 'Error al generar el reporte');
      }

      if (!data) {
        throw new Error('No se recibió respuesta del servidor');
      }

      toast({
        title: "Reporte generado",
        description: "El reporte PDF ha sido generado exitosamente",
      });

      // Download immediately
      if (data.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }

      fetchData();
    } catch (error: any) {
      console.error('Full error:', error);
      toast({
        title: "Error al generar reporte",
        description: error.message || "Error desconocido al generar el reporte",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    try {
      const { data } = await supabase.storage
        .from("reports")
        .createSignedUrl(filePath, 3600);

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Reportes</h1>
          <p className="text-muted-foreground">Genera y descarga reportes de adherencia</p>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Generar Nuevo Reporte</CardTitle>
          <CardDescription>Crea un reporte PDF con las métricas de adherencia</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Generar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Últimas Tomas</CardTitle>
            <CardDescription>Últimos 20 eventos registrados</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comp.</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {new Date(event.scheduled_at).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{event.compartments?.idx || "-"}</TableCell>
                    <TableCell>{getStatusBadge(event.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reportes Generados</CardTitle>
            <CardDescription>Historial de reportes PDF</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {report.type === "weekly" ? "Semanal" : "Mensual"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(report.range_start).toLocaleDateString("es-MX")} -{" "}
                      {new Date(report.range_end).toLocaleDateString("es-MX")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(report.file_path)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
