"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
/*
  LINK IS NOT IMPORTED SEPARATELY, and that is the fix for a warning this file
  printed on every single mount: `[tiptap warn]: Duplicate extension names
  found: ['link']`.

  TipTap v3's StarterKit ALREADY BUNDLES `@tiptap/extension-link` — check its
  package.json dependencies. Adding the package on top registered the extension
  twice, so ProseMirror built its schema, its plugins and its keymaps for `link`
  twice per editor. Configuring it THROUGH StarterKit is the v3 way and leaves
  exactly one registration.

  The behaviour is unchanged: `openOnClick` still differs between the editor and
  the read-only view below.
*/
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Bold,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";

import { mediaService } from "@/services/media.service";
import { ApiError } from "@/services/api-error";
import { cn } from "@/lib/utils";

/**
 * The product description editor — what a marketplace or storefront publishes.
 *
 * OUTPUTS HTML, which the API SANITISES before storing. That order matters and
 * is worth stating: nothing here is a security control. Tiptap parses to a
 * schema and drops what it does not recognise, which makes the output
 * well-formed, but the editor is a client and a client cannot be trusted about
 * its own output. `utils/sanitizeHtml.js` on the server is the boundary.
 *
 * IMAGES UPLOAD IMMEDIATELY, before the product is saved, and land in the
 * document as an `<img src>` pointing at our media host. They are therefore NOT
 * in `media[]`, and the orphan sweeper cannot find them by looking there — which
 * is why the upload marks them `purpose: "description"` and why the sweeper
 * leaves that prefix alone for now (see MediaService).
 *
 * The toolbar is deliberately small: bold, italic, two list kinds, a link and an
 * image. That is what a listing uses. Every extra control is a tag the server's
 * allowlist would then have to admit, and the allowlist is the thing keeping
 * this field from becoming an injection surface.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  error?: string;

}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  error,
}: RichTextEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image,
    ],
    content: value,
    // Next renders this on the server otherwise, and ProseMirror touches
    // `document` during construction.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose-sm min-h-40 max-w-none px-3 py-2 focus:outline-none [&_img]:max-w-full [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5",
        "aria-label": "Deskripsi produk",
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const asset = await mediaService.upload(file, { purpose: "description" });
      editor?.chain().focus().setImage({ src: asset.url }).run();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Gambar gagal diunggah.",
      );
    } finally {
      setUploading(false);
    }
  }

  if (!editor) {
    return (
      <div className="min-h-40 rounded-lg border border-border bg-accent/40" />
    );
  }

  const button = (
    label: string,
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted transition hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "overflow-hidden rounded-lg border",
          error ? "border-danger" : "border-border",
        )}
      >
        <div className="flex flex-wrap gap-0.5 border-b border-border bg-accent/40 p-1">
          {button(
            "Tebal",
            editor.isActive("bold"),
            () => editor.chain().focus().toggleBold().run(),
            <Bold className="size-4" />,
          )}
          {button(
            "Miring",
            editor.isActive("italic"),
            () => editor.chain().focus().toggleItalic().run(),
            <Italic className="size-4" />,
          )}
          {button(
            "Daftar poin",
            editor.isActive("bulletList"),
            () => editor.chain().focus().toggleBulletList().run(),
            <List className="size-4" />,
          )}
          {button(
            "Daftar nomor",
            editor.isActive("orderedList"),
            () => editor.chain().focus().toggleOrderedList().run(),
            <ListOrdered className="size-4" />,
          )}
          {button(
            "Tautan",
            editor.isActive("link"),
            () => {
              const href = window.prompt("Alamat tautan (https://…)");
              if (!href) return;
              editor.chain().focus().setLink({ href }).run();
            },
            <LinkIcon className="size-4" />,
          )}
          <button
            type="button"
            aria-label="Sisipkan gambar"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded p-1.5 text-muted transition hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <ImagePlus className="size-4" />
          </button>
        </div>

        <EditorContent editor={editor} />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void insertImage(file);
        }}
      />

      {placeholder && editor.isEmpty && (
        <p className="text-xs text-muted">{placeholder}</p>
      )}

      {(uploadError || error) && (

        <p role="alert" className="text-xs text-danger">

          {uploadError ?? error}

        </p>

      )}
    </div>
  );
}

/**
 * Renders a stored description read-only.
 *
 * THROUGH TIPTAP RATHER THAN `dangerouslySetInnerHTML`, and the dependency is
 * already here so it costs nothing. The server has already sanitised what is
 * stored, so this is a SECOND independent barrier rather than the only one: an
 * editor parses to a schema and silently drops anything the schema has no node
 * for, which means a tag that somehow survived the server would still not
 * render as markup.
 */
export function RichTextView({ html }: { html: string | null | undefined }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: true } }),
      Image,
    ],
    content: html ?? "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose-sm max-w-none [&_img]:max-w-full [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5",
      },
    },
  });

  if (!html) return <p className="text-sm text-muted">—</p>;

  return <EditorContent editor={editor} />;
}
