import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check VAPID keys
    const hasVapidPublic = !!Deno.env.get('VAPID_PUBLIC');
    const hasVapidPrivate = !!Deno.env.get('VAPID_PRIVATE');

    // Check reports bucket
    let hasReportsBucket = false;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      hasReportsBucket = buckets?.some((b: any) => b.id === 'reports') ?? false;
    } catch (e) {
      console.error('Error checking buckets:', e);
    }

    // Check authentication
    const authHeader = req.headers.get('Authorization');
    let isAuthenticated = false;
    let userId: string | null = null;

    if (authHeader) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        );
        
        if (!authError && user) {
          isAuthenticated = true;
          userId = user.id;
        }
      } catch (e) {
        console.error('Error checking auth:', e);
      }
    }

    // Return minimal info for unauthenticated requests
    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({
          ok: true,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Return detailed info for authenticated requests
    const result: any = {
      ok: true,
      hasVapidPublic,
      hasVapidPrivate,
      hasReportsBucket,
      timestamp: new Date().toISOString(),
    };

    // Get user-specific counts
    try {
      const { count: pushCount } = await supabase
        .from('push_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      const { count: devicesCount } = await supabase
        .from('devices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      result.pushSubsCount = pushCount ?? 0;
      result.devicesCount = devicesCount ?? 0;
    } catch (e) {
      console.error('Error getting user counts:', e);
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Health check error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
