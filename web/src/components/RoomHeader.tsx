import type { RoomState } from '../hooks/useRoom';

export function RoomHeader({ state }: { state: RoomState }) {
  const copyInvite = () => {
    const url = `${location.origin}/?room=${state.roomCode}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(url)
        .then(() => window.alert('邀请链接已复制，发给 TA 吧'))
        .catch(() => window.prompt('复制这个链接发给 TA', url));
    } else {
      window.prompt('复制这个链接发给 TA', url);
    }
  };

  return (
    <header className="room-header">
      <div className="room-brand" aria-label="一起看二人放映室">
        <span className="brand-mark" aria-hidden="true">
          02
        </span>
        <span className="brand-name">一起看</span>
      </div>

      <div className="room-session">
        <span className="room-label">放映室</span>
        <b>{state.roomCode}</b>
        <button className="mini invite-button" onClick={copyInvite}>
          分享邀请
        </button>
      </div>

      <div className="members">
        {state.members.map((m) => (
          <span key={m.cid} className="member">
            <span className={`member-dot${m.host ? ' member-dot-host' : ''}`} aria-hidden="true" />
            <span className="member-name">{m.name}</span>
            {m.cid === state.myCid && <span className="member-self">你</span>}
            {m.host && <span className="member-role">屋主</span>}
            {m.voice && <span className="member-voice">{m.muted ? '静音' : '连麦中'}</span>}
          </span>
        ))}
      </div>

      <div className="room-status" aria-label="当前模式">
        <span className="status-dot" aria-hidden="true" />
        {state.mode === 'share' ? '屏幕共享' : state.mode === 'sync' ? '同步播放' : '等你开场'}
      </div>
    </header>
  );
}
