# OpenRouter Free Proxy

[English](#english) | [فارسی](#فارسی)

A simple and reliable **Cloudflare Worker** that acts as a proxy for OpenRouter free models with automatic fallback between multiple API keys.

---

## English

### Features

- Supports multiple OpenRouter API keys (up to 12)
- Automatic **Round-robin + Fallback** when a key hits rate limit
- Only **free models** (`:free`) are allowed
- Fully compatible with OpenAI API format
- Supports both streaming and non-streaming responses
- Ready to use in apps like Open WebUI, SillyTavern, LobeChat, Continue, etc.

### Demo
Base URL: https://your-worker.workers.dev/v1


### How to Deploy

1. Create a new Worker in [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Copy the content of `src/index.js` into the Worker
3. Go to **Settings → Variables and Secrets** and add your keys:
   - `OPENROUTER_KEY_1`
   - `OPENROUTER_KEY_2`
   - ...
   - `OPENROUTER_KEY_12`
4. Deploy the Worker

### How to Use

In any application that supports OpenAI-compatible API:

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Base URL      | `https://your-worker.workers.dev/v1`      |
| API Key       | `sk-123` (or any dummy value)             |

### Example (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-worker.workers.dev/v1",
    api_key="dummy"
)

response = client.chat.completions.create(
    model="google/gemma-4-31b-it:free",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)



Notes

Free models on OpenRouter can become overloaded. The proxy will automatically try the next key.
If all keys are rate-limited, you will receive a 429 error. Just wait a few minutes and try again.

License
MIT License
