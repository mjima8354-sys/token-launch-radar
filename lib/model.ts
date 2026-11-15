// Model implementation for Token Radar (Node 22, stdlib only).
// Implied valuation model based on category market-cap multiples calibrated from live market comps inside the snapshot.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_clamp_min: number;
  base_clamp_max: number;
  growth_weight: number;
  growth_min: number;
  growth_max: number;
  maturity_base: number;
  maturity_slope: number;
  maturity_cap_days: number;
  default_age_days: number;
}

export const MODEL: ModelConstants = {
  base_clamp_min: 0.15,
  base_clamp_max: 6.0,
  growth_weight: 0.4,
  growth_min: -60,
  growth_max: 150,
  maturity_base: 0.75,
  maturity_slope: 0.5,
  maturity_cap_days: 1460,
  default_age_days: 730,
};

export const MODEL_VERSION = 'radar-v2-comps';

export interface LiveCompRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl_ratio: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  is_watchlist: boolean;
  age_days: number;
  implied_value_usd: number;
  category_ratio: number;
  growth_mult: number;
  maturity_mult: number;
  chain_mult: number;
  airdrop_readiness: number;
  value_band: 'Mega' | 'Growth' | 'Emerging' | 'Watch';
  why: string;
  farm_steps: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  global_median_ratio: number;
  board_size: number;
  watchlist_size: number;
  early_size: number;
  live_size: number;
  category_stats: Record<string, { count: number; median_ratio: number }>;
  rows: BoardRow[];
  live_comps: LiveCompRow[];
}

const TIER1_CHAINS = new Set(['Ethereum', 'Solana', 'Base', 'Arbitrum']);
const TIER2_CHAINS = new Set(['Avalanche', 'Polygon', 'Optimism', 'Binance', 'BSC', 'Bitcoin', 'Sui', 'Linea', 'Monad', 'Hyperliquid L1']);

function calcMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0.5;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function calcAgeDays(asOfStr: string, listedAtStr: string | null): number {
  if (!listedAtStr) return MODEL.default_age_days;
  const asOf = Date.parse(asOfStr);
  const listed = Date.parse(listedAtStr);
  if (Number.isNaN(asOf) || Number.isNaN(listed)) return MODEL.default_age_days;
  const diff = Math.floor((asOf - listed) / (86400 * 1000));
  return Math.max(0, diff);
}

function getChainMult(chains: string[]): number {
  const extraBonus = Math.min(0.30, Math.max(0, (chains.length - 1) * 0.06));
  const hasTier1 = chains.some((c) => TIER1_CHAINS.has(c));
  const hasTier2 = chains.some((c) => TIER2_CHAINS.has(c) && !TIER1_CHAINS.has(c));
  const tier1Bonus = hasTier1 ? 0.10 : 0;
  const tier2Bonus = hasTier2 ? 0.05 : 0;
  return Number((1.0 + extraBonus + tier1Bonus + tier2Bonus).toFixed(3));
}

function getGrowthMult(change7d: number | null): number {
  if (change7d === null || change7d === undefined) return 1.0;
  const clamped = Math.min(MODEL.growth_max, Math.max(MODEL.growth_min, change7d));
  return Number((1.0 + (MODEL.growth_weight * clamped) / 100).toFixed(3));
}

function getMaturityMult(ageDays: number): number {
  const cappedDays = Math.min(ageDays, MODEL.maturity_cap_days);
  const mult = MODEL.maturity_base + MODEL.maturity_slope * (cappedDays / MODEL.maturity_cap_days);
  return Number(mult.toFixed(3));
}

function calcReadiness(tvlUsd: number, ageDays: number, change7d: number | null): number {
  const tvlScore = Math.min(40, Math.max(5, Math.round((Math.log10(Math.max(1000, tvlUsd)) / 10) * 40)));
  const ageScore = Math.min(35, Math.round((ageDays / MODEL.maturity_cap_days) * 35));
  const growthVal = change7d === null ? 0 : change7d;
  const growthScore = Math.min(25, Math.max(0, Math.round(((growthVal + 30) / 120) * 25)));
  return Math.min(99, Math.max(10, tvlScore + ageScore + growthScore));
}

function calcValueBand(impliedValue: number): 'Mega' | 'Growth' | 'Emerging' | 'Watch' {
  if (impliedValue >= 500_000_000) return 'Mega';
  if (impliedValue >= 50_000_000) return 'Growth';
  if (impliedValue >= 5_000_000) return 'Emerging';
  return 'Watch';
}

