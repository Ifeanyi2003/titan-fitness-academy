export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ status: "ok", service: "titan-api" }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};