import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMsg,
  Member,
  Mode,
  ServerMsg,
  SourceState,
  SyncState,
} from '../../../shared/protocol';
import { Emitter } from '../lib/emitter';
import { HostSharer, ViewerShare } from '../lib/webrtc';

export interface ChatItem {
  from: string;
  text: string;
  mine: boolean;
}

export interface RoomState {
  phase: 'lobby' | 'room';
  roomCode: string;
  isHost: boolean;
  myCid: number;
  hostCid: number;
  myName: string;
  members: Member[];
  mode: Mode;
  src: SourceState | null;
  chat: ChatItem[];
  toast: string | null;
  lobbyErr: string;
  sharing: boolean; // 本端（屋主）正在推流
  shareActive: boolean; // 房间处于共享模式（观众据此切换画面）
  hasRemoteStream: boolean; // 观众已收到画面流
}

export interface RoomEvents {
  sync: SyncState;
  'share-stream': MediaStream;
  'share-ended': void;
}

const INITIAL: RoomState = {
  phase: 'lobby',
  roomCode: '',
  isHost: false,
  myCid: 0,
  hostCid: 0,
  myName: '',
  members: [],
  mode: 'idle',
  src: null,
  chat: [],
  toast: null,
  lobbyErr: '',
  sharing: false,
  shareActive: false,
  hasRemoteStream: false,
};

