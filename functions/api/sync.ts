interface Env {
  MEDTRACKER_KV?: any;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    if (env.MEDTRACKER_KV) {
      const data = await env.MEDTRACKER_KV.get('shared_history', 'text');
      return new Response(data || JSON.stringify({ empty: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = (globalThis as any).__MEDTRACKER_SYNC_STORE || JSON.stringify({ empty: true });
    return new Response(data, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    const body = await request.text();
    if (env.MEDTRACKER_KV) {
      await env.MEDTRACKER_KV.put('shared_history', body);
    } else {
      (globalThis as any).__MEDTRACKER_SYNC_STORE = body;
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
};
