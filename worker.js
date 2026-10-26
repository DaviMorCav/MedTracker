export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Endpoint de Sincronização Compartilhada de Histórico
    if (url.pathname === '/api/sync') {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. Armazenamento persistente Cloudflare KV (se o binding MEDTRACKER_KV estiver configurado)
      if (env && env.MEDTRACKER_KV) {
        if (request.method === 'GET') {
          const data = await env.MEDTRACKER_KV.get('shared_history', 'text');
          return new Response(data || JSON.stringify({ empty: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (request.method === 'POST' || request.method === 'PUT') {
          try {
            const body = await request.text();
            await env.MEDTRACKER_KV.put('shared_history', body);
            return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: String(err) }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // 2. Fallback de memória em tempo de execução
      if (request.method === 'GET') {
        const data = globalThis.__MEDTRACKER_SYNC_STORE || JSON.stringify({ empty: true });
        return new Response(data, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'POST' || request.method === 'PUT') {
        const body = await request.text();
        globalThis.__MEDTRACKER_SYNC_STORE = body;
        return new Response(JSON.stringify({ success: true, fallback: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve os arquivos estáticos da SPA pelo Cloudflare Workers
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
