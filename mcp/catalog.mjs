// Endpoint catalog, MCP tool definitions and compact projections.
// The workbench server remains the only source of truth; this file only reads.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compact, byteLength} from './format.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const endpoints = JSON.parse(readFileSync(join(here, 'endpoints.json'), 'utf8'));
export const ui = JSON.parse(readFileSync(join(here, 'ui.json'), 'utf8'));
export const views = ui.pages || [];
export const buttons = ui.buttons || [];

export const MODES = ['month-week-day', 'month-week', 'week-day', 'day-trend'];
export const MARKET_PAGES = ['home', 'overview', 'strength', 'monitor', 'rankings', 'funds', 'positions', 'fees', 'variety', 'seat-flow'];
export const TRADE_PAGES = ['home', 'fire', 'water', 'metal', 'earth', 'wood', 'monitor', 'rules'];

const escapeRegex = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compilePath(path) {
  if (path.includes('*')) return new RegExp('^' + escapeRegex(path).replace(/\\\*/g, '.*') + '$');
  const parts = path.split('/').map(segment => {
    if (segment.startsWith(':')) return segment === ':path' ? '(.*)' : '([^/]+)';
    return escapeRegex(segment);
  });
  return new RegExp('^' + parts.join('/') + '$');
}
const compiled = new Map();
for (const endpoint of endpoints) compiled.set(endpoint.id, compilePath(endpoint.path));

export function stripQuery(path) {
  const index = String(path).indexOf('?');
  return index < 0 ? String(path) : String(path).slice(0, index);
}

function fillPath(path, values = {}) {
  return String(path).replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = values?.[key];
    if (value === undefined || value === null || value === '') throw new Error(`缺少路径参数：${key}`);
    return encodeURIComponent(String(value));
  });
}

export function matchEndpoint(method, path) {
  const verb = String(method || 'GET').toUpperCase();
  const clean = stripQuery(path);
  return endpoints.find(endpoint => endpoint.method === verb && compiled.get(endpoint.id).test(clean)) || null;
}

export function classifyAccess(method, path) {
  const verb = String(method || 'GET').toUpperCase();
  const clean = stripQuery(path);
  if (verb === 'GET' || verb === 'HEAD') return 'read';
  if (/\/api\/workbench\/(risk|import\/preview)$/.test(clean) || /\/api\/three-axes\/size$/.test(clean) || /\/api\/monitor\/preview$/.test(clean) || /\/api\/knowledge\/search$/.test(clean) || /\/api\/feishu\/bind\/status$/.test(clean)) return 'calc';
  if (/\/(approve|trade|executions|release|reconcile-position)$/.test(clean) || /\/api\/workbench\/governance\/start$/.test(clean) || /\/balance-changes\/[^/]+\/void$/.test(clean)) return 'trading';
  if (/\/api\/(research\/run|research\/batch|chat|fire\/refresh|eod-market\/refresh|market-panorama\/refresh|maintenance\/backup|knowledge\/reindex)$/.test(clean) || /\/gold\/analyze$/.test(clean) || /\/postmarket-reviews$/.test(clean) && verb === 'POST') return 'expensive';
  return 'write';
}

export function accessAllowed(access, config = {}) {
  if (access === 'read' || access === 'calc') return true;
  if (access === 'write') return !!config.allowWrites;
  if (access === 'trading') return !!(config.allowWrites && config.allowTrading);
  if (access === 'expensive') return !!config.allowExpensive;
  if (access === 'stream') return false;
  return false;
}

export function accessReason(access, config = {}) {
  if (access === 'write') return '写操作未启用：设置 WUJIAN_ALLOW_WRITES=1（CLI 加 --allow-writes）后重启。';
  if (access === 'trading') return '交易/批准/删除操作未启用：需同时设置 WUJIAN_ALLOW_WRITES=1 与 WUJIAN_ALLOW_TRADING=1。';
  if (access === 'expensive') return '研究、对话、刷新等有成本/长任务未启用：设置 WUJIAN_ALLOW_EXPENSIVE=1（CLI 加 --allow-expensive）。';
  return '当前权限不允许此操作。';
}

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const arr = value => (Array.isArray(value) ? value : []);
const str = value => (value === null || value === undefined ? '' : String(value));
const lower = value => str(value).toLowerCase();

function limitValue(value, fallback, max = 500) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

// Users say 沪铜/沪金 while the quote feed names the product 铜/金; also strip
// "主力连续" so a product query still resolves to the actual contract.
function simplify(value) {
  return lower(value)
    .replace(/^(沪|郑|大|连)/, '')
    .replace(/主力连续|连续|主力|期货/g, '')
    .trim();
}

function matchQuery(item, query) {
  if (!query) return true;
  const needle = lower(query);
  const simple = simplify(query);
  const values = ['code', 'name', 'symbol', 'contract', 'contracts', 'main_contract', 'alias', 'aliases', 'product']
    .flatMap(key => arr(item?.[key]).length ? arr(item?.[key]) : [item?.[key]])
    .filter(value => value !== null && value !== undefined)
    .map(value => lower(value));
  return values.some(value => value.includes(needle) || (simple && (simplify(value).includes(simple) || value.includes(simple))));
}

function barView(bar) {
  return {
    date: bar?.date || bar?.stamp || bar?.day || null,
    open: num(bar?.open), high: num(bar?.high), low: num(bar?.low), close: num(bar?.close),
    volume: num(bar?.volume), openInterest: num(bar?.openInterest ?? bar?.open_interest),
    complete: bar?.complete === undefined ? undefined : !!bar.complete,
    provisional: bar?.provisional === undefined ? undefined : !!bar.provisional
  };
}

function quoteView(quote, {includeBars = false, barLimit = 30} = {}) {
  const result = {
    symbol: quote?.symbol,
    requestedSymbol: quote?.requestedSymbol,
    actualContract: quote?.actualContract,
    name: quote?.name,
    exchange: quote?.exchange,
    quoteTime: quote?.quoteTime,
    tradingDay: quote?.tradingDay,
    last: num(quote?.last),
    close: num(quote?.close),
    preClose: num(quote?.preClose),
    preSettlement: num(quote?.preSettlement),
    changePct: num(quote?.changePct),
    volume: num(quote?.volume),
    openInterest: num(quote?.openInterest),
    average: num(quote?.average),
    timeStatus: quote?.quality?.timeStatus || null,
    quality: quote?.quality || null
  };
  if (includeBars) result.bars = arr(quote?.bars).slice(-barLimit).map(barView);
  return result;
}

function signalView(signal) {
  if (!signal || typeof signal !== 'object') return signal;
  return {
    side: signal.side ?? null,
    status: signal.status ?? null,
    ma: num(signal.ma),
    previousMa: num(signal.previousMa),
    maChange: num(signal.maChange),
    close: num(signal.close),
    distance: num(signal.distance),
    slope: num(signal.slope),
    direction: signal.direction ?? null,
    relation: signal.relation ?? null,
    samples: num(signal.samples),
    stamp: signal.stamp || signal.completedAt || null,
    unclosed: signal.unclosed,
    reason: signal.reason || null,
    source: signal.source || null,
    contract: signal.contract || null
  };
}

function fireRowView(row, mode) {
  const attention = row?.attention?.[mode];
  return {
    code: row?.code,
    name: row?.name,
    exchange: row?.exchange,
    sector: row?.sector || row?.source_sector,
    contract: row?.main_contract || null,
    dataDate: row?.data_date || null,
    source: row?.data_source || null,
    provisional: !!row?.provisional,
    ok: !!row?.ok,
    volume: num(row?.volume),
    openInterest: num(row?.open_interest),
    liquidity: {
      ok: mode === 'day-trend' ? !!row?.day_trend_liquidity_ok : mode === 'week-day' ? !!row?.week_day_liquidity_ok : mode === 'month-week-day' ? !!row?.resonance_liquidity_ok : !!row?.liquidity_ok,
      reason: mode === 'day-trend' ? row?.day_trend_rule_reason : mode === 'week-day' ? row?.week_day_liquidity_reason : mode === 'month-week-day' ? row?.resonance_liquidity_reason : row?.liquidity_reason
    },
    modes: row?.modes || {},
    directions: {month: row?.month_direction || null, week: row?.week_direction || null, day: row?.day_direction || null},
    indicator: row?.indicator || null,
    ma: {month: num(row?.month_ma10), week: num(row?.week_ma10), day: num(row?.day_ma10)},
    latestBar: row?.latest_bar || null,
    attention: attention ? {tier: attention.tier, state: attention.state, reasons: attention.reasons} : null,
    weekDay: {
      price: num(row?.week_day_price),
      position: row?.week_day_price_position || null,
      reason: row?.week_day_rule_reason || null,
      structure: row?.week_day_structure_auxiliary || null
    },
    resonance: {
      modeResult: row?.resonance_mode_result || null,
      technicalResult: row?.resonance_technical_result || null,
      structure: row?.resonance_structure_auxiliary || null
    },
    dayTrend: {
      liquidityOk: row?.day_trend_liquidity_ok,
      reason: row?.day_trend_rule_reason || null
    },
    ruleVersions: {
      weekDay: row?.week_day_rule_version || null,
      resonance: row?.resonance_rule_version || null,
      dayTrend: row?.day_trend_rule_version || null
    }
  };
}

function fireScanView(fire, {mode = 'month-week-day', filter = 'candidate', limit = 50, sector = '', query = ''} = {}) {
  const selected = MODES.includes(mode) ? mode : 'month-week-day';
  let rows = arr(fire?.rows);
  if (sector) rows = rows.filter(row => lower(row.sector || row.source_sector).includes(lower(sector)));
  if (query) rows = rows.filter(row => matchQuery(row, query));
  const liquidityOk = row => selected === 'day-trend' ? !!row.day_trend_liquidity_ok : selected === 'week-day' ? !!row.week_day_liquidity_ok : selected === 'month-week-day' ? !!row.resonance_liquidity_ok : !!row.liquidity_ok;
  if (filter === 'candidate') rows = rows.filter(row => ['多头观察', '空头观察'].includes(row?.modes?.[selected]));
  else if (filter === 'long') rows = rows.filter(row => row?.modes?.[selected] === '多头观察');
  else if (filter === 'short') rows = rows.filter(row => row?.modes?.[selected] === '空头观察');
  else if (filter === 'illiquid') rows = rows.filter(row => row.ok && !liquidityOk(row));
  else if (filter === 'missing') rows = rows.filter(row => !row.ok || !row.modes?.[selected]);
  if (filter === 'candidate' || filter === 'long' || filter === 'short') {
    rows.sort((a, b) => {
      const rank = value => value === '多头观察' ? 0 : value === '空头观察' ? 1 : 2;
      return rank(a?.modes?.[selected]) - rank(b?.modes?.[selected]) || String(a.code).localeCompare(String(b.code));
    });
  }
  const total = rows.length;
  return {
    source: '小木 /api/workbench/fire',
    generatedAt: new Date().toISOString(),
    mode: selected,
    filter,
    status: fire?.status,
    ruleVersion: fire?.rule_version,
    baselineRuleVersion: fire?.baseline_rule_version,
    scanDate: fire?.scan_date,
    dataDate: fire?.data_date,
    refreshedAt: fire?.refreshedAt,
    refreshing: !!fire?.refreshing,
    refreshError: fire?.refreshError || null,
    universeSize: fire?.universe_size,
    currentCount: fire?.current_count,
    noTradeCount: fire?.no_trade_count,
    missingCount: fire?.missing_count,
    liquidCount: fire?.liquid_count,
    illiquidCount: fire?.illiquid_count,
    counts: fire?.counts?.[selected] || null,
    allCounts: fire?.counts || null,
    totalMatched: total,
    returned: Math.min(total, limitValue(limit, 50)),
    rows: rows.slice(0, limitValue(limit, 50)).map(row => fireRowView(row, selected)),
    notice: '观察候选不是入场信号；方向、结构、量仓、反证与人工批准仍需按工作台规则核对。'
  };
}

