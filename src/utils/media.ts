/**
 * Browser-side image and video preprocessing, done before an upload leaves.
 *
 * WHY ANY OF THIS RUNS IN THE BROWSER when the server re-encodes everything
 * anyway. The server is the authority on what gets STORED; this is about what
 * gets SENT. A phone photo is 4000×3000 and several megabytes, and the server's
 * first act is to throw nine tenths of those pixels away — so uploading them
 * costs the user their data allowance and a minute of waiting to transmit bytes
 * that are discarded on arrival. Worse, it used to fail outright: the crop
 * dialog encoded at full natural resolution and routinely produced a file above
 * the 5 MB ceiling, so the most ordinary thing a user can do — pick a photo
 * straight off their phone — was rejected.
 *
 * WHAT IS DELIBERATELY NOT HERE: video transcoding. It is possible in a browser
 * (WebCodecs, or ffmpeg compiled to wasm) and it is the wrong trade for this.
 * WebCodecs needs a muxer and produces different output on every device;
 * ffmpeg.wasm is a ~30 MB download and needs cross-origin isolation headers the
 * app does not set. The server has a real ffmpeg and gets an identical result
 * every time. What the browser does for video is the cheap half — read the
 * metadata, grab a poster frame, refuse an oversized file before the upload
 * starts rather than after fifty megabytes have gone out.
 *
 * EVERY FUNCTION HERE CLEANS UP AFTER ITSELF. An object URL that is never
 * revoked pins the whole file in memory for the lifetime of the document, and a
 * form where a user tried six videos is then holding all six.
 */

/**
 * The longest edge an uploaded image keeps.
 *
 * DELIBERATELY ABOVE THE SERVER'S 1600. Sending exactly 1600 would make the
 * server's resize a no-op, which sounds efficient and is not: a canvas
 * `drawImage` downscale is a crude filter, and the result would be the final
 * stored image. Sending 2048 leaves the last resampling step to sharp, which is
 * markedly better at it, while still cutting a phone photo's upload by roughly
 * four times. The headroom is the point.
 */
export const UPLOAD_MAX_EDGE = 2048;

/** Encoder quality for the transport copy. The server re-encodes from this. */
const UPLOAD_QUALITY = 0.9;

/** Where the poster frame is grabbed from, when the clip is long enough. */
const POSTER_SECONDS = 1;

/**
 * How long to wait on a `<video>` element before giving up on it.
 *
 * NOT BELT AND BRACES. A media element that can neither decode nor recognise a
 * file is permitted to fire neither `loadedmetadata` nor `error` — jsdom does
 * exactly this, and so does at least one real browser on a truncated MP4. A
 * promise waiting on both would then never settle, and since the caller awaits
 * it before uploading, the form would sit at 0% with no error and no way
 * forward. Both callers treat a timeout as "no poster", which is a soft
 * failure: the server extracts one.
 */
const VIDEO_READ_TIMEOUT_MS = 10_000;

/**
 * Draws `source` onto a canvas, scaled to fit `maxEdge`, and encodes it.
 *
 * THE DIMENSIONS ARE PASSED IN rather than read off the source, because the two
 * callers disagree about where they live: an `HTMLImageElement` has `width`,
 * but a video's are `videoWidth`/`videoHeight` and its `width` is the CSS box —
 * zero for an element that was never inserted into the document. Reading the
 * wrong pair yields a 0×0 canvas and a blank poster.
 *
 * Prefers WebP and falls back to JPEG. The fallback is not defensive padding:
 * `canvas.toBlob` is specified to encode PNG when it does not recognise the
 * requested type, which would make a photo several times LARGER than the JPEG
 * it replaced. Checking the type that comes back is the only reliable way to
 * know which one happened.
 *
 * NEVER UPSCALES. A 200px logo stays 200px; blowing it up to 2048 would add
 * bytes and remove nothing.
 */
