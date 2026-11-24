// 价格走势图：各超市一条线，Chart.js；颜色按超市固定，随主题调整网格/文字色。
// mode='offer' 画优惠后每件价（ep，无优惠时等于正价）；mode='list' 画正价。
import { useEffect, useMemo, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { STORE_COLORS, pick, fmtPrice } from '../api.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const PALETTE = ['#e11d48', '#2563eb', '#d97706', '#0ea5e9', '#0d9488', '#7c3aed', '#f97316', '#ec4899', '#64748b'];

export default function PriceChart({ history, supermarkets, lang, days, mode = 'offer' }) {
  const canvasRef = useRef(null);
  // 测试钩子：暴露 Chart 实例，供 UI 断言读取数据集
  useEffect(() => {
    const inst = canvasRef.current && ChartJS.getChart(canvasRef.current);
    if (inst) window.__hmwChart = inst;
  });

  const { data, options } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const rows = history.filter((r) => r.d >= cutoffStr);
    const dates = [...new Set(rows.map((r) => r.d))].sort();
    const stores = [...new Set(rows.map((r) => r.s))];
    const nameOf = {};
    for (const s of supermarkets) nameOf[s.code] = pick(s, 'name', lang);
    const dark = document.documentElement.dataset.theme === 'dark';
    const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    const text = dark ? '#c8ccd4' : '#4b5563';
    const datasets = stores.map((code, i) => ({
      label: nameOf[code] || code,
      data: dates.map((d) => {
        const r = rows.find((x) => x.s === code && x.d === d);
        if (!r) return null;
        return mode === 'offer' && r.ep != null ? r.ep : r.p;
      }),
      borderColor: STORE_COLORS[code] ?? PALETTE[i % PALETTE.length],
      backgroundColor: STORE_COLORS[code] ?? PALETTE[i % PALETTE.length],
      spanGaps: true,
      tension: 0.25,
      pointRadius: dates.length > 12 ? 2 : 3,
      borderWidth: 2,
    }));
    return {
      data: { labels: dates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        plugins: {
          legend: { labels: { color: text, boxWidth: 14, sort: (a, b) => a.text.localeCompare(b.text) } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmtPrice(ctx.parsed.y, lang)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: grid } },
          y: { ticks: { color: text }, grid: { color: grid } },
        },
      },
    };
  }, [history, supermarkets, lang, days, mode]);

  if (!data.datasets.length) return null;
  return (
    <div className="chart-wrap">
      <Line ref={canvasRef} data={data} options={options} />
    </div>
  );
}
