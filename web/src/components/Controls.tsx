import { useEffect, useRef, useState } from 'react';
import type { RoomApi } from '../hooks/useRoom';
import { fmt } from '../lib/util';

interface Props {
  stageRef: React.RefObject<{ el: HTMLDivElement | null }>;
  videoRef: React.RefObject<HTMLVideoElement>;
  state: RoomApi['state'];
  actions: RoomApi['actions'];
  onHostLocalFile: (file: File) => void;
  onTogglePlay: () => void;
  onToggleChat: () => void;
}

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

  const playLabel = paused ? '▶ 播放' : '⏸ 暂停';
  const shareLabel = state.sharing ? '⏹ 停止共享' : '屏幕共享';

  return (
    <div id="controls">
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
        <button className="primary" disabled={!canSync} onClick={onTogglePlay}>
          {playLabel}
        </button>
        <button onClick={fullscreen} title="全屏">
          ⛶
        </button>
        <button disabled={!canSync} onClick={() => setSrcOpen((v) => !v)}>
          选片
        </button>
        {state.isHost && (
          <button onClick={() => (state.sharing ? actions.stopShare() : void actions.startShare())}>
            {shareLabel}
          </button>
        )}
        <button onClick={actions.poke}>戳一下</button>
        <button onClick={onToggleChat}>聊天</button>
      </div>

      {srcOpen && canSync && (
        <div id="srcBar">
          <input
            placeholder="粘贴视频直链（mp4/webm）"
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
  );
}
