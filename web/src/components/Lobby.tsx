import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  err: string;
}

export function Lobby({ onCreate, onJoin, err }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // 从邀请链接带进来的房间码直接填好
  useEffect(() => {
    const r = new URLSearchParams(location.search).get('room');
    if (r) setCode(r.toUpperCase());
  }, []);

  const nick = () => name.trim() || '我';
  // 房间码即时净化：只留字母数字并大写，凑不满 4 位时加入按钮保持禁用
  const sanitizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const codeReady = code.length === 4;

  return (
    <main id="lobby" className="screen lobby-screen">
      <div className="lobby-brand rise" style={{ '--d': 0 } as React.CSSProperties} aria-label="一起看二人放映室">
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
            同一部片，同一条进度线。把邀请链接发给 TA，坐好就开场。
          </p>

          <ol className="lobby-notes rise" style={{ '--d': 4 } as React.CSSProperties} aria-label="使用步骤">
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
                <small>同片源同步播放，也可以共享屏幕</small>
              </p>
            </li>
          </ol>
        </section>

        {/* 登记卡：外托盘 + 内芯的双层嵌套 */}
        <section
          className="entry-card shell rise"
          style={{ '--d': 3 } as React.CSSProperties}
          aria-labelledby="entry-title"
        >
          <div className="core">
            <div className="entry-card-head">
              <div>
                <span className="entry-kicker">ready when you are</span>
                <h2 id="entry-title">进入放映室</h2>
              </div>
            </div>

            <div className="entry-fields">
              <label className="field-label" htmlFor="nickname">
                你的昵称
              </label>
              <input
                id="nickname"
                placeholder="留个称呼吧"
                maxLength={12}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="primary entry-primary" onClick={() => onCreate(nick())}>
                创建房间
                <span className="cta-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </div>

            <div className="divider">
              <span>已有房间</span>
            </div>

            <div className="join-fields">
              <label className="field-label" htmlFor="room-code">
                房间码
              </label>
            <div className="row">
              <input
                id="room-code"
                placeholder="四位字母或数字"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(sanitizeCode(e.target.value))}
                aria-invalid={code.length > 0 && !codeReady}
              />
              <button className="primary join-button" disabled={!codeReady} onClick={() => onJoin(code, nick())}>
                加入
              </button>
            </div>
            </div>

            <p className="err" role="alert">
              {err}
            </p>
            <p className="entry-footnote">无需注册 · 房间只在你们看完前保持在线</p>
          </div>
        </section>
      </div>
    </main>
  );
}
