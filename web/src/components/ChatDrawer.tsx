import { useEffect, useRef, useState } from 'react';
import type { ChatItem } from '../hooks/useRoom';

interface Props {
  open: boolean;
  chat: ChatItem[];
  onSend: (text: string) => void;
  onClose: () => void;
}

export function ChatDrawer({ open, chat, onSend, onClose }: Props) {
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
    <div id="chatDrawer" className={open ? '' : 'hidden'}>
      <div id="chatLog" ref={logRef}>
        {chat.map((c, i) => (
          <div key={i} className={`msg${c.mine ? ' mine' : ''}`}>
            <b>{c.from}</b>
            {c.text}
          </div>
        ))}
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
        <button>发送</button>
        <button type="button" className="closeChat" onClick={onClose}>
          收起
        </button>
      </form>
    </div>
  );
}
