export interface BundleToken {
  id: string;
  bundleId: string;
  tokenMint: string;
  tokenSymbol: string;
  percentage: number;
  displayOrder: number;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  totalUsdValue: number;
  displayOrder: number;
  isActive: boolean;
  badgeText: string | null;
  badgeColor: string | null;
  tokens: BundleToken[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BundleTokenAmount {
  symbol: string;
  mint: string;
  percentage: number;
  usdValue: number;
  tokenAmount: number;
  currentPrice: number;
}

export interface BundleCalculation {
  bundleName: string;
  totalUsdValue: number;
  tokens: BundleTokenAmount[];
}

