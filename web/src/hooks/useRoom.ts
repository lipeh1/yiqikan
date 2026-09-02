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
import { HostSharer, ViewerShare, VoiceLink, type ShareQuality } from '../lib/webrtc';

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
  sharing: boolean;
  shareActive: boolean;
  hasRemoteStream: boolean;
  voiceOn: boolean;
  camOn: boolean;
  quality: ShareQuality;
}

export interface RoomEvents {
  sync: SyncState;
  'share-stream': MediaStream;
  'share-ended': void;
  'voice-stream': MediaStream;
  'local-video': MediaStream | null;
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
  voiceOn: false,
  camOn: false,
  quality: 'hd',
};

const QUALITY_KEY = 'yiqikan-share-quality';

function readQuality(): ShareQuality {
  const v = localStorage.getItem(QUALITY_KEY);
  return v === 'auto' || v === 'hd' || v === 'uhd' ? v : 'hd';
}

export function useRoom() {
  const [state, setState] = useState<RoomState>({ ...INITIAL, quality: readQuality() });
  const stateRef = useRef(state);
  stateRef.current = state;

  const wsRef = useRef<WebSocket | null>(null);
  const sharerRef = useRef<HostSharer | null>(null);
  const viewerRef = useRef<ViewerShare | null>(null);
  const voicePcRef = useRef<VoiceLink | null>(null);
  const localVoiceRef = useRef<MediaStream | null>(null);
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

  const hangupVoice = useCallback(() => {
    voicePcRef.current?.close();
    voicePcRef.current = null;
  }, []);

  const maybeStartVoice = useCallback(
    (forceHost?: boolean) => {
      const s = stateRef.current;
      const isHost = forceHost ?? s.isHost;
      if (!isHost || !s.voiceOn || !localVoiceRef.current) return;
      const peer = s.members.find((m) => !m.host);
      if (!peer?.voice || voicePcRef.current) return;
      const link = new VoiceLink(localVoiceRef.current, send, peer.cid, (stream) =>
        events.emit('voice-stream', stream),
      );
      voicePcRef.current = link;
      void link.call(peer.cid);
    },
    [events, send],
  );

  useEffect(() => {
    maybeStartVoice();
  }, [maybeStartVoice, state.isHost, state.members, state.voiceOn]);

  const startShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: true,
      });
      const sharer = new HostSharer(stream, send, stateRef.current.quality);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare());
      sharerRef.current = sharer;
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

  const setQuality = useCallback(
    (q: ShareQuality) => {
      localStorage.setItem(QUALITY_KEY, q);
      set({ quality: q });
    },
    [set],
  );

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
          hangupVoice();
          set({ isHost: true, hasRemoteStream: false, sharing: false });
          toast('你成了新屋主');
          maybeStartVoice(true);
          break;
        case 'member': {
          set({ members: m.members });
          if (m.action === 'join') {
            toast(`${m.name} 进来了`);
            if (s.sharing && sharerRef.current && m.cid) void sharerRef.current.addViewer(m.cid);
          } else if (m.action === 'leave') {
            toast(`${m.name} 走开了`);
            hangupVoice();
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
        case 'voice': {
          const members = s.members.map((x) => (x.cid === m.cid ? { ...x, voice: m.on } : x));
          set({ members });
          if (m.cid === s.myCid) break;
          const who = s.members.find((x) => x.cid === m.cid)?.name ?? '对方';
          if (m.on) {
            toast(`${who} 开了连麦${s.voiceOn ? '' : '，点 🎤 加入'}`);
            maybeStartVoice();
          } else {
            hangupVoice();
            toast(`${who} 挂断了连麦`);
          }
          break;
        }
        case 'cam': {
          const members = s.members.map((x) => (x.cid === m.cid ? { ...x, cam: m.on } : x));
          set({ members });
          if (m.cid === s.myCid) break;
          const who = s.members.find((x) => x.cid === m.cid)?.name ?? '对方';
          if (m.on) {
            toast(`${who} 开了摄像头${s.camOn ? '' : '，点 📷 一起看脸'}`);
            maybeStartVoice();
          } else {
            toast(`${who} 关了摄像头`);
          }
          break;
        }
        case 'v-offer': {
          voicePcRef.current?.close();
          const link = new VoiceLink(localVoiceRef.current, send, 'host', (stream) =>
            events.emit('voice-stream', stream),
          );
          voicePcRef.current = link;
          void link.answer(m.sdp);
          break;
        }
        case 'v-answer':
          voicePcRef.current?.handleAnswer(m.sdp);
          break;
        case 'v-ice':
          voicePcRef.current?.handleIce(m.candidate);
          break;
        case 'notice':
          toast(m.msg);
          break;
        case 'err':
          toast(m.msg);
          break;
        case 'rtc-offer': {
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
    [events, hangupVoice, maybeStartVoice, send, set, toast],
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

  const stopLocalMedia = useCallback(() => {
    localVoiceRef.current?.getTracks().forEach((t) => t.stop());
    localVoiceRef.current = null;
    events.emit('local-video', null);
  }, [events]);

  const toggleVoice = useCallback(async () => {
    if (stateRef.current.voiceOn) {
      stopLocalMedia();
      hangupVoice();
      send({ t: 'voice', on: false });
      set({ voiceOn: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localVoiceRef.current = stream;
      send({ t: 'voice', on: true });
      set({ voiceOn: true });
      toast('连麦已开，建议戴耳机防啸叫');
      maybeStartVoice();
    } catch {
      toast('拿不到麦克风：检查权限（http 环境浏览器会禁用，走 https 隧道即可）');
    }
  }, [hangupVoice, maybeStartVoice, send, set, stopLocalMedia, toast]);

  const toggleCamera = useCallback(async () => {
    if (stateRef.current.camOn) {
      stopLocalMedia();
      hangupVoice();
      send({ t: 'voice', on: false });
      send({ t: 'cam', on: false });
      set({ voiceOn: false, camOn: false });
      toast('摄像头已关');
      return;
    }
    try {
      // 音视频一起开：看脸自然要说话，一条流两个轨一起走
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localVoiceRef.current = stream;
      events.emit('local-video', stream);
      send({ t: 'voice', on: true });
      send({ t: 'cam', on: true });
      set({ voiceOn: true, camOn: true });
      toast('摄像头已开，对方能看到你了');
      maybeStartVoice();
    } catch {
      toast('拿不到摄像头/麦克风：检查权限（http 环境浏览器会禁用，走 https 隧道即可）');
    }
  }, [events, hangupVoice, maybeStartVoice, send, set, stopLocalMedia, toast]);

  useEffect(() => {
    return () => {
      sharerRef.current?.stop();
      viewerRef.current?.close();
      voicePcRef.current?.close();
      localVoiceRef.current?.getTracks().forEach((t) => t.stop());
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
      setQuality,
      toggleVoice,
      toggleCamera,
      chat,
      poke,
      send,
    },
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
