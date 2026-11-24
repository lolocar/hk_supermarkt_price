// 极简 API 客户端 + 通用格式化 / 优惠解析辅助。

export async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const LANG_SUFFIX = { en: 'en', 'zh-Hant': 'zh_hant', 'zh-Hans': 'zh_hans' };

/** 按当前语言取行内三语字段，逐级回退 en → zh_hant。 */
export function pick(row, base, lang) {
  if (!row) return '';
  const suf = LANG_SUFFIX[lang] ?? 'zh_hant';
  return row[`${base}_${suf}`] || row[`${base}_en`] || row[`${base}_zh_hant`] || '';
}

export function fmtPrice(n, lang) {
  if (n == null) return '—';
  return `${lang === 'en' ? 'HK$' : '$'}${Number(n).toFixed(2)}`;
}

// 从优惠文本解析每件实际价的逻辑统一在服务端 server/offer-price.js，API 直接返回 ep。

export const STORE_COLORS = {
  WELLCOME: '#e11d48',
  PARKNSHOP: '#2563eb',
  JASONS: '#d97706',
  WATSONS: '#0ea5e9',
  MANNINGS: '#0d9488',
  AEON: '#7c3aed',
  DCHFOOD: '#f97316',
  SASA: '#ec4899',
  LUNGFUNG: '#64748b',
};
