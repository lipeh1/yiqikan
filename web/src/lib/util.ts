export const fmt = (seconds: number): string => {
  const s = Math.floor(seconds || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 心跳纠偏阈值：观众和屋主差超过 1.5 秒才追，避免频繁跳动 */
export const shouldSeek = (local: number, remote: number, threshold = 1.5): boolean =>
  Number.isFinite(remote) && Math.abs(local - remote) > threshold;
