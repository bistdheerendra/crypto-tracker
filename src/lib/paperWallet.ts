import { getPrisma } from "@/lib/db";

export type PaperWalletRow = {
  id: string;
  startingBalance: number;
  cashBalance: number;
  updatedAt: Date;
};

export async function getOrCreatePaperWallet(
  prisma: NonNullable<ReturnType<typeof getPrisma>>
): Promise<PaperWalletRow> {
  const first = await prisma.paperWallet.findFirst();
  if (first) return first;
  return prisma.paperWallet.create({ data: {} });
}
