import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema
const commandAckSchema = z.object({
  serial: z.string().min(1).max(50),
  secret: z.string().min(1).max(100),
  commandId: z.string().uuid(),
  status: z.enum(['done', 'error']),
  detail: z.string().max(500).optional()
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
    const validation = commandAckSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serial, secret, commandId, status, detail } = validation.data;

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

    // Update command
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (detail) {
      updateData.payload = { ...updateData.payload, detail };
    }

    const { data: command, error } = await supabase
      .from('commands')
      .update(updateData)
      .eq('id', commandId)
      .eq('device_id', device.id)
      .select()
      .single();

    if (error) {
      console.error('Command update error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Command ${commandId} acknowledged as ${status}`);

    return new Response(JSON.stringify({ success: true, command }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in commands-ack:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
