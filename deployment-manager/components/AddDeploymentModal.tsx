"use client";

import { useState } from "react";
import { DeploymentInput, emptyDeploymentInput } from "@/lib/types";

interface Props {
  onClose: () => void;
  onSubmit: (input: DeploymentInput) => Promise<void>;
}

const FIELD_GROUPS: {
  title: string;
  fields: { key: keyof DeploymentInput; label: string; type: string }[];
}[] = [
  {
    title: "기본 정보",
    fields: [
      { key: "no", label: "NO", type: "text" },
      { key: "deploy_date", label: "배포일", type: "date" },
      { key: "deploy_time", label: "시간", type: "time" },
      { key: "deploy_type", label: "배포유형 (정기/비정기)", type: "text" },
      { key: "category", label: "분류", type: "text" },
      { key: "work_type", label: "구분", type: "text" },
      { key: "scope", label: "작업범위", type: "text" },
      { key: "rms_no", label: "RMS NO", type: "text" },
    ],
  },
  {
    title: "업무 내용",
    fields: [
      { key: "task_name", label: "업무명", type: "text" },
      { key: "file_list", label: "파일목록", type: "textarea" },
      { key: "impact", label: "타서비스 영향도", type: "textarea" },
    ],
  },
  {
    title: "담당자",
    fields: [
      { key: "requester", label: "요청자", type: "text" },
      { key: "planner", label: "기획", type: "text" },
      { key: "publisher", label: "퍼블리싱", type: "text" },
      { key: "developer", label: "개발담당자", type: "text" },
    ],
  },
  {
    title: "검수",
    fields: [
      { key: "stg_review_at", label: "STG 검수일시", type: "datetime-local" },
      { key: "stg_reviewer", label: "STG 검수자", type: "text" },
      { key: "prod_review_at", label: "운영 검수일시", type: "datetime-local" },
      { key: "prod_reviewer", label: "운영 검수자", type: "text" },
      { key: "confirm_up", label: "완료 확인(U+)", type: "text" },
    ],
  },
];

export default function AddDeploymentModal({ onClose, onSubmit }: Props) {
  const [form, setForm] = useState<DeploymentInput>(emptyDeploymentInput());
  const [saving, setSaving] = useState(false);

  const handleChange = (key: keyof DeploymentInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.task_name?.trim()) {
      alert("업무명은 필수 입력입니다.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* No drop-shadow on chrome per the design system — the modal reads
          purely through the dimmed backdrop and a hairline border. */}
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-hairline bg-white p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2
            className="font-semibold text-ink"
            style={{ fontSize: 21, lineHeight: 1.19, letterSpacing: "0.231px" }}
          >
            배포 항목 추가
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-chip-translucent/60 text-ink transition active:scale-95"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="space-y-7">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-[14px] font-semibold tracking-[-0.224px] text-ink-80">
                {group.title}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <div
                    key={f.key}
                    className={f.type === "textarea" ? "sm:col-span-2" : ""}
                  >
                    <label className="mb-1.5 block text-[12px] tracking-[-0.12px] text-ink-48">
                      {f.label}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        className="w-full rounded-sm border border-hairline px-3 py-2 text-[14px] tracking-[-0.224px] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-focus/30"
                        rows={2}
                        value={form[f.key] ?? ""}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        type={f.type}
                        className="w-full rounded-sm border border-hairline px-3 py-2 text-[14px] tracking-[-0.224px] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-focus/30"
                        value={form[f.key] ?? ""}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex justify-end gap-2 border-t border-divider-soft pt-5">
          <button
            onClick={onClose}
            className="rounded-pill border border-primary px-[22px] py-[11px] text-[17px] tracking-[-0.374px] text-primary transition active:scale-95"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-pill bg-primary px-[22px] py-[11px] text-[17px] tracking-[-0.374px] text-white transition hover:bg-primary-focus active:scale-95 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
