import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomApi } from '../hooks/useRoom';
import { RoomHeader } from './RoomHeader';
import { VideoStage, type StageRef } from './VideoStage';
import { Controls } from './Controls';
import { ChatDrawer } from './ChatDrawer';

export function Room({ room }: { room: RoomApi }) {
  const { state, events, actions } = room;
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const stageRef = useRef<StageRef>(null);

  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
          a.play().catch(() => setShowUnlock(true));
        }
        // 音视频连麦：远端流带视频轨时显示摄像头小窗，纯语音时收起
        setRemoteCamStream(s.getVideoTracks().length > 0 ? s : null);
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

  // 任意点击解锁手机自动播放限制
  useEffect(() => {
    const arm = () => {
      const v = shareVideoRef.current;
      if (v && (v.currentSrc || v.srcObject)) {
        v.play()
          .then(() => setShowUnlock(false))
          .catch(() => {});
      }
      void voiceAudioRef.current?.play().catch(() => {});
    };
    document.addEventListener('pointerdown', arm);
    return () => document.removeEventListener('pointerdown', arm);
  }, []);

  const onUnlock = () => {
    void shareVideoRef.current
      ?.play()
      .then(() => setShowUnlock(false))
      .catch(() => {});
    void voiceAudioRef.current?.play().catch(() => {});
  };

  // 供弹幕开关读取最新状态（避免闭包旧值）
  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);

  return (
    <div id="roomView" className="screen">
      <RoomHeader state={state} onNotify={notify} />
      {/* 连麦对方的远端声音（隐藏元素，只出声） */}
      <audio ref={voiceAudioRef} autoPlay />
      {/* 影片画面：屋主共享的屏幕实时流 */}
      <div className="rise" style={{ '--d': 1 } as React.CSSProperties}>
        <VideoStage
          ref={stageRef}
          shareVideoRef={shareVideoRef}
          shareStream={shareStream}
          showUnlock={showUnlock}
          onUnlock={onUnlock}
          isHost={state.isHost}
          shareActive={state.shareActive}
          barrages={barrages}
          remoteCamStream={remoteCamStream}
          localCamStream={localCamStream}
        />
      </div>
      <Controls
        stageRef={stageRef}
        state={state}
        actions={actions}
        onToggleChat={toggleChat}
      />
      <ChatDrawer
        open={chatOpen}
        chat={state.chat}
        onSend={actions.chat}
        onClose={() => setChatOpen(false)}
        barrageOn={state.barrageOn}
        onToggleBarrage={actions.toggleBarrage}
      />
    </div>
  );
}
