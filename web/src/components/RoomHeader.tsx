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
    <header>
      <div className="roominfo">
        房间 <b>{state.roomCode}</b> <button className="mini" onClick={copyInvite}>邀请</button>
      </div>
      <div className="members">
        {state.members.map((m) => (
          <span key={m.cid} className="chip">
            {m.host ? '👑 ' : ''}
            {m.voice ? '🎙' : ''}
            {m.name}
            {m.cid === state.myCid ? '（我）' : ''}
          </span>
        ))}
      </div>
    </header>
  );
}
