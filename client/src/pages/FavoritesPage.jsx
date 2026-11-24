// 我的关注页：localStorage 收藏 + 批量取最新最低价，一键直达商品详情。
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useApp } from '../app-context.jsx';
import { api, pick, fmtPrice } from '../api.js';
import FavButton from '../components/FavButton.jsx';

export default function FavoritesPage() {
  const { t, lang } = useI18n();
  const { favs } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (favs.length === 0) { setItems([]); return undefined; }
    const ctrl = new AbortController();
    api(`/api/products/batch?codes=${encodeURIComponent(favs.join(','))}`)
      .then((r) => {
        const order = new Map(favs.map((c, i) => [c, i]));
        const sorted = [...r.items].sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
        setItems(sorted);
      })
      .catch(() => setItems([]));
    return () => ctrl.abort();
  }, [favs]);

  if (favs.length === 0) {
    return (
      <div className="state">
        <p>⭐ {t('fav.empty')}</p>
        <p className="hint">{t('fav.emptyHint')}</p>
        <Link to="/" className="ghost-btn">{t('nav.all')}</Link>
      </div>
    );
  }

  return (
    <div className="favorites">
      <ul className="item-list">
        {(items ?? []).map((it) => (
          <li key={it.code} className="item-row">
            <Link to={`/product/${it.code}`} className="item-main">
              <div className="item-name">{pick(it, 'name', lang)}</div>
              <div className="item-meta">
                <span className="item-brand">{pick(it, 'brand', lang)}</span>
                <span className="chip">{pick(it, 'cat3', lang)}</span>
                {it.store_count > 0 && <span className="item-stores">{t('list.stores', { n: it.store_count })}</span>}
              </div>
            </Link>
            <div className="item-right">
              {it.min_price != null && <span className="price">{fmtPrice(it.min_price, lang)}</span>}
              <FavButton code={it.code} />
            </div>
          </li>
        ))}
        {items && favs.length > items.length && (
          <li className="hint" style={{ padding: '8px 12px' }}>
            （{favs.length - items.length} {lang === 'en' ? 'no longer available' : '已没有近期报价'}）
          </li>
        )}
      </ul>
    </div>
  );
}
