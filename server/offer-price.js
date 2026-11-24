// 从多件优惠文本解析每件实际价格（正价与优惠后价的统一折算入口，服务端唯一实现）。
// 支持「2 for $12.00」「買2件$12.00」「買2件慳$4.00 / Buy 2 to save $4.00」等模式。

/**
 * @param {number} price 单件正价
 * @param {...(string|null|undefined)} offerTexts 该行超市的优惠文本（任意语言，可多个）
 * @returns {number|null} 每件实际价格；无法解析或折算后不低于正价时返回 null
 */
export function effectiveUnitPrice(price, ...offerTexts) {
  const text = offerTexts.filter(Boolean).join(' | ');
  if (!text || !Number.isFinite(price)) return null;
  let m = text.match(/(\d+)\s+for\s*\$\s?(\d+(?:\.\d+)?)/i)
    || text.match(/[買买]\s*(\d+)\s*[件支盒包]?\s*[\$￥]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const unit = Number(m[2]) / Number(m[1]);
    if (Number.isFinite(unit) && unit > 0 && unit < price) return Number(unit.toFixed(4));
  }
  m = text.match(/(?:buy|買|买)\s*(\d+)\s*(?:件)?\s*(?:to\s*save|慳|悭|省)\s*\$\s?(\d+(?:\.\d+)?)/i);
  if (m) {
    const unit = price - Number(m[2]) / Number(m[1]);
    if (Number.isFinite(unit) && unit > 0 && unit < price) return Number(unit.toFixed(4));
  }
  return null;
}
