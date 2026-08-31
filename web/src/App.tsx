import { useRoom } from './hooks/useRoom';
import { Lobby } from './components/Lobby';
import { Room } from './components/Room';

export default function App() {
  const room = useRoom();

  return (
    <>
      {room.state.phase === 'lobby' ? (
        <Lobby onCreate={room.actions.createRoom} onJoin={room.actions.joinRoom} err={room.state.lobbyErr} />
      ) : (
        <Room room={room} />
      )}
      <div id="toast" className={room.state.toast ? 'show' : ''}>
        {room.state.toast}
      </div>
    </>
  );
}
