import { ApiError } from "./api-error";
import { env } from "@/utils/env";
import type { MediaAsset } from "@/types/inventory";

/**
 * Uploads against /api/media — the one multipart endpoint in the API.
 *
 * TWO REASONS THIS DOES NOT GO THROUGH `apiClient`, both stated so the next
 * reader does not "fix" it back:
 *
 *  1. `apiClient` has a hard 15-second timeout. A 50 MB video on a 5 Mbps
 *     connection takes about eighty seconds, so every large upload would abort
 *     just as it was about to finish.
 *  2. `fetch` cannot report upload progress. A 50 MB upload behind a spinner
 *     with no percentage is indistinguishable from a hung one, and the user's
 *     only recourse is to try again — which starts the fifty megabytes over.
 *
 * `XMLHttpRequest` solves both. It bends `api-client.ts`'s documented rule that
 * it is the only module calling into the network, so the rule is bent HERE, in
 * one file, with the reason written down — and this still throws `ApiError` and
 * still unwraps the `{ success, data }` envelope, so a caller cannot tell the
 * difference.
 */

/** How long an upload may take before it is abandoned. */
const UPLOAD_TIMEOUT_MS = 180_000;

/**
 * Which key segment an upload is filed under: `product` for a product gallery,
 * `category` for a category's picture, `service` for a service's, `description`
 * for an image embedded in rich text.
 *
 * The value only changes a segment of the storage key, but the orphan sweeper
 * reads that segment — it never touches a `/desc/` file, and for the others it
 * asks the matching collection whether anything still points at it. A closed
 * list server-side (`PURPOSE_SEGMENTS` in media.controller.js); anything else
 * falls back to `product`, which is why adding a value here without adding it
 * there would file the asset where its own sweeper clause never looks.
 */
export type MediaUploadPurpose =
  | "product"
  | "category"
  | "service"
  | "description";

export interface UploadOptions {
  purpose?: MediaUploadPurpose;
  /**
   * A still frame for a video, captured from a `<video>` element onto a canvas.
   * Without one the tile shows a play icon rather than a blank rectangle.
   */
  poster?: Blob | null;
  /** 0–100. Called as the bytes go out; the whole reason for XHR. */
  onProgress?: (percent: number) => void;
}

export const mediaService = {
  /**
   * POST /media/upload — stores one file and returns the asset to attach.
   *
   * The returned object carries a `token`, which MUST travel back inside the
   * payload that stores it — a product's or a category's. The API verifies it
   * before storing, because everything else in the object has passed through a
   * browser and is therefore client-controlled by the time it returns.
   */
  upload(file: File, options: UploadOptions = {}): Promise<MediaAsset> {
    const body = new FormData();
    body.append("file", file);
    body.append("purpose", options.purpose ?? "product");
    if (options.poster) body.append("poster", options.poster, "poster.jpg");

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.open("POST", `${env.apiBaseUrl}/media/upload`);
      // The session cookie, exactly as apiClient sends it.
      request.withCredentials = true;
      request.timeout = UPLOAD_TIMEOUT_MS;

      request.upload.onprogress = (event) => {
        if (event.lengthComputable && options.onProgress) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      request.onload = () => {
        let payload: {
          success?: boolean;
          data?: MediaAsset;
          message?: string;
          details?: Array<{ field: string; message: string }>;
        };

        try {
          payload = JSON.parse(request.responseText);
        } catch {
          reject(new ApiError("Server response could not be read", request.status));
          return;
        }

        if (request.status >= 200 && request.status < 300 && payload.data) {
          resolve(payload.data);
          return;
        }

        // Same shape apiClient throws, so a form's `applyApiError` works
        // unchanged on an upload failure.
        reject(
          new ApiError(payload.message ?? "Upload failed", request.status, {
            details: payload.details,
          }),
        );
      };

      request.onerror = () =>
        reject(new ApiError("Upload failed — check your connection", 0));
      request.ontimeout = () =>
        reject(new ApiError("Upload timed out — the file may be too large", 0));

      request.send(body);
    });
  },
};
