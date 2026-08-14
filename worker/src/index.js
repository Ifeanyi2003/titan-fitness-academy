const N8N_BASE = "https://fppx7jtn.rcld.app/webhook";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/api/subscription" && request.method === "POST") {
        return await forwardToN8n(request, "/titan/subscription-fetch");
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        return await forwardToN8n(request, "/titan/ai-chat");
      }

      if (url.pathname === "/api/admin-action" && request.method === "POST") {
        return await forwardToN8n(request, "/titan/admin-action");
      }

      // Health check — keep this for quick "is it alive" tests
      if (url.pathname === "/" || url.pathname === "") {
        return jsonResponse({ status: "ok", service: "titan-api" });
      }

      return jsonResponse({ error: "Not found" }, 404);

    } catch (err) {
      return jsonResponse({ error: "Worker error", detail: err.message }, 500);
    }
  },
};

async function forwardToN8n(request, path) {
  const body = await request.text();

  const n8nResponse = await fetch(`${N8N_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const text = await n8nResponse.text();

  return new Response(text, {
    status: n8nResponse.status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}