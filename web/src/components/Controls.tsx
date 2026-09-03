import { useEffect, useRef, useState } from 'react';
import type { RoomApi } from '../hooks/useRoom';
import { fmt } from '../lib/util';
import type { ShareQuality } from '../lib/webrtc';

type IconName = 'play' | 'pause' | 'expand' | 'film' | 'screen' | 'mic' | 'micoff' | 'cam' | 'spark' | 'chat';

function ControlIcon({ name }: { name: IconName }) {
  const common = {
    className: 'control-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'play':
      return (
        <svg {...common}>
          <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common}>
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'expand':
      return (
        <svg {...common}>
          <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
          <path d="M4 4l5 5M20 4l-5 5M20 20l-5-5M4 20l5-5" opacity=".45" />
        </svg>
      );
    case 'film':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4" />
        </svg>
      );
    case 'screen':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </svg>
      );
    case 'micoff':
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
          <path d="M4 4l16 16" strokeWidth="2.2" />
        </svg>
      );
    case 'cam':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="13" height="11" rx="2" />
          <path d="m16 10 5-3v10l-5-3" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M5 5h14v10H9l-4 4V5Z" />
          <path d="M9 10h.01M12 10h.01M15 10h.01" strokeWidth="2.4" />
        </svg>
      );
  }
}

interface Props {
  stageRef: React.RefObject<{ el: HTMLDivElement | null }>;
  videoRef: React.RefObject<HTMLVideoElement>;
  state: RoomApi['state'];
  actions: RoomApi['actions'];
  onHostLocalFile: (file: File) => void;
  onTogglePlay: () => void;
  onToggleChat: () => void;
}

const QUALITY_OPTIONS: { value: ShareQuality; label: string; hint: string }[] = [
  { value: 'auto', label: '流畅', hint: '2.5Mbps · 网络差/中继时稳' },
  { value: 'hd', label: '高清', hint: '8Mbps · 默认' },
  { value: 'uhd', label: '超清', hint: '12Mbps · 看片推荐' },
];

