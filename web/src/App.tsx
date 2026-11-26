import { useEffect } from 'react';
import { useRoom } from './hooks/useRoom';
import { Lobby } from './components/Lobby';
import { Room } from './components/Room';
import { initGlass } from './lib/glass';

export default function App() {
  const room = useRoom();

  // 液态玻璃：全页 .glass 元素（聊天抽屉、live 标签等浮在画面上的层）
  useEffect(() => initGlass(), []);

  return (
    <>
      <a className="skip-link" href={room.state.phase === 'lobby' ? '#lobby' : '#roomView'}>
        跳到内容
      </a>
      {room.state.phase === 'lobby' ? (
        <Lobby
          onCreate={room.actions.createRoom}
          onJoin={room.actions.joinRoom}
          onClearError={room.actions.clearLobbyError}
          err={room.state.lobbyErr}
          pending={room.state.lobbyPending}
        />
      ) : (
        <Room room={room} />
      )}
      {/* 轻提示：role + aria-live 让读屏器播报（连接断开/进房/错误等全靠它） */}
      <div id="toast" role="status" aria-live="polite" className={room.state.toast ? 'glass show' : 'glass'}>
        {room.state.toast}
      </div>
    </>
  );
}
