
const COINDCX_API = "https://api.coindcx.com/exchange/ticker";
const GITHUB_API = "https://api.github.com";
const RATE_FILE = "usdt-inr.json";

async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getCoinDCXRate() {
  const response = await fetchWithTimeout(
    COINDCX_API,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "CoinDCX-USDTINR-Updater"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`CoinDCX API error: HTTP ${response.status}`);
  }

  const tickers = await response.json();

  if (!Array.isArray(tickers)) {
    throw new Error("Invalid CoinDCX API response");
  }

  const ticker = tickers.find(item => item.market === "USDTINR");

  if (!ticker) {
    throw new Error("USDTINR market not found");
  }

  const rate = Number(ticker.last_price);

  if (!Number.isFinite(rate) || rate < 50 || rate > 300) {
    throw new Error(`Implausible USDTINR rate: ${ticker.last_price}`);
  }

  return rate;
}

async function githubRequest(url, env, options = {}) {
  const response = await fetchWithTimeout(
    url,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CoinDCX-Rate-Updater",
        ...options.headers
      }
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `GitHub API error: HTTP ${response.status}: ${message.slice(0, 1000)}`
    );
  }

  return response.json();
}

function encodeBase64UTF8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

async function updateGitHubRate(rate, env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("Missing GitHub configuration or GITHUB_TOKEN secret");
  }

  const fileUrl =
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/contents/${RATE_FILE}?ref=${encodeURIComponent(branch)}`;

  const existingFile = await githubRequest(fileUrl, env);

  if (!existingFile.sha) {
    throw new Error("GitHub did not return the existing JSON file SHA");
  }

  const updatedData = {
    usdtInr: rate,
    source: "CoinDCX",
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  };

  const content = JSON.stringify(updatedData, null, 2) + "\n";

  const updateUrl =
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/contents/${RATE_FILE}`;

  const result = await githubRequest(updateUrl, env, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update CoinDCX USDTINR rate",
      content: encodeBase64UTF8(content),
      sha: existingFile.sha,
      branch
    })
  });

  if (!result.commit || !result.content) {
    throw new Error("GitHub update response is incomplete");
  }

  return {
    rate,
    updatedAt: updatedData.updatedAt,
    commit: result.commit.sha
  };
}

async function runUpdate(env) {
  console.log("Starting CoinDCX USDTINR update");

  const rate = await getCoinDCXRate();

  console.log(`CoinDCX USDTINR rate: ${rate}`);

  const result = await updateGitHubRate(rate, env);

  console.log("GitHub JSON successfully updated", result);

  return result;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runUpdate(env).catch(error => {
        console.error("Scheduled rate update failed:", error);
        throw error;
      })
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        status: "online",
        worker: "coindcx-rate-updater",
        schedule: "19,49 * * * *"
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
