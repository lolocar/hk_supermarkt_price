// meta 数据（快照日期、超市、分类树）全局缓存 + 关注列表（localStorage）上下文。
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { api } from './api.js';

const AppCtx = createContext(null);

const FAV_KEY = 'hmw.favs';

function loadFavs() {
  try {
    const arr = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function AppProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(false);
  const [favs, setFavs] = useState(loadFavs);

  const loadMeta = useCallback(() => {
    setMetaError(false);
    api('/api/meta').then(setMeta).catch(() => setMetaError(true));
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const toggleFav = useCallback((code) => {
    setFavs((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const favSet = useMemo(() => new Set(favs), [favs]);

  // 手机版视图（桌面可一键强制手机布局），data-mobile 属性驱动 CSS
  const [mobile, setMobileState] = useState(() => localStorage.getItem('hmw.mobile') === '1');
  const setMobile = useCallback((on) => {
    setMobileState(on);
    localStorage.setItem('hmw.mobile', on ? '1' : '0');
    if (on) document.documentElement.dataset.mobile = '1';
    else delete document.documentElement.dataset.mobile;
  }, []);
  useEffect(() => {
    if (mobile) document.documentElement.dataset.mobile = '1';
    else delete document.documentElement.dataset.mobile;
  }, [mobile]);

  // 由分类行数据构建三层树（节点含三语名称与计数）
  const catTree = useMemo(() => {
    if (!meta) return [];
    const l1 = new Map();
    for (const r of meta.categories) {
      const k1 = r.cat1_zh_hant; const k2 = r.cat2_zh_hant; const k3 = r.cat3_zh_hant;
      if (!l1.has(k1)) l1.set(k1, {
        name_en: r.cat1_en, name_zh_hant: r.cat1_zh_hant, name_zh_hans: r.cat1_zh_hans,
        cnt: 0, l2: new Map(),
      });
      const n1 = l1.get(k1); n1.cnt += r.cnt;
      if (!n1.l2.has(k2)) n1.l2.set(k2, {
        name_en: r.cat2_en, name_zh_hant: r.cat2_zh_hant, name_zh_hans: r.cat2_zh_hans,
        cnt: 0, l3: new Map(),
      });
      const n2 = n1.l2.get(k2); n2.cnt += r.cnt;
      n2.l3.set(k3, {
        name_en: r.cat3_en, name_zh_hant: r.cat3_zh_hant, name_zh_hans: r.cat3_zh_hans, cnt: r.cnt,
      });
    }
    return [...l1.values()].map((n1) => ({
      ...n1,
      l2: [...n1.l2.values()].map((n2) => ({ ...n2, l3: [...n2.l3.values()] })),
    }));
  }, [meta]);

  const value = useMemo(
    () => ({ meta, metaError, loadMeta, catTree, favs, favSet, toggleFav, mobile, setMobile }),
    [meta, metaError, loadMeta, catTree, favs, favSet, toggleFav, mobile, setMobile],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  return useContext(AppCtx);
}
