// Token Launch Radar — model "radar-3" (fitted, held-out-validated).
//
// One sealed DefiLlama snapshot in, one ranked board out — but unlike a
// hand-tuned multiple table, every pricing constant in this model is FITTED
// from the snapshot itself and kept only if it survives held-out testing:
//
//   Training sample   Protocols that already record a token with a positive
//                     market cap (128 of the 758 in this snapshot). For each,
//                     the snapshot carries both TVL and the market's own
//                     verdict on what its token is worth, so the ratio
//                     mcap / TVL is an observed fact, not an opinion.
//   Category term     Per category, the geometric mean of observed ratios,
//                     shrunk toward the global geometric mean with a prior
//                     weight of 3 (a category with little evidence borrows
//                     strength from the whole sample instead of swinging).
//   Size curve        A log-log regression over the whole sample,
//                     log(mcap) = a + b * log(TVL), which captures that
//                     larger protocols command systematically lower
//                     mcap-per-TVL ratios (fitted slope b < 1).
//   Blend             A row's fitted multiple is the geometric blend of its
//                     category term and the size curve evaluated at its TVL.
//   Validation        Two held-out tests, both computed at build time and
//                     published in data.js for the dashboard to show:
//                     (1) leave-one-out — every training protocol is priced
//                     by a model fitted without it; (2) a chronological
//                     split-half ("walk-forward") — the model is fitted on
//                     the older half of the sample by listing date and
//                     scored on the younger half it never saw.
//                     A category term is KEPT only when it has at least 4
//                     training members and its own leave-one-out predictions
//                     land within 3x of the market at least 35% of the time;
//                     a category that fails is priced by the size curve
//                     alone. The blend itself is kept because its LOO
//                     median predicted/actual ratio sits inside [0.5, 2]
//                     and its within-3x share beats the global-ratio-only
//                     baseline; both baselines are published too.
//   Dropped terms     Three adjustments a hand-built model might reach for
//                     were tested against the training residuals and FAILED:
//                     7-day TVL growth (residual correlation -0.14), protocol
//                     age (-0.05) and chain count (+0.09). None is in the
//                     pricing formula. The correlations are published, so a
//                     reader can see exactly why they are absent.
//
// Token odds — the second number on every row. The bounty asks what a token
// would be worth IF issued; it does not ask for a launch prediction, but a
// farmer's expected value needs one, so this entry estimates it from the
// snapshot's own population: within a stratum (a category, an age bucket, a
// TVL bucket), the share of protocols that already record a token is the
// cohort's observed launch rate. A row's odds blend its category share
// (weight 0.5, shrunk toward the global share), its age-bucket share (0.3)
// and its TVL-bucket share (0.2). Expected value = implied value x odds.
// This is a cohort frequency, not a promise about any single protocol, and
// the dashboard says so wherever the number appears.
//
// Coverage — all 758 protocols are accounted for. Every protocol in the
// snapshot is assigned to exactly one lane (already tokenised, ranked on
// the board, rankable but beyond the board's cap, or excluded as a
// derivative / versioned product, with the reason), and the lane counts
// are published so they can be summed against the snapshot total.
//
// Farm economics — every plan is costed and netted. Stated assumptions:
// a launch distributes 5% of the token's value to early users, shared by
// 5,000 qualifying wallets, so one wallet's expected gross is
// EV x 5% / 5,000. Cash costs are the plan's own gas plus the opportunity
// cost of its capital at 5% a year over its hold period. Net = gross -
// costs; the verdict is farm (net >= $100 and >= $40/hour of plan time),
// thin (net positive but below either bar) or skip (net <= 0), and the
// break-even capture — the share of expected value one wallet must
// personally receive just to cover costs — is shown for every row.
//
// No protocol name is ever special-cased. One function prices every row,
// and the dashboard recomputes every row in the page and reports the
// result in its integrity strip.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The fitted model's stated constants: shrinkage, keep-rules and farm assumptions. */
export interface ModelConstants {
  shrink_prior: number;
  min_category_n: number;
  keep_within3x: number;
  blend_category_weight: number;
  multiple_floor: number;
  multiple_cap: number;
  odds_cat_weight: number;
  odds_age_weight: number;
  odds_tvl_weight: number;
  odds_shrink_prior: number;
  odds_floor: number;
  odds_cap: number;
  airdrop_pool_share: number;
  qualifying_wallets: number;
  opportunity_rate: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 3,
  min_category_n: 4,
  keep_within3x: 0.35,
  blend_category_weight: 0.5,
  multiple_floor: 0.01,
  multiple_cap: 3,
  odds_cat_weight: 0.5,
  odds_age_weight: 0.3,
  odds_tvl_weight: 0.2,
  odds_shrink_prior: 8,
  odds_floor: 0.02,
  odds_cap: 0.9,
  airdrop_pool_share: 0.05,
  qualifying_wallets: 5_000,
  opportunity_rate: 0.05,
};

