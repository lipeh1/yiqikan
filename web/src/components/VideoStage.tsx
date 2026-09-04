import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface BarrageItem {
  id: number;
  text: string;
  mine: boolean;
}

export interface StageRef {
  el: HTMLDivElement | null;
}

interface Props {
  shareVideoRef: React.RefObject<HTMLVideoElement>;
  shareStream: MediaStream | null;
  showUnlock: boolean;
  onUnlock: () => void;
  isHost: boolean;
  shareActive: boolean;
  barrages: BarrageItem[];
  remoteCamStream: MediaStream | null;
  localCamStream: MediaStream | null;
}

/** 空场图标：与控件图标同一描边体系（1.8） */
function StageGlyph() {
  return (
    <svg className="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export const VideoStage = forwardRef<StageRef, Props>(function VideoStage(
  {
    shareVideoRef,
    shareStream,
    showUnlock,
    onUnlock,
    isHost,
    shareActive,
    barrages,
    remoteCamStream,
    localCamStream,
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

  return (
    <div id="stage" ref={stageDivRef} aria-label="影片画面">
      {/* 共享中：观众看屋主的屏幕实时流 */}
      {shareActive && !isHost && (
        <>
          <video ref={shareVideoRef} playsInline />
          {!shareStream && (
            <div className="placeholder">
              <StageGlyph />
              正在建立画面连接…
              <span>若长时间停留在这里，多半是两边网络打洞不通</span>
            </div>
          )}
          <div className="share-tag">live · 正在观看屋主的屏幕</div>
        </>
      )}

      {shareActive && isHost && (
        <>
          <div className="placeholder">
            <StageGlyph />
            正在共享你的屏幕
            <span>把要一起看的页面全屏即可，观众看到的是实时画面</span>
          </div>
          <div className="share-tag">live · 共享中</div>
        </>
      )}

      {/* 还没开场 */}
      {!shareActive && !isHost && (
        <div className="placeholder">
          <StageGlyph />
          屋主还没开始共享
          <span>片源在屋主的电脑上，等 TA 点“屏幕共享”就开场</span>
        </div>
      )}
      {!shareActive && isHost && (
        <div className="placeholder">
          <StageGlyph />
          还没开场
          <span>点下方“屏幕共享”，选要一起看的窗口（视频网站、本地播放器都行）</span>
        </div>
      )}

      {showUnlock && (
        <div className="placeholder">
          <button className="primary unlock-button" onClick={onUnlock}>
            点一下开始接收
          </button>
        </div>
      )}

      {/* 悄悄话弹幕：从右往左飘过画面，自己的蓝色、对方白色 */}
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
