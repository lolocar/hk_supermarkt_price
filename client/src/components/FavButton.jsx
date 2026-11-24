// 关注星标按钮：在列表行 / 详情页 / 收藏页通用，状态来自 localStorage（app-context）。
import { useApp } from '../app-context.jsx';

export default function FavButton({ code, label }) {
  const { favSet, toggleFav } = useApp();
  const on = favSet.has(code);
  return (
    <button
      className={`fav-btn ${on ? 'on' : ''}`}
      aria-pressed={on}
      title={on ? '★' : '☆'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFav(code);
      }}
    >
      {on ? '★' : '☆'}{label ? <span> {label}</span> : null}
    </button>
  );
}
