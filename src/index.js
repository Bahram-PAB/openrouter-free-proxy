/**
 * OpenRouter Free Proxy
 * A Cloudflare Worker that provides fallback between multiple OpenRouter free API keys.
 * Only free models (:free) are allowed.
 * 
 * GitHub: https://github.com/Bahram-PAB/openrouter-free-proxy
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Collect API Keys
    const API_KEYS = [];
    for (let i = 1; i <= 12; i++) {
      const key = env[`OPENROUTER_KEY_${i}`];
      if (key) API_KEYS.push(key);
    }

    if (API_KEYS.length === 0) {
      return jsonResponse({ error: "No API keys configured" }, 500);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/v1/models" || url.pathname === "/models") {
        return await handleModels(API_KEYS);
      }

      if (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions") {
        return await handleChat(request, API_KEYS);
      }

      return jsonResponse({ error: "Not Found" }, 404);
    } catch (err) {
      console.error("Worker error:", err.message);
      return jsonResponse({ error: "Internal Server Error", message: err.message }, 500);
    }
  },
};

// ====================== Helpers ======================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitOrOverload(status, errorText = "") {
  if ([429, 402, 503, 529].includes(status)) return true;

  const text = errorText.toLowerCase();
  return (
    text.includes("rate limit") ||
    text.includes("rate-limit") ||
    text.includes("too many requests") ||
    text.includes("overloaded") ||
    text.includes("capacity") ||
    text.includes("temporarily unavailable") ||
    text.includes("no endpoints found") ||
    text.includes("provider returned error")
  );
}

// ====================== Models (Free only) ======================

async function handleModels(apiKeys) {
  for (const key of apiKeys) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://github.com/Bahram-PAB/openrouter-free-proxy",
          "X-Title": "OpenRouter Free Proxy",
        },
      });

      if (!res.ok) continue;

      const data = await res.json();

      const freeModels = data.data
        .filter((m) => m.id && m.id.includes(":free"))
        .map((m) => ({
          id: m.id,
          object: "model",
          created: m.created || Math.floor(Date.now() / 1000),
          owned_by: m.id.split("/")[0] || "openrouter",
        }));

      return jsonResponse({
        object: "list",
        data: freeModels,
      });
    } catch (e) {
      continue;
    }
  }

  return jsonResponse({ error: "Failed to fetch models from all keys" }, 502);
}

// ====================== Chat Completions ======================

async function handleChat(request, apiKeys) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Only free models allowed
  if (body.model && !body.model.includes(":free")) {
    return jsonResponse(
      {
        error: {
          message: `Only free models are allowed. "${body.model}" is not free.`,
          type: "invalid_request_error",
        },
      },
      400
    );
  }

  const isStreaming = body.stream === true;
  const startIndex = Math.floor(Math.random() * apiKeys.length);

  let lastErrorText = "";

  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (startIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/Bahram-PAB/openrouter-free-proxy",
          "X-Title": "OpenRouter Free Proxy",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        if (isStreaming) {
          return new Response(response.body, {
            headers: {
              ...corsHeaders(),
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } else {
          const data = await response.json();
          return jsonResponse(data);
        }
      }

      const errorText = await response.text();
      lastErrorText = errorText;

      if (isRateLimitOrOverload(response.status, errorText)) {
        console.log(`Key ${keyIndex + 1} limited/overloaded (${response.status}), trying next...`);
        if (i < apiKeys.length - 1) {
          await sleep(300 + Math.random() * 400);
        }
        continue;
      }

      return new Response(errorText, {
        status: response.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      console.log(`Key ${keyIndex + 1} network error:`, err.message);
      lastErrorText = err.message;
      if (i < apiKeys.length - 1) {
        await sleep(200);
      }
      continue;
    }
  }

  return jsonResponse(
    {
      error: {
        message: "All API keys are currently rate-limited or unavailable. Please try again in a few minutes.",
        type: "rate_limit_exceeded",
        details: lastErrorText ? lastErrorText.slice(0, 300) : undefined,
      },
    },
    429
  );
}
