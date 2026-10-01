import DeploymentTable from "@/components/DeploymentTable";

export default function Home() {
  return (
    <main className="min-h-screen bg-canvas-parchment px-4 py-10 md:px-10">
      <div className="mx-auto max-w-[1600px]">
        <h1
          className="mb-2 font-semibold text-ink"
          style={{ fontSize: 34, lineHeight: 1.2, letterSpacing: "-0.374px" }}
        >
          배포 관리 시스템
        </h1>
        <p className="mb-8 text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-48">
          홈페이지운영 배포관리 목록 — 항목 추가, 검색, 선택 삭제가 가능합니다.
        </p>
        <DeploymentTable />
      </div>
    </main>
  );
}
