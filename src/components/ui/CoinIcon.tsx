const COIN_ICON_URL: Record<string, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  BNB: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  XRP: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
  PAXG: "https://assets.coingecko.com/coins/images/9519/small/paxgold.png",
};

interface CoinIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export function CoinIcon({ symbol, size = 36, className = "" }: CoinIconProps) {
  const key = symbol.toUpperCase();
  const src = COIN_ICON_URL[key];

  if (!src) {
    return (
      <div
        className={`rounded-full bg-white/10 flex items-center justify-center font-mono-data text-xs font-bold text-text-muted shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {key.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`rounded-full shrink-0 object-cover ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}

export function pairBaseSymbol(pair: string): string {
  return pair.split("/")[0]?.toUpperCase() ?? pair;
}
