// Token Launch Radar v2 — static dashboard. Reads window.RADAR (data.js,
// written beside dashboard/ by main.ts) and renders the ranked board, the
// full-population audit ledger, the fitted model's validation record, a
// detail view per protocol with its netted farm plan, and filters. No
// network: every byte it shows is in data.js. On load it RECOMPUTES the
// whole board from the fitted parameters data.js carries and reports the
// result in the integrity strip — the page checks its own data.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function pct1(x) { return (x * 100).toFixed(1) + '%'; }

  // The fitted pricing rule, recomputed in the page from the parameters
  // data.js publishes — the same arithmetic lib/model.ts runs.
  function curveMultiple(tvl) {
    var m = DATA.model;
    var v = Math.exp(DATA.fit.loglog_a) * Math.pow(tvl, DATA.fit.loglog_b - 1);
    return Math.min(m.multiple_cap, Math.max(m.multiple_floor, v));
  }
  function categoryMultiple(row) {
    if (row.model.basis !== 'category+curve' || row.model.category_multiple === null) return null;
    return row.model.category_multiple;
  }
  function impliedOf(row) {
    var m = DATA.model;
    var curve = curveMultiple(row.tvl_usd);
    var cat = categoryMultiple(row);
    var fitted = curve;
    if (cat !== null) {
      fitted = Math.exp(m.blend_category_weight * Math.log(cat) + (1 - m.blend_category_weight) * Math.log(curve));
      fitted = Math.min(m.multiple_cap, Math.max(m.multiple_floor, fitted));
    }
    return Math.max(1, Math.round(row.tvl_usd * fitted));
  }

  // Integrity self-check: recompute the board, re-sum the ledger, re-verify
  // the ordering and the farm-step gate, all from data.js alone.
  function selfCheck() {
    var matched = 0;
    DATA.rows.forEach(function (r) { if (impliedOf(r) === r.implied_value_usd) matched += 1; });
    var ledgerSum = DATA.ledger.reduce(function (s, l) { return s + l.count; }, 0);
    var ordered = true;
    for (var i = 1; i < DATA.rows.length; i++) if (DATA.rows[i].implied_value_usd > DATA.rows[i - 1].implied_value_usd) ordered = false;
    var stepsOk = 0;
    DATA.rows.forEach(function (r) {
      var ok = r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every(function (s) { return s.length >= 20 && s.length <= 600; });
      if (ok) stepsOk += 1;
    });
    var ranksOk = DATA.rows.every(function (r, i) { return r.rank === i + 1; });
    return [
      { label: 'rows recomputed in-page match board: ' + matched + '/' + DATA.rows.length, pass: matched === DATA.rows.length },
      { label: 'ledger sums to snapshot: ' + ledgerSum + '/' + DATA.snapshot_total, pass: ledgerSum === DATA.snapshot_total && DATA.ledger_total === DATA.snapshot_total },
      { label: 'board strictly ranked by implied value', pass: ordered },
      { label: 'ranks run 1..' + DATA.rows.length, pass: ranksOk },
      { label: 'farm plans inside the 3-12 x 20-600 gate: ' + stepsOk + '/' + DATA.rows.length, pass: stepsOk === DATA.rows.length }
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('verdict')) state.verdict = params.get('verdict');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.verdict !== 'all' && r.farm.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'ev') { av = a.expected_value_usd; bv = b.expected_value_usd; }
      else if (key === 'net') { av = a.farm.net_usd; bv = b.farm.net_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('span', { text: 'Token Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.source }),
        el('span', { text: 'model ' + DATA.model_version + ' (fitted)' })
      )
    );
  }

  function lede() {
    var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var totalEv = DATA.rows.reduce(function (s, r) { return s + r.expected_value_usd; }, 0);
    var farmCount = DATA.rows.filter(function (r) { return r.farm.verdict === 'farm'; }).length;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', null,
          'No hand-set multiples: prices are ', el('b', { text: 'fitted' }),
          ' from the ' + DATA.fit.train_size + ' protocols in this snapshot that already trade a token, kept only where they survive leave-one-out and split-half validation. Every row carries two numbers — implied value if a token existed, and ',
          el('b', { text: 'expected value' }),
          ' after multiplying by token odds estimated from cohort launch rates — plus a farm plan netted against its own costs with a ',
          el('b', { text: 'farm / thin / skip' }),
          ' verdict. Implied value is this radar\u2019s own claim, not a prediction that a token will launch.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: DATA.ledger_total + ' / ' + DATA.snapshot_total })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Combined implied / expected' }), el('b', { text: fmtUsd(totalImplied) + ' / ' + fmtUsd(totalEv) })),
        el('div', { class: 'fact' }, el('span', { text: 'Verdict: farm' }), el('b', { text: String(farmCount) + ' rows' }))
      )
    );
  }

  function integrityStrip() {
    var checks = selfCheck();
    var strip = el('section', { class: 'strip', 'aria-label': 'Integrity self-check and population ledger' },
      el('h2', { text: 'Integrity — this page recomputed its own board just now' }),
      el('div', { class: 'checks' }, checks.map(function (c) {
        return el('span', { class: c.pass ? 'pass' : 'fail', text: (c.pass ? '\u2713 ' : '\u2717 ') + c.label });
      })),
      el('div', { class: 'ledger' }, DATA.ledger.map(function (l) {
        return el('span', { class: 'lane', title: l.note }, l.lane + ': ', el('b', { text: String(l.count) }));
      }))
    );
    return strip;
  }

  function selectField(id, label, values, current, onchange) {
    var select = el('select', { id: id, 'aria-label': label },
      values.map(function (v) { return el('option', { value: v.value, text: v.text, selected: v.value === current ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { onchange(select.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [{ value: 'all', text: 'All categories' }].concat(categories.map(function (c) { return { value: c, text: c }; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [{ value: 'all', text: 'All chains' }].concat(chains.map(function (c) { return { value: c, text: c }; })), state.chain, function (v) { state.chain = v; }),
      selectField('tier', 'Radar tier', [{ value: 'all', text: 'Watchlist + early' }, { value: 'watchlist', text: 'Watchlist only' }, { value: 'early', text: 'Early only' }], state.tier, function (v) { state.tier = v; }),
      selectField('verdict', 'Farm verdict', [{ value: 'all', text: 'Any verdict' }, { value: 'farm', text: 'Farm' }, { value: 'thin', text: 'Thin' }, { value: 'skip', text: 'Skip' }], state.verdict, function (v) { state.verdict = v; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label + (state.sort === key ? (state.dir < 0 ? ' \u25bc' : ' \u25b2') : ''))
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the category, chain, tier or verdict filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain n/a') })
        )),
        el('td', null, el('span', { class: 'badge ' + r.tier, text: r.tier })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: pct1(r.token_odds) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.expected_value_usd) }),
        el('td', { class: 'num ' + (r.farm.net_usd >= 0 ? 'pos' : 'neg'), text: fmtMoney(r.farm.net_usd) }),
        el('td', null, el('span', { class: 'badge ' + r.farm.verdict, text: r.farm.verdict.toUpperCase() }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by fitted implied value. Odds = cohort token-launch frequency; EV = implied x odds; Net = expected farm gross minus plan cash costs. Select any row for its full breakdown.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Tier' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('odds', 'Odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('ev', 'Expected value'),
            sortHeader('net', 'Farm net'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain n/a') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'These protocols already have a token: their market cap is a market fact — and the training sample the pricing model was fitted on — never mixed into the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function metricRows() {
    var f = DATA.fit;
    function row(label, m, base) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: String(m.n) }),
        el('td', { class: 'num', text: m.median_ratio.toFixed(2) }),
        el('td', { class: 'num', text: pct1(m.within2x) }),
        el('td', { class: 'num', text: pct1(m.within3x) }),
        el('td', { class: 'num', text: base ? pct1(base.within3x) : '—' })
      );
    }
    return el('table', { class: 'small-table' },
      el('thead', null, el('tr', null, el('th', { text: 'Held-out test' }), el('th', { text: 'n' }), el('th', { text: 'Median pred/actual' }), el('th', { text: 'Within 2x' }), el('th', { text: 'Within 3x' }), el('th', { text: 'Baseline within 3x' }))),
      el('tbody', null,
        row('Leave-one-out (blend)', f.loo_blend, f.loo_baseline),
        row('Split-half, fit older → test younger (blend)', f.split_blend, f.split_baseline)
      )
    );
  }

  function modelPanel() {
    var f = DATA.fit;
    var kept = f.categories.filter(function (c) { return c.kept; });
    var dropped = f.categories.filter(function (c) { return !c.kept; });
    var tbody = el('tbody');
    kept.slice(0, 10).forEach(function (c) {
      tbody.appendChild(el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.n) }), el('td', { class: 'num', text: '\u00d7 ' + c.multiple.toFixed(3) }), el('td', { class: 'num', text: pct1(c.loo_within3x) })));
    });
    return el('section', { class: 'panel pad' },
      el('h2', { text: 'The fitted model — and its held-out record' }),
      el('div', { class: 'formula', text: 'implied = round( tvl \u00d7 exp( 0.5 \u00d7 log(category_multiple) + 0.5 \u00d7 log(curve_multiple) ) ), curve_multiple = exp(' + f.loglog_a.toFixed(2) + ') \u00d7 tvl^(' + (f.loglog_b - 1).toFixed(2) + ') clamped to [0.01, 3]. Categories that failed validation are priced by the curve alone.' }),
      el('p', { class: 'note', text: 'Fitted on the ' + f.train_size + ' snapshot protocols that already trade a token (global geometric-mean mcap/TVL \u00d7 ' + f.global_multiple.toFixed(3) + '; log-log slope ' + f.loglog_b.toFixed(3) + '). A category term is kept only with at least ' + DATA.model.min_category_n + ' training members and a leave-one-out within-3x rate of at least ' + pct1(DATA.model.keep_within3x) + ': ' + kept.length + ' kept, ' + dropped.length + ' dropped to the curve (' + (dropped.length ? dropped.map(function (c) { return c.category; }).join(', ') : 'none') + '). Dispersion is real — even held out, only about two in five predictions land within 3x (the blend still beats the global-ratio baseline on within-3x and median log error in both tests) — so treat every implied value as the centre of a wide range, never a point price.' }),
      metricRows(),
      el('table', { class: 'small-table' }, el('thead', null, el('tr', null, el('th', { text: 'Kept category terms' }), el('th', { text: 'n' }), el('th', { text: 'Multiple' }), el('th', { text: 'LOO within 3x' }))), tbody)
    );
  }

  function oddsPanel() {
    var f = DATA.fit;
    var rc = f.residual_corr;
    return el('section', { class: 'panel pad' },
      el('h2', { text: 'Token odds, and the terms that failed their test' }),
      el('p', { class: 'note', text: 'Odds blend three cohort frequencies from this snapshot\u2019s own population — the share of protocols that already record a token within the row\u2019s category (weight ' + DATA.model.odds_cat_weight + '), age bucket (' + DATA.model.odds_age_weight + ') and TVL bucket (' + DATA.model.odds_tvl_weight + '), each shrunk toward the global rate of ' + pct1(f.odds_global) + '. A cohort frequency is not a promise about any single protocol: young cohorts have simply had less time to launch, which is exactly why age is a stratum and not a pricing term.' }),
      el('p', { class: 'note', text: 'Tested against the training residuals and REJECTED as pricing terms: 7-day TVL growth (correlation ' + rc.growth.toFixed(2) + '), protocol age (' + rc.log_age.toFixed(2) + ') and chain count (' + rc.chains.toFixed(2) + '). A hand-built model would have multiplied by all three; the data does not support any of them, so none is in the formula.' }),
      el('p', { class: 'note', text: 'Farm maths, stated in full: a launch is assumed to distribute ' + pct1(DATA.model.airdrop_pool_share) + ' of token value to early users across ' + DATA.model.qualifying_wallets.toLocaleString('en-US') + ' qualifying wallets. Expected gross per wallet = EV \u00d7 pool / wallets. Cash costs are the plan\u2019s gas plus capital opportunity cost at ' + pct1(DATA.model.opportunity_rate) + ' a year over the hold. FARM needs net \u2265 $100 and \u2265 $40/hour; THIN is positive but below the bar; SKIP does not cover its costs.' }),
      el('p', { class: 'note', text: 'Population ledger: ' + DATA.ledger.map(function (l) { return l.lane + ' ' + l.count; }).join(' \u00b7 ') + ' — every protocol in the snapshot, exactly once.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row);
    var cat = categoryMultiple(row);
    var curve = curveMultiple(row.tvl_usd);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' \u00b7 ' + row.tier + ' tier' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this rank — the fitted model, line by line' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: cat !== null ? 'Category multiple (fitted, kept)' : 'Category term' }), el('b', { text: cat !== null ? '\u00d7 ' + cat.toFixed(3) : 'failed validation — curve only' })),
        el('div', null, el('span', { text: 'Size-curve multiple at this TVL' }), el('b', { text: '\u00d7 ' + curve.toFixed(3) })),
        el('div', null, el('span', { text: 'Fitted multiple (blend)' }), el('b', { text: '\u00d7 ' + row.model.fitted_multiple.toFixed(3) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Token odds (cohort rate)' }), el('b', { text: pct1(row.token_odds) })),
        el('div', null, el('span', { text: 'Expected value (implied \u00d7 odds)' }), el('b', { text: fmtUsd(row.expected_value_usd) }))
      ),
      el('p', { class: 'note', text: 'This page recomputes the row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' — the same number board.json carries.' : ' — which differs from the board, so the data would be stale.') + ' Data completeness for this row: ' + row.confidence + '. Held-out, this model\u2019s median prediction error is wide (see the model panel): read the implied value as a range centre, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — netted, not just costed' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Expected gross (EV \u00d7 ' + pct1(DATA.model.airdrop_pool_share) + ' pool / ' + DATA.model.qualifying_wallets.toLocaleString('en-US') + ' wallets)' }), el('b', { text: fmtMoney(row.farm.expected_gross_usd) })),
        el('div', null, el('span', { text: 'Capital / hold' }), el('b', { text: fmtUsd(row.farm.capital_usd) + ' / ' + row.farm.hold_days + 'd' })),
        el('div', null, el('span', { text: 'Gas (whole plan)' }), el('b', { text: fmtMoney(row.farm.gas_usd) })),
        el('div', null, el('span', { text: 'Cash costs (gas + opportunity)' }), el('b', { text: fmtMoney(row.farm.cash_cost_usd) })),
        el('div', null, el('span', { text: 'Net' }), el('b', { text: fmtMoney(row.farm.net_usd) })),
        el('div', null, el('span', { text: 'Net per hour (' + row.farm.hours + 'h of plan time)' }), el('b', { text: fmtMoney(row.farm.net_per_hour_usd) })),
        el('div', null, el('span', { text: 'Break-even capture (share of EV)' }), el('b', { text: row.farm.breakeven_capture_pct.toFixed(4) + '%' }))
      ),
      el('div', { class: 'verdict', text: 'Radar verdict: ' + row.farm.verdict.toUpperCase() + (row.farm.verdict === 'farm' ? ' — the plan clears its costs with room under the stated assumptions. Still farm only from a dedicated wallet, with capital you can leave in place for the full hold.' : row.farm.verdict === 'thin' ? ' — positive but thin: worth it only if you are already active in this protocol.' : ' — under the stated assumptions the plan does not pay for itself. Skip it and spend the time on a FARM row.') })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — what to do, what it costs, how long it takes' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Signal' }),
      el('p', { class: 'note', text: row.signal })
    ));
    if (!dialog.isConnected) app.appendChild(dialog);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    var selected = state.selected;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      var grid = el('div', { class: 'grid2' });
      grid.appendChild(modelPanel());
      grid.appendChild(oddsPanel());
      shell.appendChild(grid);
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (selected) { state.selected = selected; openDetail(selected); }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
