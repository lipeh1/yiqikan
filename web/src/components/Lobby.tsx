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
    <div id="lobby" className="screen">
      <h1>
        一起看<span>两个人的小影院</span>
      </h1>
      <p className="sub">同一个片源，同步播放，随时戳一戳</p>
      <input
        placeholder="你的昵称"
        maxLength={12}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="primary" onClick={() => onCreate(nick())}>
        创建房间
      </button>
      <div className="divider">或者</div>
      <div className="row">
        <input
          placeholder="房间码"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="primary" onClick={() => onJoin(code, nick())}>
          加入
        </button>
      </div>
      <p className="err">{err}</p>
    </div>
  );
}
