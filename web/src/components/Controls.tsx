import { Dropdown, Tooltip } from 'tdesign-react';
import type { RoomApi } from '../hooks/useRoom';
import type { ShareQuality } from '../lib/webrtc';

type IconName = 'expand' | 'screen' | 'mic' | 'micoff' | 'cam' | 'spark' | 'chat';

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
    case 'expand':
      return (
        <svg {...common}>
          <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
          <path d="M4 4l5 5M20 4l-5 5M20 20l-5-5M4 20l5-5" opacity=".45" />
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
  state: RoomApi['state'];
  actions: RoomApi['actions'];
  onToggleChat: () => void;
}

const QUALITY_OPTIONS: { value: ShareQuality; label: string; hint: string }[] = [
  { value: 'auto', label: '流畅', hint: '2.5Mbps · 网络差/中继时稳' },
  { value: 'hd', label: '高清', hint: '8Mbps · 默认' },
  { value: 'uhd', label: '超清', hint: '12Mbps · 看片推荐' },
];

export function Controls({ stageRef, state, actions, onToggleChat }: Props) {
  const fullscreen = () => {
    const stage = stageRef.current?.el;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (stage?.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    }
  };

  const shareLabel = state.sharing ? '停止共享' : '屏幕共享';
  const qualityNow = QUALITY_OPTIONS.find((q) => q.value === state.quality) ?? QUALITY_OPTIONS[1];
  const inCall = state.voiceOn || state.camOn;

  return (
    <section
      id="controls"
      className="rise"
      style={{ '--d': 2 } as React.CSSProperties}
      aria-label="播放控制"
    >
      <div id="btnRow">
        {state.isHost && (
          <Tooltip
            content={state.sharing ? '停止共享屏幕' : '把电脑屏幕推给对方（视频网站、本地播放器都行）'}
            placement="top"
            showArrow={false}
          >
            <button
              className={`control-button${state.sharing ? ' is-danger' : ''}`}
              onClick={() => (state.sharing ? actions.stopShare() : void actions.startShare())}
            >
              <ControlIcon name="screen" />
              <span>{shareLabel}</span>
            </button>
          </Tooltip>
        )}

        {state.isHost && (
          <div className="quality-menu">
            <Dropdown
              options={QUALITY_OPTIONS.map((q) => ({ content: `${q.label} · ${q.hint}`, value: q.value }))}
              trigger="click"
              placement="top-left"
              onClick={(item) => actions.setQuality(item.value as ShareQuality)}
            >
              <button type="button" className="quality-trigger">
                <span>画质 · {qualityNow.label}</span>
                <svg className="chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </Dropdown>
          </div>
        )}

        <Tooltip content="全屏观看" placement="top" showArrow={false}>
          <button className="control-button" onClick={fullscreen}>
            <ControlIcon name="expand" />
            <span>全屏</span>
          </button>
        </Tooltip>

        <Tooltip content="语音连麦（采集已开降噪，建议戴耳机）" placement="top" showArrow={false}>
          <button
            className={`control-button${state.voiceOn ? ' is-active' : ''}`}
            onClick={() => void actions.toggleVoice()}
          >
            <ControlIcon name="mic" />
            <span>{state.voiceOn ? '挂断连麦' : '连麦'}</span>
          </button>
        </Tooltip>

        <Tooltip content="摄像头：互相看脸" placement="top" showArrow={false}>
          <button
            className={`control-button${state.camOn ? ' is-active' : ''}`}
            onClick={() => void actions.toggleCamera()}
          >
            <ControlIcon name="cam" />
            <span>{state.camOn ? '关摄像头' : '摄像头'}</span>
          </button>
        </Tooltip>

        {inCall && (
          <Tooltip content={state.micMuted ? '取消静音' : '静音麦克风'} placement="top" showArrow={false}>
            <button
              className={`control-button${state.micMuted ? ' is-danger' : ''}`}
              onClick={actions.toggleMute}
            >
              <ControlIcon name={state.micMuted ? 'micoff' : 'mic'} />
              <span>{state.micMuted ? '取消静音' : '静音'}</span>
            </button>
          </Tooltip>
        )}

        <Tooltip content="戳一戳对方" placement="top" showArrow={false}>
          <button className="control-button" onClick={actions.poke}>
            <ControlIcon name="spark" />
            <span>戳一下</span>
          </button>
        </Tooltip>

        <Tooltip content="聊天与悄悄话弹幕" placement="top" showArrow={false}>
          <button className="control-button" onClick={onToggleChat}>
            <ControlIcon name="chat" />
            <span>聊天</span>
          </button>
        </Tooltip>
      </div>

      <p className="hint">
        {state.isHost
          ? state.mode === 'share'
            ? '共享中：影片全屏播放，画面和声音都会同步给对方'
            : '你是屋主：点屏幕共享，选要一起看的窗口就开场'
          : state.mode === 'share'
            ? '正在观看屋主的屏幕，想TA了就戳一下'
          : '等屋主开始共享，想TA了就戳一下'}
      </p>
    </section>
  );
}
