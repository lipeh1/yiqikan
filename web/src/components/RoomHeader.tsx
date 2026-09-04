import type { RoomState } from '../hooks/useRoom';
import { ThemeToggle } from './ThemeToggle';

/** 品牌标：播放三角，与 favicon 同一符号 */
function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <path d="M8 5.5 18 12 8 18.5z" />
      </svg>
    </span>
  );
}

/** 兼容非安全上下文（http 局域网）的复制：clipboard API → execCommand 降级，都不行就亮出房间码让人手抄 */
function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  return new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    resolve(ok);
  });
}

export function RoomHeader({
  state,
  onNotify,
}: {
  state: RoomState;
  onNotify: (msg: string) => void;
}) {
  const copyInvite = async () => {
    const url = `${location.origin}/?room=${state.roomCode}`;
    const ok = await copyText(url);
    onNotify(ok ? '邀请链接已复制，发给 TA 吧' : `复制失败，手动打开：${url}`);
  };

  return (
    <header className="room-header rise" style={{ '--d': 0 } as React.CSSProperties}>
      <div className="room-brand" aria-label="一起看二人放映室">
        <BrandMark />
        <span className="brand-name">一起看</span>
      </div>

      <div className="room-session">
        <span className="room-label">放映室</span>
        <b>{state.roomCode}</b>
        <button className="mini" onClick={() => void copyInvite()}>
          分享邀请
        </button>
        {/* 离开房间：整页回大厅，连接与房间状态一并清干净 */}
        <button className="mini leave-button" onClick={() => location.assign('/')}>
          离开
        </button>
        <ThemeToggle />
      </div>

      <div className="members">
        {state.members.map((m) => (
          <span key={m.cid} className="member">
            <span className={`member-dot${m.host ? ' member-dot-host' : ''}`} aria-hidden="true" />
            <span>{m.name}</span>
            {m.cid === state.myCid && <span className="member-self">你</span>}
            {m.host && <span className="member-role">屋主</span>}
            {m.voice && <span className="member-voice">{m.muted ? '静音' : '连麦中'}</span>}
          </span>
        ))}
      </div>

      <div className="room-status" aria-label="当前模式">
        <span className={`status-dot${state.mode === 'share' ? ' is-share' : ''}`} aria-hidden="true" />
        {state.mode === 'share' ? '屏幕共享' : state.mode === 'sync' ? '同步播放' : '等你开场'}
      </div>
    </header>
  );
}
