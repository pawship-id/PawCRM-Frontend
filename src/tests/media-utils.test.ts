import {
  UPLOAD_MAX_EDGE,
  captureVideoPoster,
  encodeForUpload,
  formatMegabytes,
  probeVideo,
} from "@/utils/media";

/**
 * The browser-side preprocessing helpers.
 *
 * JSDOM HAS NO CANVAS AND NO MEDIA PIPELINE, so `getContext("2d")` returns null
 * and a `<video>` never loads anything. Both are stubbed here — which sounds
 * like it leaves nothing to test, and does not: what these functions own is the
 * ARITHMETIC and the CONTROL FLOW, and both are where the bugs are. Whether a
 * 4000px photo becomes 2048 and not 4000, whether a small image is left alone
 * rather than upscaled, whether a WebP encoder that silently produced a PNG is
 * noticed, whether an element that never fires an event eventually gives up.
 * The pixels themselves are the browser's job.
 *
 * `URL.createObjectURL` does not exist in jsdom either, so it is stubbed and
 * asserted on — a leaked object URL pins the whole file in memory for the life
 * of the document, and a form where a user tried six videos then holds all six.
 */
describe("media utils", () => {
  let created: string[];
  let revoked: string[];

  /**
   * Installs a canvas whose `toBlob` answers with `type`, recording the size it
   * was asked to draw at.
   */
  function stubCanvas({
    type = "image/webp",
    bytes = 1024,
  }: { type?: string; bytes?: number } = {}) {
    const drawn: Array<{ width: number; height: number }> = [];

    jest
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        if (tag !== "canvas") {
          return Object.getPrototypeOf(document).createElement.call(
            document,
            tag,
          );
        }

        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "low",
            drawImage: () => {
              drawn.push({ width: canvas.width, height: canvas.height });
            },
          }),
          toBlob: (
            callback: (blob: Blob | null) => void,
            requested: string,
          ) => {
            // A browser that does not know the requested type encodes PNG and
            // says so — the reason the caller checks what came back.
            const actual = requested === type ? requested : "image/png";
            callback(new Blob([new Uint8Array(bytes)], { type: actual }));
          },
        };

        return canvas as unknown as HTMLElement;
      });

    return drawn;
  }

  beforeEach(() => {
    created = [];
    revoked = [];

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        const url = `blob:${created.length}`;
        created.push(url);
        void blob;
        return url;
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: (url: string) => revoked.push(url),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  describe("encodeForUpload", () => {
    /** A stand-in source; only its dimensions are read. */
    const source = {} as CanvasImageSource;

    it("scales the longest edge down to the upload cap", async () => {
      const drawn = stubCanvas();

      await encodeForUpload(source, 4000, 3000);

      // The whole point: a phone photo is uploaded at 2048px, not 4000px.
      expect(drawn[0]).toEqual({ width: UPLOAD_MAX_EDGE, height: 1536 });
    });

    it("scales by the HEIGHT when that is the longest edge", async () => {
      const drawn = stubCanvas();

      await encodeForUpload(source, 1500, 3000);

      expect(drawn[0]).toEqual({ width: 1024, height: UPLOAD_MAX_EDGE });
    });

    it("never upscales", async () => {
      // A 200px logo blown up to 2048 adds bytes and removes nothing.
      const drawn = stubCanvas();

      await encodeForUpload(source, 200, 120);

      expect(drawn[0]).toEqual({ width: 200, height: 120 });
    });

    it("never produces a zero-sized canvas", async () => {
      // A 1×4000 sliver rounds its short edge to 0, and a 0-wide canvas throws
      // in a real browser rather than returning an empty image.
      const drawn = stubCanvas();

      await encodeForUpload(source, 1, 4000);

      expect(drawn[0].width).toBeGreaterThanOrEqual(1);
    });

    it("prefers WebP", async () => {
      stubCanvas({ type: "image/webp" });

      const blob = await encodeForUpload(source, 1000, 1000);

      expect(blob.type).toBe("image/webp");
    });

    it("falls back to JPEG when the encoder answers with something else", async () => {
      // `canvas.toBlob` encodes PNG for a type it does not recognise, which for
      // a photo is several times LARGER than the JPEG it replaced — so the type
      // that comes back has to be checked rather than assumed.
      stubCanvas({ type: "image/jpeg" });

      const blob = await encodeForUpload(source, 1000, 1000);

      expect(blob.type).toBe("image/jpeg");
    });

    it("asks for a high-quality resample", async () => {
      // Browsers default to a fast, low-quality resampler. On a 4× downscale
      // that is the difference between a sharp photo and a visibly aliased one.
      let context: {
        imageSmoothingEnabled?: boolean;
        imageSmoothingQuality?: string;
        drawImage?: () => void;
      } = {};
      jest.spyOn(document, "createElement").mockImplementation(
        () =>
          ({
            width: 0,
            height: 0,
            getContext: () => {
              context = {
                imageSmoothingEnabled: false,
                imageSmoothingQuality: "low",
                drawImage: () => {},
              };
              return context;
            },
            toBlob: (callback: (blob: Blob | null) => void) =>
              callback(new Blob([], { type: "image/webp" })),
          }) as unknown as HTMLElement,
      );

      await encodeForUpload(source, 4000, 4000);

      expect(context.imageSmoothingQuality).toBe("high");
    });

    it("reports a canvas it cannot draw on rather than returning nothing", async () => {
      jest.spyOn(document, "createElement").mockReturnValue({
        getContext: () => null,
      } as unknown as HTMLElement);

      await expect(encodeForUpload(source, 100, 100)).rejects.toThrow(
        /Canvas/,
      );
    });
  });

  describe("probeVideo", () => {
    /** A `<video>` that reports `metadata` and then fires `event`. */
    function stubVideo(
      event: "loadedmetadata" | "error" | null,
      metadata: Partial<HTMLVideoElement> = {},
    ) {
      const listeners: Record<string, () => void> = {};
      const element = {
        preload: "",
        muted: false,
        playsInline: false,
        removeAttribute: () => {},
        load: () => {},
        addEventListener: (name: string, handler: () => void) => {
          listeners[name] = handler;
        },
        set src(_value: string) {
          // Deferred, so the caller has attached its listeners first — the same
          // ordering a real element gives.
          if (event) queueMicrotask(() => listeners[event]?.());
        },
        ...metadata,
      };

      jest
        .spyOn(document, "createElement")
        .mockReturnValue(element as unknown as HTMLElement);

      return { element, listeners };
    }

    it("reads the duration and dimensions", async () => {
      stubVideo("loadedmetadata", {
        duration: 12.5,
        videoWidth: 1920,
        videoHeight: 1080,
      });

      await expect(probeVideo(new Blob())).resolves.toEqual({
        durationMs: 12_500,
        width: 1920,
        height: 1080,
      });
    });

    it("reports nulls rather than throwing when the video cannot be read", async () => {
      // The server probes it properly with ffprobe and rejects it there if it
      // is genuinely broken; a browser quirk must not stop a user whose file is
      // fine.
      stubVideo("error");

      await expect(probeVideo(new Blob())).resolves.toEqual({
        durationMs: null,
        width: null,
        height: null,
      });
    });

    it("treats a stream with no finite duration as unknown", async () => {
      // A file still being written reports Infinity, which would otherwise be
      // rounded into a nonsense integer.
      stubVideo("loadedmetadata", {
        duration: Infinity,
        videoWidth: 640,
        videoHeight: 480,
      });

      await expect(probeVideo(new Blob())).resolves.toMatchObject({
        durationMs: null,
        width: 640,
      });
    });

    it("revokes the object URL on both paths", async () => {
      stubVideo("error");
      await probeVideo(new Blob());

      expect(revoked).toEqual(created);
    });
  });

  describe("captureVideoPoster", () => {
    /** A `<video>` that loads, then answers a seek. */
    function stubSeekableVideo({
      videoWidth = 1280,
      videoHeight = 720,
      duration = 30,
    } = {}) {
      const listeners: Record<string, () => void> = {};
      const seeks: number[] = [];

      const element = {
        preload: "",
        muted: false,
        playsInline: false,
        duration,
        videoWidth,
        videoHeight,
        removeAttribute: () => {},
        load: () => {},
        addEventListener: (name: string, handler: () => void) => {
          listeners[name] = handler;
        },
        set src(_value: string) {
          queueMicrotask(() => listeners.loadedmetadata?.());
        },
        set currentTime(value: number) {
          seeks.push(value);
          queueMicrotask(() => listeners.seeked?.());
        },
      };

      jest
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) =>
          tag === "video"
            ? (element as unknown as HTMLElement)
            : ({
                width: 0,
                height: 0,
                getContext: () => ({
                  imageSmoothingEnabled: false,
                  imageSmoothingQuality: "low",
                  drawImage: () => {},
                }),
                toBlob: (callback: (blob: Blob | null) => void) =>
                  callback(new Blob([new Uint8Array(64)], { type: "image/webp" })),
              } as unknown as HTMLElement),
        );

      return seeks;
    }

    it("seeks past the opening frame", async () => {
      // Video very often opens on black or on a hand moving away from the
      // phone, so frame zero is the worst available choice for a thumbnail.
      const seeks = stubSeekableVideo({ duration: 30 });

      await captureVideoPoster(new Blob());

      expect(seeks).toEqual([1]);
    });

    it("halves the seek on a clip shorter than the usual offset", async () => {
      // Seeking to 1s in an 0.8s clip lands past the end and yields no frame.
      const seeks = stubSeekableVideo({ duration: 0.8 });

      await captureVideoPoster(new Blob());

      expect(seeks).toEqual([0.4]);
    });

    it("returns a blob the upload can send", async () => {
      stubSeekableVideo();

      await expect(captureVideoPoster(new Blob())).resolves.toBeInstanceOf(
        Blob,
      );
    });

    it("returns null rather than a blank poster when no frame decoded", async () => {
      // `videoWidth` is 0 until a frame is decoded; drawing then yields an empty
      // canvas, which is worse than no poster because it looks like a real one.
      stubSeekableVideo({ videoWidth: 0, videoHeight: 0 });

      await expect(captureVideoPoster(new Blob())).resolves.toBeNull();
    });

    it("returns null when the element never settles", async () => {
      // A media element is permitted to fire neither `loadedmetadata` nor
      // `error`. Without the timeout the promise never settles, and since the
      // caller awaits it before uploading, the form would sit at 0% forever.
      jest.useFakeTimers();
      const listeners: Record<string, () => void> = {};
      jest.spyOn(document, "createElement").mockReturnValue({
        preload: "",
        muted: false,
        playsInline: false,
        removeAttribute: () => {},
        load: () => {},
        addEventListener: (name: string, handler: () => void) => {
          listeners[name] = handler;
        },
        set src(_value: string) {},
      } as unknown as HTMLElement);

      const pending = captureVideoPoster(new Blob());
      jest.advanceTimersByTime(10_000);

      await expect(pending).resolves.toBeNull();
      jest.useRealTimers();
    });

    it("revokes the object URL even when it gives up", async () => {
      stubSeekableVideo({ videoWidth: 0, videoHeight: 0 });

      await captureVideoPoster(new Blob());

      expect(revoked).toEqual(created);
    });
  });

  describe("formatMegabytes", () => {
    it("renders the number a size limit is explained with", () => {
      expect(formatMegabytes(50 * 1024 * 1024)).toBe("50.0 MB");
      expect(formatMegabytes(1_600_000)).toBe("1.5 MB");
    });
  });
});
