import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema
const registerSchema = z.object({
  serial: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  secret: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, { message: "Invalid timezone" })
});

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

    const body = await req.json();
    
    // Validate input
    const validation = registerSchema.safeParse({
      ...body,
      timezone: body.timezone || 'America/Mexico_City'
    });

    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serial, secret, name, timezone } = validation.data;

    // Hash secret using bcrypt (stronger than SHA-256)
    const hashedSecret = await bcrypt.hash(secret);

    // Create device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        user_id: user.id,
        serial,
        secret: hashedSecret,
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

    // Create 3 default compartments for ESP32
    const compartments = Array.from({ length: 3 }, (_, i) => ({
      device_id: device.id,
      idx: i + 1,
      title: `Compartimento ${i + 1}`,
      active: true,
      servo_angle_deg: i * 90, // 0°, 90°, 180°
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
