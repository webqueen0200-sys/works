"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  COLUMNS,
  Deployment,
  DeploymentInput,
  SEARCH_KEYS,
} from "@/lib/types";
import AddDeploymentModal from "./AddDeploymentModal";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function DeploymentTable() {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("deployments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(
        "데이터를 불러오지 못했습니다. Supabase 연동 환경변수(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)와 테이블 생성 여부를 확인해주세요."
      );
      setRows([]);
    } else {
      setRows((data as Deployment[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      SEARCH_KEYS.some((key) => {
        const value = row[key];
        return value && String(value).toLowerCase().includes(q);
      })
    );
  }, [rows, search]);

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach((r) => next.delete(r.id));
      } else {
        filteredRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAdd = async (input: DeploymentInput) => {
    const payload: Record<string, string | null> = {};
    Object.entries(input).forEach(([k, v]) => {
      payload[k] = v === "" ? null : v;
    });

    const { error } = await supabase.from("deployments").insert(payload);
    if (error) {
      console.error(error);
      throw error;
    }
    // 새 항목이 상단에 보이도록 created_at desc 정렬 기준 재조회
    await fetchRows();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      "삭제하시면 복구할 수 없습니다. 진행하시겠습니까?"
    );
    if (!confirmed) return;

    const ids = Array.from(selected);
    const { error } = await supabase.from("deployments").delete().in("id", ids);
    if (error) {
      console.error(error);
      alert("삭제 중 오류가 발생했습니다.");
      return;
    }
    setSelected(new Set());
    await fetchRows();
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-48 text-[14px]">
              ⌕
            </span>
            <input
              type="text"
              placeholder="업무명, 요청자, RMS NO 등으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-pill border border-black/[0.08] bg-white pl-10 pr-4 text-[14px] text-ink placeholder:text-ink-48 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-focus/30"
            />
          </div>
          <span className="whitespace-nowrap text-[12px] tracking-[-0.12px] text-ink-48">
            {filteredRows.length}건 {search && `(전체 ${rows.length}건 중)`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteSelected}
            disabled={selected.size === 0}
            className="rounded-sm bg-[#ff3b30] px-[15px] py-2 text-[14px] font-normal tracking-[-0.224px] text-white transition active:scale-95 disabled:cursor-not-allowed disabled:bg-ink-48/30 disabled:text-white/70"
          >
            선택 삭제 {selected.size > 0 && `(${selected.size})`}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-pill bg-primary px-[22px] py-[11px] text-[17px] font-normal tracking-[-0.374px] text-white transition hover:bg-primary-focus active:scale-95"
          >
            + 항목 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] tracking-[-0.224px] text-amber-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="min-w-[1800px] w-full border-collapse text-[14px] tracking-[-0.224px]">
          <thead>
            <tr className="border-b border-hairline bg-canvas-parchment text-left text-[12px] font-semibold uppercase tracking-[-0.12px] text-ink-48">
              <th className="sticky left-0 z-10 w-10 bg-canvas-parchment px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  className="accent-primary"
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{ minWidth: col.width }}
                  className="whitespace-nowrap px-3 py-2.5"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-3 py-10 text-center text-[14px] text-ink-48"
                >
                  불러오는 중...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-3 py-10 text-center text-[14px] text-ink-48"
                >
                  {search ? "검색 결과가 없습니다." : "등록된 배포 항목이 없습니다."}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-divider-soft transition-colors hover:bg-canvas-parchment ${
                    selected.has(row.id) ? "bg-primary/[0.06]" : "bg-white"
                  }`}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label="행 선택"
                      className="accent-primary"
                    />
                  </td>
                  {COLUMNS.map((col) => {
                    const value = row[col.key];
                    const display =
                      col.key === "stg_review_at" || col.key === "prod_review_at"
                        ? formatDateTime(value as string | null)
                        : value || "-";
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2.5 align-top text-ink"
                        title={typeof display === "string" ? display : undefined}
                      >
                        <span className="line-clamp-2 whitespace-pre-wrap break-words">
                          {display}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddDeploymentModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAdd}
        />
      )}
    </div>
  );
}
