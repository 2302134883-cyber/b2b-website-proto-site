/* ============ 数据同源 · 拼接式 vs 一套底座 ============
 * 挂载点：<div id="dataSource"></div>
 * 引入顺序：i18n.js → tech-ring.js → data-source.js（均 defer）
 * 交互：首次进入视口自动播放一次；传统三端逐个生效，同源四端同一帧生效。
 * 关键：初始静止，离开再回来不重播；按钮可手动重播，改价前后对照持续保留。
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lang = document.documentElement.lang || 'zh-CN';
  var cur = 86;
  var activeFrom = 86;
  var activeTo = 92;
  var playing = false;
  var hasRun = false;
  var refs = { leftCards: [], rightCards: [] };

  var STATE_KEYS = {
    idle: 'ds.idle',
    wait: 'ds.wait',
    syncing: 'ds.syncing',
    done: 'ds.applied'
  };

  var SYSTEMS = [
    { name: '商城系统', copy: '独立数据拷贝' },
    { name: '后台管理系统', copy: '独立数据拷贝' },
    { name: '财务系统', copy: '独立数据拷贝' }
  ];
  var VIEWS = ['ds.view.shop', 'ds.view.workbench', 'ds.view.mobile', 'ds.view.ai'];
  var MODULES = ['主数据', '规则引擎', '状态机', '身份权限', '配置中心', '审计日志'];

  function t(key) {
    var dicts = window.__I18N_DICTS || {};
    var dict = dicts[lang] || dicts['zh-CN'] || {};
    var fallback = dicts['zh-CN'] || {};
    return dict[key] != null ? dict[key] : (fallback[key] != null ? fallback[key] : key);
  }

  function money(value) { return '¥' + value; }
  function nextPrice(value) { return value === 86 ? 92 : 86; }

  function el(tag, className, text, i18nKey) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (i18nKey) node.setAttribute('data-i18n', i18nKey);
    return node;
  }

  /* ---- CSS：扁平卡片 + 明确状态；不沿用旧原型的 3D 圆柱 ---- */
  var CSS = [
    '.dsc{margin-top:8px;font-family:inherit;--ds-accent:var(--md-sys-color-secondary,#6d5ef0);--ds-soft:var(--md-sys-color-secondary-container,#f1edfd)}',
    '.dsc *{box-sizing:border-box}',
    '.dsc-controls{margin-bottom:20px;padding:20px;border:1px solid var(--line,#e2e5ea);border-radius:16px;background:var(--wash,#fafbfc);text-align:center}',
    '.dsc-play{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 24px;border:0;border-radius:999px;background:var(--ink,#111827);color:#fff;font-family:inherit;font-size:13px;font-weight:700;line-height:1.4;cursor:pointer;font-variant-numeric:tabular-nums;transition:transform .18s ease,opacity .18s ease}',
    '.dsc-play:hover:not(:disabled){transform:translateY(-1px)}',
    '.dsc-play:focus-visible{outline:2px solid var(--ds-accent);outline-offset:3px}',
    '.dsc-play:disabled{opacity:.55;cursor:default}',
    '.dsc-tip{min-height:18px;margin:9px 0 0;color:var(--sub,#6b7280);font-size:11px;line-height:1.6}',
    '.dsc-progress{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:16px;text-align:left}',
    '.dsc-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--sub,#6b7280);font-size:10px;line-height:1.4}',
    '.dsc-progress-count{flex:none;color:var(--ink,#111827);font-weight:700;font-variant-numeric:tabular-nums}',
    '.dsc-progress-track{height:3px;margin-top:7px;overflow:hidden;border-radius:999px;background:var(--line,#e2e5ea)}',
    '.dsc-progress-fill{display:block;width:0;height:100%;border-radius:inherit;background:var(--ink,#111827);transition:width .28s ease}',
    '.dsc-progress-item.ours .dsc-progress-fill{background:var(--ds-accent)}',
    '.dsc-grid{display:grid;grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr);gap:0 12px;align-items:stretch}',
    '.dsc-col{display:flex;min-width:0;flex-direction:column;padding:18px;border:1px solid var(--line,#e2e5ea);border-radius:16px;background:#fff}',
    '.dsc-col-head{min-height:58px;margin-bottom:16px}',
    '.dsc-col-tag{display:block;color:var(--ink,#111827);font-size:11px;font-weight:700;line-height:1.5;letter-spacing:.03em}',
    '.dsc-col-status{display:block;margin-top:7px;color:var(--sub,#6b7280);font-size:10.5px;line-height:1.5}',
    '.dsc-col.ours .dsc-col-status{color:var(--ds-accent)}',
    '.dsc-vs{align-self:center;justify-self:center;display:flex;width:36px;height:36px;align-items:center;justify-content:center;border:1px solid var(--line,#e2e5ea);border-radius:50%;color:var(--faint,#6e7681);font-size:10px;font-weight:700}',
    '.dsc-ledger{display:grid;gap:12px}',
    '.dsc-floats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
    '.dsc-price-card{position:relative;min-width:0;overflow:hidden;padding:14px;border:1px solid var(--line-2,#e2e5ea);border-radius:12px;background:#fff;transition:border-color .25s ease,background .25s ease}',
    '.dsc-price-card::after{content:"";position:absolute;right:0;bottom:0;left:0;height:2px;background:var(--ds-accent);transform:scaleX(0);transform-origin:left}',
    '.dsc-price-card.is-syncing::after{animation:dsc-sync-progress .7s linear forwards}',
    '.dsc-price-card.is-syncing{border-color:var(--ds-accent)}',
    '.dsc-price-card.is-done{border-color:var(--ds-accent)}',
    '.dsc-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
    '.dsc-card-copy{min-width:0}',
    '.dsc-price-card .nm{display:block;color:var(--ink,#111827);font-size:12px;font-weight:700;line-height:1.45}',
    '.dsc-price-card .cp{display:block;margin-top:3px;color:var(--faint,#6e7681);font-size:10px;line-height:1.4}',
    '.dsc-state{flex:none;padding:2px 7px;border:1px solid var(--line,#e2e5ea);border-radius:999px;background:var(--wash,#fafbfc);color:var(--sub,#6b7280);font-size:10px;line-height:1.5;white-space:nowrap}',
    '.dsc-price-card.is-syncing .dsc-state,.dsc-price-card.is-done .dsc-state{border-color:var(--ds-accent);background:var(--ds-soft);color:var(--ds-accent)}',
    '.dsc-price-row{display:flex;min-height:30px;align-items:baseline;justify-content:space-between;gap:8px;margin-top:12px}',
    '.dsc-price-card .prc{display:inline-block;color:var(--ink,#111827);font-size:24px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;transform-origin:left center;white-space:nowrap}',
    '.dsc-price-card.is-done .prc{color:var(--ds-accent)}',
    '.dsc-change{color:var(--sub,#6b7280);font-size:10px;line-height:1.4;font-variant-numeric:tabular-nums;white-space:nowrap;visibility:hidden;opacity:0;transition:opacity .2s ease}',
    '.dsc-change.visible{visibility:visible;opacity:1}',
    '.dsc-flash{animation:dsc-price-pop 1s ease}',
    '.dsc-note{margin-top:auto;padding-top:16px;color:var(--sub,#6b7280);font-size:10.5px;line-height:1.7}',
    '.dsc-links{display:grid;width:50%;height:16px;grid-template-columns:repeat(2,1fr);margin:0 auto}',
    '.dsc-links i{justify-self:center;width:1px;height:16px;background:var(--line-2,#e2e5ea)}',
    '.dsc-source{padding:14px;border:1px solid var(--line,#e2e5ea);border-radius:12px;background:var(--wash,#fafbfc);text-align:center;transition:border-color .25s ease,background .25s ease}',
    '.dsc-source.is-commit{animation:dsc-source-commit 1.1s ease}',
    '.dsc-source-title{color:var(--ink,#111827);font-size:12px;font-weight:800;line-height:1.5}',
    '.dsc-cyl-mods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:12px}',
    '.dsc-cyl-mods span{padding:5px 3px;border:1px solid var(--line,#e2e5ea);border-radius:6px;background:#fff;color:var(--sub,#6b7280);font-size:10px;line-height:1.4}',
    '@keyframes dsc-sync-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '@keyframes dsc-price-pop{0%{transform:scale(.82)}35%{transform:scale(1.12)}100%{transform:scale(1)}}',
    '@keyframes dsc-source-commit{0%,100%{background:var(--wash,#fafbfc)}35%{border-color:var(--ds-accent);background:var(--ds-soft)}}',
    '@media (max-width:860px){.dsc-grid{grid-template-columns:minmax(0,1fr);gap:16px}.dsc-vs{margin:0 auto}.dsc-col-head{min-height:0}.dsc-ledger{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@media (max-width:640px){.dsc-controls{padding:16px 14px}.dsc-progress{gap:14px}.dsc-ledger{grid-template-columns:minmax(0,1fr)}.dsc-col{padding:14px}.dsc-price-card .prc{font-size:22px}}',
    '@media (max-width:420px){.dsc-progress{grid-template-columns:minmax(0,1fr);gap:12px}.dsc-floats{gap:8px}.dsc-price-card{padding:12px 10px}.dsc-card-top{flex-direction:column;gap:6px}.dsc-state{align-self:flex-start}.dsc-price-row{margin-top:9px}}',
    '@media (max-width:360px){.dsc-price-row{flex-direction:column;align-items:flex-start;gap:5px}}',
    '@media (prefers-reduced-motion:reduce){.dsc *,.dsc *::after{animation:none!important;transition:none!important}.dsc-price-card.is-syncing::after{transform:scaleX(1)}}'
  ].join('\n');

  function flash(node) {
    if (reduced.matches) return;
    node.classList.remove('dsc-flash');
    void node.offsetWidth;
    node.classList.add('dsc-flash');
  }

  function buildPriceCard(className, name, copy, nameKey) {
    var card = el('div', 'dsc-price-card ' + className);
    card.dataset.state = 'idle';

    var top = el('div', 'dsc-card-top');
    var copyBox = el('div', 'dsc-card-copy');
    copyBox.appendChild(el('span', 'nm', name, nameKey));
    copyBox.appendChild(el('span', 'cp', copy));
    top.appendChild(copyBox);
    var state = el('span', 'dsc-state', t(STATE_KEYS.idle));
    top.appendChild(state);
    card.appendChild(top);

    var priceRow = el('div', 'dsc-price-row');
    var price = el('span', 'prc', money(cur));
    var change = el('span', 'dsc-change');
    priceRow.appendChild(price);
    priceRow.appendChild(change);
    card.appendChild(priceRow);

    return { root: card, price: price, change: change, state: state };
  }

  function buildProgress(labelKey, side) {
    var item = el('div', 'dsc-progress-item ' + side);
    item.setAttribute('aria-hidden', 'true');
    var meta = el('div', 'dsc-progress-meta');
    meta.appendChild(el('span', null, t(labelKey), labelKey));
    var count = el('span', 'dsc-progress-count', '—/' + (side === 'ours' ? '4' : '3'));
    meta.appendChild(count);
    item.appendChild(meta);
    var track = el('div', 'dsc-progress-track');
    var fill = el('span', 'dsc-progress-fill');
    track.appendChild(fill);
    item.appendChild(track);
    return { root: item, count: count, fill: fill };
  }

  function build(host) {
    if (!document.getElementById('dsc-styles')) {
      var style = el('style');
      style.id = 'dsc-styles';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    host.innerHTML = '';
    refs = { leftCards: [], rightCards: [] };
    refs.host = host;

    var root = el('div', 'dsc');
    root.id = 'dsRoot';
    refs.root = root;

    /* 顶部：统一操作 + 两侧完成进度 */
    var controls = el('div', 'dsc-controls');
    var play = el('button', 'dsc-play');
    play.type = 'button';
    play.id = 'dsPlay';
    refs.play = play;
    controls.appendChild(play);
    refs.tip = el('p', 'dsc-tip', t('ds.sub'));
    refs.tip.id = 'dsTip';
    controls.appendChild(refs.tip);

    var progress = el('div', 'dsc-progress');
    refs.leftProgress = buildProgress('ds.left.tag', 'legacy');
    refs.rightProgress = buildProgress('ds.right.tag', 'ours');
    progress.appendChild(refs.leftProgress.root);
    progress.appendChild(refs.rightProgress.root);
    controls.appendChild(progress);
    root.appendChild(controls);

    var grid = el('div', 'dsc-grid');
    refs.grid = grid;

    /* 左：三个独立拷贝，逐个传输 */
    var left = el('article', 'dsc-col legacy');
    left.id = 'dsLeft';
    var leftHead = el('div', 'dsc-col-head');
    leftHead.appendChild(el('div', 'dsc-col-tag', t('ds.tag.a'), 'ds.tag.a'));
    refs.leftStatus = el('span', 'dsc-col-status', t('ds.idle'));
    refs.leftStatus.id = 'dsStA';
    refs.leftStatus.setAttribute('aria-live', 'polite');
    refs.leftStatus.setAttribute('aria-atomic', 'true');
    leftHead.appendChild(refs.leftStatus);
    left.appendChild(leftHead);
    var ledger = el('div', 'dsc-ledger');
    SYSTEMS.forEach(function (system) {
      var card = buildPriceCard('dsc-pz', system.name, system.copy);
      refs.leftCards.push(card);
      ledger.appendChild(card.root);
    });
    left.appendChild(ledger);
    left.appendChild(el('div', 'dsc-note', t('ds.left.foot'), 'ds.left.foot'));
    grid.appendChild(left);

    grid.appendChild(el('div', 'dsc-vs', 'VS'));

    /* 右：四个同源视图 + 一套扁平底座 */
    var right = el('article', 'dsc-col ours');
    right.id = 'dsRight';
    var rightHead = el('div', 'dsc-col-head');
    rightHead.appendChild(el('div', 'dsc-col-tag', t('ds.tag.b'), 'ds.tag.b'));
    refs.rightStatus = el('span', 'dsc-col-status', t('ds.idle'));
    refs.rightStatus.id = 'dsStB';
    refs.rightStatus.setAttribute('aria-live', 'polite');
    refs.rightStatus.setAttribute('aria-atomic', 'true');
    rightHead.appendChild(refs.rightStatus);
    right.appendChild(rightHead);

    var views = el('div', 'dsc-floats');
    VIEWS.forEach(function (key) {
      var card = buildPriceCard('dsc-float', t(key), 'DMS-B2B', key);
      refs.rightCards.push(card);
      views.appendChild(card.root);
    });
    right.appendChild(views);

    var links = el('div', 'dsc-links');
    links.setAttribute('aria-hidden', 'true');
    links.appendChild(el('i'));
    links.appendChild(el('i'));
    right.appendChild(links);

    var source = el('div', 'dsc-source');
    refs.source = source;
    source.appendChild(el('div', 'dsc-source-title', t('ds.right.label'), 'ds.right.label'));
    var modules = el('div', 'dsc-cyl-mods');
    MODULES.forEach(function (module) { modules.appendChild(el('span', null, module)); });
    source.appendChild(modules);
    right.appendChild(source);
    right.appendChild(el('div', 'dsc-note', t('ds.b.st1'), 'ds.b.st1'));
    grid.appendChild(right);

    root.appendChild(grid);
    host.appendChild(root);
    renderDynamicText();
  }

  function setProgress(progress, value, total) {
    progress.count.textContent = value + '/' + total;
    progress.fill.style.width = (value / total * 100) + '%';
  }

  function setCardState(card, state, from, to) {
    card.root.dataset.state = state;
    card.root.classList.toggle('is-syncing', state === 'syncing');
    card.root.classList.toggle('is-done', state === 'done');
    card.state.textContent = t(STATE_KEYS[state]);

    if (state === 'done') {
      card.price.textContent = money(to);
      card.change.textContent = money(from) + ' → ' + money(to);
      card.change.classList.add('visible');
      flash(card.price);
    } else if (state === 'idle' || state === 'wait') {
      card.change.classList.remove('visible');
    }
  }

  function renderDynamicText() {
    if (!refs.play) return;
    var target = playing ? activeTo : nextPrice(cur);
    var from = playing ? activeFrom : cur;
    refs.play.disabled = playing;
    refs.play.textContent = playing
      ? t('ds.running') + ' ' + money(from) + ' → ' + money(target)
      : t(hasRun ? 'ds.again.prefix' : 'ds.play') + ': ' + money(cur) + ' → ' + money(nextPrice(cur));

    refs.leftStatus.textContent = hasRun ? t(playing ? 'ds.a.st1' : 'ds.a.st2') : t('ds.idle');
    refs.rightStatus.textContent = hasRun ? t('ds.b.st2') : t('ds.idle');
    refs.tip.textContent = t(hasRun && !playing ? 'ds.done.tip' : 'ds.sub');

    refs.leftCards.concat(refs.rightCards).forEach(function (card) {
      card.state.textContent = t(STATE_KEYS[card.root.dataset.state] || STATE_KEYS.idle);
    });
  }

  function play() {
    if (playing || !refs.play) return;
    playing = true;
    hasRun = true;
    activeFrom = cur;
    activeTo = nextPrice(cur);
    cur = activeTo;

    refs.root.dataset.phase = 'running';
    refs.host.setAttribute('aria-busy', 'true');
    setProgress(refs.leftProgress, 0, 3);
    setProgress(refs.rightProgress, 0, 4);

    refs.leftCards.concat(refs.rightCards).forEach(function (card) {
      card.price.textContent = money(activeFrom);
      setCardState(card, 'wait', activeFrom, activeTo);
    });
    renderDynamicText();

    /* 同源四端：同一帧全部变为目标价，并永久保留本次改价对照。 */
    refs.rightCards.forEach(function (card) {
      setCardState(card, 'done', activeFrom, activeTo);
    });
    setProgress(refs.rightProgress, 4, 4);
    refs.source.classList.remove('is-commit');
    void refs.source.offsetWidth;
    refs.source.classList.add('is-commit');

    /* 传统三端：保留旧价，用独立状态表示同步，再逐个生效。 */
    refs.leftCards.forEach(function (card, index) {
      var delay = 500 + index * 800;
      window.setTimeout(function () {
        setCardState(card, 'syncing', activeFrom, activeTo);
      }, delay);
      window.setTimeout(function () {
        setCardState(card, 'done', activeFrom, activeTo);
        setProgress(refs.leftProgress, index + 1, 3);
        if (index === refs.leftCards.length - 1) {
          playing = false;
          refs.root.dataset.phase = 'done';
          refs.host.setAttribute('aria-busy', 'false');
          renderDynamicText();
        }
      }, delay + 700);
    });
  }

  document.addEventListener('i18n:applied', function (event) {
    if (event.detail && event.detail.lang) lang = event.detail.lang;
    renderDynamicText();
  });

  function armScrollPlay() {
    /* 初始保持静止；仅首次进入对比区域时自动播放，离开后回来不重播。 */
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.2) return;
        observer.disconnect();
        if (!hasRun) play();
      });
    }, { threshold: [0, 0.2] });
    observer.observe(refs.grid);
  }

  function init() {
    var host = document.getElementById('dataSource');
    if (!host) return;
    build(host);
    refs.play.addEventListener('click', play);
    armScrollPlay();
  }

  /* defer 脚本按序执行，DOM 已就绪 */
  init();
})();
