/**
 * Standalone SoSoValue probe — same URL/headers as providers/sosovalue.ts.
 * Run: npx tsx scripts/test-sosovalue.ts
 */
import "dotenv/config";

const BASE_URL = "https://openapi.sosovalue.com/openapi/v1";
const apiKey = process.env.SOSOVALUE_API_KEY?.trim();

async function probe(path: string) {
  console.log(`\n=== GET ${BASE_URL}${path} ===`);
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "x-soso-api-key": apiKey!,
    },
  });
  const text = await res.text();
  console.log(`status: ${res.status}`);
  console.log(`body: ${text.slice(0, 2000)}`);
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    console.log(`top-level keys: ${Object.keys(json).join(", ")}`);
    if ("code" in json) console.log(`code: ${json.code}, message: ${json.message}`);
    if ("data" in json) {
      const data = json.data;
      console.log(`data type: ${Array.isArray(data) ? "array" : typeof data}`);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        console.log(`data keys: ${Object.keys(data as object).join(", ")}`);
      }
      if (Array.isArray(data)) {
        console.log(`data length: ${data.length}`);
        if (data[0]) console.log(`first item keys: ${Object.keys(data[0] as object).join(", ")}`);
      }
    }
  } catch {
    console.log("(body is not JSON)");
  }
}

async function main() {
  console.log(`SOSOVALUE_API_KEY present: ${!!apiKey}`);
  if (!apiKey) {
    console.error("No SOSOVALUE_API_KEY in env — aborting");
    process.exit(1);
  }

  await probe("/etfs?symbol=BTC&country_code=US");
  await probe("/etfs/IBIT/market-snapshot");
  await probe("/etfs/IBIT/history?limit=1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
