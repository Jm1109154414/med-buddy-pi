import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-serial, x-device-secret',
};

// Validation schema
const alarmStartSchema = z.object({
  serial: z.string().min(1).max(50),
  secret: z.string().min(1).max(100),
  compartmentId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  scheduleId: z.string().uuid().optional(),
  title: z.string().max(200).optional()
});

// SHA-256 verification for backward compatibility
async function verifySHA256(secret: string, hashedSecret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const secretData = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', secretData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === hashedSecret;
}

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

    const body = await req.json();
    
    // Validate input
    const validation = alarmStartSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serial, secret, scheduleId, compartmentId, scheduledAt, title } = validation.data;

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

    // Verify secret (bcrypt or SHA-256 fallback for old devices)
    let isValid = false;
    if (device.secret.startsWith('$2')) {
      isValid = await bcrypt.compare(secret, device.secret);
    } else {
      isValid = await verifySHA256(secret, device.secret);
    }

    if (!isValid) {
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
