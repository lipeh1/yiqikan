import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, Member, Mode, ServerMsg } from '../../../shared/protocol';
import { Emitter } from '../lib/emitter';
import { HostSharer, ViewerShare, VoiceLink, type ShareQuality } from '../lib/webrtc';

export interface ChatItem {
  from: string;
  text: string;
  mine: boolean;
  ts: number; // 服务端盖的毫秒时间戳（自己的回显用本地钟）
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
  chat: ChatItem[];
  toast: string | null;
  lobbyErr: string;
  sharing: boolean; // 本端（屋主）正在推流
  shareActive: boolean; // 房间处于共享模式（观众据此切换画面）
  hasRemoteStream: boolean; // 观众已收到画面流
  voiceOn: boolean;
  camOn: boolean;
  micMuted: boolean;
  barrageOn: boolean;
  quality: ShareQuality;
  chatOpen: boolean; // 聊天抽屉开合（未读角标据此清零）
  chatUnread: number; // 抽屉关闭期间收到的新消息数（腾讯会议红点）
}

export interface RoomEvents {
  'share-stream': MediaStream;
  'share-ended': void;
  'voice-stream': MediaStream;
  'local-video': MediaStream | null;
  barrage: { text: string; mine: boolean };
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
  chat: [],
  toast: null,
  lobbyErr: '',
  sharing: false,
  shareActive: false,
  hasRemoteStream: false,
  voiceOn: false,
  camOn: false,
  micMuted: false,
  barrageOn: false,
  quality: 'hd',
  chatOpen: false,
  chatUnread: 0,
};

const QUALITY_KEY = 'yiqikan-share-quality';

function readQuality(): ShareQuality {
  const v = localStorage.getItem(QUALITY_KEY);
  return v === 'auto' || v === 'hd' || v === 'uhd' ? v : 'hd';
}

