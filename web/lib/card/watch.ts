const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** A YouTube video id: exactly 11 characters of letters, digits, "-" and "_". */
export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/**
 * The link to a fight's official video on YouTube. We only link (the viewer is sent to YouTube):
 * no player, thumbnail or title is shown here, so the card shows no result.
 */
export function videoUrl(videoId: string | null | undefined): string | null {
  return isVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
}
