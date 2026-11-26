import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomApi } from '../hooks/useRoom';
import { RoomHeader } from './RoomHeader';
import { VideoStage, type StageRef } from './VideoStage';
import { Controls } from './Controls';
import { ChatDrawer } from './ChatDrawer';

function playMedia(element: HTMLMediaElement, setBlocked: (blocked: boolean) => void) {
  const stream = element.srcObject;
  if (!stream) return;
  void element.play().then(
    () => {
      if (element.srcObject === stream) setBlocked(false);
    },
    (err: DOMException) => {
      if (element.srcObject === stream && err.name === 'NotAllowedError') setBlocked(true);
    },
  );
}

export function Room({ room }: { room: RoomApi }) {
  const { state, events, actions } = room;
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const stageRef = useRef<StageRef>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);

  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [shareBlocked, setShareBlocked] = useState(false);
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [remoteCamStream, setRemoteCamStream] = useState<MediaStream | null>(null);
  const [localCamStream, setLocalCamStream] = useState<MediaStream | null>(null);
  const [barrages, setBarrages] = useState<
    { id: number; text: string; mine: boolean }[]
  >([]);
  const barrageIdRef = useRef(0);

  const { notify } = actions;

  useEffect(() => {
    const offs = [
      events.on('share-stream', (s) => setShareStream(s)),
      events.on('share-ended', () => setShareStream(null)),
      events.on('voice-stream', (s) => {
        const a = voiceAudioRef.current;
        if (a) {
          a.srcObject = s;
          playMedia(a, setVoiceBlocked);
        }
        setRemoteCamStream(s);
      }),
      events.on('local-video', (s) => setLocalCamStream(s)),
      events.on('barrage', ({ text, mine }) => {
        // 弹幕开关没开就不飘（聊天记录仍正常）
        if (!stateRef.current.barrageOn) return;
        const id = ++barrageIdRef.current;
        setBarrages((prev) => [...prev.slice(-5), { id, text, mine }]);
        // 约 7 秒飘完，移出队列
        window.setTimeout(() => {
          setBarrages((prev) => prev.filter((b) => b.id !== id));
        }, 7000);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [events]);

  const stateRef = useRef(state);
  stateRef.current = state;

  // 共享流与模式通知可能先后到达，等视频元素和流都就绪再绑定。
  useEffect(() => {
    setShareBlocked(false);
    const video = shareVideoRef.current;
    if (!video || !shareStream) return;
    video.srcObject = shareStream;
    playMedia(video, setShareBlocked);
    return () => {
      video.srcObject = null;
    };
  }, [shareStream, state.shareActive, state.isHost]);

  const onUnlock = useCallback(() => {
    if (shareVideoRef.current) playMedia(shareVideoRef.current, setShareBlocked);
    if (voiceAudioRef.current) playMedia(voiceAudioRef.current, setVoiceBlocked);
  }, []);

  useEffect(() => {
    document.addEventListener('pointerdown', onUnlock);
    return () => document.removeEventListener('pointerdown', onUnlock);
  }, [onUnlock]);

  const voicePeer = state.members.find((member) => member.host !== state.isHost);
  const closeChat = () => {
    actions.closeChat();
    chatButtonRef.current?.focus();
  };

  return (
    <div
      id="roomView"
      className={state.chatOpen ? 'screen chat-open' : 'screen'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && state.chatOpen && !event.defaultPrevented && !event.nativeEvent.isComposing) {
          event.preventDefault();
          closeChat();
        }
      }}
    >
      <RoomHeader state={state} onNotify={notify} />
      {/* 连麦对方的远端声音（隐藏元素，只出声） */}
      <audio ref={voiceAudioRef} autoPlay />
      {/* 影片画面：屋主共享的屏幕实时流 */}
      <div className="rise stage-slot" style={{ '--d': 1 } as React.CSSProperties}>
        <VideoStage
          ref={stageRef}
          shareVideoRef={shareVideoRef}
          shareStream={shareStream}
          showUnlock={shareBlocked || voiceBlocked}
          onUnlock={onUnlock}
          isHost={state.isHost}
          shareActive={state.shareActive}
          barrages={barrages}
          remoteCamStream={voicePeer?.cam ? remoteCamStream : null}
          localCamStream={localCamStream}
        />
      </div>
      <ChatDrawer
        open={state.chatOpen}
        chat={state.chat}
        onSend={actions.chat}
        onClose={closeChat}
        barrageOn={state.barrageOn}
        onToggleBarrage={actions.toggleBarrage}
      />
      <Controls stageRef={stageRef} chatButtonRef={chatButtonRef} state={state} actions={actions} />
    </div>
  );
}
