/**
 * Snip/Log API proxy.
 *
 * This is the only piece of code that ever touches your real Anthropic API
 * key. It runs on Cloudflare's servers, not in the browser, so the key is
 * never exposed to anyone using the site.
 *
 * The frontend POSTs the same request body it would send straight to
 * Anthropic; this worker just attaches the key and forwards it, then adds
 * CORS headers so your GitHub Pages site is allowed to call it.
 */

// Set this to your actual GitHub Pages URL once you know it, e.g.
// "https://yourname.github.io". Using "*" works too but is less strict.
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Force the model server-side so the client can't override it and run
    // up a different bill than you expect.
    body.model = "claude-sonnet-4-6";
    if (!body.max_tokens) body.max_tokens = 1000;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const responseBody = await anthropicResponse.text();

    return new Response(responseBody, {
      status: anthropicResponse.status,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};
