export interface ChatViewportMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const CHAT_BOTTOM_TOLERANCE_PX = 96;

export function isChatViewportNearBottom(
  metrics: ChatViewportMetrics,
  tolerancePx = CHAT_BOTTOM_TOLERANCE_PX,
): boolean {
  return metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= tolerancePx;
}

export function shouldAutoScrollChat(args: {
  isInitialLoad: boolean;
  isNearBottom: boolean;
  isOwnMessage: boolean;
}): boolean {
  return args.isInitialLoad || args.isNearBottom || args.isOwnMessage;
}
