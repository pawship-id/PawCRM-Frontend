"use client";

import { useRef, useState } from "react";

import { ChevronDownIcon } from "lucide-react";

// The shadcn button rather than the project wrapper: only this one takes
// `asChild`, which is what lets it be the dropdown's trigger without nesting a
// button inside a button.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TemplateFormat = "xlsx" | "csv";

/**
 * Both formats, and the MIME types browsers actually report for them. The
 * extensions are listed alongside because a Windows machine with no Office
 * install reports `application/octet-stream` for an .xlsx, and an accept list of
 * MIME types alone would grey out the very file the user came to upload.
 */
const DEFAULT_ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Get a template, then give a file back — the part of every upload that is the
 * same. It has no card of its own, so it sits in a page or in a dialog alike.
 *
 * THE TEMPLATE BUTTON IS NOT DECORATION. The column names are the contract
 * between the screen and the server, and a user who invents their own headers
 * gets a refusal about a column they can plainly see. Downloading the template
 * is the supported path in and it is the first thing here.
 */
export function ImportFilePicker({
  fileName,
  onPick,
  onDownloadTemplate,
  disabled,
  templateNote,
  templateLabel = "Unduh template",
  xlsxHint = "Disarankan — kolom kode dikunci sebagai teks, jadi angka nol di depan tidak hilang.",
  csvHint = "Untuk Google Sheets, atau kalau Anda memang memakai CSV.",
  accept = DEFAULT_ACCEPT,
}: {
  fileName: string | null;
  onPick: (file: File) => void;
  onDownloadTemplate: (format: TemplateFormat) => void;
  disabled: boolean;
  /** One line under the template button, on what the template holds. */
  templateNote?: string;
  /** For a download that is the user's own data rather than a blank sheet. */
  templateLabel?: string;
  xlsxHint?: string;
  csvHint?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const compact = !xlsxHint && !csvHint;

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onPick(file);
  };

  return (
    <>
      <div>
        {/*
          ONE BUTTON, TWO FORMATS BEHIND IT. Both are real choices, but only one
          of them is the right default — so the menu states the difference rather
          than leaving two equal-looking buttons for the user to pick between on
          the strength of the file extension alone.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary" disabled={disabled}>
              {templateLabel}
              <ChevronDownIcon className="size-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>

          {/*
            WITHOUT HINTS THE MENU IS TWO SHORT WORDS — it takes the trigger's
            width and a rule between the rows rather than a 288 px box
            (Transfer Stok, 6 Nov 2026).
          */}
          <DropdownMenuContent
            align="start"
            className={
              compact
                ? "min-w-[var(--radix-dropdown-menu-trigger-width)]"
                : "w-72"
            }
          >
            <DropdownMenuItem
              onSelect={() => onDownloadTemplate("xlsx")}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">Excel (.xlsx)</span>
              {xlsxHint && <span className="text-xs text-muted">{xlsxHint}</span>}
            </DropdownMenuItem>

            {compact && <DropdownMenuSeparator />}

            <DropdownMenuItem
              onSelect={() => onDownloadTemplate("csv")}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">CSV (.csv)</span>
              {csvHint && <span className="text-xs text-muted">{csvHint}</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {templateNote && (
          <p className="mt-2 text-xs text-muted">{templateNote}</p>
        )}
      </div>

      {/*
        A label wrapping a hidden input, plus drop handlers on the same box.
        Clicking and dragging land on one element, so there is no state in
        which the outline says "drop here" and the click does nothing.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
          disabled && "opacity-60",
        )}
      >
        <p className="text-sm text-foreground">
          {fileName ? (
            <>
              Terpilih: <span className="font-medium">{fileName}</span>
            </>
          ) : (
            "Tarik file ke sini, atau"
          )}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {fileName ? "Ganti file" : "Pilih file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          aria-label="Pilih file CSV atau Excel"
          onChange={(event) => {
            handleFiles(event.target.files);
            // Cleared so picking the SAME file twice fires `change` again —
            // the natural thing to do after fixing it in Excel.
            event.target.value = "";
          }}
        />
      </div>
    </>
  );
}
