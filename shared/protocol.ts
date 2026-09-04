// 前后端共用的 WebSocket 消息协议。改协议先改这里。
// 注：IceLike 是 DOM RTCIceCandidateInit 的结构子集，服务端没有 DOM 类型也能用。
// 应用形态：屏幕共享看片（无选片/同步播放，片源在屋主屏幕上）。

export type Mode = 'idle' | 'share';

export interface Member {
  cid: number; // 房间内连接 id，WebRTC 信令按它定向投递
  name: string;
  host: boolean;
  voice: boolean; // 是否在麦上（连麦语音）
  cam: boolean; // 是否开着摄像头（音视频连麦）
  muted: boolean; // 是否静音（本地静音，对端据此显示状态）
}

export interface IceLike {
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; name: string }
  | { t: 'share-start' }
  | { t: 'share-stop' }
  // 社交
  | { t: 'chat'; text: string }
  | { t: 'poke' }
  // 连麦（音视频共用一条双向 PeerConnection，各自传各自有的轨）
  | { t: 'voice'; on: boolean }
  | { t: 'cam'; on: boolean }
  | { t: 'mute'; on: boolean }
  | { t: 'v-offer'; to: number; sdp: string }
  | { t: 'v-answer'; sdp: string }
  | { t: 'v-ice'; to: number | 'host'; candidate: IceLike }
  // 屏幕共享信令。观众→屋主固定 to:'host'
  | { t: 'rtc-offer'; to: number; sdp: string }
  | { t: 'rtc-answer'; sdp: string }
  | { t: 'rtc-ice'; to: number | 'host'; candidate: IceLike };

export type ServerMsg =
  | { t: 'created'; room: string; you: number; hostCid: number; members: Member[] }
  | { t: 'joined'; room: string; you: number; hostCid: number; members: Member[]; mode: Mode }
  | { t: 'host' } // 你被提升为新屋主
  | { t: 'member'; action: 'join' | 'leave' | 'host'; name: string; cid?: number; members: Member[] }
  | { t: 'mode'; mode: Mode }
  | { t: 'chat'; from: string; text: string }
  | { t: 'poke'; from: string }
  | { t: 'voice'; cid: number; on: boolean }
  | { t: 'cam'; cid: number; on: boolean }
  | { t: 'mute'; cid: number; on: boolean }
  | { t: 'notice'; msg: string }
  | { t: 'err'; msg: string }
  | { t: 'v-offer'; from: number; sdp: string }
  | { t: 'v-answer'; from: number; sdp: string }
  | { t: 'v-ice'; from: number; candidate: IceLike }
  | { t: 'rtc-offer'; from: number; sdp: string }
  | { t: 'rtc-answer'; from: number; sdp: string }
  | { t: 'rtc-ice'; from: number; candidate: IceLike };