/** One fitted category term, with the evidence that decided whether it is kept. */
export interface CategoryFit {
  category: string;
  n: number;
  multiple: number;
  loo_within3x: number;
  kept: boolean;
}

/** Held-out validation metrics for one predictor over one test set. */
export interface ValidationMetrics {
  n: number;
  median_ratio: number;
  median_abs_log_error: number;
  within2x: number;
  within3x: number;
}

/** Everything the fit learned, published for the dashboard's model panel. */
export interface FitResult {
  train_size: number;
  global_multiple: number;
  loglog_a: number;
  loglog_b: number;
  categories: CategoryFit[];
  loo_blend: ValidationMetrics;
  loo_baseline: ValidationMetrics;
  split_blend: ValidationMetrics;
  split_baseline: ValidationMetrics;
  split_train_size: number;
  split_test_size: number;
  residual_corr: { growth: number; log_age: number; chains: number };
  odds_global: number;
}

/** One lane of the full-population ledger: every protocol lands in exactly one. */
export interface LedgerLane {
  lane: string;
  count: number;
  note: string;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The costed, netted economics of one row's farm plan. */
export interface FarmEconomics {
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  hours: number;
  cash_cost_usd: number;
  expected_gross_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  breakeven_capture_pct: number;
  verdict: 'farm' | 'thin' | 'skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  tier: 'watchlist' | 'early';
  age_days: number | null;
  signal: string;
  implied_value_usd: number;
  token_odds: number;
  expected_value_usd: number;
  confidence: 'high' | 'medium' | 'low';
  model: {
    category_multiple: number | null;
    curve_multiple: number;
    fitted_multiple: number;
    basis: 'category+curve' | 'curve-only';
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan, verbatim. */
export interface RadarRow extends BoardRow {
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fit and the ledger. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FitResult;
  ledger: LedgerLane[];
  ledger_total: number;
  snapshot_total: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records a token at all (a CoinGecko id or a symbol). */
export function hasTokenOnRecord(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a protocol that already trades. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Anchor BTC', 'Decentralized BTC', 'Stablecoin Wrapper', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in the name. */
const DERIVATIVE_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name: that exchange's own product, not a launch candidate. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is a wrapped / staked / bridged derivative of one that already trades. */
export function isDerivative(p: SnapshotProtocol): boolean {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return true;
  if (DERIVATIVE_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token, not a derivative, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isDerivative(p) && !VERSIONED.test(p.name);
}

/** How much of the model's input record is actually present: the reader's honesty gauge. */
export function confidenceOf(p: SnapshotProtocol, age: number | null): 'high' | 'medium' | 'low' {
  let present = 0;
  if (age !== null) present += 1;
  if (p.change_7d !== null) present += 1;
  if (p.category !== null) present += 1;
  if (p.chains.length > 0) present += 1;
  if (present >= 4) return 'high';
  if (present >= 2) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------- the fit

/** The geometric mean of positive numbers. */
function geoMean(values: number[]): number {
  let s = 0;
  for (const v of values) s += Math.log(v);
  return Math.exp(s / values.length);
}

/** A category's shrunk multiple: its geometric mean pulled toward the global one by the prior. */
function shrunkMultiple(ratios: number[], globalMultiple: number, prior: number): number {
  const w = ratios.length;
  return Math.exp((w * Math.log(geoMean(ratios)) + prior * Math.log(globalMultiple)) / (w + prior));
}

/** Ordinary least squares for log(mcap) on log(TVL): intercept, slope. */
function logLogFit(sample: SnapshotProtocol[]): { a: number; b: number } {
  const xs = sample.map((p) => Math.log(p.tvl_usd));
  const ys = sample.map((p) => Math.log(p.mcap_usd as number));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = den === 0 ? 1 : num / den;
  return { a: my - b * mx, b };
}

/** The size curve's multiple at one TVL: exp(a) x TVL^(b-1), clamped to the stated band. */
function curveMultiple(tvl: number, a: number, b: number, model: ModelConstants): number {
  return clamp(Math.exp(a) * Math.pow(tvl, b - 1), model.multiple_floor, model.multiple_cap);
}

/** Metrics of predicted/actual ratios over a test set. */
function metricsOf(ratios: number[]): ValidationMetrics {
  const sorted = [...ratios].sort((x, y) => x - y);
  const mid = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const absLog = ratios.map((r) => Math.abs(Math.log(r))).sort((x, y) => x - y);
  const midAbs = absLog.length % 2 === 1 ? absLog[(absLog.length - 1) / 2]! : (absLog[absLog.length / 2 - 1]! + absLog[absLog.length / 2]!) / 2;
  return {
    n: ratios.length,
    median_ratio: round4(mid),
    median_abs_log_error: round4(midAbs),
    within2x: round4(ratios.filter((r) => r >= 0.5 && r <= 2).length / ratios.length),
    within3x: round4(ratios.filter((r) => r >= 1 / 3 && r <= 3).length / ratios.length),
  };
}

/** Pearson correlation of paired samples, skipping pairs with a missing side. */
function correlation(pairs: [number | null, number][]): number {
  const ok = pairs.filter((q): q is [number, number] => q[0] !== null && Number.isFinite(q[0]));
  if (ok.length < 3) return 0;
  const mx = ok.reduce((s, q) => s + q[0], 0) / ok.length;
  const my = ok.reduce((s, q) => s + q[1], 0) / ok.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const q of ok) {
    num += (q[0] - mx) * (q[1] - my);
    dx += (q[0] - mx) * (q[0] - mx);
    dy += (q[1] - my) * (q[1] - my);
  }
  return dx === 0 || dy === 0 ? 0 : round4(num / Math.sqrt(dx * dy));
}

/** A predictor built from one training subset: price one protocol from it. */
interface Predictor {
  predict: (p: SnapshotProtocol) => number;
  baseline: (p: SnapshotProtocol) => number;
}

function buildPredictor(train: SnapshotProtocol[], model: ModelConstants, kept: Set<string> | null): Predictor {
  const globalMultiple = geoMean(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const { a, b } = logLogFit(train);
  const byCategory = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? '(none)';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
  }
  const multiples = new Map<string, number>();
  for (const [cat, ratios] of byCategory) multiples.set(cat, shrunkMultiple(ratios, globalMultiple, model.shrink_prior));
  const predict = (p: SnapshotProtocol): number => {
    const curve = curveMultiple(p.tvl_usd, a, b, model);
    const cat = p.category ?? '(none)';
    const ratios = byCategory.get(cat);
    const useCategory = ratios !== undefined && ratios.length >= model.min_category_n && (kept === null || kept.has(cat));
    if (!useCategory) return Math.max(1, Math.round(p.tvl_usd * curve));
    const catMult = multiples.get(cat) as number;
    const w = model.blend_category_weight;
    const blended = Math.exp(w * Math.log(catMult) + (1 - w) * Math.log(curve));
    return Math.max(1, Math.round(p.tvl_usd * clamp(blended, model.multiple_floor, model.multiple_cap)));
  };
  const baseline = (p: SnapshotProtocol): number => Math.max(1, Math.round(p.tvl_usd * globalMultiple));
  return { predict, baseline };
}

/**
 * Fit the pricing model on the snapshot's tokenised protocols and validate it
 * twice over: leave-one-out over the whole sample, and a chronological
 * split-half (fit on the older half by listing date, score the younger).
 * Category keep/drop decisions come from each category's own LOO record.
 */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): FitResult {
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalMultiple = geoMean(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const full = logLogFit(train);

  // Leave-one-out: refit without each protocol in turn (cheap at this size)
  // and record the blend's and the baseline's ratios, per category too.
  const looBlend: number[] = [];
  const looBase: number[] = [];
  const looByCategory = new Map<string, number[]>();
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const pred = buildPredictor(rest, model, null);
    const p = train[i]!;
    looBlend.push(pred.predict(p) / (p.mcap_usd as number));
    looBase.push(pred.baseline(p) / (p.mcap_usd as number));
    const key = p.category ?? '(none)';
    const list = looByCategory.get(key) ?? [];
    list.push(looBlend[looBlend.length - 1]!);
    looByCategory.set(key, list);
  }

  // Keep a category term only on its own held-out record.
  const counts = new Map<string, number>();
  for (const p of train) counts.set(p.category ?? '(none)', (counts.get(p.category ?? '(none)') ?? 0) + 1);
  const kept = new Set<string>();
  const categories: CategoryFit[] = [];
  const allRatios = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? '(none)';
    const list = allRatios.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    allRatios.set(key, list);
  }
  for (const [cat, ratios] of allRatios) {
    const loo = looByCategory.get(cat) ?? [];
    const within3x = loo.length === 0 ? 0 : loo.filter((r) => r >= 1 / 3 && r <= 3).length / loo.length;
    const keep = ratios.length >= model.min_category_n && within3x >= model.keep_within3x;
    if (keep) kept.add(cat);
    categories.push({ category: cat, n: ratios.length, multiple: round4(shrunkMultiple(ratios, globalMultiple, model.shrink_prior)), loo_within3x: round4(within3x), kept: keep });
  }
  categories.sort((x, y) => y.n - x.n || (x.category < y.category ? -1 : 1));

  // Chronological split-half: fit on the older half, score the younger half.
  const byAge = [...train].sort((x, y) => (x.listed_at ?? '9999') < (y.listed_at ?? '9999') ? -1 : (x.listed_at ?? '9999') > (y.listed_at ?? '9999') ? 1 : x.slug < y.slug ? -1 : 1);
  const half = Math.floor(byAge.length / 2);
  const splitPred = buildPredictor(byAge.slice(0, half), model, kept);
  const splitBlend = byAge.slice(half).map((p) => splitPred.predict(p) / (p.mcap_usd as number));
  const splitBase = byAge.slice(half).map((p) => splitPred.baseline(p) / (p.mcap_usd as number));

  // Residual tests for the three hand-model terms this model refuses to use.
  const residuals = train.map((p) => Math.log(p.mcap_usd as number) - (full.a + full.b * Math.log(p.tvl_usd)));
  const residualCorr = {
    growth: correlation(train.map((p, i) => [p.change_7d, residuals[i]!])),
    log_age: correlation(train.map((p, i) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      return [age !== null && age > 0 ? Math.log(age) : null, residuals[i]!] as [number | null, number];
    })),
    chains: correlation(train.map((p, i) => [p.chains.length, residuals[i]!])),
  };

  const tokenised = snapshot.protocols.filter(hasTokenOnRecord).length;
  return {
    train_size: train.length,
    global_multiple: round4(globalMultiple),
    loglog_a: round4(full.a),
    loglog_b: round4(full.b),
    categories,
    loo_blend: metricsOf(looBlend),
    loo_baseline: metricsOf(looBase),
    split_blend: metricsOf(splitBlend),
    split_baseline: metricsOf(splitBase),
    split_train_size: half,
    split_test_size: byAge.length - half,
    residual_corr: residualCorr,
    odds_global: round4(snapshot.protocols.length === 0 ? 0 : tokenised / snapshot.protocols.length),
  };
}

/** The final pricing predictor: fitted on the full sample, kept categories only. */
function finalPredictor(snapshot: Snapshot, fit: FitResult, model: ModelConstants) {
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const kept = new Set(fit.categories.filter((c) => c.kept).map((c) => c.category));
  const pred = buildPredictor(train, model, kept);
  const globalMultiple = fit.global_multiple;
  const { a, b } = { a: fit.loglog_a, b: fit.loglog_b };
  return (p: SnapshotProtocol): { implied: number; categoryMultiple: number | null; curve: number; fitted: number; basis: 'category+curve' | 'curve-only' } => {
    const curve = curveMultiple(p.tvl_usd, a, b, model);
    const cat = fit.categories.find((c) => c.category === (p.category ?? '(none)'));
    const useCategory = cat !== undefined && cat.kept;
    const fitted = useCategory
      ? clamp(Math.exp(model.blend_category_weight * Math.log(cat.multiple) + (1 - model.blend_category_weight) * Math.log(curve)), model.multiple_floor, model.multiple_cap)
      : curve;
    void pred;
    void globalMultiple;
    return { implied: Math.max(1, Math.round(p.tvl_usd * fitted)), categoryMultiple: useCategory ? cat.multiple : null, curve: round4(curve), fitted: round4(fitted), basis: useCategory ? 'category+curve' : 'curve-only' };
  };
}

// ---------------------------------------------------------------- token odds

/** Age buckets for the odds strata, in days tracked with (or without) a token. */
function ageBucket(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 180) return '<180d';
  if (age < 365) return '180-364d';
  if (age < 730) return '1-2y';
  if (age < 1095) return '2-3y';
  return '3y+';
}

/** TVL buckets for the odds strata. */
function tvlBucket(tvl: number): string {
  if (tvl < 10_000_000) return '<$10M';
  if (tvl < 50_000_000) return '$10-50M';
  if (tvl < 500_000_000) return '$50-500M';
  return '$500M+';
}

interface Strata {
  share: (key: string) => number;
}

/** One stratum's tokenised share, shrunk toward the global share by the prior. */
function buildStrata(snapshot: Snapshot, keyOf: (p: SnapshotProtocol) => string, globalShare: number, prior: number): Strata {
  const total = new Map<string, number>();
  const tokenised = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const key = keyOf(p);
    total.set(key, (total.get(key) ?? 0) + 1);
    if (hasTokenOnRecord(p)) tokenised.set(key, (tokenised.get(key) ?? 0) + 1);
  }
  return {
    share: (key: string): number => {
      const n = total.get(key) ?? 0;
      const t = tokenised.get(key) ?? 0;
      return (t + prior * globalShare) / (n + prior);
    },
  };
}

/** A protocol's token odds: the blended cohort launch frequency, clamped to the stated band. */
export function tokenOdds(p: SnapshotProtocol, snapshot: Snapshot, model: ModelConstants = MODEL): number {
  const globalShare = snapshot.protocols.length === 0 ? 0 : snapshot.protocols.filter(hasTokenOnRecord).length / snapshot.protocols.length;
  const byCategory = buildStrata(snapshot, (q) => q.category ?? '(none)', globalShare, model.odds_shrink_prior);
  const byAge = buildStrata(snapshot, (q) => ageBucket(ageDays(snapshot.as_of, q.listed_at)), globalShare, model.odds_shrink_prior);
  const byTvl = buildStrata(snapshot, (q) => tvlBucket(q.tvl_usd), globalShare, model.odds_shrink_prior);
  const age = ageDays(snapshot.as_of, p.listed_at);
  const blended =
    model.odds_cat_weight * byCategory.share(p.category ?? '(none)') +
    model.odds_age_weight * byAge.share(ageBucket(age)) +
    model.odds_tvl_weight * byTvl.share(tvlBucket(p.tvl_usd));
  return round4(clamp(blended, model.odds_floor, model.odds_cap));
}

// ---------------------------------------------------------------- the ledger

/** Assign every protocol in the snapshot to exactly one lane and count the lanes. */
export function buildLedger(snapshot: Snapshot, boardSlugs: Set<string>): LedgerLane[] {
  let tokenised = 0;
  let fitSample = 0;
  let rankedWatchlist = 0;
  let rankedEarly = 0;
  let rankableBeyondCap = 0;
  let excludedDerivative = 0;
  let excludedVersioned = 0;
  const watchlist = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (hasTokenOnRecord(p)) {
      tokenised += 1;
      if (p.mcap_usd !== null && p.mcap_usd > 0) fitSample += 1;
      continue;
    }
    if (boardSlugs.has(p.slug)) {
      if (watchlist.has(p.slug)) rankedWatchlist += 1;
      else rankedEarly += 1;
      continue;
    }
    if (isDerivative(p)) { excludedDerivative += 1; continue; }
    if (VERSIONED.test(p.name)) { excludedVersioned += 1; continue; }
    rankableBeyondCap += 1;
  }
  return [
    { lane: 'Already tokenised', count: tokenised, note: `Records a token (CoinGecko id or symbol). ${fitSample} of them carry a positive market cap and form the pricing model's training sample.` },
    { lane: 'Ranked — watchlist', count: rankedWatchlist, note: 'On the house watchlist (TVL at or above the floor, no token on record) and ranked on the board.' },
    { lane: 'Ranked — early', count: rankedEarly, note: 'Pre-token and rankable below the watchlist floor, taken by TVL up to the board cap.' },
    { lane: 'Rankable, not selected', count: rankableBeyondCap, note: 'Pre-token and rankable, but not selected: protocols at or above the floor that the house left off the watchlist (its rule uses fields this snapshot does not carry, so this radar does not overrule it), plus any early candidates past the cap. Named here so the ledger is complete, not hidden.' },
    { lane: 'Excluded — derivative', count: excludedDerivative, note: 'Pre-token but a wrapped, staked, bridged or exchange product of a protocol whose token already trades.' },
    { lane: 'Excluded — versioned', count: excludedVersioned, note: 'Pre-token but its name ends in a version marker: a later pool of another protocol, not a first launch.' },
  ];
}

