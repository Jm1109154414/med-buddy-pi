import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { deviceId, type, rangeStart } = await req.json();

    if (!deviceId || !type || !['weekly', 'monthly'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify device ownership
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('name, timezone')
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .single();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: 'Device not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date range
    const start = rangeStart ? new Date(rangeStart) : new Date();
    let end = new Date(start);
    
    if (type === 'weekly') {
      end.setDate(end.getDate() + 7);
    } else {
      end.setMonth(end.getMonth() + 1);
    }

    const rangeStartStr = start.toISOString().split('T')[0];
    const rangeEndStr = end.toISOString().split('T')[0];

    // Fetch dose events
    const { data: events, error: eventsError } = await supabase
      .from('dose_events')
      .select('*, compartments(title, idx)')
      .eq('device_id', deviceId)
      .gte('scheduled_at', rangeStartStr)
      .lte('scheduled_at', rangeEndStr)
      .order('scheduled_at', { ascending: true });

    if (eventsError) {
      console.error('Events query error:', eventsError);
      return new Response(JSON.stringify({ error: eventsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate metrics
    const taken = events?.filter(e => e.status === 'taken').length || 0;
    const late = events?.filter(e => e.status === 'late').length || 0;
    const missed = events?.filter(e => e.status === 'missed').length || 0;
    const total = taken + late + missed;
    const adherence = total > 0 ? ((taken / total) * 100).toFixed(1) : '0.0';

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();
    let y = height - 50;

    // Header
    page.drawText('Reporte de Adherencia - PillMate', {
      x: 50,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 30;

    page.drawText(`Dispositivo: ${device.name}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Período: ${rangeStartStr} a ${rangeEndStr}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Generado: ${new Date().toISOString().split('T')[0]}`, { x: 50, y, size: 12, font });
    y -= 40;

    // Metrics
    page.drawText('Métricas de Adherencia', { x: 50, y, size: 14, font: fontBold });
    y -= 25;
    page.drawText(`Adherencia: ${adherence}%`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Tomas exitosas: ${taken}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Tomas tardías: ${late}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Tomas omitidas: ${missed}`, { x: 50, y, size: 12, font });
    y -= 40;

    // Events table
    page.drawText('Eventos del Período', { x: 50, y, size: 14, font: fontBold });
    y -= 25;

    // Table headers
    page.drawText('Fecha', { x: 50, y, size: 10, font: fontBold });
    page.drawText('Comp.', { x: 120, y, size: 10, font: fontBold });
    page.drawText('Título', { x: 160, y, size: 10, font: fontBold });
    page.drawText('Hora Prog.', { x: 260, y, size: 10, font: fontBold });
    page.drawText('Estado', { x: 340, y, size: 10, font: fontBold });
    page.drawText('Tomada', { x: 400, y, size: 10, font: fontBold });
    page.drawText('Δ Peso', { x: 470, y, size: 10, font: fontBold });
    y -= 15;

    // Table rows
    for (const event of events || []) {
      if (y < 50) {
        page = pdfDoc.addPage([595, 842]);
        y = height - 50;
      }

      const scheduledDate = new Date(event.scheduled_at);
      const dateStr = scheduledDate.toISOString().split('T')[0];
      const timeStr = scheduledDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const compartmentIdx = event.compartments?.idx || '?';
      const compartmentTitle = event.compartments?.title || 'N/A';
      const actualStr = event.actual_at ? new Date(event.actual_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-';
      const deltaStr = event.delta_weight_g ? event.delta_weight_g.toFixed(2) : '-';

      page.drawText(dateStr, { x: 50, y, size: 9, font });
      page.drawText(`${compartmentIdx}`, { x: 130, y, size: 9, font });
      page.drawText(compartmentTitle.substring(0, 12), { x: 160, y, size: 9, font });
      page.drawText(timeStr, { x: 270, y, size: 9, font });
      page.drawText(event.status, { x: 340, y, size: 9, font });
      page.drawText(actualStr, { x: 405, y, size: 9, font });
      page.drawText(deltaStr, { x: 475, y, size: 9, font });
      y -= 15;
    }

    const pdfBytes = await pdfDoc.save();

    // Upload to Storage
    const fileName = `${deviceId}_${type}_${rangeStartStr}.pdf`;
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      // Check if bucket doesn't exist
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
        return new Response(JSON.stringify({ 
          error: 'reports_bucket_missing',
          message: 'El bucket de reportes no está configurado. Ejecuta: INSERT INTO storage.buckets (id, name, public) VALUES (\'reports\', \'reports\', false);'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create report record
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        user_id: user.id,
        device_id: deviceId,
        range_start: rangeStartStr,
        range_end: rangeEndStr,
        type,
        file_path: filePath,
      })
      .select()
      .single();

    if (reportError) {
      console.error('Report insert error:', reportError);
      return new Response(JSON.stringify({ error: reportError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate signed URL
    const { data: signedData } = await supabase.storage
      .from('reports')
      .createSignedUrl(filePath, 3600);

    console.log(`Report generated: ${report.id}`);

    return new Response(JSON.stringify({
      reportId: report.id,
      signedUrl: signedData?.signedUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in reports-generate:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
