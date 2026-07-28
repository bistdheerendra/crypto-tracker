export type PositionRow = {
  id: string;
  assetSymbol: string;
  amount: number;
  closedAmount: number;
  status: string;
  avgEntryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitedAt: string | null;
  exitPrice: number | null;
  realizedPnl: number;
  positionType: string;
  leverage: number | null;
  entryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaperWallet = {
  id: string;
  startingBalance: number;
  cashBalance: number;
  updatedAt: string;
};

export type SignalHint = {
  direction: string;
  outcome: string | null;
  timeframe: string;
  createdAt: string;
};
