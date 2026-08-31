import type { ClientMsg, IceLike } from '../../../shared/protocol';

export type SendFn = (m: ClientMsg) => void;

// 腾讯公共 STUN，国内可用；没有 TURN，打洞失败就连不上（提示用户换网络/上中继）
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.qq.com:3478', 'stun:stun1.qq.com:3478'] }],
};

/** 屋主侧：把屏幕采集流推给每个观众（每个观众一条 PeerConnection） */
export class HostSharer {
  private pcs = new Map<number, RTCPeerConnection>();
  private pendingIce = new Map<number, IceLike[]>();

  constructor(
    private stream: MediaStream,
    private send: SendFn,
  ) {}

  async addViewer(cid: number): Promise<void> {
    if (this.pcs.has(cid)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pcs.set(cid, pc);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    await this.limitVideoBitrate(pc);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: 'rtc-ice', to: cid, candidate: e.candidate.toJSON() });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ t: 'rtc-offer', to: cid, sdp: pc.localDescription!.sdp });
  }

  /** 家里宽带上行有限，压到 2.5Mbps / 20fps */
  private async limitVideoBitrate(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const p = sender.getParameters();
        p.encodings = [{ maxBitrate: 2_500_000, maxFramerate: 20 }];
        await sender.setParameters(p);
      } catch {
        /* 部分浏览器不支持，忽略 */
      }
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