function panoramaProductView(product, {includeBars = false, barLimit = 60, includeSeats = false} = {}) {
  const result = {
    code: product?.code,
    name: product?.name,
    exchange: product?.exchange,
    sector: product?.sector,
    contract: product?.contract,
    contractDate: product?.contractDate,
    pointValue: num(product?.pointValue),
    tickSize: num(product?.tickSize),
    fireModes: product?.fireModes || {},
    fireDate: product?.fireDate || null,
    close: num(product?.close),
    closeDate: product?.closeDate || null,
    priceTime: product?.priceTime || null,
    priceSource: product?.priceSource || null,
    priceType: product?.priceType || null,
    changeBasis: product?.changeBasis || null,
    changePct: num(product?.changePct),
    quoteChangePct: num(product?.quoteChangePct),
    previousSettlement: num(product?.previousSettlement),
    return3: num(product?.return3),
    return5: num(product?.return5),
    volume: num(product?.volume),
    interest: num(product?.interest),
    volumeChange: num(product?.volumeChange),
    interestChange: num(product?.interestChange),
    signals: Object.fromEntries(Object.entries(product?.signals || {}).map(([period, signal]) => [period, signalView(signal)])),
    resonance: product?.resonance || null,
    movement30: product?.movement30 || null,
    movementAt: product?.movementAt || null,
    basis: product?.basis ? {
      spot: num(product.basis.spot), future: num(product.basis.future), basis: num(product.basis.basis),
      sourceBasis: num(product.basis.sourceBasis), unit: product.basis.unit, contract: product.basis.contract,
      dataDate: product.basis.dataDate, source: product.basis.source, definition: product.basis.basisDefinition
    } : null,
    roll: product?.rollYield ? {
      rate: num(product.rollYield.rate), monthGap: num(product.rollYield.monthGap),
      near: product.rollYield.near, far: product.rollYield.far, source: product.rollYield.source,
      definition: product.rollYield.definition, status: product.rollStatus?.status || null
    } : null,
    warrant: product?.warrantStatus ? {
      status: product.warrantStatus.status, rows: product.warrantStatus.rows, recordDay: product.warrantStatus.recordDay,
      source: product.warrantStatus.source, reason: product.warrantStatus.reason
    } : null,
    contractInfo: product?.contractInfo ? {
      listed: product.contractInfo.listed, lastTrade: product.contractInfo.lastTrade,
      delivery: product.contractInfo.delivery, lastDelivery: product.contractInfo.lastDelivery,
      source: product.contractInfo.source, basis: product.contractInfo.basis
    } : null,
    fees: product?.fees || null,
    seat: {
      net: num(product?.net), delta: num(product?.delta), amount: num(product?.amount),
      amountChange: num(product?.amountChange), coverage: product?.seatCoverage,
      date: product?.seatDate, marketInterestChange: num(product?.marketInterestChange),
      marketNominalChange: num(product?.marketNominalChange), samples: num(product?.marketSamples)
    }
  };
  if (includeSeats) result.seatHistory = arr(product?.seatHistory).slice(-30);
  if (includeBars) result.bars = arr(product?.bars).slice(-barLimit).map(barView);
  return result;
}

function panoramaMeta(snapshot) {
  return {
    source: snapshot?.source || null,
    selectedDate: snapshot?.selectedDate || null,
    generatedAt: snapshot?.generatedAt || null,
    revision: snapshot?.revision ?? null,
    dates: arr(snapshot?.dates).slice(-12),
    periods: snapshot?.periods || null,
    maLength: snapshot?.maLength ?? null,
    method: snapshot?.method || null,
    counts: snapshot?.counts || null,
    coverage: snapshot?.coverage || null,
    job: snapshot?.job ? {
      id: snapshot.job.id, status: snapshot.job.status, mode: snapshot.job.mode,
      stage: snapshot.job.stage, startedAt: snapshot.job.startedAt,
      finishedAt: snapshot.job.finishedAt, errors: snapshot.job.errors || []
    } : null,
    tqConnection: snapshot?.tqConnection || null,
    watchlist: snapshot?.watchlist || null,
    closeOverview: snapshot?.closeOverview ? {
      updatedAt: snapshot.closeOverview.updatedAt,
      basis: snapshot.closeOverview.basis,
      dayCount: arr(snapshot.closeOverview.day).length,
      previousDayCount: arr(snapshot.closeOverview.previousDay).length,
      products: arr(snapshot.closeOverview.products).slice(0, 20)
    } : null
  };
}

function panoramaProducts(snapshot, {sector = '', query = ''} = {}) {
  let products = arr(snapshot?.products);
  if (sector) products = products.filter(product => lower(product.sector).includes(lower(sector)) || lower(product.exchange) === lower(sector));
  if (query) products = products.filter(product => matchQuery(product, query));
  return products;
}

function topBy(rows, value, count = 10) {
  return [...rows].sort((a, b) => (num(value(b)) ?? -Infinity) - (num(value(a)) ?? -Infinity)).slice(0, count);
}

function panoramaPage(snapshot, {page = 'overview', sector = '', query = '', limit = 100, sort = ''} = {}) {
  const products = panoramaProducts(snapshot, {sector, query});
  const max = limitValue(limit, 100, 500);
  const meta = panoramaMeta(snapshot);
  if (page === 'overview') {
    const sectors = new Map();
    for (const product of products) {
      const key = product.sector || '未分组';
      const row = sectors.get(key) || {sector: key, count: 0, up: 0, down: 0, flat: 0, sumChange: 0, long: 0, short: 0, candidates: 0};
      row.count++;
      if (num(product.changePct) > 0) row.up++; else if (num(product.changePct) < 0) row.down++; else row.flat++;
      if (num(product.changePct) !== null) row.sumChange += product.changePct;
      const daySide = product.signals?.day?.side;
      if (daySide === 'long') row.long++; else if (daySide === 'short') row.short++;
      const resonance = typeof product.resonance === 'string' ? product.resonance : JSON.stringify(product.resonance || '');
      if (['月周日共振', '周日共振'].some(label => resonance.includes(label))) row.candidates++;
      sectors.set(key, row);
    }
    const sectorRows = [...sectors.values()].map(row => ({...row, avgChangePct: row.count ? row.sumChange / row.count : null})).sort((a, b) => b.avgChangePct - a.avgChangePct);
    const ranked = products.filter(product => num(product.changePct) !== null).sort((a, b) => b.changePct - a.changePct);
    return {
      ...meta,
      page,
      total: products.length,
      sectors: sectorRows,
      topGainers: ranked.slice(0, 10).map(product => ({code: product.code, name: product.name, contract: product.contract, changePct: num(product.changePct), close: num(product.close), volume: num(product.volume), interest: num(product.interest)})),
      topLosers: ranked.slice(-10).reverse().map(product => ({code: product.code, name: product.name, contract: product.contract, changePct: num(product.changePct), close: num(product.close), volume: num(product.volume), interest: num(product.interest)})),
      topLong: topBy(products, product => product.signals?.day?.distance, 10).map(product => ({code: product.code, name: product.name, contract: product.contract, daySide: product.signals?.day?.side, distance: num(product.signals?.day?.distance), changePct: num(product.changePct)})),
      topShort: [...products].sort((a, b) => (num(a.signals?.day?.distance) ?? Infinity) - (num(b.signals?.day?.distance) ?? Infinity)).slice(0, 10).map(product => ({code: product.code, name: product.name, contract: product.contract, daySide: product.signals?.day?.side, distance: num(product.signals?.day?.distance), changePct: num(product.changePct)}))
    };
  }
  let rows = products;
  if (page === 'strength') {
    rows = [...rows].sort((a, b) => scoreStrength(b) - scoreStrength(a) || String(a.code).localeCompare(String(b.code)));
    return {...meta, page, total: rows.length, returned: Math.min(rows.length, max), rows: rows.slice(0, max).map(product => ({
      code: product.code, name: product.name, contract: product.contract, sector: product.sector,
      changePct: num(product.changePct), volume: num(product.volume), interest: num(product.interest),
      resonance: product.resonance, movement30: product.movement30,
      signals: Object.fromEntries(Object.entries(product.signals || {}).map(([period, signal]) => [period, signalView(signal)]))
    }))};
  }
  if (page === 'rankings') {
    const key = sort === 'changePct' ? 'changePct' : sort === 'volume' ? 'volume' : 'amount';
    rows = topBy(rows, product => product[key], max);
    return {...meta, page, sort: key, total: products.length, rows: rows.map(product => ({code: product.code, name: product.name, contract: product.contract, sector: product.sector, changePct: num(product.changePct), amount: num(product.amount), volume: num(product.volume), interest: num(product.interest), seatNet: num(product.net)}))};
  }
  if (page === 'funds') {
    rows = topBy(rows, product => product.amount, max);
    return {...meta, page, total: products.length, rows: rows.map(product => ({code: product.code, name: product.name, contract: product.contract, sector: product.sector, net: num(product.net), delta: num(product.delta), amount: num(product.amount), amountChange: num(product.amountChange), marketInterestChange: num(product.marketInterestChange), marketNominalChange: num(product.marketNominalChange), samples: num(product.marketSamples), seatDate: product.seatDate}))};
  }
  if (page === 'positions') {
    rows = topBy(rows, product => Math.abs(num(product.interestChange) ?? 0), max);
    return {...meta, page, total: products.length, rows: rows.map(product => ({code: product.code, name: product.name, contract: product.contract, sector: product.sector, close: num(product.close), changePct: num(product.changePct), volume: num(product.volume), volumeChange: num(product.volumeChange), interest: num(product.interest), interestChange: num(product.interestChange), marketInterestChange: num(product.marketInterestChange)}))};
  }
  if (page === 'fees') {
    return {...meta, page, total: products.length, rows: products.slice(0, max).map(product => ({code: product.code, name: product.name, contract: product.contract, sector: product.sector, pointValue: num(product.pointValue), tickSize: num(product.tickSize), fees: product.fees}))};
  }
  if (page === 'seat-flow') {
    rows = topBy(rows, product => Math.abs(num(product.net) ?? 0), max);
    return {...meta, page, total: products.length, rows: rows.map(product => ({code: product.code, name: product.name, contract: product.contract, sector: product.sector, net: num(product.net), delta: num(product.delta), amount: num(product.amount), amountChange: num(product.amountChange), coverage: num(product.seatCoverage), seatDate: product.seatDate}))};
  }
  if (page === 'catalog') {
    return {...meta, page, total: products.length, rows: products.slice(0, max).map(product => ({code: product.code, name: product.name, exchange: product.exchange, sector: product.sector, contract: product.contract, pointValue: num(product.pointValue), tickSize: num(product.tickSize), fireModes: product.fireModes}))};
  }
  if (page === 'home') {
    return panoramaPage(snapshot, {page: 'overview', sector, query, limit: max, sort});
  }
  return {...meta, page: 'snapshot', total: products.length, rows: products.slice(0, max).map(product => panoramaProductView(product))};
}

function scoreStrength(product) {
  const signals = product?.signals || {};
  const side = signals.day?.side;
  if (!side) return 0;
  let score = 0;
  for (const key of ['month', 'week', 'day', 'hour', 'halfHour']) {
    if (signals[key]?.side === side) score++;
    else if (signals[key]?.side) score--;
  }
  return score;
}

