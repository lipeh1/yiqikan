import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Mode, SourceState } from '../../../shared/protocol';

export interface BarrageItem {
  id: number;
  text: string;
  mine: boolean;
}

export interface StageRef {
  el: HTMLDivElement | null;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  shareVideoRef: React.RefObject<HTMLVideoElement>;
  shareStream: MediaStream | null;
  showUnlock: boolean;
  onUnlock: () => void;
  src: SourceState | null;
  isHost: boolean;
  mode: Mode;
  shareActive: boolean;
  pickedTitle: string | null;
  onPickLocal: (file: File) => void;
  barrages: BarrageItem[];
  remoteCamStream: MediaStream | null;
  localCamStream: MediaStream | null;
  loading: boolean;
}

/** 空场胶片图标：与控件图标同一描边体系（1.8） */
function FilmGlyph() {
  return (
    <svg className="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" />
    </svg>
  );
}

export const VideoStage = forwardRef<StageRef, Props>(function VideoStage(
  {
    videoRef,
    shareVideoRef,
    shareStream,
    showUnlock,
    onUnlock,
    src,
    isHost,
    mode,
    shareActive,
    pickedTitle,
    onPickLocal,
    barrages,
    remoteCamStream,
    localCamStream,
    loading,
  },
  ref,
) {
  const stageDivRef = useRef<HTMLDivElement>(null);
  const remoteCamRef = useRef<HTMLVideoElement>(null);
  const localCamRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => ({ el: stageDivRef.current }), []);

  // 摄像头小窗挂流放在 effect 里：元素渲染后再生效，避免"事件先到、元素未挂"的黑屏竞态
  useEffect(() => {
    const v = remoteCamRef.current;
    if (!v || !remoteCamStream) return;
    v.srcObject = remoteCamStream;
    v.play().catch(() => {});
  }, [remoteCamStream]);

  useEffect(() => {
    const v = localCamRef.current;
    if (!v || !localCamStream) return;
    v.srcObject = localCamStream;
    v.play().catch(() => {});
  }, [localCamStream]);

  const sharing = mode === 'share' && shareActive;

  return (
    <div id="stage" ref={stageDivRef} aria-label="影片画面">
      {/* 同步播放模式的视频 */}
      {!sharing && <video ref={videoRef} playsInline />}

      {!sharing && !src && (
        <div className="placeholder">
          <FilmGlyph />
          屋主还没选片
          <span>支持视频直链、本地文件，或让屋主开屏幕共享</span>
        </div>
      )}

      {!sharing && src?.kind === 'local' && pickedTitle !== src.title && (
        <div className="placeholder">
          <FilmGlyph />
          屋主选择了本地文件：<b>{src.title}</b>
          <br />
          <label className="primary filebtn">
            选择我这边的文件
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickLocal(f);
              }}
            />
          </label>
        </div>
      )}

      {/* 屏幕共享模式：观众看屋主的屏幕 */}
      {sharing && !isHost && (
        <>
          <video ref={shareVideoRef} playsInline />
          {!shareStream && (
            <div className="placeholder">
              <FilmGlyph />
              正在建立画面连接…
              <span>若长时间停留在这里，多半是两边网络打洞不通</span>
            </div>
          )}
          <div className="share-tag">live · 正在观看屋主的屏幕</div>
        </>
      )}

      {sharing && isHost && (
        <>
          <div className="placeholder">
            <FilmGlyph />
            正在共享你的屏幕
            <span>把要一起看的页面全屏即可，观众看到的是实时画面</span>
          </div>
          <div className="share-tag">live · 共享中</div>
        </>
      )}

      {showUnlock && (
        <div className="placeholder">
          <button className="primary unlock-button" onClick={onUnlock}>
            点一下开始接收
          </button>
        </div>
      )}

      {/* 正片加载中间态：设置片源后到可播放前的过渡，弱网不再黑幕 */}
      {loading && !sharing && (
        <div className="stage-loading" aria-live="polite">
          <div>
            <div className="spin" />
            正在载入影片
          </div>
        </div>
      )}

      {/* 悄悄话弹幕：从右往左飘过画面，自己的朱砂、对方鼠尾草绿 */}
      {barrages.length > 0 && (
        <div className="barrage-layer" aria-hidden="true">
          {barrages.map((b, i) => (
            <span
              key={b.id}
              className={`barrage-item${b.mine ? ' mine' : ''}`}
              style={{ top: 16 + (i % 4) * 40 }}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}

      {/* 音视频连麦小窗：悬浮在影片画面上（远端右下、本地预览左下镜像） */}
      {remoteCamStream && <video ref={remoteCamRef} id="remoteCam" playsInline autoPlay />}
      {localCamStream && <video ref={localCamRef} id="localCam" playsInline autoPlay muted />}
    </div>
  );
});
