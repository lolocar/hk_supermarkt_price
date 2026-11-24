// 商品列表页：分类树（点标签直接展开/关闭并筛选）+ 超市筛选 + 文字搜索 + 价格排序 + 分页。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useApp } from '../app-context.jsx';
import { api, pick, fmtPrice } from '../api.js';
import FavButton from '../components/FavButton.jsx';

const SORTS = ['price_asc', 'price_desc', 'name_asc'];

function CategoryTree({ params, setParamsObj, lang, tree }) {
  const active1 = params.get('cat1');
  const active2 = params.get('cat2');
  const active3 = params.get('cat3');
  const [open1, setOpen1] = useState(() => new Set());
  const [open2, setOpen2] = useState(() => new Set());
  const setOpen = (set, setter, key, on) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    setter(next);
  };

  return (
    <div className="tree">
      {tree.map((n1) => {
        const k1 = n1.name_zh_hant;
        const expanded1 = open1.has(k1) || active1 === k1;
        return (
          <div className="tree-l1" key={k1}>
            <button
              className={`tree-label tree-label1 ${expanded1 ? 'expanded' : ''} ${active1 === k1 && !active2 ? 'active' : ''}`}
              onClick={() => {
                if (active1 === k1) {
                  setParamsObj({ cat1: null, cat2: null, cat3: null });
                  setOpen(open1, setOpen1, k1, false);
                } else {
                  setParamsObj({ cat1: k1, cat2: null, cat3: null });
                  setOpen(open1, setOpen1, k1, true);
                }
              }}
            >
              {pick(n1, 'name', lang)}
              <span className="tree-count">{n1.cnt}</span>
            </button>
            {expanded1 && n1.l2.map((n2) => {
              const k2 = n2.name_zh_hant;
              const key2 = `${k1}|${k2}`;
              const expanded2 = open2.has(key2) || active2 === k2;
              return (
                <div className="tree-l2" key={k2}>
                  <button
                    className={`tree-label tree-label2 ${expanded2 ? 'expanded' : ''} ${active2 === k2 ? 'active' : ''}`}
                    onClick={() => {
                      if (active2 === k2) {
                        setParamsObj({ cat2: null, cat3: null });
                        setOpen(open2, setOpen2, key2, false);
                      } else {
                        setParamsObj({ cat1: k1, cat2: k2, cat3: null });
                        setOpen(open2, setOpen2, key2, true);
                      }
                    }}
                  >
                    {pick(n2, 'name', lang)}
                    <span className="tree-count">{n2.cnt}</span>
                  </button>
                  {expanded2 && n2.l3.map((n3) => {
                    const k3 = n3.name_zh_hant;
                    return (
                      <button
                        key={k3}
                        className={`tree-label tree-label3 ${active3 === k3 ? 'active' : ''}`}
                        onClick={() => {
                          if (active3 === k3) setParamsObj({ cat3: null });
                          else setParamsObj({ cat1: k1, cat2: k2, cat3: k3 });
                        }}
                      >
                        {pick(n3, 'name', lang)}
                        <span className="tree-count">{n3.cnt}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function SearchPage() {
  const { t, lang } = useI18n();
  const { meta, metaError, loadMeta, catTree, mobile } = useApp();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const sidebarRef = useRef(null);

  // 一次事件只调用一次 setParams，避免连续 setParam 互相覆盖丢失筛选条件
  const setParamsObj = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const setParam = (key, value) => setParamsObj({ [key]: value });

  const q = params.get('q') ?? '';
  const stores = (params.get('stores') ?? '').split(',').filter(Boolean);
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'price_asc';
  const page = Number.parseInt(params.get('page') ?? '1', 10) || 1;

  // 窄屏或手机版视图下侧栏默认收起（details），宽屏强制展开
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => {
      if (sidebarRef.current) sidebarRef.current.open = !(mq.matches || document.documentElement.dataset.mobile === '1');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mobile]);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(false);
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    for (const k of ['cat1', 'cat2', 'cat3']) if (params.get(k)) qs.set(k, params.get(k));
    if (stores.length) qs.set('stores', stores.join(','));
    qs.set('sort', sort);
    qs.set('page', String(page));
    qs.set('lang', lang);
    fetch(`/api/search?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== 'AbortError') setError(true); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, params.get('cat1'), params.get('cat2'), params.get('cat3'), params.get('stores'), sort, page, lang, nonce]);

  const toggleStore = (code) => {
    const next = new Set(stores);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setParam('stores', [...next].join(','));
  };

  const activeFilters = [q, params.get('cat1'), params.get('cat2'), params.get('cat3'), stores.length > 0 ? '1' : '']
    .filter(Boolean).length;
  const pages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / data.per)) : 1), [data]);

  if (metaError) {
    return (
      <div className="state">
        <p>{t('loadError')}</p>
        <button className="ghost-btn" onClick={loadMeta}>{t('retry')}</button>
      </div>
    );
  }

  return (
    <div className="layout">
      <details className="sidebar" ref={sidebarRef}>
        <summary className="side-summary">
          {t('filters.title')}
          {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
        </summary>
        <h2 className="side-title">{t('filters.title')}</h2>
        {activeFilters > 0 ? (
          <button className="clear-btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>✕ {t('filters.clear')}</button>
        ) : null}
        <h3 className="side-h3">{t('filters.stores')}</h3>
        <div className="store-list">
          {(meta?.supermarkets ?? []).map((s) => (
            <label key={s.code} className="store-item">
              <input type="checkbox" checked={stores.includes(s.code)} onChange={() => toggleStore(s.code)} />
              <span>{pick(s, 'name', lang)}</span>
            </label>
          ))}
        </div>
        <h3 className="side-h3">{t('filters.categories')}</h3>
        <CategoryTree params={params} setParamsObj={setParamsObj} lang={lang} tree={catTree} />
      </details>

      <section className="results">
        <div className="results-bar">
          <span>{data ? t('results.count', { n: data.total }) : t('loading')}</span>
          <select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="sort">
            {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </div>

        {error ? (
          <div className="state"><p>{t('loadError')}</p><button className="ghost-btn" onClick={() => setNonce((n) => n + 1)}>{t('retry')}</button></div>
        ) : !data ? (
          <div className="state">{t('loading')}</div>
        ) : data.items.length === 0 ? (
          <div className="state">{t('noResults')}</div>
        ) : (
          <ul className="item-list">
            {data.items.map((it) => (
              <li key={it.code} className="item-row">
                <Link to={`/product/${it.code}`} className="item-main">
                  <div className="item-name">{pick(it, 'name', lang)}</div>
                  <div className="item-meta">
                    <span className="item-brand">{pick(it, 'brand', lang)}</span>
                    <span className="chip">{pick(it, 'cat3', lang)}</span>
                    <span className="item-stores" title={t('product.noQuoteNote')}>{t('list.stores', { n: it.store_count })}</span>
                  </div>
                </Link>
                <div className="item-right">
                  <span className="price">{fmtPrice(it.min_price, lang)}</span>
                  <FavButton code={it.code} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && pages > 1 ? (
          <div className="pager">
            <button disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>{t('prev')}</button>
            <span>{t('page', { p: page, t: pages })}</span>
            <button disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>{t('next')}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
