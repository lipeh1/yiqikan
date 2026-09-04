import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, Member, Mode, ServerMsg } from '../../../shared/protocol';
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

  /**
   * 屋主侧重建连麦连接（先关旧再发起新 offer）。
   * 用于摄像头开/关这类"本地流换了轨"的场景： renegotiate 走重建，
   * 简单可靠——短暂的音频中断远好于视频轨永远发不出去。
   */
  const startVoiceLink = useCallback(
    (forceHost?: boolean) => {
      const s = stateRef.current;
      if (!(forceHost ?? s.isHost) || !localVoiceRef.current) return;
      const peer = s.members.find((m) => !m.host);
      if (!peer?.voice) return;
      hangupVoice();
      const link = new VoiceLink(localVoiceRef.current, send, peer.cid, (stream) =>
        events.emit('voice-stream', stream),
      );
      voicePcRef.current = link;
      void link.call(peer.cid);
    },
    [events, hangupVoice, send],
  );

  const maybeStartVoice = useCallback(
    (forceHost?: boolean) => {
      const s = stateRef.current;
      const isHost = forceHost ?? s.isHost;
      if (!isHost || !s.voiceOn || !localVoiceRef.current || voicePcRef.current) return;
      startVoiceLink(isHost);
    },
    [startVoiceLink],
  );

  useEffect(() => {
    maybeStartVoice();
  }, [maybeStartVoice, state.isHost, state.members, state.voiceOn]);

  /**
   * 语音常开（腾讯会议模式）：进房自动请求麦克风并入会，会中只有静音、没有"挂断连麦"。
   * 必须定义在 handle 之前（进了它的依赖数组）。权限被拒时提示，不打断其它功能。
   */
  const enableVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      // 沿用当前静音状态，避免换流后静音失效
      for (const t of stream.getAudioTracks()) t.enabled = !stateRef.current.micMuted;
      localVoiceRef.current = stream;
      send({ t: 'voice', on: true });
      set({ voiceOn: true });
      maybeStartVoice();
    } catch {
      toast('拿不到麦克风：检查权限（http 环境浏览器会禁用，走 https 隧道即可）');
    }
  }, [maybeStartVoice, send, set, toast]);

  // 进房只自动开麦一次（权限弹窗也只出一次），失败不重试不打扰
  const autoVoiceDoneRef = useRef(false);
  const autoEnableVoice = useCallback(() => {
    if (autoVoiceDoneRef.current) return;
    autoVoiceDoneRef.current = true;
    void enableVoice();
  }, [enableVoice]);

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
          });
          toast('房间建好了，把邀请码发给 TA');
          autoEnableVoice();
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
          autoEnableVoice();
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
        case 'chat':
          set({ chat: [...s.chat.slice(-199), { from: m.from, text: m.text, mine: false }] });
          events.emit('barrage', { text: m.text, mine: false });
          break;
        case 'poke':
          navigator.vibrate?.([120, 60, 120]);
          toast(`${m.from} 戳了戳你`);
          set({ chat: [...s.chat.slice(-199), { from: '戳一戳', text: '戳了戳你，快看片！', mine: false }] });
          break;
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
          const members = s.members.map((x) =>
            x.cid === m.cid ? { ...x, cam: m.on, muted: m.on ? x.muted : false } : x,
          );
          set({ members });
          if (m.cid === s.myCid) break;
          const who = s.members.find((x) => x.cid === m.cid)?.name ?? '对方';
          if (m.on) {
            toast(`${who} 开了摄像头${s.camOn ? '' : '，点摄像头一起看脸'}`);
            // 对方换了音视频流：屋主在麦上就重建连接，否则视频轨发不过来
            if (s.isHost && s.voiceOn) startVoiceLink();
            else maybeStartVoice();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoEnableVoice, events, hangupVoice, maybeStartVoice, send, set, startVoiceLink, toast],
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
      set({ chat: [...s.chat.slice(-199), { from: `${s.myName}（我）`, text, mine: true }] });
      events.emit('barrage', { text, mine: true });
    },
    [send, set, events],
  );

  const poke = useCallback(() => {
    send({ t: 'poke' });
    navigator.vibrate?.(80);
    toast('戳了戳对方');
  }, [send, toast]);

  const toggleCamera = useCallback(async () => {
    if (stateRef.current.camOn) {
      // 关摄像头但保留语音（语音常开）：换成纯音频流并重建连接，对端小窗收起
      localVoiceRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        for (const t of stream.getAudioTracks()) t.enabled = !stateRef.current.micMuted;
        localVoiceRef.current = stream;
        events.emit('local-video', null);
        hangupVoice();
        send({ t: 'cam', on: false });
        set({ camOn: false });
        toast('摄像头已关，语音保持');
        if (stateRef.current.isHost) startVoiceLink();
        else maybeStartVoice();
      } catch {
        toast('语音恢复失败：检查麦克风权限，或刷新页面重进');
      }
      return;
    }
    try {
      // 音视频一起开：看脸自然要说话，一条流两个轨一起走；音频同样带降噪
      // 若之前只有纯音频，先停旧流再取新流，避免双路麦克风采集
      localVoiceRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: true,
      });
      for (const t of stream.getAudioTracks()) t.enabled = !stateRef.current.micMuted;
      localVoiceRef.current = stream;
      events.emit('local-video', stream);
      // 本地流换了轨：旧连接里没有视频轨，直接重建（屋主端立刻发起，观众端等屋主收到 cam 消息后重建）
      hangupVoice();
      send({ t: 'cam', on: true });
      set({ camOn: true });
      toast('摄像头已开，对方能看到你了');
      if (stateRef.current.isHost) startVoiceLink();
      else maybeStartVoice();
    } catch {
      toast('拿不到摄像头/麦克风：检查权限（http 环境浏览器会禁用，走 https 隧道即可）');
    }
  }, [events, hangupVoice, maybeStartVoice, send, set, startVoiceLink, toast]);

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
      chat,
      poke,
      notify: toast, // 供组件弹轻提示（替代 window.alert 的正规通道）
      send,
    },
  };
}
export type RoomApi = ReturnType<typeof useRoom>;
