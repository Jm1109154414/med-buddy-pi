import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-serial, x-device-secret',
};

// Validation schema
const doseEventSchema = z.object({
  serial: z.string().min(1).max(50),
  secret: z.string().min(1).max(100),
  compartmentId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  status: z.enum(['taken', 'late', 'missed', 'skipped']),
  actualAt: z.string().datetime().optional(),
  deltaWeightG: z.number().min(-1000).max(1000).optional(),
  source: z.enum(['auto', 'manual']).default('auto'),
  notes: z.string().max(500).optional(),
  scheduleId: z.string().uuid().optional()
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
    const validation = doseEventSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      serial, 
      secret, 
      compartmentId, 
      scheduledAt, 
      status, 
      actualAt, 
      deltaWeightG,
      source,
      notes,
      scheduleId
    } = validation.data;

    // Verify device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, secret')
      .eq('serial', serial)
      .single();

    if (deviceError || !device) {
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

    // Insert dose event
    const { data: event, error: eventError } = await supabase
      .from('dose_events')
      .insert({
        device_id: device.id,
        compartment_id: compartmentId,
        schedule_id: scheduleId || null,
        scheduled_at: scheduledAt,
        status,
        actual_at: actualAt || null,
        delta_weight_g: deltaWeightG || null,
        source,
        notes: notes || null,
      })
      .select()
      .single();

    if (eventError) {
      console.error('Dose event error:', eventError);
      return new Response(JSON.stringify({ error: eventError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Dose event created: ${event.id} for device ${device.id}`);

    return new Response(JSON.stringify(event), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in events-dose:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
