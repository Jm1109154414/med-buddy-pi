import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-serial, x-device-secret',
};

// Validation schema
const weightReadingSchema = z.object({
  measuredAt: z.string().datetime(),
  weightG: z.number().min(-100000).max(100000),
  raw: z.any().optional()
});

const weightsBulkSchema = z.object({
  serial: z.string().min(1).max(50),
  secret: z.string().min(1).max(100),
  readings: z.array(weightReadingSchema).min(1).max(1000)  // Limit to 1000 readings per batch
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
    const validation = weightsBulkSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serial, secret, readings } = validation.data;

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

    // Prepare weight readings
    const weightData = readings.map((r) => ({
      device_id: device.id,
      measured_at: r.measuredAt,
      weight_g: r.weightG,
      raw: r.raw || null,
    }));

    const { data, error } = await supabase
      .from('weight_readings')
      .insert(weightData)
      .select();

    if (error) {
      console.error('Weight readings error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`${readings.length} weight readings inserted for device ${device.id}`);

    return new Response(JSON.stringify({ inserted: data.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in weights-bulk:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
