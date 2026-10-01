-- 배포 관리 시스템 테이블 (시트4 "배포관리 목록" 구조 동일)
create extension if not exists "pgcrypto";

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  no text,                      -- NO
  deploy_date date,             -- 배포일
  deploy_time time,             -- 시간
  deploy_type text,             -- 배포유형 (정기/비정기)
  category text,                -- 분류 (소상공인/기업 등)
  work_type text,               -- 구분 (배포/BO반영 등)
  scope text,                   -- 작업범위 (퍼블만/개발포함 등)
  rms_no text,                  -- RMS NO
  task_name text,               -- 업무명
  file_list text,               -- 파일목록
  requester text,               -- 요청자
  planner text,                 -- 기획
  publisher text,               -- 퍼블리싱
  developer text,               -- 개발담당자
  impact text,                  -- 타서비스 영향도
  stg_review_at timestamptz,    -- STG 검수일시
  stg_reviewer text,            -- STG 검수자
  prod_review_at timestamptz,   -- 운영 검수일시
  prod_reviewer text,           -- 운영 검수자
  confirm_up text,              -- 완료 확인(U+)
  created_at timestamptz not null default now()
);

-- 최신 등록 건이 위로 오도록 생성일 기준 인덱스
create index if not exists deployments_created_at_idx
  on public.deployments (created_at desc);

-- RLS 활성화
alter table public.deployments enable row level security;

-- 내부 운영툴 용도: anon 키로 전체 CRUD 허용
-- (사내 전용으로만 접근 가능하다면 이대로 사용하고,
--  외부에 URL이 노출될 가능성이 있다면 Supabase Auth 로그인 연동 후
--  정책을 "authenticated 사용자만 허용"으로 좁히는 것을 권장합니다.)
drop policy if exists "Allow all for anon" on public.deployments;
create policy "Allow all for anon"
  on public.deployments
  for all
  using (true)
  with check (true);
