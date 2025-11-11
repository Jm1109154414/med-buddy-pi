import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-serial, x-device-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { serial, secret, scheduleId, compartmentId, scheduledAt, title } = await req.json();

    if (!serial || !secret || !compartmentId || !scheduledAt) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, user_id, secret')
      .eq('serial', serial)
      .single();

    if (deviceError || !device) {
      console.error('Device not found:', serial);
      return new Response(JSON.stringify({ error: 'Device not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify secret
    const encoder = new TextEncoder();
    const secretData = encoder.encode(secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', secretData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex !== device.secret) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get compartment details
    const { data: compartment } = await supabase
      .from('compartments')
      .select('idx, title')
      .eq('id', compartmentId)
      .single();

    // Format notification
    const time = new Date(scheduledAt).toLocaleTimeString('es-MX', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'America/Mexico_City' 
    });
    
    const compartmentTitle = compartment?.title || 'Medicamento';
    const compartmentIdx = compartment?.idx || '?';

    // Call push-send internally
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: device.user_id,
        title: '💊 Hora de tu pastilla',
        body: `${compartmentTitle} — ${time} (compartimento ${compartmentIdx})`,
        data: {
          route: '/dashboard',
          deviceId: device.id,
          compartmentId,
          scheduledAt,
          action: 'open_app',
        },
      }),
    });

    const pushResult = await pushResponse.json();

    console.log(`Alarm notification sent for device ${device.id}:`, pushResult);

    return new Response(JSON.stringify({ 
      success: true, 
      notificationsSent: pushResult.sent || 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in alarm-start:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});