function cardSummary(card) {
  return {
    id: card?.id,
    roundId: card?.roundId,
    accountId: card?.accountId,
    symbol: card?.symbol,
    name: card?.name,
    exchange: card?.exchange,
    contract: card?.contract,
    direction: card?.direction,
    source: card?.source,
    scanMode: card?.scanMode,
    status: card?.status,
    activePlanVersion: card?.activePlanVersion ?? null,
    createdAt: card?.createdAt,
    updatedAt: card?.updatedAt,
    archivedAt: card?.archivedAt || null,
    fire: card?.fire ? {scanDate: card.fire.scanDate, dataDate: card.fire.dataDate, mode: card.fire.mode, modeLabel: card.fire.modeLabel, result: card.fire.result} : null,
    water: card?.water ? {status: card.water.status, summary: card.water.summary, updatedAt: card.water.updatedAt} : null,
    plan: card?.plan ? {version: card.plan.version, status: card.plan.status, direction: card.plan.direction, entry: card.plan.entry, stop: card.plan.stop, risk: card.plan.risk} : null,
    trade: card?.trade ? {remainingLots: card.trade.remainingLots, averageEntry: card.trade.averageEntry, realizedPnl: card.trade.realizedPnl} : null
  };
}

function reportSummary(report) {
  return {
    id: report?.id, name: report?.name, symbol: report?.symbol, productCode: report?.productCode,
    contract: report?.contract, cardId: report?.cardId, status: report?.status, stage: report?.stage,
    created: report?.created, completed: report?.completed, dataAsOf: report?.dataAsOf,
    researchVersion: report?.researchVersion, provider: report?.provider, model: report?.model,
    review: report?.review ? {status: report.review.status, missingSections: report.review.missingSections, unverifiedLinks: report.review.unverifiedLinks?.length || 0, readSources: report.review.readSources} : null,
    expert: report?.expert ? {mainDriver: report.expert.mainDriver, advice: report.expert.advice, invalidation: report.expert.invalidation} : null
  };
}

function compactReportDetail(report, {includeReport = true, includeSources = false, includeEvidence = false} = {}) {
  if (!report) return null;
  const result = reportSummary(report);
  result.followups = arr(report.followups);
  result.comparison = report.comparison || null;
  result.review = report.review || null;
  result.toolCalls = arr(report.tools).length ? arr(report.tools).slice(0, 40) : undefined;
  if (includeReport) result.report = str(report.report).slice(0, 120_000);
  if (includeSources) result.sources = arr(report.sources).slice(0, 30).map(item => ({name: item.name, args: item.args, at: item.at, result: item.result ? {url: item.result.url, error: item.result.error, status: item.result.status, items: arr(item.result.items).slice(0, 5)} : null}));
  if (includeEvidence) result.evidence = compact(report.evidence, {maxBytes: 120_000});
  return result;
}

function trendRowView(row) {
  const signals = {};
  for (const [period, signal] of Object.entries(row?.signals || {})) {
    signals[period] = signalView(signal);
  }
  return {
    code: row?.code, name: row?.name, symbol: row?.symbol, sector: row?.sector,
    mappingDate: row?.mappingDate, quoteAt: row?.quoteAt, sessionActive: row?.sessionActive,
    source: row?.source, signals, alerts: row?.alerts || []
  };
}

function trendStatusView(status, {limit = 50, code = '', includeRows = true} = {}) {
  let rows = arr(status?.rows);
  if (code) rows = rows.filter(row => lower(row.code).includes(lower(code)) || lower(row.name).includes(lower(code)) || lower(row.symbol).includes(lower(code)));
  const events = arr(status?.events);
  return {
    running: !!status?.running,
    tasks: arr(status?.tasks),
    coverage: status?.coverage || null,
    market: status?.market ? {
      status: status.market.status, message: status.market.message, source: status.market.source,
      provider: status.market.provider, heartbeatAt: status.market.heartbeatAt,
      heartbeatFresh: status.market.heartbeatFresh, lastQuoteAt: status.market.lastQuoteAt,
      freshQuoteCount: status.market.freshQuoteCount, subscribed: status.market.subscribed,
      activeContracts: status.market.activeContracts, coverage: status.market.coverage
    } : null,
    weixin: status?.weixin || null,
    sources: status?.sources || null,
    eventCount: events.length,
    events: events.slice(0, limitValue(limit, 50, 200)),
    observationCount: arr(status?.observations).length,
    observations: arr(status?.observations).slice(0, limitValue(limit, 50, 200)).map(item => ({
      taskId: item.taskId, taskTitle: item.taskTitle, symbol: item.symbol, code: item.code, name: item.name,
      period: item.period, lastObserved: item.lastObserved, price: num(item.price),
      smallSignal: item.smallSignal ? signalView(item.smallSignal) : null,
      bigSignal: item.bigSignal ? signalView(item.bigSignal) : null
    })),
    totalRows: arr(status?.rows).length,
    rows: includeRows ? rows.slice(0, limitValue(limit, 50, 200)).map(trendRowView) : undefined,
    notice: status?.notice || null
  };
}

function compactGovernance(governance) {
  if (!governance) return null;
  const brief = run => run ? {
    id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
    version: run.snapshot?.version, combinedHash: run.snapshot?.combinedHash,
    files: arr(run.snapshot?.files).map(file => ({name: file.name, available: file.available, sha256: file.sha256})),
    responsibilities: run.snapshot?.responsibilities || null,
    result: run.result || null
  } : null;
  return {
    active: brief(governance.active),
    history: arr(governance.history).slice(0, 5).map(brief),
    issues: arr(governance.issues).slice(0, 30),
    responsibilities: governance.responsibilities || null,
    reviewMode: governance.reviewMode || null
  };
}

function compactMonitorEvents(payload, {limit = 30, unread = false} = {}) {
  let items = arr(payload?.items);
  if (unread) items = items.filter(item => !item.readAt);
  return {total: items.length, items: items.slice(0, limitValue(limit, 30, 200))};
}

const schema = (properties = {}, required = []) => ({type: 'object', properties, required, additionalProperties: false});
const string = (description, extra = {}) => ({type: 'string', description, ...extra});
const number = (description, extra = {}) => ({type: 'number', description, ...extra});
const integer = (description, extra = {}) => ({type: 'integer', description, ...extra});
const boolean = (description, extra = {}) => ({type: 'boolean', description, ...extra});
const enumOf = (values, description) => ({type: 'string', enum: values, description});

async function get(client, path, query) { return client.get(path, {query}); }

