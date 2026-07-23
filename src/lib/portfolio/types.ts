export type PositionRow = {
  id: string;
  assetSymbol: string;
  amount: number;
  avgEntryPrice: number;
  positionType: string;
  leverage: number | null;
  entryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SignalHint = {
  direction: string;
  outcome: string | null;
  timeframe: string;
  createdAt: string;
};
