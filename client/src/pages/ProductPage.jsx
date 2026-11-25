// 商品详情页：多超市比价（按价格低→高）+ 30 天价格走势图 + 关注按钮。
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useApp } from '../app-context.jsx';
import { api, pick, fmtPrice } from '../api.js';
import FavButton from '../components/FavButton.jsx';
import PriceChart from '../components/PriceChart.jsx';

export default function ProductPage() {
  const { code } = useParams();
  const { t, lang } = useI18n();
  const { meta, favSet } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState(() => (localStorage.getItem('hmw.chartMode') === 'list' ? 'list' : 'offer'));
  const switchMode = (m) => {
    setMode(m);
    localStorage.setItem('hmw.chartMode', m);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(false);
    api(`/api/products/${encodeURIComponent(code)}`)
      .then(setData)
      .catch((e) => { if (e.name !== 'AbortError') setError(true); });
    return () => ctrl.abort();
  }, [code]);

  if (error) return <div className="state"><p>{t('loadError')}</p><Link to="/">← {t('back')}</Link></div>;
  if (!data) return <div className="state">{t('loading')}</div>;
  if (!data.meta) return <div className="state"><p>{t('product.notFound')}</p><Link to="/">← {t('back')}</Link></div>;

  const m = data.meta;
  const best = data.prices.length ? data.prices[0].price : null;
  // 正價最平 = 正价最低行；最低價 = 实付价（ep ?? 正价）最低行；并列同价全部标记
  const effs = data.prices.map((p) => p.ep ?? null); // 供「每件約」展示：仅优惠折算价
  // 最低价 = 实付价（有优惠用折算价，无优惠即正价）的全场最低行——
  // 正价可能比其他店的优惠后价还低（如 P000002440），该行应获得「最低价」标签
  const payoffs = data.prices.map((p) => p.ep ?? p.price);
  // 并列同价时所有并列行都标记（正價最平 / 最低價 同理）
  const minPrice = Math.min(...data.prices.map((p) => p.price));
  const bestIdxs = new Set(data.prices.flatMap((p, i) => (p.price === minPrice ? [i] : [])));
  const minPay = Math.min(...payoffs.filter((v) => v != null));
  const bestEffIdxs = new Set(payoffs.flatMap((v, i) => (v === minPay ? [i] : [])));

  return (
    <div className="detail">
      <Link to="/" className="backlink">← {t('back')}</Link>

      <div className="detail-head card">
        <div className="detail-title">
          <div className="detail-cat">
            {pick(m, 'cat1', lang)} › {pick(m, 'cat2', lang)} › {pick(m, 'cat3', lang)}
          </div>
          <h1>{pick(m, 'name', lang)}</h1>
          <div className="detail-brand">{pick(m, 'brand', lang)} · {code}</div>
          <div className="detail-sub">
            {data.date ? t('product.asOf', { date: data.date }) : ''}
            {' · '}
            {t('product.storesAvailable', { n: data.prices.length })}
          </div>
        </div>
        <div className="detail-fav">
          <FavButton code={code} label={favSet.has(code) ? t('product.removeFav') : t('product.addFav')} />
        </div>
      </div>

      <section className="card">
        <h2>{t('product.compare', { date: data.date })}</h2>
        {data.prices.length === 0 ? (
          <div className="state">{t('noResults')}</div>
        ) : (
          <>
          <table className="cmp">
            <thead>
              <tr>
                <th>{t('product.rank')}</th>
                <th>{t('product.store')}</th>
                <th className="num">{t('product.price')}</th>
                <th>{t('product.offer')}</th>
              </tr>
            </thead>
            <tbody>
              {data.prices.map((p, i) => {
                const eff = effs[i];
                const cls = [bestIdxs.has(i) ? 'best' : '', bestEffIdxs.has(i) ? 'best-eff' : ''].filter(Boolean).join(' ');
                return (
                  <tr key={p.supermarket_code} className={cls}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="store-cell">
                        <span className="store-line">
                          <span className="dot" style={{ background: `var(--store-${p.supermarket_code}, #888)` }} />
                          {pick(p, 'name', lang)}
                        </span>
                        {(bestIdxs.has(i) || bestEffIdxs.has(i)) && (
                          <span className="badge-row">
                            {bestIdxs.has(i) && <span className="best-badge">{t('product.lowest')}</span>}
                            {bestEffIdxs.has(i) && <span className="best-badge eff-badge">{t('product.lowestEff')}</span>}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num price">{fmtPrice(p.price, lang)}
                      {eff ? <small className="eff">{t('product.approxUnit', { p: fmtPrice(eff, lang) })}</small> : null}
                    </td>
                    <td className="offers">{pick(p, 'offers', lang) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="legend">
            <span><i className="lg lg-best" />{t('legend.best')}</span>
            <span><i className="lg lg-eff" />{t('legend.eff')}</span>
          </div>
          <p className="notice">ℹ️ {t('product.noQuoteNote')}</p>
          </>
        )}
        {best != null && data.prices.length > 1 && (
          <p className="hint">
            {t('product.lowest')}: {fmtPrice(best, lang)}
          </p>
        )}
      </section>

      {data.history.length > 0 && (
        <section className="card">
          <div className="chart-head">
            <h2>{t('product.history')}</h2>
            <div className="chart-tools">
              <div className="mode-group" role="group" aria-label="price basis">
                <button className={`day-btn mode-btn ${mode === 'offer' ? 'on' : ''}`} data-mode="offer"
                  onClick={() => switchMode('offer')}>{t('product.modeOffer')}</button>
                <button className={`day-btn mode-btn ${mode === 'list' ? 'on' : ''}`} data-mode="list"
                  onClick={() => switchMode('list')}>{t('product.modeList')}</button>
              </div>
              <div className="days-group">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    className={`day-btn ${days === d ? 'on' : ''}`}
                    onClick={() => setDays(d)}
                  >
                    {t(`days${d}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <PriceChart history={data.history} supermarkets={meta?.supermarkets ?? []} lang={lang} days={days} mode={mode} />
          <p className="hint">{t('product.historyNote', { n: days })}{mode === 'offer' ? t('product.modeOfferNote') : ''}</p>
        </section>
      )}
    </div>
  );
}