function generateFarmSteps(p: SnapshotProtocol, ageDays: number): string[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const cat = (p.category || '').toLowerCase();
  const name = p.name;
  const holdDays = ageDays > 365 ? 30 : ageDays > 180 ? 45 : 60;
  const capitalStr = p.tvl_usd >= 100_000_000 ? '$1,000–$3,000' : p.tvl_usd >= 10_000_000 ? '$500–$1,500' : '$200–$600';

  let primaryAction = `Vault Strategy: Deposit ${capitalStr} into the automated yield strategy on ${name} (${chain}) and keep capital deployed across 4+ snapshot cycles.`;

  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
    primaryAction = `Supply & Borrow: Supply ${capitalStr} of USDC/ETH collateral on ${name} (${chain}) and open a conservative 15% LTV borrow position to establish borrowing history.`;
  } else if (cat.includes('dex') || cat.includes('liquidity') || cat.includes('farm') || cat.includes('swap')) {
    primaryAction = `Liquidity Provision: Deposit ${capitalStr} of dual-sided liquidity into the top-volume ETH/USDC pair on ${name} (${chain}) and retain LP tokens in wallet.`;
  } else if (cat.includes('bridge')) {
    primaryAction = `Cross-Chain Bridge: Route ${capitalStr} worth of USDC across chains using ${name}, executing at least 3 distinct volume transactions over 4 weeks.`;
  } else if (cat.includes('stak') || cat.includes('restak')) {
    primaryAction = `Staking Derivative: Mint liquid staking receipt tokens by depositing ETH/SOL into ${name} on ${chain} and hold the liquid derivative position.`;
  } else if (cat.includes('perp') || cat.includes('derivative') || cat.includes('option')) {
    primaryAction = `Perpetual Trading: Deposit ${capitalStr} margin on ${name} and execute 3–5 low-leverage (1.5x) hedged trades across multiple calendar weeks.`;
  } else if (cat.includes('infra') || cat.includes('chain') || cat.includes('privacy') || cat.includes('ai')) {
    primaryAction = `Network Interaction: Deploy a contract or execute ${capitalStr} worth of native protocol operations on ${name} (${chain}) across active testnet/mainnet routes.`;
  }

  return [
    `Wallet Setup: Configure a fresh, isolated farming wallet on ${chain} loaded with ${capitalStr} and sufficient gas funds; keep seed phrases offline.`,
    primaryAction,
    `Recurring Engagement: Perform 1 routine on-chain interaction every 7–10 days on ${chain} (such as minor rebalancing or voting) to build a continuous activity timeline.`,
    `Holding Commitment: Maintain active protocol presence for at least ${holdDays} days (~$2–$8 gas total on L2 networks, ~$15–$35 on Ethereum mainnet).`,
    `Rewards Verification: Track protocol point distributions weekly and claim official rewards exclusively through verified documentation links upon mainnet launch.`,
  ];
}

