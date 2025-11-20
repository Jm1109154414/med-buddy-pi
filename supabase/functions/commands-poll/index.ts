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

    const serial = req.headers.get('X-Device-Serial');
    const secret = req.headers.get('X-Device-Secret');

    // Validate headers
    if (!serial || !secret) {
      return new Response(JSON.stringify({ error: 'Missing device credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (serial.length > 50 || secret.length > 100) {
      return new Response(JSON.stringify({ error: 'Credentials too long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const url = new URL(req.url);
    const since = url.searchParams.get('since');

    // Validate 'since' parameter if present
    if (since) {
      try {
        new Date(since);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid since parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch pending commands
    let query = supabase
      .from('commands')
      .select('*')
      .eq('device_id', device.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data: commands, error } = await query;

    if (error) {
      console.error('Commands query error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark commands as acknowledged
    if (commands && commands.length > 0) {
      const commandIds = commands.map(c => c.id);
      await supabase
        .from('commands')
        .update({ status: 'ack', updated_at: new Date().toISOString() })
        .in('id', commandIds);

      console.log(`Commands polled: ${commands.length} for device ${device.id}`);
    }

    return new Response(JSON.stringify({ commands: commands || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in commands-poll:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
