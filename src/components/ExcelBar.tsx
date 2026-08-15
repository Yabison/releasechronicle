"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportEventsXlsx, importEventsXlsx, type ImportResult } from "@/app/actions/excel";
import type { ExportFilter } from "@/lib/eventExport";
import { useI18n } from "@/i18n/useI18n";
import { actionMessage } from "@/i18n/labels";
import styles from "./ExcelBar.module.css";

export function ExcelBar({ filter }: { filter: ExportFilter }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function download() {
    startTransition(async () => {
      const bytes = await exportEventsXlsx(filter);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `events-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const r = await importEventsXlsx(fd);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className={styles.bar}>
      <button type="button" onClick={download} disabled={pending}>{t("excel.export")}</button>
      <button type="button" onClick={() => fileInput.current?.click()} disabled={pending}>{t("excel.import")}</button>
      <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={onFile} />
      {result?.ok && <span className={styles.ok}>{t("excel.imported", { count: result.count })}</span>}
      {result && !result.ok && (
        <ul className={styles.errors}>
          {result.errors.map((er, i) => (
            <li key={i}>{er.row ? t("excel.rowError", { row: er.row, error: actionMessage(t, er) }) : actionMessage(t, er)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
