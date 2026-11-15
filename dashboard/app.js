/* Token Radar Mission Control Console (Vanilla JS) */
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = {
    q: '',
    category: 'all',
    watchlistOnly: false,
    tab: 'pre-token', // 'pre-token' | 'comps' | 'method'
    sort: 'implied',
    dir: -1, // -1 desc, 1 asc
    selected: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
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

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
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
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === 'true';
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlistOnly) params.set('watchlist', 'true');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var str = params.toString();
    if (str) window.history.replaceState(null, '', '#' + str);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function getFilteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.watchlistOnly && !r.is_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.value_band, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function getSortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days; bv = b.age_days; }
      else if (key === 'readiness') { av = a.airdrop_readiness; bv = b.airdrop_readiness; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }

      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug.localeCompare(b.slug);
    });
  }

  function renderHeader() {
    return el('header', { class: 'radar-header' },
      el('div', { class: 'radar-brand' },
        el('span', { class: 'radar-pulse' }),
        el('div', { class: 'radar-title-group' },
          el('h1', { text: 'Token Radar Mission Control' }),
          el('span', { class: 'radar-subtitle', text: 'Pre-token intelligence & implied valuation engine' })
        )
      ),
      el('div', { class: 'radar-meta' },
        el('div', { class: 'meta-item' }, 'Snapshot: ', el('b', { text: DATA.as_of })),
        el('div', { class: 'meta-item' }, 'Source: ', el('b', { text: DATA.source })),
        el('div', { class: 'meta-item' }, 'Model: ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function renderHero() {
    return el('section', { class: 'radar-hero' },
      el('div', { class: 'hero-text' },
        el('h2', { text: 'Systematic Pre-Token Valuation' }),
        el('p', { text: 'Evaluating ' + DATA.board_size + ' pre-token protocols using category multiples calibrated from live market comparables. The watchlist floor captures all ' + DATA.watchlist_size + ' target protocols, augmented by ' + DATA.early_size + ' early pre-token protocols.' })
      ),
      el('div', { class: 'hero-stats' },
        el('div', { class: 'stat-row' }, el('span', { text: 'Watchlist Covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Total Scored Board' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Live Token Comps' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Global Median MCap/TVL' }), el('b', { text: DATA.global_median_ratio.toFixed(2) + 'x' }))
      )
    );
  }

  function renderTabs() {
    return el('div', { class: 'nav-tabs' },
      el('button', {
        type: 'button',
        class: 'tab-btn ' + (state.tab === 'pre-token' ? 'active' : ''),
        text: 'Pre-Token Board (' + DATA.board_size + ')',
        onclick: function () { state.tab = 'pre-token'; writeHash(); render(); }
      }),
      el('button', {
        type: 'button',
        class: 'tab-btn ' + (state.tab === 'comps' ? 'active' : ''),
        text: 'Market Comps (' + DATA.live_comps.length + ' live)',
        onclick: function () { state.tab = 'comps'; writeHash(); render(); }
      }),
      el('button', {
        type: 'button',
        class: 'tab-btn ' + (state.tab === 'method' ? 'active' : ''),
        text: 'Methodology & Constants',
        onclick: function () { state.tab = 'method'; writeHash(); render(); }
      })
    );
  }

  function renderControls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();

    var searchInput = el('input', {
      type: 'search',
      id: 'search-input',
      placeholder: 'Search protocol, slug, chain...',
      value: state.q,
      oninput: function (e) { state.q = e.target.value; writeHash(); updateTableContent(); }
    });

    var categorySelect = el('select', {
      id: 'category-select',
      onchange: function (e) { state.category = e.target.value; writeHash(); updateTableContent(); }
    },
      el('option', { value: 'all', text: 'All Categories' }),
      categories.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })
    );

    var watchlistCheckbox = el('input', {
      type: 'checkbox',
      id: 'watchlist-checkbox',
      checked: state.watchlistOnly ? 'checked' : null,
      onchange: function (e) { state.watchlistOnly = e.target.checked; writeHash(); updateTableContent(); }
    });

    var counterSpan = el('span', { class: 'results-counter', id: 'results-counter', text: getFilteredRows().length + ' protocols shown' });

    return el('div', { class: 'controls-bar' },
      el('div', { class: 'control-group' }, el('label', { for: 'search-input', text: 'Search' }), searchInput),
      el('div', { class: 'control-group' }, el('label', { for: 'category-select', text: 'Category Filter' }), categorySelect),
      el('div', { class: 'control-group checkbox-group' }, el('label', null, watchlistCheckbox, 'Watchlist Only')),
      counterSpan
    );
  }

  function sortHeader(key, label) {
    var isCurrent = state.sort === key;
    var arrow = isCurrent ? (state.dir < 1 ? ' ▼' : ' ▲') : '';
    return el('th', { scope: 'col' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          render();
        }
      }, label + arrow)
    );
  }

  function renderBoardTable() {
    var list = getSortedRows(getFilteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' },
        el('div', { class: 'empty-state' },
          el('h3', { text: 'No protocols match your filters' }),
          el('p', { text: 'Try broadening your search term or resetting category filters.' }),
          el('button', {
            type: 'button',
            class: 'tab-btn active',
            text: 'Reset Filters',
            onclick: function () { state.q = ''; state.category = 'all'; state.watchlistOnly = false; writeHash(); render(); }
          })
        )
      );
    }

    var tbody = el('tbody', { id: 'board-tbody' });
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badgeHtml = r.is_watchlist ? el('span', { class: 'badge badge-watchlist', text: 'Watchlist' }) : el('span', { class: 'badge badge-early', text: 'Early' });
      var bandBadge = el('span', { class: 'badge badge-band', text: r.value_band });

      var tr = el('tr', {
        'aria-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDrawer(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null,
          el('div', { class: 'proto-cell' },
            el('div', { class: 'proto-name' }, r.name, badgeHtml, bandBadge),
            el('div', { class: 'proto-meta', text: (r.category || 'Other') + ' • ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'Multi-chain') })
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', null,
          el('div', { class: 'readiness-wrap' },
            el('span', { class: 'num', text: r.airdrop_readiness + '%' }),
            el('div', { class: 'readiness-bar', 'aria-hidden': 'true' },
              el('div', { class: 'readiness-fill', style: 'width: ' + r.airdrop_readiness + '%;' })
            )
          )
        )
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'panel' },
      el('div', { class: 'table-container' },
        el('table', null,
          el('thead', null,
            el('tr', null,
              sortHeader('implied', 'Rank'),
              sortHeader('name', 'Protocol'),
              sortHeader('tvl', 'TVL'),
              sortHeader('growth', '7d Growth'),
              sortHeader('age', 'Age w/o Token'),
              sortHeader('implied', 'Implied Value'),
              sortHeader('readiness', 'Readiness')
            )
          ),
          tbody
        )
      )
    );
  }

  function updateTableContent() {
    var container = document.getElementById('board-container');
    var counter = document.getElementById('results-counter');
    if (counter) counter.textContent = getFilteredRows().length + ' protocols shown';
    if (container) {
      container.textContent = '';
      container.appendChild(renderBoardTable());
    }
  }

  function renderCompsTable() {
    var tbody = el('tbody');
    DATA.live_comps.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'proto-name' }, r.name, el('span', { class: 'badge badge-watchlist', text: 'Live Token' }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio.toFixed(2) + 'x' }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) })
      ));
    });

    return el('div', { class: 'panel' },
      el('div', { class: 'table-container' },
        el('table', null,
          el('thead', null,
            el('tr', null,
              el('th', { scope: 'col', text: 'Live Protocol' }),
              el('th', { scope: 'col', text: 'Category' }),
              el('th', { scope: 'col', text: 'TVL' }),
              el('th', { scope: 'col', text: 'Market Cap' }),
              el('th', { scope: 'col', text: 'MCap / TVL Ratio' }),
              el('th', { scope: 'col', text: '7d Growth' })
            )
          ),
          tbody
        )
      )
    );
  }

  function renderMethodologyPanel() {
    var m = DATA.model;
    var stats = DATA.category_stats;

    var catCards = Object.keys(stats).sort().map(function (cat) {
      var st = stats[cat];
      return el('div', { class: 'methodology-card' },
        el('h4', { text: cat }),
        el('p', { text: 'Live comps: ' + st.count + ' protocol' + (st.count === 1 ? '' : 's') }),
        el('p', { text: 'Calibrated MCap/TVL multiple: ' + st.median_ratio.toFixed(2) + 'x' })
      );
    });

    return el('div', { class: 'methodology-panel' },
      el('h3', { text: 'Valuation Methodology & Model Parameters' }),
      el('p', { text: 'Implied valuation is derived deterministically from the snapshot figures and calibrated against live market comparables present in the snapshot.' }),
      el('div', { class: 'formula-box' },
        'implied_value = round( tvl_usd × category_multiple × growth_multiplier × maturity_multiplier × chain_multiplier )'
      ),
      el('div', { class: 'methodology-grid' },
        el('div', { class: 'methodology-card' },
          el('h4', { text: 'Base Clamps' }),
          el('p', { text: 'Min clamp: ' + m.base_clamp_min + 'x | Max clamp: ' + m.base_clamp_max + 'x' })
        ),
        el('div', { class: 'methodology-card' },
          el('h4', { text: 'Growth Weight' }),
          el('p', { text: 'Weight factor: ' + m.growth_weight + ' (capped between ' + m.growth_min + '% and ' + m.growth_max + '%)' })
        ),
        el('div', { class: 'methodology-card' },
          el('h4', { text: 'Maturity Scaling' }),
          el('p', { text: 'Base: ' + m.maturity_base + ', Slope: ' + m.maturity_slope + ' over ' + m.maturity_cap_days + ' days' })
        ),
        el('div', { class: 'methodology-card' },
          el('h4', { text: 'Global Median Ratio' }),
          el('p', { text: 'Global fallback ratio: ' + DATA.global_median_ratio.toFixed(2) + 'x' })
        )
      ),
      el('h3', { text: 'Category Multipliers & Sample Counts' }),
      el('div', { class: 'methodology-grid' }, catCards)
    );
  }

  // Drawer / Detail View
  var drawerBackdrop = el('div', { class: 'drawer-backdrop', id: 'drawer-backdrop', hidden: 'hidden', onclick: function (e) { if (e.target === drawerBackdrop) closeDrawer(); } });
  var drawerEl = el('div', { class: 'drawer' });
  drawerBackdrop.appendChild(drawerEl);

  function openDrawer(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();

    drawerEl.textContent = '';
    drawerEl.appendChild(el('div', { class: 'drawer-header' },
      el('div', { class: 'drawer-title-area' },
        el('span', { class: 'badge badge-band', text: 'Rank #' + row.rank + ' // ' + row.value_band }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' • Chains: ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'None') })
      ),
      el('button', { type: 'button', class: 'drawer-close', text: '✕', onclick: closeDrawer, 'aria-label': 'Close details' })
    ));

    var body = el('div', { class: 'drawer-body' });

    // Why section
    body.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Intelligence Rationale ("Why")' }),
      el('p', { class: 'why-text', text: row.why })
    ));

    // Value Model Breakdown
    var catStat = DATA.category_stats[row.category] || { count: 0 };
    body.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Value Model Breakdown' }),
      el('div', { class: 'formula-box' },
        fmtUsd(row.tvl_usd) + ' TVL × ' + row.category_ratio.toFixed(2) + ' (cat mult) × ' + row.growth_mult.toFixed(2) + ' (growth) × ' + row.maturity_mult.toFixed(2) + ' (maturity) × ' + row.chain_mult.toFixed(2) + ' (chain) = ' + fmtUsd(row.implied_value_usd)
      ),
      el('div', { class: 'factor-grid' },
        el('div', { class: 'factor-card' }, el('span', { text: 'Category Comps' }), el('b', { text: (catStat.count || 0) + ' live protocols (' + row.category_ratio.toFixed(2) + 'x)' })),
        el('div', { class: 'factor-card' }, el('span', { text: 'Age with No Token' }), el('b', { text: row.age_days + ' days' })),
        el('div', { class: 'factor-card' }, el('span', { text: 'Airdrop Readiness' }), el('b', { text: row.airdrop_readiness + '%' })),
        el('div', { class: 'factor-card' }, el('span', { text: 'Value Band' }), el('b', { text: row.value_band }))
      )
    ));

    // Farm Plan
    var stepsList = el('ul', { class: 'farm-steps-list' });
    if (row.farm_steps && row.farm_steps.length > 0) {
      row.farm_steps.forEach(function (step, idx) {
        stepsList.appendChild(el('li', null,
          el('span', { class: 'farm-step-num', text: 'Step ' + (idx + 1) }),
          el('span', { class: 'farm-step-text', text: step })
        ));
      });
    } else {
      stepsList.appendChild(el('li', null, el('span', { class: 'farm-step-text', text: 'Standard multi-chain interaction and routine retention recommended.' })));
    }

    body.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Actionable Farm Plan' }),
      stepsList
    ));

    drawerEl.appendChild(body);
    drawerBackdrop.removeAttribute('hidden');
  }

  function closeDrawer() {
    state.selected = null;
    writeHash();
    drawerBackdrop.setAttribute('hidden', 'hidden');
  }

  function render() {
    var app = document.getElementById('radar-app');
    if (!app) return;
    app.textContent = '';

    var container = el('div', { class: 'app-container' });
    container.appendChild(renderHeader());
    container.appendChild(renderHero());
    container.appendChild(renderTabs());

    if (state.tab === 'pre-token') {
      container.appendChild(renderControls());
      var boardDiv = el('div', { id: 'board-container' });
      boardDiv.appendChild(renderBoardTable());
      container.appendChild(boardDiv);
    } else if (state.tab === 'comps') {
      container.appendChild(renderCompsTable());
    } else if (state.tab === 'method') {
      container.appendChild(renderMethodologyPanel());
    }

    container.appendChild(drawerBackdrop);
    app.appendChild(container);

    if (state.selected) {
      openDrawer(state.selected);
    }
  }

  readHash();
  render();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });
})();
