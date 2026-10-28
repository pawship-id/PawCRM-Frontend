"use client";

import { useCallback, useState } from "react";

import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type { TemplateUploadResult } from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import { formatCount } from "../labels";

/** One sentence on what a template upload did, for the toast. */
export function templateUploadSummary(result: TemplateUploadResult): string {
  const parts = [`${formatCount(result.variants)} varian dibaca`];
  if (result.autoBound > 0) parts.push(`${formatCount(result.autoBound)} SKU langsung terikat`);
  parts.push(`${formatCount(result.unbound)} belum terikat`);
  return `Template tersimpan. ${parts.join(", ")}.`;
}

/**
 * Uploads a Shopee template for a store — the first one or a refresh. The
 * server reads it, locks the shop id on the first upload, and binds identical
 * SKUs; the caller reloads its store and listings on success.
 */
export function useTemplateUpload(onDone: () => void) {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (storeId: string, file: File) => {
      setUploading(true);
      try {
        const { result } = await marketplaceService.uploadTemplate(storeId, file);
        swalToast(templateUploadSummary(result), "success", 6000);
        onDone();
      } catch (error) {
        swalToast(ecommerceFailure(error, "Template belum bisa diupload.").toast, "error", 6000);
      } finally {
        setUploading(false);
      }
    },
    [onDone],
  );

  return { upload, uploading };
}
