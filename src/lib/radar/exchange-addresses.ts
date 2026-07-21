/** Known exchange hot-wallet addresses (lowercase) for direction inference. */
export const EXCHANGE_WALLET_ADDRESSES = new Set([
  // Binance (publicly labeled on-chain)
  "34xp4vrocdqwytzkwiv6ygq5gdpyv8sytq",
  "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut2tl2mgrh",
  "1ndyjntntjmwk5xpnhjgamu4hdhigtobu1s",
  "3kzh9qavwqhesfqz7zeql1eusx5tynlns",
  "3cbxcguyutrqrk3qhwefgakcnsrdhhovd",
  "bc1q9vza2e8x326ca0l0zja8jldys95q7j3c9d0hq",
  "1feexv6ahxnykmclm7pradnja3cytjkwjh",
]);

export function isExchangeAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (EXCHANGE_WALLET_ADDRESSES.has(normalized)) return true;
  if (normalized.includes("exchange")) return true;
  return false;
}

export type WhaleDirection = "in" | "out" | "unknown";

export function inferBtcDirection(
  inputAddresses: string[],
  outputAddresses: string[]
): WhaleDirection {
  const exchangeInInputs = inputAddresses.some(isExchangeAddress);
  const exchangeInOutputs = outputAddresses.some(isExchangeAddress);

  if (exchangeInInputs && !exchangeInOutputs) return "in";
  if (exchangeInOutputs && !exchangeInInputs) return "out";
  return "unknown";
}
