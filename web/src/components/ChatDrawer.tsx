import { useEffect, useRef, useState } from 'react';
import type { ChatItem } from '../hooks/useRoom';

interface Props {
  open: boolean;
  chat: ChatItem[];
  onSend: (text: string) => void;
  onClose: () => void;
  barrageOn: boolean;
  onToggleBarrage: () => void;
}

/** 会议式时间戳：时:分 */
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function ChatDrawer({ open, chat, onSend, onClose, barrageOn, onToggleBarrage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <aside id="chatDrawer" className={open ? '' : 'hidden'} aria-label="聊天">
      <div className="chat-head">
        <div>
          <span className="chat-kicker">live notes</span>
          <strong>聊天</strong>
        </div>
        <div className="chat-head-actions">
          <button
            type="button"
            className={`mini barrage-toggle${barrageOn ? ' is-on' : ''}`}
            onClick={onToggleBarrage}
            title={barrageOn ? '弹幕已开：消息会飘在画面上' : '弹幕已关：消息只在聊天里'}
          >
            弹幕{barrageOn ? '开' : '关'}
          </button>
          <button type="button" className="closeChat" onClick={onClose}>
            收起
          </button>
        </div>
      </div>

      <div id="chatLog" ref={logRef}>
        {chat.length === 0 ? (
          <p className="chat-empty">还没有留言，先说句“开场了”。</p>
        ) : (
          chat.map((c, i) => (
            <div key={i} className={`msg${c.mine ? ' mine' : ''}`}>
              <span className="msg-meta">
                <span className="msg-from">{c.from}</span>
                <span className="msg-time">{fmtTime(c.ts)}</span>
              </span>
              <span className="msg-text">{c.text}</span>
            </div>
          ))
        )}
      </div>
      <form id="chatForm" onSubmit={submit}>
        <input
          ref={inputRef}
          placeholder="说点什么…"
          maxLength={300}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" aria-label="发送" title="发送">
          {/* 纸飞机：与控件图标同一 1.8 描边体系 */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>
    </aside>
  );
}