export function useRoom() {
  const [state, setState] = useState<RoomState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const wsRef = useRef<WebSocket | null>(null);
  const sharerRef = useRef<HostSharer | null>(null);
  const viewerRef = useRef<ViewerShare | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const eventsRef = useRef(new Emitter<RoomEvents>());
  const events = eventsRef.current;

  const set = useCallback((patch: Partial<RoomState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const toast = useCallback(
    (msg: string) => {
      set({ toast: msg });
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => set({ toast: null }), 2200);
    },
    [set],
  );

  const send = useCallback((m: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  const stopShare = useCallback(
    (notify = true) => {
      sharerRef.current?.stop();
      sharerRef.current = null;
      if (notify) send({ t: 'share-stop' });
      set({ sharing: false });
    },
    [send, set],
  );

  const startShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        audio: true,
      });
      const sharer = new HostSharer(stream, send);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare());
      sharerRef.current = sharer;
      // 已在房间的观众逐个推流
      for (const m of stateRef.current.members) {
        if (!m.host) await sharer.addViewer(m.cid);
      }
      send({ t: 'share-start' });
      set({ sharing: true });
      toast('共享中：把要一起看的页面全屏，画面和声音都会过去');
    } catch {
      toast('没有选择屏幕，或浏览器不允许采集');
    }
  }, [send, set, stopShare, toast]);

  const handle = useCallback(
    (m: ServerMsg) => {
      const s = stateRef.current;
      switch (m.t) {
        case 'created':
          set({
            phase: 'room',
            roomCode: m.room,
            isHost: true,
            myCid: m.you,
            hostCid: m.hostCid,
            members: m.members,
            mode: 'idle',
            src: null,
          });
          toast('房间建好了，把邀请码发给 TA');
          break;
        case 'joined':
          set({
            phase: 'room',
            roomCode: m.room,
            isHost: false,
            myCid: m.you,
            hostCid: m.hostCid,
            members: m.members,
            mode: m.mode,
            src: m.src,
            shareActive: m.mode === 'share',
            hasRemoteStream: false,
          });
          if (m.mode === 'sync' && m.src) events.emit('sync', m.sync);
          toast('进来啦');
          break;
        case 'host':
          viewerRef.current?.close();
          viewerRef.current = null;
          set({ isHost: true, hasRemoteStream: false, sharing: false });
          toast('你成了新屋主');
          break;
        case 'member': {
          set({ members: m.members });
          if (m.action === 'join') {
            toast(`${m.name} 进来了`);
            // 新观众中途加入且本端正在共享 → 给TA补一路推流
            if (s.sharing && sharerRef.current && m.cid) void sharerRef.current.addViewer(m.cid);
          } else if (m.action === 'leave') {
            toast(`${m.name} 走开了`);
          }
          break;
        }
        case 'src':
          set({ src: m.src });
          break;
        case 'mode': {
          const shareActive = m.mode === 'share';
          if (!shareActive) {
            viewerRef.current?.close();
            viewerRef.current = null;
            events.emit('share-ended');
          }
          set({ mode: m.mode, shareActive, hasRemoteStream: false });
          if (shareActive) toast('屋主开始共享屏幕了');
          break;
        }
        case 'sync':
        case 'heartbeat':
          if (!s.isHost) events.emit('sync', { playing: m.playing, pos: m.pos });
          break;
        case 'chat':
          set({ chat: [...s.chat.slice(-199), { from: m.from, text: m.text, mine: false }] });
          break;
        case 'poke':
          navigator.vibrate?.([120, 60, 120]);
          toast(`${m.from} 戳了戳你`);
          set({ chat: [...s.chat.slice(-199), { from: '戳一戳', text: '戳了戳你，快看片！', mine: false }] });
          break;
        case 'notice':
          toast(m.msg);
          break;
        case 'err':
          toast(m.msg);
          break;
        case 'rtc-offer': {
          // 观众：收到屋主的屏幕推流邀约
          viewerRef.current?.close();
          const v = new ViewerShare(send, (stream) => {
            events.emit('share-stream', stream);
            set({ hasRemoteStream: true });
          });
          viewerRef.current = v;
          void v.handleOffer(m.sdp);
          break;
        }
        case 'rtc-answer':
          sharerRef.current?.handleAnswer(m.from, m.sdp);
          break;
        case 'rtc-ice':
          if (s.isHost) sharerRef.current?.handleIce(m.from, m.candidate);
          else viewerRef.current?.handleIce(m.candidate);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, send, set, toast],
  );

  const connect = useCallback(
    (onOpen: () => void) => {
      const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      const ws = new WebSocket(`${proto}${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = onOpen;
      ws.onmessage = (e) => handle(JSON.parse(e.data as string) as ServerMsg);
      ws.onclose = () => toast('连接断了，刷新一下重进吧');
    },
    [handle, toast],
  );

  const createRoom = useCallback(
    (name: string) => {
      set({ myName: name, chat: [], lobbyErr: '' });
      connect(() => send({ t: 'create', name }));
    },
    [connect, send, set],
  );

  const joinRoom = useCallback(
    (code: string, name: string) => {
      const c = code.trim().toUpperCase();
      if (c.length !== 4) {
        set({ lobbyErr: '房间码是 4 位哦' });
        return;
      }
      set({ myName: name, chat: [], lobbyErr: '' });
      connect(() => send({ t: 'join', room: c, name }));
    },
    [connect, send, set],
  );

  const setSourceUrl = useCallback(
    (url: string) => {
      if (!/^(https?:\/\/|\/)/.test(url)) {
        toast('要 http(s) 开头的直链');
        return;
      }
      send({ t: 'src', kind: 'url', url, title: '在线视频' });
    },
    [send, toast],
  );

  const setSourceLocal = useCallback(
    (file: File) => {
      send({ t: 'src', kind: 'local', url: '', title: file.name });
    },
    [send],
  );

  const chat = useCallback(
    (text: string) => {
      const s = stateRef.current;
      send({ t: 'chat', text });
      set({ chat: [...s.chat.slice(-199), { from: `${s.myName}（我）`, text, mine: true }] });
    },
    [send, set],
  );

  const poke = useCallback(() => {
    send({ t: 'poke' });
    navigator.vibrate?.(80);
    toast('戳了戳对方');
  }, [send, toast]);

  useEffect(() => {
    return () => {
      sharerRef.current?.stop();
      viewerRef.current?.close();
      wsRef.current?.close();
    };
  }, []);

  return {
    state,
    events,
    actions: {
      createRoom,
      joinRoom,
      setSourceUrl,
      setSourceLocal,
      startShare,
      stopShare,
      chat,
      poke,
      send,
    },
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