export function Controls({
  stageRef,
  videoRef,
  state,
  actions,
  onHostLocalFile,
  onTogglePlay,
  onToggleChat,
}: Props) {
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(Number.NaN);
  const [paused, setPaused] = useState(true);
  const [bar, setBar] = useState(0);
  const [srcOpen, setSrcOpen] = useState(false);
  const [url, setUrl] = useState('');
  const draggingRef = useRef(false);

  const canSync = state.isHost && state.mode === 'sync';
  const inCall = state.voiceOn || state.camOn;

  // 轮询进度（<video> 的时间变化没有好用的回调，500ms 足够顺滑）
  useEffect(() => {
    const t = window.setInterval(() => {
      const v = videoRef.current;
      if (!v?.currentSrc) return;
      setCur(v.currentTime);
      setPaused(v.paused);
      setDur(Number.isFinite(v.duration) ? v.duration : Number.NaN);
      if (!draggingRef.current && Number.isFinite(v.duration) && v.duration > 0) {
        setBar(Math.round((v.currentTime / v.duration) * 1000));
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [videoRef]);

  const onSeekPreview = (val: number) => {
    draggingRef.current = true;
    setBar(val);
    if (Number.isFinite(dur)) setCur((val / 1000) * dur);
  };

  const onSeekCommit = (val: number) => {
    draggingRef.current = false;
    const v = videoRef.current;
    if (!canSync || !v?.currentSrc || !Number.isFinite(v.duration)) return;
    v.currentTime = (val / 1000) * v.duration;
    actions.send({ t: 'sync', playing: !v.paused, pos: v.currentTime });
  };

  const fullscreen = () => {
    const stage = stageRef.current?.el;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (stage?.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    } else if (videoRef.current) {
      // iPhone Safari 只支持 video 元素自身的私有全屏 API
      (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    }
  };

  const playLabel = paused ? '播放' : '暂停';
  const shareLabel = state.sharing ? '停止共享' : '屏幕共享';

  return (
    <section
      id="controls"
      className="shell rise"
      style={{ '--d': 2 } as React.CSSProperties}
      aria-label="播放控制"
    >
      <div className="core">
      <div id="progressRow">
        <span>{fmt(cur)}</span>
        <input
          id="seek"
          type="range"
          min={0}
          max={1000}
          value={bar}
          disabled={!canSync}
          onChange={(e) => onSeekPreview(Number(e.target.value))}
          onMouseUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
        />
        <span>{Number.isFinite(dur) ? fmt(dur) : '--:--'}</span>
      </div>

      <div id="btnRow">
        <button className="primary control-button" disabled={!canSync} onClick={onTogglePlay}>
          <ControlIcon name={paused ? 'play' : 'pause'} />
          <span>{playLabel}</span>
        </button>
        <button className="control-button" onClick={fullscreen} title="全屏">
          <ControlIcon name="expand" />
          <span>全屏</span>
        </button>
        <button className="control-button" disabled={!canSync} onClick={() => setSrcOpen((v) => !v)}>
          <ControlIcon name="film" />
          <span>选片</span>
        </button>
        {state.isHost && (
          <button
            className="control-button"
            onClick={() => (state.sharing ? actions.stopShare() : void actions.startShare())}
          >
            <ControlIcon name="screen" />
            <span>{shareLabel}</span>
          </button>
        )}
        {state.isHost && (
          <label
            className="quality-wrap"
            title="屏幕共享画质：选超清看片最清晰；中继/网络差会自动降档"
          >
            <span>画质</span>
            <select
              className="quality-select"
              value={state.quality}
              onChange={(e) => actions.setQuality(e.target.value as ShareQuality)}
              aria-label="屏幕共享画质"
            >
              {QUALITY_OPTIONS.map((q) => (
                <option key={q.value} value={q.value} title={q.hint}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className={`control-button${state.voiceOn ? ' is-active' : ''}`}
          onClick={() => void actions.toggleVoice()}
          title="连麦：语音聊天，采集已开降噪，建议戴耳机防啸叫"
        >
          <ControlIcon name="mic" />
          <span>{state.voiceOn ? '挂断连麦' : '连麦'}</span>
        </button>
        <button
          className={`control-button${state.camOn ? ' is-active' : ''}`}
          onClick={() => void actions.toggleCamera()}
          title="摄像头：音视频连麦，互相看脸"
        >
          <ControlIcon name="cam" />
          <span>{state.camOn ? '关摄像头' : '摄像头'}</span>
        </button>
        {inCall && (
          <button
            className={`control-button${state.micMuted ? ' is-active' : ''}`}
            onClick={actions.toggleMute}
            title="静音：本地静音，连接不断"
          >
            <ControlIcon name={state.micMuted ? 'micoff' : 'mic'} />
            <span>{state.micMuted ? '取消静音' : '静音'}</span>
          </button>
        )}
        <button className="control-button" onClick={actions.poke}>
          <ControlIcon name="spark" />
          <span>戳一下</span>
        </button>
        <button className="control-button" onClick={onToggleChat}>
          <ControlIcon name="chat" />
          <span>聊天</span>
        </button>
      </div>

      {srcOpen && canSync && (
        <div id="srcBar">
          <input
            placeholder="粘贴视频直链（mp4/webm/m3u8）"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={() => url.trim() && actions.setSourceUrl(url.trim())}>用链接</button>
          <label className="filebtn">
            本地文件
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  onHostLocalFile(f);
                  setSrcOpen(false);
                }
              }}
            />
          </label>
        </div>
      )}

      <p className="hint">
        {state.isHost
          ? state.mode === 'share'
            ? '共享中：影片全屏播放，画面和声音都会同步给对方'
            : '你是屋主：选片、播放、拖进度都由你控制'
          : state.mode === 'share'
            ? '正在观看屋主的屏幕，想TA了就戳一下'
          : '跟着屋主的进度走，想TA了就戳一下'}
      </p>
      </div>
    </section>
  );
}
