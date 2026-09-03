import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { RoomApi } from '../hooks/useRoom';
import type { SyncState } from '../../../shared/protocol';
import { shouldSeek } from '../lib/util';
import { RoomHeader } from './RoomHeader';
import { VideoStage, type StageRef, type BarrageItem } from './VideoStage';
import { Controls } from './Controls';
import { ChatDrawer } from './ChatDrawer';

export function Room({ room }: { room: RoomApi }) {
  const { state, events, actions } = room;
  // notify 是 useCallback 稳定引用；actions 对象本身每帧重建，不能进 effect 依赖
  const { notify } = actions;
  const videoRef = useRef<HTMLVideoElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const stageRef = useRef<StageRef>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pickedTitle, setPickedTitle] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [remoteCamStream, setRemoteCamStream] = useState<MediaStream | null>(null);
  const [localCamStream, setLocalCamStream] = useState<MediaStream | null>(null);
  const [barrages, setBarrages] = useState<BarrageItem[]>([]);
  const barrageIdRef = useRef(0);

  const pendingRef = useRef<SyncState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------- 同步播放 ---------- */

  const applyPendingOnce = useCallback(() => {
    const v = videoRef.current;
    const p = pendingRef.current;
    if (!v || !p) return;
    pendingRef.current = null;
    try {
      v.currentTime = p.pos;
    } catch {
      /* 元数据未就绪 */
    }
    if (p.playing) v.play().catch(() => setShowUnlock(true));
    else v.pause();
  }, []);

  const applySync = useCallback(
    (sync: SyncState) => {
      const v = videoRef.current;
      if (!v) return;
      if (!v.currentSrc) {
        pendingRef.current = sync;
        return;
      }
      if (shouldSeek(v.currentTime, sync.pos)) v.currentTime = sync.pos;
      if (sync.playing) v.play().catch(() => setShowUnlock(true));
      else v.pause();
    },
    [],
  );

  useEffect(() => {
    const offs = [
      events.on('sync', applySync),
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
  }, [events, applySync]);

  // 屋主广播：自己的播放变化就是同步源
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      if (stateRef.current.isHost && stateRef.current.mode === 'sync')
        actions.send({ t: 'sync', playing: true, pos: v.currentTime });
    };
    const onPause = () => {
      if (stateRef.current.isHost && stateRef.current.mode === 'sync')
        actions.send({ t: 'sync', playing: false, pos: v.currentTime });
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [actions]);

  // 屋主每 5 秒心跳纠偏，追剧两小时也差不出一两秒
  useEffect(() => {
    if (!state.isHost || state.mode !== 'sync') return;
    const t = window.setInterval(() => {
      const v = videoRef.current;
      if (v?.currentSrc && !v.paused && !v.ended)
        actions.send({ t: 'heartbeat', playing: true, pos: v.currentTime });
    }, 5000);
    return () => window.clearInterval(t);
  }, [state.isHost, state.mode, actions]);

  // 正片加载中间态：拿到片源到可播放之间亮加载标；出错走轻提示
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoading = () => setVideoLoading(true);
    const onReady = () => setVideoLoading(false);
    const onError = () => {
      setVideoLoading(false);
      notify('影片加载失败：检查直链是否有效');
    };
    v.addEventListener('loadstart', onLoading);
    v.addEventListener('waiting', onLoading);
    v.addEventListener('canplay', onReady);
    v.addEventListener('playing', onReady);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('loadstart', onLoading);
      v.removeEventListener('waiting', onLoading);
      v.removeEventListener('canplay', onReady);
      v.removeEventListener('playing', onReady);
      v.removeEventListener('error', onError);
    };
  }, [notify]);

  // 任意点击解锁手机自动播放限制
  useEffect(() => {
    const arm = () => {
      const tryPlay = (el: HTMLVideoElement | null) => {
        if (el && (el.currentSrc || el.srcObject)) {
          el.play()
            .then(() => setShowUnlock(false))
            .catch(() => {});
        }
      };
      tryPlay(videoRef.current);
      tryPlay(shareVideoRef.current);
      void voiceAudioRef.current?.play().catch(() => {});
    };
    document.addEventListener('pointerdown', arm);
    return () => document.removeEventListener('pointerdown', arm);
  }, []);

  // 片源变化：直链直接加载；.m3u8 走 hls.js（Safari 原生 HLS 回退）；本地文件等各自选
  useEffect(() => {
    const v = videoRef.current;
    const src = state.src;
    if (!v || !src) return;
    if (src.kind === 'url' && src.url) {
      const isHls = /\.m3u8(\?|#|$)/i.test(src.url);
      if (isHls) {
        // 重新选片时销毁旧实例，避免重复挂载
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(src.url);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            v.addEventListener('loadedmetadata', applyPendingOnce, { once: true });
          });
        } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari/iPhone 原生支持 HLS，直接当直链放
          v.src = src.url;
          v.addEventListener('loadedmetadata', applyPendingOnce, { once: true });
        } else {
          notify('这个浏览器不支持 m3u8 播放');
        }
        return;
      }
      // 普通直链
      if (v.src !== src.url) {
        v.src = src.url;
        v.addEventListener('loadedmetadata', applyPendingOnce, { once: true });
      }
    }
  }, [state.src, applyPendingOnce, notify]);

  // 卸载时销毁 hls 实例
  useEffect(() => () => void hlsRef.current?.destroy(), []);

  /* ---------- 片源/共享 ---------- */

  const onHostLocalFile = (file: File) => {
    const v = videoRef.current;
    if (!v) return;
    actions.setSourceLocal(file);
    v.src = URL.createObjectURL(file);
    setPickedTitle(file.name);
  };

  const onFollowerLocalFile = (file: File) => {
    const v = videoRef.current;
    if (!v) return;
    v.src = URL.createObjectURL(file);
    v.addEventListener('loadedmetadata', applyPendingOnce, { once: true });
    setPickedTitle(file.name);
  };

  const onTogglePlay = () => {
    const v = videoRef.current;
    if (!v?.currentSrc) return;
    if (v.paused) v.play().catch(() => setShowUnlock(true));
    else v.pause();
  };

  const onUnlock = () => {
    const tryPlay = (el: HTMLVideoElement | null) =>
      el?.play()
        .then(() => setShowUnlock(false))
        .catch(() => {});
    tryPlay(videoRef.current);
    tryPlay(shareVideoRef.current);
    void voiceAudioRef.current?.play().catch(() => {});
  };

  return (
    <div id="roomView" className="screen">
      <RoomHeader state={state} onNotify={actions.notify} />
      {/* 连麦对方的远端声音（隐藏元素，只出声） */}
      <audio ref={voiceAudioRef} autoPlay />
      {/* 影片画面：外托盘 + 内芯幕布 */}
      <div className="shell rise" style={{ '--d': 1 } as React.CSSProperties}>
        <VideoStage
        ref={stageRef}
        videoRef={videoRef}
        shareVideoRef={shareVideoRef}
        shareStream={shareStream}
        showUnlock={showUnlock}
        onUnlock={onUnlock}
        src={state.src}
        isHost={state.isHost}
        mode={state.mode}
        shareActive={state.shareActive}
        pickedTitle={pickedTitle}
        onPickLocal={onFollowerLocalFile}
        barrages={barrages}
        remoteCamStream={remoteCamStream}
        localCamStream={localCamStream}
        loading={videoLoading}
      />
      </div>
      <Controls
        stageRef={stageRef}
        videoRef={videoRef}
        state={state}
        actions={actions}
        onHostLocalFile={onHostLocalFile}
        onTogglePlay={onTogglePlay}
        onToggleChat={() => setChatOpen((v) => !v)}
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
