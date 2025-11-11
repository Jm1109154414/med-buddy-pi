import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

    // Verify JWT and get user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serial, secret, name, timezone = 'America/Mexico_City' } = await req.json();

    if (!serial || !secret || !name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash secret using Argon2 (simulated with SHA-256 for now, Argon2 would need Deno module)
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        user_id: user.id,
        serial,
        secret: hashHex,
        name,
        timezone,
      })
      .select()
      .single();

    if (deviceError) {
      console.error('Device creation error:', deviceError);
      return new Response(JSON.stringify({ error: deviceError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create 5 default compartments
    const compartments = Array.from({ length: 5 }, (_, i) => ({
      device_id: device.id,
      idx: i + 1,
      title: `Compartimento ${i + 1}`,
      active: true,
    }));

    const { error: compartmentsError } = await supabase
      .from('compartments')
      .insert(compartments);

    if (compartmentsError) {
      console.error('Compartments creation error:', compartmentsError);
      // Rollback device if compartments fail
      await supabase.from('devices').delete().eq('id', device.id);
      return new Response(JSON.stringify({ error: 'Failed to create compartments' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Device registered: ${device.id} for user ${user.id}`);

    return new Response(JSON.stringify({ deviceId: device.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in devices-register:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});