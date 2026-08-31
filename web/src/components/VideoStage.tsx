import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Mode, SourceState } from '../../../shared/protocol';

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
  },
  ref,
) {
  const stageDivRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ el: stageDivRef.current }), []);

  const sharing = mode === 'share' && shareActive;

  return (
    <div id="stage" ref={stageDivRef} aria-label="影片画面">
      {/* 同步播放模式的视频 */}
      {!sharing && <video ref={videoRef} playsInline />}

      {!sharing && !src && (
        <div className="placeholder">
          屋主还没选片
          <br />
          <span>支持视频直链、本地文件，或让屋主开屏幕共享</span>
        </div>
      )}

      {!sharing && src?.kind === 'local' && pickedTitle !== src.title && (
        <div className="placeholder">
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
              正在建立画面连接…
              <br />
              <span>若长时间停留在这里，多半是两边网络打洞不通</span>
            </div>
          )}
          <div className="share-tag">正在观看屋主的屏幕</div>
        </>
      )}

      {sharing && isHost && (
        <div className="placeholder">
          正在共享你的屏幕
          <br />
          <span>把要一起看的页面全屏即可，观众看到的是实时画面</span>
        </div>
      )}

      {showUnlock && (
        <div className="placeholder">
          <button className="primary unlock-button" onClick={onUnlock}>
            点一下开始接收
          </button>
        </div>
      )}
    </div>
  );
});
