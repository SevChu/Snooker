export function isValidFrameCount(totalFrames: number): boolean {
  return Number.isSafeInteger(totalFrames) && totalFrames > 0 && totalFrames % 2 === 1;
}

export function framesToWin(totalFrames: number): number {
  if (!isValidFrameCount(totalFrames)) throw new RangeError('总局数必须是正奇数');
  return (totalFrames + 1) / 2;
}
