import type { ClientMsg, IceLike } from '../../../shared/protocol';

export type SendFn = (m: ClientMsg) => void;

/**
 * ICE 服务器：默认腾讯公共 STUN（国内可用）。
 * TURN 中继可选——打洞失败时靠它兜底，用 Vite 环境变量注入（部署时在 web/.env 里填，构建时生效）：
 *   VITE_TURN_URL=turn:你的域名:3478
 *   VITE_TURN_USER=...
 *   VITE_TURN_CRED=...
 * 没填就保持纯 STUN（打洞失败会提示连不上）；填了则自动追加 TURN（udp + tcp 双通道）。
 * 注意：走中继时带宽有限，已有 relay 检测会自动把画质压到流畅档。
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.qq.com:3478', 'stun:stun1.qq.com:3478'] },
  ];
  const turnUrl = ((import.meta.env.VITE_TURN_URL as string | undefined) ?? '').trim();
  const turnUser = ((import.meta.env.VITE_TURN_USER as string | undefined) ?? '').trim();
  const turnCred = ((import.meta.env.VITE_TURN_CRED as string | undefined) ?? '').trim();
  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: [`${turnUrl}?transport=udp`, `${turnUrl}?transport=tcp`],
      username: turnUser,
      credential: turnCred,
    });
  }
  return servers;
}

const RTC_CONFIG: RTCConfiguration = { iceServers: buildIceServers() };

/** 屏幕共享画质档位 */
export type ShareQuality = 'auto' | 'hd' | 'uhd';

/** 各档位的编码参数：流畅=2.5Mbps@30fps、高清=8Mbps@60fps、超清=12Mbps@60fps */
const SHARE_QUALITY: Record<ShareQuality, { maxBitrate: number; maxFramerate: number }> = {
  auto: { maxBitrate: 2_500_000, maxFramerate: 30 },
  hd: { maxBitrate: 8_000_000, maxFramerate: 60 },
  uhd: { maxBitrate: 12_000_000, maxFramerate: 60 },
};

/** TURN 中继带宽有限（阿里云轻量通常 3~5Mbps），走中继时自动降到流畅档 */
const RELAY_QUALITY = { maxBitrate: 2_500_000, maxFramerate: 30 };

/**
 * 偏好 H.265(HEVC) > H.264 > 其余：两端都支持 HEVC 时自动协商用 HEVC（同画质省约一半码率），
 * 任意一端不支持则自动回落 H.264（WebRTC 强制编码器，全浏览器兜底）。
 * 注意：setCodecPreferences 是 RTCRtpTransceiver 的方法（不是 RTCPeerConnection 的），
 * 需在 addTrack 之后、createOffer 之前调用。
 */
function preferHevc(pc: RTCPeerConnection): void {
  try {
    const caps = RTCRtpSender.getCapabilities('video');
    if (!caps?.codecs?.length) return;
    const codecs = caps.codecs;
    const match = (re: RegExp) => codecs.filter((c) => re.test(c.mimeType));
    const hevc = match(/hevc|h265/i);
    const h264 = match(/h264/i);
    const rest = codecs.filter((c) => !hevc.includes(c) && !h264.includes(c));
    const ordered = [...hevc, ...h264, ...rest];
    if (!ordered.length) return;
    const video = pc.getTransceivers().find((t) => t.sender.track?.kind === 'video');
    video?.setCodecPreferences(ordered);
  } catch {
    /* 部分浏览器不支持，忽略 */
  }
}

/** 屋主侧：把屏幕采集流推给每个观众（每个观众一条 PeerConnection） */
export class HostSharer {
  private pcs = new Map<number, RTCPeerConnection>();
  private pendingIce = new Map<number, IceLike[]>();

  constructor(
    private stream: MediaStream,
    private send: SendFn,
    private quality: ShareQuality = 'auto',
  ) {}