function wrap(data, extra = {}) { return {ok: true, ...extra, data}; }

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const tools = [
  {
    name: 'wujian_health',
    title: '小木服务健康与版本',
    description: '检查小木本机服务是否在线、版本、项目根、构建哈希和关键配置状态。任何 Agent 的第一步。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => {
      const [health, status] = await Promise.allSettled([get(client, '/api/health'), get(client, '/api/status')]);
      return {
        ok: health.status === 'fulfilled',
        service: health.status === 'fulfilled' ? health.value : {error: health.reason?.message},
        status: status.status === 'fulfilled' ? {
          mode: status.value.mode, marketConnected: status.value.marketConnected, marketStatus: status.value.marketStatus,
          chatConfigured: status.value.chatConfigured, llm: status.value.llm, brokerConnected: status.value.brokerConnected,
          tasks: arr(status.value.tasks).slice(0, 10)
        } : {error: status.reason?.message}
      };
    }
  },
  {
    name: 'wujian_status',
    title: '小木总状态',
    description: '读取 /api/status：研究模式、行情连接、模型配置、研究任务与交易权限。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => wrap(await get(client, '/api/status'))
  },
  {
    name: 'wujian_brief',
    title: 'Agent 一段式简报',
    description: '一次获取可直接交给 Agent 的小木上下文：行情、火候选、监控、趋势、研究、账户与数据健康。适合任务开始前调用。',
    access: 'read',
    inputSchema: schema({
      accountId: string('账户 ID；不填使用默认账户'),
      candidateLimit: integer('每个方向返回的候选数，默认 8', {minimum: 1, maximum: 30})
    }),
    handler: async (args, {client}) => {
      const limit = limitValue(args.candidateLimit, 8, 30);
      const [health, status, summary, fire, trend, monitor, pano, eod, reports, universe] = await Promise.allSettled([
        get(client, '/api/health'), get(client, '/api/status'),
        get(client, '/api/workbench/summary', args.accountId ? {accountId: args.accountId} : undefined),
        get(client, '/api/workbench/fire'), get(client, '/api/trend-monitor/status'),
        get(client, '/api/monitor/status'), get(client, '/api/market-panorama/status'),
        get(client, '/api/eod-market/status'), get(client, '/api/research/reports'),
        get(client, '/api/research/universe')
      ]);
      const value = result => result.status === 'fulfilled' ? result.value : null;
      const fireData = value(fire);
      const fireView = fireData ? fireScanView(fireData, {mode: 'month-week-day', filter: 'candidate', limit}) : null;
      const trendView = value(trend) ? trendStatusView(value(trend), {limit: 12, includeRows: false}) : null;
      const summaryData = value(summary);
      const universeData = value(universe);
      const fireRows = fireView?.rows || [];
      const topNames = fireRows.slice(0, 6).map(row => `${row.name}(${row.code}·${row.modes?.['month-week-day'] === '多头观察' ? '多' : '空'})`).join('、') || '无';
      const digest = [
        `小木简报 ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`,
        value(status)?.marketConnected ? `行情 ${value(status).marketStatus}` : '行情未连接',
        `火 ${fireView?.counts?.long ?? '—'} 多 / ${fireView?.counts?.short ?? '—'} 空`,
        `候选：${topNames}`,
        `盯盘未读 ${value(monitor)?.unread ?? '—'}`,
        `研究 ${universeData?.completed ?? '—'}/${universeData?.total ?? '—'} 已完成`
      ].join('；');
      return {
        generatedAt: new Date().toISOString(),
        digest,
        service: value(health),
        status: value(status) ? {
          mode: value(status).mode, marketConnected: value(status).marketConnected, marketStatus: value(status).marketStatus,
          chatConfigured: value(status).chatConfigured, llm: value(status).llm, brokerConnected: value(status).brokerConnected
        } : null,
        account: summaryData ? {
          account: summaryData.account, openCount: summaryData.openCount, approvedCount: summaryData.approvedCount,
          executionCount: summaryData.executionCount, plannedRisk: summaryData.plannedRisk,
          ruleVersion: summaryData.ruleVersion, marketDate: summaryData.marketDate, fireCounts: summaryData.fireCounts,
          pending: arr(summaryData.pending).slice(0, 10).map(cardSummary)
        } : null,
        fire: fireView ? {mode: fireView.mode, counts: fireView.counts, dataDate: fireView.dataDate, rows: fireView.rows.slice(0, limit)} : null,
        trend: trendView ? {running: trendView.running, tasks: trendView.tasks, coverage: trendView.coverage, events: trendView.events.slice(0, 10)} : null,
        monitor: value(monitor) ? {runtime: value(monitor).runtime, activeRules: value(monitor).activeRules, unread: value(monitor).unread, market: value(monitor).market?.status, desktop: value(monitor).desktop?.available, phone: value(monitor).phone?.bound} : null,
        panorama: value(pano) ? {job: value(pano).job, catalog: value(pano).catalog, counts: value(pano).counts, updatedAt: value(pano).updatedAt} : null,
        eod: value(eod),
        research: {
          reports: arr(value(reports)).slice(0, 8).map(reportSummary),
          universe: universeData ? {total: universeData.total, researchable: universeData.researchable, completed: universeData.completed} : null
        },
        errors: [health, status, summary, fire, trend, monitor, pano, eod, reports, universe].map((item, index) => item.status === 'rejected' ? {source: ['health', 'status', 'summary', 'fire', 'trend', 'monitor', 'panorama', 'eod', 'reports', 'universe'][index], error: item.reason?.message} : null).filter(Boolean)
      };
    }
  },
  {
    name: 'wujian_signals',
    title: '跨源信号聚合',
    description: '把火扫描、趋势监控、盯盘事件、市场全景、研究进度和行情健康合成一份信号面板，供 Agent 快速抓取。',
    access: 'read',
    inputSchema: schema({
      mode: enumOf(MODES, '火扫描模式，默认月周日共振'),
      limit: integer('每个区块返回条数，默认 12', {minimum: 1, maximum: 50}),
      unreadOnly: boolean('盯盘事件只看未读，默认 true')
    }),
    handler: async (args, {client}) => {
      const limit = limitValue(args.limit, 12, 50);
      const mode = MODES.includes(args.mode) ? args.mode : 'month-week-day';
      const [fire, trend, monitor, events, pano, universe, eod, tq] = await Promise.allSettled([
        get(client, '/api/workbench/fire'), get(client, '/api/trend-monitor/status'),
        get(client, '/api/monitor/status'), get(client, '/api/monitor/events'),
        get(client, '/api/market-panorama/snapshot'), get(client, '/api/research/universe'),
        get(client, '/api/eod-market/status'), get(client, '/api/tq/status')
      ]);
      const value = result => result.status === 'fulfilled' ? result.value : null;
      const fireData = value(fire);
      const fireView = fireData ? fireScanView(fireData, {mode, filter: 'candidate', limit}) : null;
      const trendData = value(trend);
      const trendView = trendData ? trendStatusView(trendData, {limit, includeRows: false}) : null;
      const panoData = value(pano);
      const overview = panoData ? panoramaPage(panoData, {page: 'overview', limit: 20}) : null;
      const universeData = value(universe);
      const topSignals = [];
      for (const row of fireView?.rows || []) {
        topSignals.push({kind: 'fire', code: row.code, name: row.name, contract: row.contract, side: row.modes?.[mode] === '多头观察' ? 'long' : 'short', detail: row, route: '#trade/fire'});
      }
      for (const event of trendView?.events?.slice(0, limit) || []) {
        topSignals.push({kind: 'trend', code: event.code || event.symbol, name: event.name, side: event.direction === 1 ? 'long' : event.direction === -1 ? 'short' : null, detail: event, route: '#market/monitor'});
      }
      for (const event of compactMonitorEvents(value(events), {limit, unread: args.unreadOnly !== false}).items) {
        topSignals.push({kind: 'monitor', code: event.code, name: event.name, side: event.direction || null, detail: event, route: '#trade/monitor'});
      }
      const digest = [
        `小木信号 ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`,
        `火 ${mode}：${fireView?.counts?.long ?? '—'} 多 / ${fireView?.counts?.short ?? '—'} 空`,
        `趋势 ${trendView?.events?.length ?? 0} 条警报`,
        `盯盘未读 ${value(monitor)?.unread ?? '—'}`,
        `研究 ${universeData?.completed ?? '—'}/${universeData?.total ?? '—'} 已完成`,
        `盘后 ${value(eod)?.status ?? '未知'}`
      ].join('；');
      return {
        generatedAt: new Date().toISOString(),
        digest,
        mode,
        market: {
          eod: value(eod), tq: value(tq) ? {status: value(tq).status, configured: value(tq).configured, quoteCount: value(tq).quoteCount, message: value(tq).message} : null,
          panorama: panoData ? {job: panoData.job, counts: panoData.counts, selectedDate: panoData.selectedDate, coverage: panoData.coverage} : null
        },
        fire: fireView ? {counts: fireView.counts, dataDate: fireView.dataDate, candidates: fireView.rows} : null,
        trend: trendView ? {running: trendView.running, tasks: trendView.tasks, coverage: trendView.coverage, market: trendView.market, weixin: trendView.weixin, events: trendView.events, observations: trendView.observations} : null,
        monitor: value(monitor) ? {runtime: value(monitor).runtime, activeRules: value(monitor).activeRules, unread: value(monitor).unread, market: value(monitor).market, desktop: value(monitor).desktop, phone: value(monitor).phone, announcements: value(monitor).announcements} : null,
        research: universeData ? {total: universeData.total, researchable: universeData.researchable, completed: universeData.completed, pending: universeData.total - universeData.completed} : null,
        marketOverview: overview ? {sectors: overview.sectors, topGainers: overview.topGainers, topLosers: overview.topLosers} : null,
        topSignals: topSignals.slice(0, limit * 2),
        notice: '信号是环境与观察候选，不构成交易许可；订单、批准与仓位仍由人工拍板。'
      };
    }
  },
  {
    name: 'wujian_api',
    title: '任意只读 API',
    description: '调用小木任意只读/纯计算 REST 接口。路径与参数可从 wujian_catalog 查询。写、交易、昂贵动作会被拒绝。',
    access: 'read',
    inputSchema: schema({
      method: enumOf(['GET', 'POST'], 'HTTP 方法；默认 GET'),
      path: string('API 路径，例如 /api/workbench/summary 或 /api/workbench/cards/:id'),
      pathParams: {type: 'object', description: '路径参数，例如 {id:"<卡UUID>"}', additionalProperties: true},
      query: {type: 'object', description: '查询参数对象', additionalProperties: true},
      body: {type: 'object', description: 'POST 纯计算接口的请求体', additionalProperties: true},
      maxBytes: integer('返回体上限，默认 350000', {minimum: 1000, maximum: 2000000})
    }, ['path']),
    handler: async (args, {client, config}) => {
      const method = String(args.method || 'GET').toUpperCase();
      const path = fillPath(args.path, args.pathParams);
      const endpoint = matchEndpoint(method, path);
      const access = endpoint?.access || classifyAccess(method, path);
      if (endpoint?.deprecated) throw new Error('该接口已停用（410），不供 Agent 使用');
      if (endpoint?.stream) throw new Error('SSE 流接口不能直接调用；请使用 wujian_monitor / wujian_trend_monitor 轮询');
      if (!accessAllowed(access, config) || !['read', 'calc'].includes(access)) throw new Error(accessReason(access, config));
      const data = await client.request(method, path, {query: args.query, body: args.body});
      return {request: {method, path}, endpoint: endpoint ? {id: endpoint.id, summary: endpoint.summary, access} : null, data: compact(data, {maxBytes: limitValue(args.maxBytes, config.maxResultBytes, 2_000_000)})};
    }
  },
  {
    name: 'wujian_endpoint',
    title: '按端点 ID 调用只读 API',
    description: '用 wujian_catalog 返回的 endpoint id 调用任意只读/纯计算接口，自动替换 :id 等路径参数。写、交易、昂贵动作仍被拒绝。',
    access: 'read',
    inputSchema: schema({
      id: string('端点 ID，例如 workbench-summary、workbench-card、market-panorama-variety'),
      pathParams: {type: 'object', description: '路径参数，例如 {id:"<卡UUID>"}', additionalProperties: true},
      query: {type: 'object', description: '查询参数', additionalProperties: true},
      body: {type: 'object', description: 'POST 纯计算接口请求体', additionalProperties: true},
      maxBytes: integer('返回体上限，默认 350000', {minimum: 1000, maximum: 2000000})
    }, ['id']),
    handler: async (args, {client, config}) => {
      const endpoint = endpoints.find(item => item.id === args.id);
      if (!endpoint) throw new Error(`未知端点 ID：${args.id}；用 wujian_catalog --kind endpoints 查询`);
      if (endpoint.deprecated) throw new Error('该接口已停用（410），不供 Agent 使用');
      if (endpoint.stream) throw new Error('SSE 流接口不能直接调用；请使用轮询工具');
      const access = endpoint.access;
      if (!accessAllowed(access, config) || !['read', 'calc'].includes(access)) throw new Error(accessReason(access, config));
      const path = fillPath(endpoint.path, args.pathParams);
      const data = await client.request(endpoint.method, path, {query: args.query, body: args.body});
      return {endpoint: {id: endpoint.id, method: endpoint.method, path: endpoint.path, summary: endpoint.summary}, requestPath: path, data: compact(data, {maxBytes: limitValue(args.maxBytes, config.maxResultBytes, 2_000_000)})};
    }
  },
  {
    name: 'wujian_catalog',
    title: 'API / 工具 / 页面目录',
    description: '列出小木全部 REST 端点、MCP 工具或页面，可按关键词、分类、权限过滤。回答“有哪些接口/按钮”时先查这里。',
    access: 'read',
    inputSchema: schema({
      kind: enumOf(['endpoints', 'tools', 'views', 'all'], '目录类型，默认 endpoints'),
      query: string('按路径、摘要、分类、工具名模糊过滤'),
      category: string('端点分类，例如 market、research、workbench、monitor'),
      access: enumOf(['read', 'calc', 'write', 'trading', 'expensive', 'stream'], '按权限过滤'),
      limit: integer('返回条数，默认 120', {minimum: 1, maximum: 400})
    }),
    handler: async (args, {config}) => {
      const kind = args.kind || 'endpoints';
      const limit = limitValue(args.limit, 120, 400);
      const query = lower(args.query);
      const endpointRows = endpoints.filter(endpoint => {
        if (args.category && endpoint.category !== args.category) return false;
        if (args.access && endpoint.access !== args.access) return false;
        if (!query) return true;
        return [endpoint.id, endpoint.path, endpoint.summary, endpoint.category, endpoint.method].some(value => lower(value).includes(query));
      }).map(endpoint => ({id: endpoint.id, method: endpoint.method, path: endpoint.path, category: endpoint.category, summary: endpoint.summary, access: endpoint.access, expensive: !!endpoint.expensive, deprecated: !!endpoint.deprecated, params: endpoint.params || []}));
      const toolRows = tools.filter(tool => !query || [tool.name, tool.title, tool.description].some(value => lower(value).includes(query))).map(tool => ({name: tool.name, title: tool.title, description: tool.description, access: tool.access, available: accessAllowed(tool.access, config)}));
      const viewRows = views.filter(view => !query || [view.id, view.title, view.purpose].some(value => lower(value).includes(query)));
      const result = {
        generatedAt: new Date().toISOString(),
        counts: {endpoints: endpoints.length, tools: tools.length, views: views.length, buttons: buttons.length},
        permissions: {reads: true, writes: !!config.allowWrites, trading: !!config.allowTrading, expensive: !!config.allowExpensive}
      };
      if (kind === 'endpoints' || kind === 'all') result.endpoints = endpointRows.slice(0, limit);
      if (kind === 'tools' || kind === 'all') result.tools = toolRows.slice(0, limit);
      if (kind === 'views' || kind === 'all') result.views = viewRows.slice(0, limit);
      return result;
    }
  },
  {
    name: 'wujian_views',
    title: '页面与按钮地图',
    description: '列出 18 个交易/市场页面、旧版入口、深链和每个页面的按钮/动作，帮助 Agent 告诉用户去哪里查看或操作。',
    access: 'read',
    inputSchema: schema({
      id: string('页面 ID，例如 trade/fire 或 market/overview'),
      group: enumOf(['market', 'trade', 'entry'], '页面分组'),
      includeButtons: boolean('是否返回按钮映射，默认 false'),
      query: string('按标题或用途过滤'),
      limit: integer('最多返回页面数，默认 30', {minimum: 1, maximum: 50})
    }),
    handler: async (args, {config}) => {
      const pageRows = views.filter(view => {
        if (args.id && view.id !== args.id) return false;
        if (args.group && view.group !== args.group) return false;
        if (args.query && ![view.id, view.title, view.purpose].some(value => lower(value).includes(lower(args.query)))) return false;
        return true;
      }).slice(0, limitValue(args.limit, 30, 50));
      const result = {baseUrl: config?.baseUrl || 'http://127.0.0.1:4318', total: views.length, pages: pageRows};
      if (args.includeButtons) result.buttons = buttons.filter(button => !args.id || button.page === args.id);
      return result;
    }
  },
  {
    name: 'wujian_market_snapshot',
    title: '实时/盘后行情快照',
    description: '读取 TqSdk/盘后行情快照。默认研究池，可指定合约；默认去掉 K 线以控制体积，需要 K 线用 wujian_bars。',
    access: 'read',
    inputSchema: schema({
      scope: enumOf(['research', 'all'], 'research=量仓均>1万手研究池；all=全部已订阅主力合约'),
      symbols: {type: 'array', items: {type: 'string'}, description: '只返回这些合约/代码'},
      query: string('按代码、名称或合约模糊过滤'),
      includeBars: boolean('是否包含K线，默认 false'),
      barLimit: integer('每合约K线数，默认 30', {minimum: 1, maximum: 180}),
      limit: integer('最多返回合约数，默认 200', {minimum: 1, maximum: 300})
    }),
    handler: async (args, {client}) => {
      const snapshot = await get(client, '/api/live-market', {scope: args.scope || 'research'});
      let quotes = arr(snapshot.quotes);
      if (arr(args.symbols).length) {
        const wanted = new Set(args.symbols.map(lower));
        quotes = quotes.filter(quote => wanted.has(lower(quote.symbol)) || wanted.has(lower(quote.actualContract)) || wanted.has(lower(quote.requestedSymbol)) || wanted.has(lower(quote.name)));
      }
      if (args.query) quotes = quotes.filter(quote => matchQuery({...quote, code: quote.symbol?.split('.').pop()?.replace(/\d+$/, ''), contract: quote.actualContract}, args.query));
      const max = limitValue(args.limit, 200, 300);
      return {
        source: snapshot.source, status: snapshot.status, receivedAt: snapshot.receivedAt, dataMode: snapshot.dataMode,
        ageMs: snapshot.ageMs, permission: snapshot.permission, quality: snapshot.quality, liquidity: snapshot.liquidity,
        totalQuotes: arr(snapshot.quotes).length, returned: Math.min(quotes.length, max),
        quotes: quotes.slice(0, max).map(quote => quoteView(quote, {includeBars: !!args.includeBars, barLimit: limitValue(args.barLimit, 30, 180)})),
        failures: snapshot.failures, error: snapshot.error, notice: '最新成交价不等于收盘价；报价年龄只描述时间差，不据此推断断线或休市。'
      };
    }
  },
  {
    name: 'wujian_market_overview',
    title: '市场全景总览',
    description: '读取市场全景：板块等权涨跌、涨跌榜、多空距离、品种与收盘覆盖。适合回答“今天市场怎么样”。',
    access: 'read',
    inputSchema: schema({
      date: string('数据日期 YYYY-MM-DD；不填用最新'),
      sector: string('板块或交易所过滤'),
      query: string('品种/代码过滤'),
      limit: integer('返回条数，默认 100', {minimum: 1, maximum: 500})
    }),
    handler: async (args, {client}) => {
      const snapshot = await get(client, '/api/market-panorama/snapshot', args.date ? {date: args.date} : undefined);
      return panoramaPage(snapshot, {page: 'overview', sector: args.sector, query: args.query, limit: args.limit});
    }
  },
  {
    name: 'wujian_market_page',
    title: '市场全景分页数据',
    description: '按页面读取市场全景：overview/strength/rankings/funds/positions/fees/seat-flow/catalog/snapshot。服务端返回同一快照，本工具按页面裁剪。',
    access: 'read',
    inputSchema: schema({
      page: enumOf(['overview', 'strength', 'rankings', 'funds', 'positions', 'fees', 'seat-flow', 'catalog', 'snapshot'], '页面，默认 overview'),
      date: string('数据日期 YYYY-MM-DD'),
      sector: string('板块或交易所过滤'),
      query: string('品种/代码过滤'),
      sort: enumOf(['amount', 'changePct', 'volume'], 'rankings 排序字段'),
      limit: integer('返回条数，默认 100', {minimum: 1, maximum: 500})
    }),
    handler: async (args, {client}) => {
      const snapshot = await get(client, '/api/market-panorama/snapshot', args.date ? {date: args.date} : undefined);
      return panoramaPage(snapshot, {page: args.page || 'overview', sector: args.sector, query: args.query, limit: args.limit, sort: args.sort});
    }
  },
  {
    name: 'wujian_market_variety',
    title: '单品种全景详情',
    description: '读取一个品种的多周期信号、基差、仓单、展期、席位与收盘依据。默认不含K线/席位历史，需要时显式开启。',
    access: 'read',
    inputSchema: schema({
      product: string('品种代码，例如 CU、AG、RB'),
      date: string('数据日期 YYYY-MM-DD'),
      includeBars: boolean('包含日K，默认 false'),
      includeSeats: boolean('包含席位历史，默认 false'),
      barLimit: integer('K线数，默认 60', {minimum: 1, maximum: 180})
    }, ['product']),
    handler: async (args, {client}) => {
      const data = await get(client, '/api/market-panorama/variety', {product: args.product, date: args.date});
      return panoramaProductView(data, {includeBars: !!args.includeBars, includeSeats: !!args.includeSeats, barLimit: limitValue(args.barLimit, 60, 180)});
    }
  },
  {
    name: 'wujian_market_intraday',
    title: '单品种分时',
    description: '读取品种当日已采集的 1 分钟分时（相对前结算价的涨跌幅），只返回采样点，不补画。',
    access: 'read',
    inputSchema: schema({
      product: string('品种代码，例如 CU'),
      date: string('数据日期 YYYY-MM-DD'),
      limit: integer('最多返回点数，默认 300', {minimum: 10, maximum: 2000})
    }, ['product']),
    handler: async (args, {client}) => {
      const data = await get(client, '/api/market-panorama/intraday', {product: args.product, date: args.date});
      const points = arr(data.points);
      const max = limitValue(args.limit, 300, 2000);
      return {...data, points: points.slice(-max), totalPoints: points.length};
    }
  },
  {
    name: 'wujian_contract_spec',
    title: '合约参数',
    description: '读取品种合约乘数、最小变动价位、每跳盈亏和来源；计算仓位前必须先核对。',
    access: 'read',
    inputSchema: schema({symbol: string('品种代码，例如 CU、RB、AG')}, ['symbol']),
    handler: async (args, {client}) => wrap(await get(client, '/api/workbench/contract-spec', {symbol: args.symbol}))
  },
  {
    name: 'wujian_market_refresh_status',
    title: '行情同步状态',
    description: '汇总盘后行情、市场全景、天勤登录和监控行情的刷新状态。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => {
      const [eod, panorama, tq, monitor] = await Promise.allSettled([
        get(client, '/api/eod-market/status'), get(client, '/api/market-panorama/status'),
        get(client, '/api/tq/status'), get(client, '/api/monitor/status')
      ]);
      const value = result => result.status === 'fulfilled' ? result.value : {error: result.reason?.message};
      return {eod: value(eod), panorama: value(panorama), tq: value(tq), monitor: value(monitor)?.market || null};
    }
  },
  {
    name: 'wujian_fire_scan',
    title: '火 · 机会扫描',
    description: '读取最新火扫描，默认只返回月周日共振观察候选；可按模式、方向、板块过滤。候选不是入场信号。',
    access: 'read',
    inputSchema: schema({
      mode: enumOf(MODES, '扫描模式，默认 month-week-day'),
      filter: enumOf(['candidate', 'long', 'short', 'all', 'illiquid', 'missing'], '过滤条件，默认 candidate'),
      sector: string('板块过滤'),
      query: string('品种/代码过滤'),
      limit: integer('返回条数，默认 50', {minimum: 1, maximum: 200})
    }),
    handler: async (args, {client}) => fireScanView(await get(client, '/api/workbench/fire'), {
      mode: args.mode, filter: args.filter, sector: args.sector, query: args.query, limit: args.limit
    })
  },
  {
    name: 'wujian_fire_detail',
    title: '火 · 单品种详情',
    description: '读取火扫描单品种完整行、三模式判定和可选具体合约日K。',
    access: 'read',
    inputSchema: schema({
      code: string('品种代码，例如 CU、AG'),
      mode: enumOf(MODES, '关注的模式，默认 month-week-day'),
      includeBars: boolean('包含扫描日K，默认 true'),
      barLimit: integer('K线数，默认 60', {minimum: 1, maximum: 180})
    }, ['code']),
    handler: async (args, {client}) => {
      const fire = await get(client, '/api/workbench/fire');
      const row = arr(fire.rows).find(item => lower(item.code) === lower(args.code));
      if (!row) throw new Error(`火扫描中没有品种 ${args.code}`);
      const mode = MODES.includes(args.mode) ? args.mode : 'month-week-day';
      const result = {mode, row: fireRowView(row, mode), counts: fire.counts?.[mode] || null, dataDate: fire.data_date, ruleVersion: fire.rule_version};
      if (args.includeBars !== false && row.main_contract) {
        try {
          const bars = await get(client, '/api/workbench/fire/bars', {contract: row.main_contract});
          result.contract = row.main_contract;
          result.bars = arr(bars.bars).slice(-limitValue(args.barLimit, 60, 180)).map(barView);
          result.barSource = bars.source;
        } catch (error) { result.barsError = error.message; }
      }
      return result;
    }
  },
  {
    name: 'wujian_bars',
    title: '具体合约日K',
    description: '读取具体合约日K（最多 180 根），用于结构复核；末根可能未完成。',
    access: 'read',
    inputSchema: schema({
      contract: string('具体合约，例如 CU2612、AG2612'),
      limit: integer('返回最近 N 根，默认 80', {minimum: 1, maximum: 180})
    }, ['contract']),
    handler: async (args, {client}) => {
      const data = await get(client, '/api/workbench/fire/bars', {contract: args.contract});
      const bars = arr(data.bars).slice(-limitValue(args.limit, 80, 180)).map(barView);
      return {contract: data.contract, source: data.source, total: arr(data.bars).length, bars};
    }
  },
  {
    name: 'wujian_quote',
    title: '按名称/代码查报价',
    description: '用中文名、品种代码或合约在真实行情里解析最新报价，并可附带火扫描判定。找不到时返回候选，不猜测。',
    access: 'read',
    inputSchema: schema({
      query: string('例如 沪铜、CU、CU2612'),
      includeFire: boolean('附带火扫描判定，默认 true')
    }, ['query']),
    handler: async (args, {client}) => {
      const snapshot = await get(client, '/api/live-market', {scope: 'all'});
      const matches = arr(snapshot.quotes).filter(quote => {
        const code = quote.symbol?.split('.')?.[1]?.replace(/\d+$/, '') || quote.symbol;
        return matchQuery({
          code,
          name: quote.name,
          symbol: quote.symbol,
          contract: quote.actualContract,
          product: quote.requestedSymbol
        }, args.query);
      });
      let fireRow = null;
      if (args.includeFire !== false && matches.length) {
        try {
          const fire = await get(client, '/api/workbench/fire');
          const code = String(matches[0].actualContract || matches[0].symbol || '').replace(/^[^.]+\./, '').replace(/\d+$/, '');
          fireRow = arr(fire.rows).find(row => lower(row.code) === lower(code)) || null;
        } catch {}
      }
      return {
        query: args.query, status: snapshot.status, receivedAt: snapshot.receivedAt,
        matched: matches.length,
        matches: matches.slice(0, 10).map(quote => quoteView(quote)),
        fire: fireRow ? fireRowView(fireRow, 'month-week-day') : null,
        error: matches.length ? null : '未在已订阅真实行情中找到该品种；不要用记忆价格代替。'
      };
    }
  },
  {
    name: 'wujian_research_universe',
    title: '研究宇宙与进度',
    description: '读取全品种研究宇宙：技术方向、共振、证据等级、研究状态与报告 ID。',
    access: 'read',
    inputSchema: schema({
      filter: enumOf(['all', 'researchable', 'completed', 'pending', 'long', 'short'], '过滤，默认 all'),
      sector: string('板块过滤'),
      query: string('品种/代码过滤'),
      limit: integer('返回条数，默认 100', {minimum: 1, maximum: 200})
    }),
    handler: async (args, {client}) => {
      const universe = await get(client, '/api/research/universe');
      let rows = arr(universe.rows);
      if (args.filter === 'researchable') rows = rows.filter(row => row.researchable);
      if (args.filter === 'completed') rows = rows.filter(row => row.researchStatus === 'completed' || row.reportId);
      if (args.filter === 'pending') rows = rows.filter(row => row.researchStatus !== 'completed' && !row.reportId);
      if (args.filter === 'long') rows = rows.filter(row => row.technicalDirection === 'long');
      if (args.filter === 'short') rows = rows.filter(row => row.technicalDirection === 'short');
      if (args.sector) rows = rows.filter(row => lower(row.sector).includes(lower(args.sector)));
      if (args.query) rows = rows.filter(row => matchQuery(row, args.query));
      return {
        generatedAt: universe.generatedAt, dataDate: universe.dataDate, total: universe.total, researchable: universe.researchable,
        completed: universe.completed, matched: rows.length,
        rows: rows.slice(0, limitValue(args.limit, 100, 200)).map(row => ({
          code: row.code, name: row.name, sector: row.sector, contract: row.contract, dataDate: row.dataDate,
          researchable: row.researchable, technicalDirection: row.technicalDirection,
          fundamentalDirection: row.fundamentalDirection, resonance: row.resonance,
          strategyConclusion: row.strategyConclusion, strategyAction: row.strategyAction,
          institutionView: row.institutionView, evidenceGrade: row.evidenceGrade,
          reportId: row.reportId, researchStatus: row.researchStatus, researchAsOf: row.researchAsOf
        }))
      };
    }
  },
  {
    name: 'wujian_research_reports',
    title: '研究报告列表',
    description: '列出本机深度研究报告，可过滤状态、交易卡；默认返回摘要，不返回全文。',
    access: 'read',
    inputSchema: schema({
      status: enumOf(['completed', 'running', 'failed', 'cancelled'], '状态过滤'),
      cardId: string('交易卡 ID'),
      query: string('名称/代码过滤'),
      limit: integer('返回条数，默认 30', {minimum: 1, maximum: 100})
    }),
    handler: async (args, {client}) => {
      let rows = arr(await get(client, '/api/research/reports'));
      if (args.status) rows = rows.filter(report => report.status === args.status);
      if (args.cardId) rows = rows.filter(report => report.cardId === args.cardId);
      if (args.query) rows = rows.filter(report => matchQuery({...report, contract: report.contract || report.symbol}, args.query));
      return {total: rows.length, rows: rows.slice(0, limitValue(args.limit, 30, 100)).map(reportSummary)};
    }
  },
  {
    name: 'wujian_research_report',
    title: '研究报告详情',
    description: '读取一篇研究报告、来源、复核记录和对照；默认含正文，来源/证据需显式开启。',
    access: 'read',
    inputSchema: schema({
      id: string('报告 UUID'),
      includeReport: boolean('包含正文，默认 true'),
      includeSources: boolean('包含来源记录，默认 false'),
      includeEvidence: boolean('包含证据包，默认 false')
    }, ['id']),
    handler: async (args, {client}) => {
      const data = await get(client, `/api/research/reports/${encodeURIComponent(args.id)}`);
      return compactReportDetail(data, {includeReport: args.includeReport !== false, includeSources: !!args.includeSources, includeEvidence: !!args.includeEvidence});
    }
  },
  {
    name: 'wujian_research_batch',
    title: '批量研究状态',
    description: '读取批量研究队列状态与当前品种。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => wrap(await get(client, '/api/research/batch'))
  },
  {
    name: 'wujian_workbench_summary',
    title: '工作台账户总览',
    description: '读取账户、交易卡、待办、计划风险、火计数和规则版本。',
    access: 'read',
    inputSchema: schema({accountId: string('账户 ID；不填默认账户')}),
    handler: async (args, {client}) => {
      const summary = await get(client, '/api/workbench/summary', args.accountId ? {accountId: args.accountId} : undefined);
      return {
        ...summary,
        cards: arr(summary.cards).map(cardSummary),
        archivedCards: arr(summary.archivedCards).map(cardSummary),
        pending: arr(summary.pending).map(cardSummary)
      };
    }
  },
  {
    name: 'wujian_cards',
    title: '交易卡列表',
    description: '列出交易卡，可按账户、状态、归档过滤；返回五行流程摘要。',
    access: 'read',
    inputSchema: schema({
      accountId: string('账户 ID'),
      status: string('交易卡状态，例如 观察、待证据、已批准、已结束'),
      includeArchived: boolean('包含已归档，默认 false'),
      query: string('名称/合约过滤'),
      limit: integer('返回条数，默认 50', {minimum: 1, maximum: 100})
    }),
    handler: async (args, {client}) => {
      let rows = arr(await get(client, '/api/workbench/cards', {accountId: args.accountId, status: args.status}));
      if (!args.includeArchived) rows = rows.filter(card => !card.archivedAt);
      if (args.query) rows = rows.filter(card => matchQuery(card, args.query));
      return {total: rows.length, cards: rows.slice(0, limitValue(args.limit, 50, 100)).map(cardSummary)};
    }
  },
  {
    name: 'wujian_card',
    title: '单张交易卡',
    description: '读取交易卡完整内容：火、水、金计划、土执行、木复盘、时间线与账户；可只取某一环节。',
    access: 'read',
    inputSchema: schema({
      id: string('交易卡 UUID'),
      section: enumOf(['all', 'fire', 'water', 'plan', 'executions', 'reviews', 'timeline', 'trade'], '只取某环节，默认 all')
    }, ['id']),
    handler: async (args, {client}) => {
      const card = await get(client, `/api/workbench/cards/${encodeURIComponent(args.id)}`);
      if (!args.section || args.section === 'all') return card;
      return {id: card.id, name: card.name, contract: card.contract, status: card.status, [args.section]: card[args.section]};
    }
  },
  {
    name: 'wujian_accounts',
    title: '账户与资金',
    description: '列出账户；给 accountId 时附带余额变动和总览。只读，不修改账户。',
    access: 'read',
    inputSchema: schema({accountId: string('账户 ID；不填只列账户')}),
    handler: async (args, {client}) => {
      const accounts = await get(client, '/api/workbench/accounts');
      if (!args.accountId) return {accounts};
      const [summary, changes] = await Promise.all([
        get(client, '/api/workbench/summary', {accountId: args.accountId}),
        get(client, `/api/workbench/accounts/${encodeURIComponent(args.accountId)}/balance-changes`)
      ]);
      return {accounts, account: summary.account, balanceChanges: changes, plannedRisk: summary.plannedRisk, openCount: summary.openCount};
    }
  },
  {
    name: 'wujian_risk_calc',
    title: '以损定量计算（工作台）',
    description: '调用工作台 /api/workbench/risk。支持 simple 模式（账户权益×风险百分比）和完整计划模式；需人工提供账户/卡、方向、入场、止损、乘数与风险参数。纯计算，不批准、不下单。',
    access: 'calc',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: string('交易卡 ID；服务端会读取该卡的环境分层与账户'),
        accountId: string('账户 ID；不填时由 cardId 或服务端默认账户决定'),
        layers: {type: 'object', description: '五层环境方向；通常由 cardId 自动带入', additionalProperties: true},
        plan: {type: 'object', description: '完整计划对象；simple 模式需 sizingMode=simple、riskPercent、direction、entry、stop、multiplier', additionalProperties: true},
        sizingMode: enumOf(['simple', 'full'], '不传 plan 时的简写模式'),
        direction: enumOf(['long', 'short'], '方向（简写）'),
        entry: number('入场价（简写）'),
        stop: number('止损价（简写）'),
        multiplier: number('合约乘数（简写）'),
        tickSize: number('最小变动价位（简写）'),
        riskPercent: number('单笔风险百分比，例如 1 表示 1%（simple 简写）'),
        costPerLot: number('每手费用与滑点（完整模式简写）'),
        mainCycle: enumOf(['day', 'week', 'month'], '主周期（完整模式简写）'),
        frozenBudget: number('冻结预算（完整模式可选）'),
        marginCapLots: integer('保证金上限手数'),
        liquidityCapLots: integer('流动性上限手数')
      },
      additionalProperties: true
    },
    handler: async (args, {client}) => {
      const body = {...args};
      if (!body.plan) {
        body.plan = {
          sizingMode: args.sizingMode || 'simple',
          direction: args.direction,
          entry: args.entry,
          stop: args.stop,
          multiplier: args.multiplier,
          tickSize: args.tickSize,
          riskPercent: args.riskPercent,
          costPerLot: args.costPerLot,
          mainCycle: args.mainCycle,
          frozenBudget: args.frozenBudget,
          marginCapLots: args.marginCapLots,
          liquidityCapLots: args.liquidityCapLots
        };
      }
      return wrap(await client.post('/api/workbench/risk', body));
    }
  },
  {
    name: 'wujian_three_axes_size',
    title: '三板斧风险手数（旧独立参考）',
    description: '调用 /api/three-axes/size：按手工权益、风险比例、敞口比例、入场、止损、乘数计算上限手数。独立外部参考，不是工作台批准。',
    access: 'calc',
    inputSchema: schema({
      equity: number('账户权益（元）'),
      riskPct: number('单笔风险比例，0—1'),
      exposurePct: number('敞口比例，0—1'),
      entry: number('入场价'),
      stop: number('止损价'),
      multiplier: number('合约乘数')
    }, ['equity', 'riskPct', 'exposurePct', 'entry', 'stop', 'multiplier']),
    handler: async (args, {client}) => wrap(await client.post('/api/three-axes/size', args))
  },
  {
    name: 'wujian_governance',
    title: '五行治理与运行锁定',
    description: '读取团队职责、当前运行锁定、历史轮次、问题与复盘模式。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => compactGovernance(await get(client, '/api/workbench/governance'))
  },
  {
    name: 'wujian_changes',
    title: '业务变更记录',
    description: '读取工作台变更/审计记录。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => wrap(await get(client, '/api/workbench/changes'))
  },
  {
    name: 'wujian_monitor',
    title: '盯盘提醒',
    description: '读取盯盘状态、规则、事件、合约目录或桌面待办。SSE 事件改为轮询。',
    access: 'read',
    inputSchema: schema({
      section: enumOf(['status', 'events', 'rules', 'contracts', 'pending', 'export'], '区块，默认 status'),
      limit: integer('事件条数，默认 30', {minimum: 1, maximum: 200}),
      unreadOnly: boolean('只看未读事件，默认 false')
    }),
    handler: async (args, {client}) => {
      const section = args.section || 'status';
      if (section === 'status') return wrap(await get(client, '/api/monitor/status'));
      if (section === 'events') return compactMonitorEvents(await get(client, '/api/monitor/events'), {limit: args.limit, unread: !!args.unreadOnly});
      if (section === 'rules') return wrap(await get(client, '/api/monitor/rules'));
      if (section === 'contracts') return wrap(await get(client, '/api/monitor/contracts'));
      if (section === 'pending') return wrap(await get(client, '/api/monitor/desktop/pending'));
      if (section === 'export') return wrap(await get(client, '/api/monitor/export'));
      throw new Error('未知盯盘区块');
    }
  },
  {
    name: 'wujian_trend_monitor',
    title: '全品种EMA10监控',
    description: '读取趋势监控状态、任务、事件、目录、微信通道或单品种信号。',
    access: 'read',
    inputSchema: schema({
      section: enumOf(['status', 'tasks', 'events', 'catalog', 'weixin'], '区块，默认 status'),
      code: string('品种代码过滤，例如 AU'),
      limit: integer('返回条数，默认 50', {minimum: 1, maximum: 200})
    }),
    handler: async (args, {client}) => {
      const section = args.section || 'status';
      if (section === 'status') return trendStatusView(await get(client, '/api/trend-monitor/status'), {code: args.code, limit: args.limit});
      if (section === 'tasks') return wrap(await get(client, '/api/trend-monitor/tasks'));
      if (section === 'events') return wrap(await get(client, '/api/trend-monitor/events'));
      if (section === 'catalog') return wrap(await get(client, '/api/trend-monitor/catalog'));
      if (section === 'weixin') return wrap(await get(client, '/api/trend-monitor/weixin/status'));
      throw new Error('未知趋势监控区块');
    }
  },
  {
    name: 'wujian_knowledge',
    title: '本地知识库',
    description: '读取知识库状态、检索五简资料、按片段编号读取原文。检索走本地向量/全文混合。',
    access: 'read',
    inputSchema: schema({
      action: enumOf(['status', 'search', 'source'], '动作，默认 status'),
      query: string('检索词；action=search 时必填'),
      limit: integer('检索条数，默认 6', {minimum: 1, maximum: 12}),
      chunkId: integer('知识片段编号；action=source 时必填')
    }),
    handler: async (args, {client}) => {
      const action = args.action || 'status';
      if (action === 'status') return wrap(await get(client, '/api/knowledge/status'));
      if (action === 'search') {
        if (!args.query) throw new Error('知识库检索需要 query');
        const result = await client.post('/api/knowledge/search', {query: args.query, limit: args.limit || 6});
        return {...result, hits: arr(result.hits).slice(0, args.limit || 6).map(hit => ({...hit, content: str(hit.content).slice(0, 4000)}))};
      }
      if (action === 'source') {
        if (!args.chunkId) throw new Error('读取知识原文需要 chunkId');
        return wrap(await get(client, `/api/knowledge/source/${Number(args.chunkId)}`));
      }
      throw new Error('未知知识库动作');
    }
  },
  {
    name: 'wujian_postmarket',
    title: '盘后复盘',
    description: '读取盘后复盘历史、当前任务和来源连接；不启动新的复盘。',
    access: 'read',
    inputSchema: schema({
      section: enumOf(['reviews', 'current', 'sources'], '区块，默认 reviews'),
      mode: string('复盘模式，例如 all'),
      limit: integer('返回条数，默认 10', {minimum: 1, maximum: 50})
    }),
    handler: async (args, {client}) => {
      const section = args.section || 'reviews';
      if (section === 'reviews') {
        const rows = arr(await get(client, '/api/workbench/postmarket-reviews', args.mode ? {mode: args.mode} : undefined));
        return {total: rows.length, rows: rows.slice(0, limitValue(args.limit, 10, 50))};
      }
      if (section === 'current') return wrap(await get(client, '/api/workbench/postmarket-reviews/current'));
      if (section === 'sources') return wrap(await get(client, '/api/postmarket-sources'));
      throw new Error('未知盘后区块');
    }
  },
  {
    name: 'wujian_news',
    title: '官方公告',
    description: '读取上期所官网公告标题、日期、链接和抓取时间；标题不是全文。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => wrap(await get(client, '/api/news'))
  },
  {
    name: 'wujian_rules',
    title: '规则与规则详情',
    description: '读取现行规则、规则文件哈希、扫描规则详情或规则登记。',
    access: 'read',
    inputSchema: schema({
      section: enumOf(['rules', 'registry', 'detail'], '区块，默认 rules')
    }),
    handler: async (args, {client}) => {
      const section = args.section || 'rules';
      if (section === 'rules') return wrap(await get(client, '/api/rules'));
      if (section === 'registry') return wrap(await get(client, '/api/workbench/rules'));
      if (section === 'detail') return wrap(await get(client, '/api/workbench/rules/detail'));
      throw new Error('未知规则区块');
    }
  },
  {
    name: 'wujian_providers',
    title: '外部数据源',
    description: '列出海外/宏观数据源及接入状态；可读取 yfinance 或 fred 的真实序列。',
    access: 'read',
    inputSchema: schema({provider: enumOf(['yfinance', 'fred'], '要读取的提供方；不填只列状态')}),
    handler: async (args, {client}) => {
      if (!args.provider) return wrap(await get(client, '/api/providers'));
      return {providers: await get(client, '/api/providers'), data: await get(client, '/api/external', {provider: args.provider})};
    }
  },
  {
    name: 'wujian_connections',
    title: '连接状态总览',
    description: '汇总模型、飞书、火山语音、GPT-Live、天勤、盘后、备份、维护和操作归档状态。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {client}) => {
      const paths = {
        feishu: '/api/feishu/status', llm: '/api/llm/status', volc: '/api/volc/status',
        liveVoice: '/api/live-voice/status', tq: '/api/tq/status', eod: '/api/eod-market/status',
        maintenance: '/api/maintenance/status', operationFiles: '/api/workbench/operation-files',
        panorama: '/api/market-panorama/status', monitor: '/api/monitor/status'
      };
      const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
        try { return [key, await get(client, path)]; } catch (error) { return [key, {error: error.message}]; }
      }));
      return Object.fromEntries(entries);
    }
  },
  {
    name: 'wujian_search',
    title: '跨源搜索',
    description: '按品种/关键词同时搜索真实行情、火扫描、交易卡、研究报告、研究宇宙和（可选）知识库。适合定位数据。',
    access: 'read',
    inputSchema: schema({
      query: string('名称、代码、合约或关键词'),
      limit: integer('每组条数，默认 8', {minimum: 1, maximum: 30}),
      includeKnowledge: boolean('同时检索本地知识库，默认 false（较慢）')
    }, ['query']),
    handler: async (args, {client}) => {
      const limit = limitValue(args.limit, 8, 30);
      const [market, fire, cards, reports, universe] = await Promise.allSettled([
        get(client, '/api/live-market', {scope: 'all'}), get(client, '/api/workbench/fire'),
        get(client, '/api/workbench/cards'), get(client, '/api/research/reports'), get(client, '/api/research/universe')
      ]);
      const value = result => result.status === 'fulfilled' ? result.value : null;
      const needle = lower(args.query);
      const quotes = arr(value(market)?.quotes).filter(quote => matchQuery({...quote, code: String(quote.actualContract || quote.symbol || '').replace(/^[^.]+\./, '').replace(/\d+$/, ''), contract: quote.actualContract}, args.query)).slice(0, limit).map(quote => ({type: 'quote', id: quote.symbol, title: quote.name || quote.symbol, subtitle: `${quote.actualContract || quote.symbol} · ${quote.last ?? '—'}`, route: '#market/home', data: quoteView(quote)}));
      const fireRows = arr(value(fire)?.rows).filter(row => matchQuery(row, args.query)).slice(0, limit).map(row => ({type: 'fire', id: row.code, title: row.name, subtitle: `${row.main_contract || '—'} · ${row.modes?.['month-week-day'] || '—'}`, route: '#trade/fire', data: fireRowView(row, 'month-week-day')}));
      const cardRows = arr(value(cards)).filter(card => matchQuery(card, args.query)).slice(0, limit).map(card => ({type: 'card', id: card.id, title: `${card.name} ${card.contract || ''}`, subtitle: card.status, route: `#trade/water?card=${card.id}`, data: cardSummary(card)}));
      const reportRows = arr(value(reports)).filter(report => matchQuery({...report, contract: report.contract || report.symbol}, args.query)).slice(0, limit).map(report => ({type: 'report', id: report.id, title: report.name, subtitle: `${report.status} · ${report.created}`, route: '#trade/water', data: reportSummary(report)}));
      const universeRows = arr(value(universe)?.rows).filter(row => matchQuery(row, args.query)).slice(0, limit).map(row => ({type: 'universe', id: row.code, title: row.name, subtitle: `${row.technicalDirection || '—'} · ${row.researchStatus || '—'}`, route: '#trade/water', data: row}));
      let knowledge = null;
      if (args.includeKnowledge) {
        try {
          const result = await client.post('/api/knowledge/search', {query: args.query, limit: Math.min(limit, 8)});
          knowledge = {hits: arr(result.hits).slice(0, limit).map(hit => ({title: hit.title, heading: hit.heading, path: hit.path, score: hit.score, lifecycle: hit.lifecycle, chunkId: hit.chunkId, snippet: str(hit.content).slice(0, 1200)}))};
        } catch (error) { knowledge = {error: error.message}; }
      }
      return {
        query: args.query, generatedAt: new Date().toISOString(),
        counts: {quotes: quotes.length, fire: fireRows.length, cards: cardRows.length, reports: reportRows.length, universe: universeRows.length, knowledge: knowledge?.hits?.length || 0},
        quotes, fire: fireRows, cards: cardRows, reports: reportRows, universe: universeRows, knowledge,
        notice: needle ? '结果是名称/代码匹配，不代表研究结论或交易许可。' : null
      };
    }
  },
  {
    name: 'wujian_permissions',
    title: '当前权限',
    description: '说明当前 MCP 进程的只读/写入/交易/昂贵动作权限，以及开启方式。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {config}) => ({
      permissions: {reads: true, writes: !!config.allowWrites, trading: !!config.allowTrading, expensive: !!config.allowExpensive},
      mode: config.allowTrading ? 'trading-enabled' : config.allowWrites ? 'write-enabled' : 'read-only',
      env: ['WUJIAN_ALLOW_WRITES', 'WUJIAN_ALLOW_TRADING', 'WUJIAN_ALLOW_EXPENSIVE'],
      notice: '默认只读。写操作需要 WUJIAN_ALLOW_WRITES=1；批准/成交/删除再需 WUJIAN_ALLOW_TRADING=1；研究/对话/刷新需 WUJIAN_ALLOW_EXPENSIVE=1。'
    })
  },
  {
    name: 'wujian_sync',
    title: '触发数据同步/备份',
    description: '触发盘后行情、市场全景、火扫描、公告检查或完整备份。长任务，需要 WUJIAN_ALLOW_EXPENSIVE=1 与 confirm=true。',
    access: 'expensive',
    inputSchema: schema({
      target: enumOf(['eod', 'panorama', 'fire', 'monitor-sources', 'backup'], '同步/备份目标'),
      mode: enumOf(['closes', 'quotes', 'full', 'supplement', 'minutes', 'holdings', 'fees'], 'panorama 同步内容，默认 closes'),
      confirm: boolean('必须为 true，确认启动长任务')
    }, ['target', 'confirm']),
    handler: async (args, {client, config}) => {
      if (!config.allowExpensive) throw new Error(accessReason('expensive', config));
      if (args.confirm !== true) throw new Error('长任务需要 confirm: true');
      if (args.target === 'eod') return wrap(await client.post('/api/eod-market/refresh', {}));
      if (args.target === 'panorama') return wrap(await client.post('/api/market-panorama/refresh', {mode: args.mode || 'closes'}));
      if (args.target === 'fire') return wrap(await client.post('/api/workbench/fire/refresh', {}));
      if (args.target === 'monitor-sources') return wrap(await client.post('/api/monitor/sources/check', {}));
      if (args.target === 'backup') return wrap(await client.post('/api/maintenance/backup', {}));
      throw new Error('未知同步目标');
    }
  },
  {
    name: 'wujian_research_start',
    title: '启动深度研究',
    description: '启动一个品种的后台深度研究（调用 DeepSeek，有成本）。需要 WUJIAN_ALLOW_EXPENSIVE=1 与 confirm=true。',
    access: 'expensive',
    inputSchema: schema({
      product: string('品种名称或代码，例如 沪铜、CU'),
      cardId: string('可选交易卡 ID'),
      confirm: boolean('必须为 true')
    }, ['product', 'confirm']),
    handler: async (args, {client, config}) => {
      if (!config.allowExpensive) throw new Error(accessReason('expensive', config));
      if (args.confirm !== true) throw new Error('启动研究需要 confirm: true');
      const body = args.cardId ? {product: args.product, cardId: args.cardId} : {product: args.product};
      return wrap(await client.post('/api/research/run', body));
    }
  },
  {
    name: 'wujian_research_cancel',
    title: '取消深度研究',
    description: '取消一个正在运行的研究任务。需要 WUJIAN_ALLOW_WRITES=1 与 confirm=true；只取消研究，不影响通话。',
    access: 'write',
    inputSchema: schema({
      id: string('报告/任务 UUID'),
      confirm: boolean('必须为 true')
    }, ['id', 'confirm']),
    handler: async (args, {client, config}) => {
      if (!config.allowWrites) throw new Error(accessReason('write', config));
      if (args.confirm !== true) throw new Error('取消研究需要 confirm: true');
      return wrap(await client.post('/api/research/cancel', {id: args.id}));
    }
  },
  {
    name: 'wujian_chat',
    title: '小木对话',
    description: '调用小木文字研究助手（DeepSeek，有成本）。需要 WUJIAN_ALLOW_EXPENSIVE=1。回答会使用工作台工具与本地知识库。',
    access: 'expensive',
    inputSchema: schema({
      messages: {
        type: 'array',
        description: '对话消息，role=user/assistant，content=文本；最多 24 条',
        items: {type: 'object', properties: {role: {type: 'string', enum: ['user', 'assistant']}, content: {type: 'string'}}, required: ['role', 'content'], additionalProperties: false}
      },
      contextSymbol: string('当前品种完整合约，例如 SHFE.CU2612'),
      cardId: string('交易卡 ID')
    }, ['messages']),
    handler: async (args, {client, config}) => {
      if (!config.allowExpensive) throw new Error(accessReason('expensive', config));
      if (!Array.isArray(args.messages) || !args.messages.length) throw new Error('messages 不能为空');
      return wrap(await client.post('/api/chat', {messages: args.messages, contextSymbol: args.contextSymbol, cardId: args.cardId}));
    }
  },
  {
    name: 'wujian_write',
    title: '通用写操作',
    description: '调用任意非交易写接口（保存卡片、余额、复盘、自选、导入等）。需要 WUJIAN_ALLOW_WRITES=1、confirm=true，并说明理由。',
    access: 'write',
    inputSchema: schema({
      method: enumOf(['POST', 'PATCH', 'DELETE'], 'HTTP 方法'),
      path: string('API 路径，例如 /api/workbench/cards/:id/water-notes'),
      pathParams: {type: 'object', description: '路径参数，例如 {id:"<卡UUID>"}', additionalProperties: true},
      query: {type: 'object', description: '查询参数', additionalProperties: true},
      body: {type: 'object', description: '请求体', additionalProperties: true},
      confirm: boolean('必须为 true'),
      reason: string('写入理由，会被记录在 MCP 日志')
    }, ['method', 'path', 'confirm', 'reason']),
    handler: async (args, {client, config}) => {
      if (!config.allowWrites) throw new Error(accessReason('write', config));
      if (args.confirm !== true) throw new Error('写操作需要 confirm: true');
      const method = String(args.method || 'POST').toUpperCase();
      const path = fillPath(args.path, args.pathParams);
      const endpoint = matchEndpoint(method, path);
      const access = endpoint?.access || classifyAccess(method, path);
      if (access === 'trading') throw new Error('该接口属于交易/批准/删除，请用 wujian_trading');
      if (access === 'expensive') throw new Error('该接口是昂贵长任务，请用 wujian_expensive / wujian_sync / wujian_research_start');
      if (!['write', 'calc'].includes(access)) throw new Error('该路径不是可写接口');
      return wrap(await client.request(method, path, {query: args.query, body: args.body}), {reason: args.reason});
    }
  },
  {
    name: 'wujian_expensive',
    title: '通用昂贵/长任务操作',
    description: '调用任意标记为昂贵的接口：盘后复盘生成、知识库重建、全景刷新、备份、金分析等。需要 WUJIAN_ALLOW_EXPENSIVE=1、confirm=true、reason。',
    access: 'expensive',
    inputSchema: schema({
      method: enumOf(['POST', 'PATCH'], 'HTTP 方法'),
      path: string('API 路径，例如 /api/workbench/cards/:id/gold/analyze'),
      pathParams: {type: 'object', description: '路径参数', additionalProperties: true},
      query: {type: 'object', description: '查询参数', additionalProperties: true},
      body: {type: 'object', description: '请求体', additionalProperties: true},
      confirm: boolean('必须为 true'),
      reason: string('启动长任务的理由')
    }, ['method', 'path', 'confirm', 'reason']),
    handler: async (args, {client, config}) => {
      if (!config.allowExpensive) throw new Error(accessReason('expensive', config));
      if (args.confirm !== true) throw new Error('长任务需要 confirm: true');
      const method = String(args.method || 'POST').toUpperCase();
      const path = fillPath(args.path, args.pathParams);
      const endpoint = matchEndpoint(method, path);
      const access = endpoint?.access || classifyAccess(method, path);
      if (access !== 'expensive') throw new Error('该路径不是昂贵/长任务接口；写操作用 wujian_write，交易用 wujian_trading');
      return wrap(await client.request(method, path, {query: args.query, body: args.body}), {reason: args.reason});
    }
  },
  {
    name: 'wujian_trading',
    title: '交易/批准/删除操作',
    description: '调用批准、成交、执行、释放、删除、运行锁定等交易类接口。需要 WUJIAN_ALLOW_WRITES=1 与 WUJIAN_ALLOW_TRADING=1，并 confirm+reason。小木设计上仍要求人工拍板。',
    access: 'trading',
    inputSchema: schema({
      method: enumOf(['POST', 'PATCH', 'DELETE'], 'HTTP 方法'),
      path: string('API 路径，例如 /api/workbench/cards/:id/approve'),
      pathParams: {type: 'object', description: '路径参数', additionalProperties: true},
      query: {type: 'object', description: '查询参数', additionalProperties: true},
      body: {type: 'object', description: '请求体', additionalProperties: true},
      confirm: boolean('必须为 true'),
      reason: string('人工授权理由')
    }, ['method', 'path', 'confirm', 'reason']),
    handler: async (args, {client, config}) => {
      if (!config.allowTrading) throw new Error(accessReason('trading', config));
      if (args.confirm !== true) throw new Error('交易类操作需要 confirm: true');
      const method = String(args.method || 'POST').toUpperCase();
      const path = fillPath(args.path, args.pathParams);
      const endpoint = matchEndpoint(method, path);
      const access = endpoint?.access || classifyAccess(method, path);
      if (!['trading', 'write'].includes(access)) throw new Error('该路径不是交易类接口');
      return wrap(await client.request(method, path, {query: args.query, body: args.body}), {reason: args.reason});
    }
  },
  {
    name: 'wujian_openapi',
    title: 'OpenAPI 描述',
    description: '生成小木 REST 的 OpenAPI 3.1 描述，便于不支持 MCP 的 Agent 直接走 HTTP。',
    access: 'read',
    inputSchema: schema({}),
    handler: async (_args, {config}) => buildOpenApi(config.baseUrl)
  }
];