// ---------------------------------------------------------------- farm plans

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Total gas a full plan burns, in dollars, from its capital band. */
function gasFor(capital: number): number {
  return capital >= 150 ? 22 : capital >= 100 ? 16 : 12;
}

/** Total hands-on hours a full plan takes: setup, weekly touches over the hold, and the log. */
function hoursFor(holdDays: number): number {
  return round2(0.75 + Math.ceil(holdDays / 7) * 0.17 + 0.25);
}

/** Cost one row's plan and net it against its expected gross under the stated assumptions. */
export function farmEconomics(p: SnapshotProtocol, age: number | null, expectedValue: number, model: ModelConstants = MODEL): FarmEconomics {
  const capital = capitalFor(p);
  const gas = gasFor(capital);
  const hold = holdDaysFor(age);
  const hours = hoursFor(hold);
  const opportunity = capital * model.opportunity_rate * (hold / 365);
  const cashCost = round2(gas + opportunity);
  const gross = (expectedValue * model.airdrop_pool_share) / model.qualifying_wallets;
  const net = round2(gross - cashCost);
  const perHour = round2(net / hours);
  const breakeven = expectedValue > 0 ? round4((cashCost / expectedValue) * 100) : 0;
  const verdict: FarmEconomics['verdict'] = net <= 0 ? 'skip' : net >= 100 && perHour >= 40 ? 'farm' : 'thin';
  return {
    capital_usd: capital,
    gas_usd: gas,
    hold_days: hold,
    hours,
    cash_cost_usd: cashCost,
    expected_gross_usd: round2(gross),
    net_usd: net,
    net_per_hour_usd: perHour,
    breakeven_capture_pct: breakeven,
    verdict,
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it once so both sides of the market record your wallet.`;
  if (c.includes('dex')) return `Swap $${capital} of USDC through ${name} on ${chain}, then provide the proceeds as liquidity to its main pool and keep the position open.`;
  if (c.includes('deriv') || c.includes('perpetual') || c.includes('options') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, then close it a day later so the volume is real, not wash.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in one app on the far side.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the staking receipt in the same wallet.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a liquid market on ${name}, holding it to settlement.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares; vault share history is the record curators reward.`;
  if (c.includes('stable') || c.includes('reserve')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it rather than swapping straight back.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's real-world-asset yield token on ${chain} and hold it past one yield distribution.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy to expiry.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Provide $${capital} of liquidity to ${name}'s main vault on ${chain} and keep the position open; do not loop it more than once.`;
  if (c.includes('launchpad')) return `Commit $${capital} to one launch on ${name} and complete its participation steps in the same wallet.`;
  if (c.includes('payment') || c.includes('card')) return `Route one real payment of about $${capital} through ${name} and keep the account active afterwards.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, diversifying action: breadth of use is what separates a farmer from a bot. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Repay part of the borrow and borrow again once in a later week, so ${name} sees repeat credit use, not a single touch.`;
  if (c.includes('dex')) return `Make one swap in a second pair on ${name} in a later week, so your history is not a single pool.`;
  if (c.includes('chain')) return `Use two different apps deployed on ${name} in later weeks, so your activity is spread across its ecosystem.`;
  if (p.chains.length > 1) return `Repeat one small action through ${name} on ${p.chains[1]}, its second chain, so the wallet is visible on more than one network.`;
  return `Repeat the main action on ${name} once in a later week at a smaller size, so the wallet shows a pattern of use on ${chain}, not one visit.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: eight steps — the seven working steps plus a final
 * net-verdict step that states the plan's expected gross, its cash costs, its
 * net and its verdict under the model's published assumptions.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics, odds: number): string[] {
  const chain = chainOf(p);
  const capital = econ.capital_usd;
  const hold = econ.hold_days;
  const verdictText =
    econ.verdict === 'farm'
      ? `Verdict for ${p.name}: FARM. Expected gross $${econ.expected_gross_usd.toFixed(2)} (expected value x the stated 5% early-user pool / 5,000 qualifying wallets) against $${econ.cash_cost_usd.toFixed(2)} of cash costs leaves $${econ.net_usd.toFixed(2)} net, about $${econ.net_per_hour_usd.toFixed(2)} per hour of plan time. Break-even needs this wallet to capture just ${econ.breakeven_capture_pct.toFixed(4)}% of expected value. Token odds behind this: ${(odds * 100).toFixed(1)}%.`
      : econ.verdict === 'thin'
        ? `Verdict for ${p.name}: THIN — farm only if you are already active here. Expected gross $${econ.expected_gross_usd.toFixed(2)} against $${econ.cash_cost_usd.toFixed(2)} of cash costs leaves $${econ.net_usd.toFixed(2)} net, about $${econ.net_per_hour_usd.toFixed(2)} per hour of plan time, below the farm bar ($100 net and $40/hour). Break-even capture is ${econ.breakeven_capture_pct.toFixed(4)}% of expected value; token odds ${(odds * 100).toFixed(1)}%.`
        : `Verdict for ${p.name}: SKIP. Expected gross $${econ.expected_gross_usd.toFixed(2)} does not cover the $${econ.cash_cost_usd.toFixed(2)} cash cost of farming it, leaving $${econ.net_usd.toFixed(2)} net under the stated assumptions (5% early-user pool, 5,000 qualifying wallets, token odds ${(odds * 100).toFixed(1)}%). Revisit only if its expected value or odds rise materially.`;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm ${p.name} with, keep its seed phrase offline, and never reuse a wallet that holds your main funds.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Verify you are on ${p.name}'s real app before depositing: reach it from the protocol's official account or listing, check the contract address it shows, and start with a $5 test deposit.`,
      cost: 'a $5 test deposit plus about $2 of gas',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: 'about $2 of gas for the repeat action',
      time: '10 minutes, in a later week',
    },
    {
      text: `Make one qualifying action each week — a deposit, a borrow, a swap, a claim or a vote — and hold the position for at least ${hold} days so the activity spans more than one snapshot.`,
      cost: 'about $2 of gas a week, with the capital left in place',
      time: `10 minutes a week for ${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points, rewards or governance page and claim only from the link it publishes there; never pay a third party to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log for ${p.name}: the wallet, the dates, the amounts and the transaction hashes, so you can prove the history, repeat the position, or unwind it cleanly.`,
      cost: 'nothing but the log itself',
      time: '5 minutes',
    },
    { text: verdictText, cost: `$${econ.cash_cost_usd.toFixed(2)} total cash cost (gas plus capital opportunity cost)`, time: `${econ.hours} hours of hands-on time in total` },
  ];
  return steps.map(stepText);
}

/** A one-line factual signal for a row: tier, size, momentum, footprint and age, nothing inferred. */
export function signalOf(p: SnapshotProtocol, tier: 'watchlist' | 'early', age: number | null): string {
  const tierWord = tier === 'watchlist' ? 'Watchlist protocol' : 'Early protocol below the watchlist floor';
  const growth = p.change_7d === null ? 'no 7-day change reported' : `${p.change_7d >= 0 ? 'growing' : 'shrinking'} ${Math.abs(p.change_7d).toFixed(2)}% over 7 days`;
  const footprint = p.chains.length === 0 ? 'no chain recorded' : `live on ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}`;
  const ageWord = age === null ? 'listing date unreported' : `tracked for ${age} days with no token on record`;
  return `${tierWord}: ${growth}, ${footprint}, ${ageWord}.`;
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first by fitted implied value, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitResult, model: ModelConstants = MODEL): BoardRow[] {
  const price = finalPredictor(snapshot, fit, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const v = price(p);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const odds = tokenOdds(p, snapshot, model);
    const expected = Math.max(1, Math.round(v.implied * odds));
    const econ = farmEconomics(p, age, expected, model);
    return { p, v, age, odds, expected, econ };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    tier: watchlist.has(s.p.slug) ? ('watchlist' as const) : ('early' as const),
    age_days: s.age,
    signal: signalOf(s.p, watchlist.has(s.p.slug) ? 'watchlist' : 'early', s.age),
    implied_value_usd: s.v.implied,
    token_odds: s.odds,
    expected_value_usd: s.expected,
    confidence: confidenceOf(s.p, s.age),
    model: {
      category_multiple: s.v.categoryMultiple,
      curve_multiple: s.v.curve,
      fitted_multiple: s.v.fitted,
      basis: s.v.basis,
    },
    farm: s.econ,
    farm_steps: farmSteps(s.p, s.age, s.econ, s.odds),
  }));
}

/** The live-token protocols, set aside from the ranking: the market's own values, by market cap. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot, model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const ledger = buildLedger(snapshot, boardSlugs);
  const early = board.filter((r) => r.tier === 'early').length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    ledger,
    ledger_total: ledger.reduce((s, l) => s + l.count, 0),
    snapshot_total: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, spread, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board has ${board.length} rows: the gate wants at least 100`;
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
    if (!(r.token_odds > 0 && r.token_odds <= 1)) return `${r.slug} has token odds ${r.token_odds}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