  async addViewer(cid: number): Promise<void> {
    if (this.pcs.has(cid)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pcs.set(cid, pc);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    // 先定编解码器优先级，再压码率，最后 createOffer
    preferHevc(pc);
    await this.limitVideoBitrate(pc);
    this.watchRelay(pc);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: 'rtc-ice', to: cid, candidate: e.candidate.toJSON() });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ t: 'rtc-offer', to: cid, sdp: pc.localDescription!.sdp });
  }

  /** 按当前画质档位设置编码参数（码率 / 帧率上限） */
  private async limitVideoBitrate(pc: RTCPeerConnection): Promise<void> {
    await this.applyVideoParams(pc, SHARE_QUALITY[this.quality]);
  }

  private async applyVideoParams(
    pc: RTCPeerConnection,
    q: { maxBitrate: number; maxFramerate: number },
  ): Promise<void> {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const p = sender.getParameters();
        p.encodings = [{ maxBitrate: q.maxBitrate, maxFramerate: q.maxFramerate }];
        await sender.setParameters(p);
      } catch {
        /* 部分浏览器不支持，忽略 */
      }
    }
  }

  /** 连接建立后检测是否走 TURN 中继；中继时把码率压到流畅档，避免服务器带宽瓶颈卡顿 */
  private watchRelay(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && this.quality !== 'auto') {
        void this.downgradeIfRelay(pc);
      }
    };
  }

  private async downgradeIfRelay(pc: RTCPeerConnection): Promise<void> {
    try {
      const stats = await pc.getStats();
      let relayed = false;
      stats.forEach((raw) => {
        const s = raw as unknown as {
          type: string;
          nominated?: boolean;
          state?: string;
          localCandidateId?: string;
        };
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && s.localCandidateId) {
          const local = stats.get(s.localCandidateId) as unknown as { candidateType?: string } | undefined;
          if (local?.candidateType === 'relay') relayed = true;
        }
      });
      if (relayed) await this.applyVideoParams(pc, RELAY_QUALITY);
    } catch {
      /* getStats 结构因浏览器而异，降级失败就保持原档位 */
    }
  }

  async handleAnswer(from: number, sdp: string): Promise<void> {
    const pc = this.pcs.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp });
      for (const c of this.pendingIce.get(from) ?? []) {
        await pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
      }
      this.pendingIce.delete(from);
    } catch {
      /* 坏 answer，忽略 */
    }
  }

  handleIce(from: number, c: IceLike): void {
    const pc = this.pcs.get(from);
    if (!pc) return;
    // answer 还没处理完时先缓存，避免 ICE 丢包导致连不上
    if (!pc.remoteDescription) {
      const q = this.pendingIce.get(from) ?? [];
      q.push(c);
      this.pendingIce.set(from, q);
      return;
    }
    void pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
  }

  stop(): void {
    for (const pc of this.pcs.values()) pc.close();
    this.pcs.clear();
    this.pendingIce.clear();
    for (const t of this.stream.getTracks()) t.stop();
  }
}

/** 观众侧：接收屋主的屏幕流 */
export class ViewerShare {
  readonly pc: RTCPeerConnection;
  private pendingIce: IceLike[] = [];

  constructor(
    private send: SendFn,
    onStream: (s: MediaStream) => void,
  ) {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc.ontrack = (e) => onStream(e.streams[0]);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: 'rtc-ice', to: 'host', candidate: e.candidate.toJSON() });
    };
  }

  async handleOffer(sdp: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send({ t: 'rtc-answer', sdp: this.pc.localDescription!.sdp });
      for (const c of this.pendingIce) {
        await this.pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
      }
      this.pendingIce = [];
    } catch {
      /* 坏 offer，忽略 */
    }
  }

  handleIce(c: IceLike): void {
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(c);
      return;
    }
    void this.pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
  }

  close(): void {
    this.pc.close();
  }
}

/**
 * 连麦（音视频）：一条双向 PeerConnection，与屏幕共享的互不干扰。
 * 支持纯语音（只带 audio 轨）或音视频（audio+video 轨），各自传各自有的轨。
 * 规则：双方各自先开麦/开摄像头，都就绪后由屋主发起 call()。
 */
export class VoiceLink {
  readonly pc: RTCPeerConnection;
  private pendingIce: IceLike[] = [];

  constructor(
    localStream: MediaStream | null,
    private send: SendFn,
    private peerCid: number | 'host',
    onRemoteStream: (s: MediaStream) => void,
  ) {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    if (localStream) {
      for (const t of localStream.getTracks()) this.pc.addTrack(t, localStream);
    }
    this.pc.ontrack = (e) => onRemoteStream(e.streams[0]);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: 'v-ice', to: this.peerCid, candidate: e.candidate.toJSON() });
    };
  }

  /** 屋主侧发起 */
  async call(cid: number): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send({ t: 'v-offer', to: cid, sdp: this.pc.localDescription!.sdp });
  }

  /** 屋主侧：收到对方 answer */
  async handleAnswer(sdp: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
      for (const c of this.pendingIce) {
        await this.pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
      }
      this.pendingIce = [];
    } catch {
      /* 坏 answer，忽略 */
    }
  }

  /** 观众侧应答 */
  async answer(sdp: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send({ t: 'v-answer', sdp: this.pc.localDescription!.sdp });
      for (const c of this.pendingIce) {
        await this.pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
      }
      this.pendingIce = [];
    } catch {
      /* 坏 offer，忽略 */
    }
  }

  handleIce(c: IceLike): void {
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(c);
      return;
    }
    void this.pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {});
  }

  close(): void {
    this.pc.close();
  }
}