export const toolByName = new Map(tools.map(tool => [tool.name, tool]));

export function availableTools(config = {}) {
  return tools.filter(tool => tool.access !== 'expensive' || config.allowExpensive)
    .filter(tool => tool.access !== 'write' || config.allowWrites)
    .filter(tool => tool.access !== 'trading' || (config.allowWrites && config.allowTrading));
}

export async function callTool(name, args = {}, {client, config} = {}) {
  const tool = toolByName.get(name);
  if (!tool) throw new Error(`未知工具：${name}`);
  if (!availableTools(config).some(item => item.name === name)) throw new Error(accessReason(tool.access, config));
  const value = await tool.handler(args || {}, {client, config});
  return value;
}

export function toolDescriptor(tool) {
  return {name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: {readOnlyHint: ['read', 'calc'].includes(tool.access), destructiveHint: ['write', 'trading'].includes(tool.access)}};
}

// ---------------------------------------------------------------------------
// OpenAPI 3.1
// ---------------------------------------------------------------------------

export function buildOpenApi(baseUrl = 'http://127.0.0.1:4318') {
  const paths = {};
  for (const endpoint of endpoints.filter(item => !item.deprecated)) {
    const path = endpoint.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const parameters = arr(endpoint.params).filter(param => param.in === 'path' || param.in === 'query').map(param => ({
      name: param.name, in: param.in, required: !!param.required, description: param.description || '',
      schema: {type: param.type === 'integer' ? 'integer' : param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : 'string'}
    }));
    const operation = {
      operationId: endpoint.id,
      summary: endpoint.summary,
      description: `${endpoint.summary}\n\n权限：${endpoint.access}${endpoint.expensive ? '（长任务/有成本）' : ''}`,
      tags: [endpoint.category],
      parameters,
      responses: {200: {description: '小木 JSON 响应'}, 400: {description: '请求或权限错误'}}
    };
    if (['POST', 'PATCH', 'DELETE'].includes(endpoint.method)) {
      operation.requestBody = {required: false, content: {'application/json': {schema: {type: 'object', additionalProperties: true}}}};
    }
    paths[path] ||= {};
    paths[path][endpoint.method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: '小木工作台只读 API',
      version: '0.5.x',
      description: '由 mcp/catalog.mjs 从 server.mjs 路由表生成。仅本机 127.0.0.1；写/交易/昂贵动作受权限控制。'
    },
    servers: [{url: baseUrl}],
    tags: [...new Set(endpoints.map(endpoint => endpoint.category))].sort().map(name => ({name})),
    paths
  };
}

export function endpointStats() {
  return {
    total: endpoints.length,
    byMethod: endpoints.reduce((out, endpoint) => ({...out, [endpoint.method]: (out[endpoint.method] || 0) + 1}), {}),
    byAccess: endpoints.reduce((out, endpoint) => ({...out, [endpoint.access]: (out[endpoint.access] || 0) + 1}), {}),
    byCategory: endpoints.reduce((out, endpoint) => ({...out, [endpoint.category]: (out[endpoint.category] || 0) + 1}), {})
  };
}

export function viewById(id) { return views.find(view => view.id === id) || null; }
export function buttonById(id) { return buttons.find(button => button.id === id) || null; }
