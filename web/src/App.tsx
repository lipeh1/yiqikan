import { useRoom } from './hooks/useRoom';
import { Lobby } from './components/Lobby';
import { Room } from './components/Room';

export default function App() {
  const room = useRoom();

  return (
    <>
      <a className="skip-link" href={room.state.phase === 'lobby' ? '#lobby' : '#roomView'}>
        跳到内容
      </a>
      {room.state.phase === 'lobby' ? (
        <Lobby onCreate={room.actions.createRoom} onJoin={room.actions.joinRoom} err={room.state.lobbyErr} />
      ) : (
        <Room room={room} />
      )}
      {/* 轻提示：role + aria-live 让读屏器播报（连接断开/进房/错误等全靠它） */}
      <div id="toast" role="status" aria-live="polite" className={room.state.toast ? 'show' : ''}>
        {room.state.toast}
      </div>
    </>
  );
}
