import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-serial, x-device-secret',
};

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

    const url = new URL(req.url);
    const deviceId = url.searchParams.get('deviceId');
    const serial = req.headers.get('x-device-serial');
    const secret = req.headers.get('x-device-secret');
    const authHeader = req.headers.get('authorization');

    let device;

    // Mode 1: User authenticated (JWT)
    if (authHeader && deviceId) {
      // Validate deviceId format
      if (!z.string().uuid().safeParse(deviceId).success) {
        return new Response(JSON.stringify({ error: 'Invalid deviceId format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const jwt = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Device not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      device = data;
    }
    // Mode 2: Device authenticated (serial + secret)
    else if (serial && secret) {
      // Validate serial and secret length
      if (serial.length > 50 || secret.length > 100) {
        return new Response(JSON.stringify({ error: 'Credentials too long' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('serial', serial)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Device not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify secret (bcrypt or SHA-256 fallback for old devices)
      let isValid = false;
      if (data.secret.startsWith('$2')) {
        isValid = await bcrypt.compare(secret, data.secret);
      } else {
        isValid = await verifySHA256(secret, data.secret);
      }

      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      device = data;
    } else {
      return new Response(JSON.stringify({ error: 'Missing authentication' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get compartments (only first 3 for ESP32) and schedules
    const { data: compartments, error: compError } = await supabase
      .from('compartments')
      .select('id, idx, title, active, servo_angle_deg')
      .eq('device_id', device.id)
      .lte('idx', 3)
      .order('idx');

    if (compError) {
      console.error('Compartments error:', compError);
      return new Response(JSON.stringify({ error: 'Failed to fetch compartments' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const compartmentIds = compartments.map(c => c.id);
    const { data: schedules, error: schedError } = await supabase
      .from('schedules')
      .select('*')
      .in('compartment_id', compartmentIds);

    if (schedError) {
      console.error('Schedules error:', schedError);
      return new Response(JSON.stringify({ error: 'Failed to fetch schedules' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      timezone: device.timezone,
      deviceId: device.id,
      compartments,
      schedules,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in devices-config:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