export async function encodeForUpload(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  { maxEdge = UPLOAD_MAX_EDGE, quality = UPLOAD_QUALITY } = {},
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas tidak tersedia");

  // Browsers default to a fast, low-quality resampler. On a 4× downscale that
  // is the difference between a sharp photo and a visibly aliased one, and the
  // cost is a few milliseconds once per upload.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );

  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;

  const jpeg = await encode("image/jpeg");
  if (jpeg) return jpeg;

  throw new Error("Gambar gagal diproses");
}

/** Loads an image from a URL, resolving once its pixels are readable. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const element = new Image();
    element.addEventListener("load", () => resolve(element));
    element.addEventListener("error", () =>
      reject(new Error("Gambar tidak bisa dibaca")),
    );
    element.src = src;
  });
}

export interface VideoInfo {
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Loads a video's metadata far enough to read a frame from it.
 *
 * `preload = "metadata"` is not enough on its own — a frame cannot be drawn to
 * a canvas until the video has actually decoded one, which is what `seeked`
 * waits for. `muted` and `playsInline` are what let this happen at all on iOS,
 * where an un-muted video element is not permitted to load without a gesture.
 */
function openVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const timer = setTimeout(() => {
      // Drop the source so the element stops fetching. Without this a file that
      // never loads keeps downloading behind a promise nobody is waiting on.
      video.removeAttribute("src");
      video.load();
      reject(new Error("Video tidak bisa dibaca"));
    }, VIDEO_READ_TIMEOUT_MS);

    video.addEventListener(
      "loadedmetadata",
      () => {
        clearTimeout(timer);
        resolve(video);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Video tidak bisa dibaca"));
      },
      { once: true },
    );

    video.src = url;
  });
}

/**
 * Reads a video's duration and dimensions without uploading it.
 *
 * The server reports the same three numbers from ffprobe once the file arrives;
 * these are for the form, which needs them before that.
 */
export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const url = URL.createObjectURL(file);

  try {
    const video = await openVideo(url);

    return {
      // A stream still being written reports Infinity rather than a number.
      durationMs: Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    };
  } catch {
    // Not being able to read a video here is not a reason to block the upload —
    // the server probes it properly with ffprobe and rejects it there if it is
    // genuinely unreadable. Returning nulls keeps a browser quirk from stopping
    // a user whose file is fine.
    return { durationMs: null, width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Grabs a still frame to use as the video's poster.
 *
 * SEEKS PAST THE OPENING FRAME, because video very often starts on black or on
 * a hand moving away from the phone — frame zero is the worst available choice
 * for a thumbnail. One second in is past that for nearly everything, and half
 * the duration covers a clip shorter than that.
 *
 * The server can extract a poster itself and does when this returns null, so
 * every failure path here is a soft one. What sending a poster buys is the
 * gallery tile filling in the instant the upload finishes rather than after the
 * transcode, and a poster surviving on a deployment with transcoding switched
 * off.
 */
export async function captureVideoPoster(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);

  try {
    const video = await openVideo(url);

    const target = Number.isFinite(video.duration)
      ? Math.min(POSTER_SECONDS, video.duration / 2)
      : 0;

    // Timed out for the same reason `openVideo` is: a seek into a damaged file
    // can settle neither way, and this one is awaited before the upload starts.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Video tidak bisa dibaca")),
        VIDEO_READ_TIMEOUT_MS,
      );
      const settle = (finish: () => void) => () => {
        clearTimeout(timer);
        finish();
      };

      video.addEventListener("seeked", settle(resolve), { once: true });
      video.addEventListener(
        "error",
        settle(() => reject(new Error("Video tidak bisa dibaca"))),
        { once: true },
      );
      video.currentTime = target;
    });

    // `videoWidth` is 0 until a frame is decoded; drawing then yields a blank
    // canvas, which is worse than no poster because it looks like a real one.
    if (!video.videoWidth || !video.videoHeight) return null;

    return await encodeForUpload(video, video.videoWidth, video.videoHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Human-readable megabytes, for the one place a size limit is explained. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
