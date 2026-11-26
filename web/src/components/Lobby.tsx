import { useState, type FormEvent } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onClearError: () => void;
  err: string;
  pending: 'create' | 'join' | null;
}

export function Lobby({ onCreate, onJoin, onClearError, err, pending }: Props) {
  const [inviteCode] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null,
  );
  const invited = inviteCode !== null;
  const [name, setName] = useState('');
  const [code, setCode] = useState(
    inviteCode && /^[A-Z0-9]{4}$/.test(inviteCode) ? inviteCode : '',
  );
  const [inviteError, setInviteError] = useState(
    invited && !code ? '邀请链接里的房间码无效，请输入 4 位字母或数字。' : '',
  );
  const [lastSubmit, setLastSubmit] = useState<'create' | 'join'>('join');
  const codeReady = code.length === 4;
  const roomError = (lastSubmit === 'join' && err) || inviteError;

  const changeCode = (raw: string) => {
    setCode(
      raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4),
    );
    setInviteError('');
    onClearError();
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setLastSubmit('create');
    setInviteError('');
    onCreate(name.trim() || '我');
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !codeReady) return;
    setLastSubmit('join');
    onJoin(code, name.trim() || '我');
  };

  const nameField = (
    <>
      <label className="field-label" htmlFor="nickname">
        你的昵称（选填）
      </label>
      <input
        id="nickname"
        autoComplete="nickname"
        placeholder="留个称呼吧"
        maxLength={12}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </>
  );

  const createForm = (
    <form className={invited ? 'invite-create' : 'entry-fields'} onSubmit={submitCreate}>
      {!invited && nameField}
      <button
        type="submit"
        className={invited ? 'invite-secondary' : 'primary entry-primary'}
        disabled={pending !== null}
      >
        {pending === 'create' ? '创建中…' : invited ? '创建新房间' : '创建房间'}
        {!invited && (
          <span className="cta-arrow" aria-hidden="true">
            →
          </span>
        )}
      </button>
      {lastSubmit === 'create' && err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </form>
  );

  return (
    <main id="lobby" className={`screen lobby-screen${invited ? ' invite-lobby' : ''}`}>
      <div
        className="lobby-brand rise"
        style={{ '--d': 0 } as React.CSSProperties}
        aria-label="一起看二人放映室"
      >
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M8 5.5 18 12 8 18.5z" />
          </svg>
        </span>
        <span className="brand-name">一起看</span>
        <span className="brand-note">二人放映室</span>
        <ThemeToggle />
      </div>

      <div className="lobby-layout">
        {!invited && (
          <section className="lobby-intro" aria-labelledby="lobby-title">
            <span className="eyebrow rise" style={{ '--d': 1 } as React.CSSProperties}>
              private screening
            </span>
            <h1 id="lobby-title" className="rise" style={{ '--d': 2 } as React.CSSProperties}>
              今晚的电影，
              <br />
              <em>留给两个人。</em>
            </h1>
            <p className="sub rise" style={{ '--d': 3 } as React.CSSProperties}>
              你放片，TA 隔着屏幕一起看。把邀请链接发给 TA，坐好就开场。
            </p>

            <ol
              className="lobby-notes rise"
              style={{ '--d': 4 } as React.CSSProperties}
              aria-label="使用步骤"
            >
              <li>
                <span>01</span>
                <p>
                  <strong>开一间放映室</strong>
                  <small>输入昵称，房间马上就绪</small>
                </p>
              </li>
              <li>
                <span>02</span>
                <p>
                  <strong>把邀请发给 TA</strong>
                  <small>屋主共享屏幕，边看边聊</small>
                </p>
              </li>
            </ol>
          </section>
        )}

        {/* 登记卡：外托盘 + 内芯的双层嵌套 */}
        <section
          className="entry-card shell glass rise"
          style={{ '--d': 3 } as React.CSSProperties}
          aria-labelledby="entry-title"
        >
          <div className="core">
            <div className="entry-card-head">
              <div>
                {invited ? (
                  <h1 id="entry-title">加入放映室</h1>
                ) : (
                  <>
                    <span className="entry-kicker">ready when you are</span>
                    <h2 id="entry-title">进入放映室</h2>
                  </>
                )}
              </div>
            </div>

            {!invited && (
              <>
                {createForm}
                <div className="divider">
                  <span>已有房间</span>
                </div>
              </>
            )}

            <form className="join-fields" onSubmit={submitJoin}>
              {invited && nameField}
              <label className="field-label" htmlFor="room-code">
                房间码
              </label>
              <div className="row">
                <input
                  id="room-code"
                  placeholder="四位字母或数字"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={4}
                  value={code}
                  onChange={(event) => changeCode(event.target.value)}
                  aria-invalid={Boolean(roomError) || (code.length > 0 && !codeReady)}
                  aria-describedby={roomError ? 'room-code-error' : undefined}
                />
                <button
                  type="submit"
                  className="primary join-button"
                  disabled={!codeReady || pending !== null}
                >
                  {pending === 'join' ? '加入中…' : invited ? '加入放映室' : '加入'}
                </button>
              </div>
              <p id="room-code-error" className="err" role="alert">
                {roomError}
              </p>
            </form>
            {invited && createForm}
            <p className="entry-footnote">无需注册 · 房间只在你们看完前保持在线</p>
          </div>
        </section>
      </div>
    </main>
  );
}
