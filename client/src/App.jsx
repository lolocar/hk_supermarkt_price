// 应用外壳：页头（搜索、语言、主题、关注入口）+ 路由 + 页脚。
import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from './i18n.jsx';
import { useApp } from './app-context.jsx';
import SearchPage from './pages/SearchPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import FavoritesPage from './pages/FavoritesPage.jsx';
import { api } from './api.js';

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('hmw.theme', next);
    setTheme(next);
  };
  return (
    <button className="icon-btn" onClick={toggle} aria-label="toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

function MobileToggle() {
  const { mobile, setMobile } = useApp();
  return (
    <button
      className={`icon-btn ${mobile ? 'on' : ''}`}
      onClick={() => setMobile(!mobile)}
      aria-label="mobile view"
      aria-pressed={mobile}
      title="📱"
    >
      📱
    </button>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="language">
      <option value="zh-Hant">繁中</option>
      <option value="zh-Hans">简中</option>
      <option value="en">EN</option>
    </select>
  );
}

function Header() {
  const { t } = useI18n();
  const { favs } = useApp();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const onSubmit = (e) => {
    e.preventDefault();
    navigate(`/?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">🛒</span>
          <span className="logo-text">
            <strong>{t('app.name')}</strong>
            <small>{t('app.tagline')}</small>
          </span>
        </Link>
        <form className="searchbox" onSubmit={onSubmit} role="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label="search"
          />
          <button type="submit">🔍</button>
        </form>
        <nav className="topnav">
          <NavLink to="/" className="navlink" end>
            {t('nav.all')}
          </NavLink>
          <NavLink to="/favorites" className="navlink">
            ⭐ {t('nav.favorites')}
            {favs.length > 0 && <span className="badge">{favs.length}</span>}
          </NavLink>
          <LangSwitch />
          <MobileToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { t, lang } = useI18n();
  const { meta, loadMeta } = useApp();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      await api('/api/admin/collect', { method: 'POST' });
    } catch (e) { /* 后台继续抓取，稍后刷新即可 */ }
    setTimeout(() => { loadMeta(); setBusy(false); }, 6000);
  };
  return (
    <footer className="footer">
      <div>
        <a href="https://online-price-watch.consumer.org.hk/" target="_blank" rel="noreferrer">
          {t('footer.source')}
        </a>
        {meta?.latestDate ? <span className="footer-date"> · {t('product.asOf', { date: meta.latestDate })}</span> : null}
      </div>
      <div className="footer-row">
        <span>{t('footer.disclaimer')}</span>
        <button className="ghost-btn" onClick={refresh} disabled={busy}>
          {busy ? t('footer.refreshing') : t('footer.refresh')}
        </button>
      </div>
      <p className="ack">
        {t('footer.datagovAck')}
        <a href={`https://www.data.gov.hk/${{ 'zh-Hant': 'tc', 'zh-Hans': 'sc', en: 'en' }[lang]}/terms-and-conditions`}
          target="_blank" rel="noreferrer">{t('footer.datagovTerms')}</a>
        {t('footer.datagovEnd')}
      </p>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/product/:code" element={<ProductPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="*" element={<SearchPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