export function parseSnapshot(jsonText: string): Snapshot {
  const o = JSON.parse(jsonText);
  if (!o || typeof o !== 'object') throw new Error('Invalid snapshot JSON');
  return {
    as_of: String(o.as_of),
    source: String(o.source),
    floor_usd: Number(o.floor_usd),
    protocols: Array.isArray(o.protocols) ? o.protocols : [],
    watchlist: Array.isArray(o.watchlist) ? o.watchlist : [],
  };
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const liveProtocols: SnapshotProtocol[] = [];
  const preProtocols: SnapshotProtocol[] = [];

  for (const p of snapshot.protocols) {
    const isLive = p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
    if (isLive) {
      liveProtocols.push(p);
    } else {
      preProtocols.push(p);
    }
  }

  // Calibrate category multiples from live market comparables
  const globalRatios: number[] = [];
  const catRatiosMap: Record<string, number[]> = {};

  for (const p of liveProtocols) {
    if (p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      globalRatios.push(ratio);
      const cat = p.category || 'Uncategorized';
      if (!catRatiosMap[cat]) catRatiosMap[cat] = [];
      catRatiosMap[cat]!.push(ratio);
    }
  }

  const globalMedianRatio = calcMedian(globalRatios);
  const categoryStats: Record<string, { count: number; median_ratio: number }> = {};

  for (const [cat, ratios] of Object.entries(catRatiosMap)) {
    const count = ratios.length;
    const med = calcMedian(ratios);
    let blended: number;
    if (count >= 3) {
      blended = med;
    } else if (count > 0) {
      blended = 0.65 * med + 0.35 * globalMedianRatio;
    } else {
      blended = globalMedianRatio;
    }
    const clamped = Math.min(MODEL.base_clamp_max, Math.max(MODEL.base_clamp_min, blended));
    categoryStats[cat] = { count, median_ratio: Number(clamped.toFixed(4)) };
  }

  function getCatMult(category: string | null): number {
    const cat = category || 'Uncategorized';
    if (categoryStats[cat]) {
      return categoryStats[cat]!.median_ratio;
    }
    const clamped = Math.min(MODEL.base_clamp_max, Math.max(MODEL.base_clamp_min, globalMedianRatio));
    return Number(clamped.toFixed(4));
  }

  // Score all pre-token protocols
  const scoredPre = preProtocols.map((p) => {
    const ageDays = calcAgeDays(snapshot.as_of, p.listed_at);
    const catMult = getCatMult(p.category);
    const growthMult = getGrowthMult(p.change_7d);
    const maturityMult = getMaturityMult(ageDays);
    const chainMult = getChainMult(p.chains || []);

    const rawImplied = p.tvl_usd * catMult * growthMult * maturityMult * chainMult;
    const floorImplied = Math.max(1, Math.round(p.tvl_usd * 0.05));
    const impliedVal = Math.max(floorImplied, Math.round(rawImplied));

    return {
      protocol: p,
      ageDays,
      catMult,
      growthMult,
      maturityMult,
      chainMult,
      impliedVal,
    };
  });

  // Sort by implied value descending, stable tie-break by slug
  scoredPre.sort((a, b) => {
    if (b.impliedVal !== a.impliedVal) return b.impliedVal - a.impliedVal;
    return a.protocol.slug.localeCompare(b.protocol.slug);
  });

  const watchlistSet = new Set(snapshot.watchlist);

  // Take top ~200 pre-token protocols (or all if < 200), ensuring all watchlist protocols are included
  const targetCount = Math.min(scoredPre.length, Math.max(180, watchlistSet.size));
  const selectedSet = new Set<string>();

  // First add top targetCount protocols
  for (let i = 0; i < targetCount; i++) {
    selectedSet.add(scoredPre[i]!.protocol.slug);
  }

  // Ensure every watchlist slug is in selectedSet
  for (const item of scoredPre) {
    if (watchlistSet.has(item.protocol.slug)) {
      selectedSet.add(item.protocol.slug);
    }
  }

  const selectedScored = scoredPre.filter((item) => selectedSet.has(item.protocol.slug));

  // Re-sort to maintain strict order by impliedVal descending
  selectedScored.sort((a, b) => {
    if (b.impliedVal !== a.impliedVal) return b.impliedVal - a.impliedVal;
    return a.protocol.slug.localeCompare(b.protocol.slug);
  });

  const board: BoardRow[] = selectedScored.map((item, idx) => {
    const p = item.protocol;
    const rank = idx + 1;
    const isWatchlist = watchlistSet.has(p.slug);
    const readiness = calcReadiness(p.tvl_usd, item.ageDays, p.change_7d);
    const band = calcValueBand(item.impliedVal);

    const tvlStr = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(2)}B` : `$${(p.tvl_usd / 1e6).toFixed(1)}M`;
    const growthStr = p.change_7d !== null ? `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% 7d` : 'stable 7d';
    const ageStr = `${item.ageDays} days with no token`;
    const why = `${tvlStr} TVL, ${growthStr}, ${ageStr}; comps put ${p.category || 'protocol'} multiple at ${item.catMult.toFixed(2)}x TVL.`;

    const steps = generateFarmSteps(p, item.ageDays);

    return {
      rank,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains || [],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: null,
      listed_at: p.listed_at,
      gecko_id: null,
      symbol: null,
      token_status: 'pre-token',
      is_watchlist: isWatchlist,
      age_days: item.ageDays,
      implied_value_usd: item.impliedVal,
      category_ratio: item.catMult,
      growth_mult: item.growthMult,
      maturity_mult: item.maturityMult,
      chain_mult: item.chainMult,
      airdrop_readiness: readiness,
      value_band: band,
      why,
      farm_steps: steps,
    };
  });

  // Prepare market live comps table (top live protocols by mcap)
  const validLive = liveProtocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  validLive.sort((a, b) => b.mcap_usd! - a.mcap_usd!);
  const liveComps: LiveCompRow[] = validLive.slice(0, 20).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains || [],
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    change_7d: p.change_7d,
    mcap_tvl_ratio: Number((p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0).toFixed(4)),
  }));

  const earlySize = board.filter((r) => !watchlistSet.has(r.slug)).length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    global_median_ratio: Number(globalMedianRatio.toFixed(4)),
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    early_size: earlySize,
    live_size: liveProtocols.length,
    category_stats: categoryStats,
    rows: board,
    live_comps: liveComps,
  };

  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