// 采集统一开启降噪/回声消除/自动增益（浏览器不支持的约束会被忽略，安全）
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export function useRoom() {
  const [state, setState] = useState<RoomState>({ ...INITIAL, quality: readQuality() });
  const stateRef = useRef(state);

  const wsRef = useRef<WebSocket | null>(null);
  const sharerRef = useRef<HostSharer | null>(null);
  const viewerRef = useRef<ViewerShare | null>(null);
  const voicePcRef = useRef<VoiceLink | null>(null);
  const localVoiceRef = useRef<MediaStream | null>(null);
  const micRequest = useRef<Promise<MediaStream | null> | null>(null);
  const cameraBusy = useRef(false);
  const shareBusy = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const eventsRef = useRef(new Emitter<RoomEvents>());
  const events = eventsRef.current;

  const set = useCallback((patch: Partial<RoomState>) => {
    // 一次渲染前可能收到多条信令，后续消息需要看到刚更新的成员和媒体状态。
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
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
      set({ sharing: false, shareActive: false, mode: 'idle' });
    },
    [send, set],
  );

  const hangupVoice = useCallback(() => {
    voicePcRef.current?.close();
    voicePcRef.current = null;
  }, []);

  const maybeStartVoice = useCallback(() => {
    const s = stateRef.current;
    const stream = localVoiceRef.current;
    if (!s.isHost || !stream || voicePcRef.current) return;
    const peer = s.members.find((m) => !m.host && m.cid !== s.myCid);
    if (!peer?.voice) return;
    const link = new VoiceLink(stream, send, peer.cid, (remote) => events.emit('voice-stream', remote));
    voicePcRef.current = link;
    void link.call(peer.cid).catch(() => {
      if (voicePcRef.current !== link) return;
      hangupVoice();
      toast('连麦连接失败，请重新进入房间');
    });
  }, [events, hangupVoice, send, toast]);

  useEffect(() => {
    maybeStartVoice();
  }, [maybeStartVoice, state.isHost, state.members, state.voiceOn]);

  // 自动开麦和手动开摄像头可能同时触发，只请求一次音轨。
  const enableVoice = useCallback((): Promise<MediaStream | null> => {
    if (localVoiceRef.current) return Promise.resolve(localVoiceRef.current);
    if (micRequest.current) return micRequest.current;
    const ws = wsRef.current;
    micRequest.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        if (ws !== wsRef.current || ws?.readyState !== WebSocket.OPEN) {
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }
        for (const t of stream.getAudioTracks()) t.enabled = !stateRef.current.micMuted;
        localVoiceRef.current = stream;
        send({ t: 'voice', on: true });
        set({ voiceOn: true });
        return stream;
      } catch {
        toast('拿不到麦克风：检查权限（http 环境浏览器会禁用，走 https 隧道即可）');
        return null;
      } finally {
        micRequest.current = null;
      }
    })();
    return micRequest.current;
  }, [send, set, toast]);

  const startShare = useCallback(async () => {
    if (shareBusy.current || sharerRef.current) return;
    shareBusy.current = true;
    const ws = wsRef.current;
    let sharer: HostSharer | undefined;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: true,
      });
      if (ws !== wsRef.current || ws?.readyState !== WebSocket.OPEN || !stateRef.current.isHost) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      sharer = new HostSharer(stream, send, stateRef.current.quality);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (sharerRef.current === sharer) stopShare();
      });
      sharerRef.current = sharer;
      send({ t: 'share-start' });
      set({ sharing: true, shareActive: true, mode: 'share' });
      toast('共享中：把要一起看的页面全屏，画面和声音都会过去');
      for (const m of stateRef.current.members) {
        if (sharerRef.current !== sharer) break;
        if (!m.host) await sharer.addViewer(m.cid);
      }
    } catch {
      if (sharer && sharerRef.current !== sharer) return;
      if (sharer) stopShare();
      toast('无法开始共享，请检查屏幕采集权限后重试');
    } finally {
      shareBusy.current = false;
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
          });
          toast('房间建好了，把邀请码发给 TA');
          void enableVoice();
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
            shareActive: m.mode === 'share',
            hasRemoteStream: false,
          });
          toast('进来啦');
          void enableVoice();
          break;
        case 'host':
          viewerRef.current?.close();
          viewerRef.current = null;
          hangupVoice();
          set({
            isHost: true,
            hostCid: s.myCid,
            hasRemoteStream: false,
            sharing: false,
            shareActive: false,
            mode: 'idle',
          });
          toast('你成了新屋主');
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
        case 'chat': {
          set({ chat: [...s.chat.slice(-199), { from: m.from, text: m.text, mine: false, ts: m.ts }] });
          events.emit('barrage', { text: m.text, mine: false });
          // 抽屉关着时按腾讯会议的方式提醒：未读角标 + 浮动预览
          if (!s.chatOpen) {
            set({ chatUnread: s.chatUnread + 1 });
            const preview = m.text.length > 18 ? `${m.text.slice(0, 18)}…` : m.text;
            toast(`${m.from}：${preview}`);
          }
          break;
        }
        case 'voice': {
          const members = s.members.map((x) =>
            x.cid === m.cid ? { ...x, voice: m.on, muted: m.on ? x.muted : false } : x,
          );
          set({ members });
          if (m.cid === s.myCid) break;
          const who = s.members.find((x) => x.cid === m.cid)?.name ?? '对方';
          if (m.on) {
            toast(`${who} 已入会`);
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
            toast(`${who} 开了摄像头${s.camOn ? '' : '，点摄像头一起看脸'}`);
          } else {
            toast(`${who} 关了摄像头`);
          }
          break;
        }
        case 'mute': {
          const members = s.members.map((x) => (x.cid === m.cid ? { ...x, muted: m.on } : x));
          set({ members });
          if (m.cid === s.myCid) break;
          const who = s.members.find((x) => x.cid === m.cid)?.name ?? '对方';
          toast(m.on ? `${who} 静音了` : `${who} 取消静音`);
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
    [enableVoice, events, hangupVoice, maybeStartVoice, send, set, toast],
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

  const chat = useCallback(
    (text: string) => {
      const s = stateRef.current;
      send({ t: 'chat', text });
      set({ chat: [...s.chat.slice(-199), { from: `${s.myName}（我）`, text, mine: true, ts: Date.now() }] });
      events.emit('barrage', { text, mine: true });
    },
    [send, set, events],
  );

  // 聊天抽屉开合：打开即清未读（腾讯会议红点行为）
  const toggleChat = useCallback(() => {
    const s = stateRef.current;
    set(s.chatOpen ? { chatOpen: false } : { chatOpen: true, chatUnread: 0 });
  }, [set]);
  const closeChat = useCallback(() => set({ chatOpen: false }), [set]);

  const toggleCamera = useCallback(async () => {
    if (cameraBusy.current) return;
    cameraBusy.current = true;
    const ws = wsRef.current;
    try {
      const stream = await enableVoice();
      if (!stream) return;
      const original = stream.getVideoTracks()[0];
      if (original) {
        stream.removeTrack(original);
        original.stop();
        events.emit('local-video', null);
        send({ t: 'cam', on: false });
        set({ camOn: false });
        await voicePcRef.current?.setCameraTrack(null);
        toast('摄像头已关，语音保持');
        return;
      }

      const capture = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = capture.getVideoTracks()[0];
      if (ws !== wsRef.current || ws?.readyState !== WebSocket.OPEN) {
        track.stop();
        return;
      }
      stream.addTrack(track);
      try {
        await voicePcRef.current?.setCameraTrack(track);
      } catch (error) {
        stream.removeTrack(track);
        track.stop();
        throw error;
      }
      events.emit('local-video', capture);
      send({ t: 'cam', on: true });
      set({ camOn: true });
      toast('摄像头已开，对方能看到你了');
    } catch {
      toast('无法切换摄像头，请检查设备和权限');
    } finally {
      cameraBusy.current = false;
    }
  }, [enableVoice, events, send, set, toast]);

  // 静音键：本地静音（track.enabled 置 false，连接不断），广播让对端看到状态
  const toggleMute = useCallback(() => {
    const s = stateRef.current;
    if (!s.voiceOn && !s.camOn) {
      toast('麦克风没开（权限被拒），静音不可用');
      return;
    }
    const next = !s.micMuted;
    for (const t of localVoiceRef.current?.getAudioTracks() ?? []) t.enabled = !next;
    send({ t: 'mute', on: next });
    set({ micMuted: next });
    toast(next ? '已静音' : '已取消静音');
  }, [send, set, toast]);

  // 弹幕开关：开启后聊天消息会在影片画面上飘过（复用 chat 通道，只影响显示）
  const toggleBarrage = useCallback(() => {
    set({ barrageOn: !stateRef.current.barrageOn });
  }, [set]);

  useEffect(() => {
    return () => {
      sharerRef.current?.stop();
      viewerRef.current?.close();
      voicePcRef.current?.close();
      localVoiceRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return {
    state,
    events,
    actions: {
      createRoom,
      joinRoom,
      startShare,
      stopShare,
      setQuality,
      toggleCamera,
      toggleMute,
      toggleBarrage,
      toggleChat,
      closeChat,
      chat,
      notify: toast, // 供组件弹轻提示（替代 window.alert 的正规通道）
      send,
    },
  };
}
export type RoomApi = ReturnType<typeof useRoom>;
