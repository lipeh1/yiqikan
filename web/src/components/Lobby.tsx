import { useEffect, useState } from 'react';

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

  return (
    <main id="lobby" className="screen lobby-screen">
      <div className="lobby-brand" aria-label="一起看二人放映室">
        <span className="brand-mark" aria-hidden="true">
          02
        </span>
        <span className="brand-name">一起看</span>
        <span className="brand-note">二人放映室</span>
      </div>

      <div className="lobby-layout">
        <section className="lobby-intro" aria-labelledby="lobby-title">
          <div className="intro-rule" aria-hidden="true" />
          <h1 id="lobby-title">
            今晚的电影，
            <br />
            <em>留给两个人。</em>
          </h1>
          <p className="sub">同一部片，同一条进度线。把邀请链接发给 TA，坐好就开场。</p>

          <ol className="lobby-notes" aria-label="使用步骤">
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

        <section className="entry-card" aria-labelledby="entry-title">
          <div className="entry-card-head">
            <div>
              <span className="entry-kicker">READY WHEN YOU ARE</span>
              <h2 id="entry-title">进入放映室</h2>
            </div>
            <span className="entry-index" aria-hidden="true">
              01
            </span>
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
              <span aria-hidden="true">→</span>
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
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="primary join-button" onClick={() => onJoin(code, nick())}>
                加入
              </button>
            </div>
          </div>

          <p className="err" role="alert">
            {err}
          </p>
          <p className="entry-footnote">无需注册 · 房间只在你们看完前保持在线</p>
        </section>
      </div>
    </main>
  );
}
