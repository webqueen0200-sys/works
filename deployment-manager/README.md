# 배포 관리 시스템

"시트4 배포관리 목록" 구조를 그대로 옮긴 배포 관리 웹앱입니다. Next.js(App Router) +
Supabase로 구성되어 있으며, Vercel의 기존 Supabase 연동 프로젝트에 배포하면 환경변수가
자동으로 연결됩니다.

## 기능

- 시트4와 동일한 컬럼 구성의 목록/테이블
- **+ 항목 추가**: 새 항목은 등록일(created_at) 기준 최신순으로 정렬되어 항상 **맨 위**에 표시됩니다
- **선택 삭제**: 체크박스로 여러 건을 선택 후 삭제 — 클릭 시 "삭제하시면 복구할 수 없습니다. 진행하시겠습니까?" 확인창 노출, 확인해야 실제 삭제됩니다
- **검색**: 업무명 / 요청자 / 기획 / 퍼블리싱 / 개발담당자 / RMS NO / 분류 / 구분 등 주요 필드 통합 검색
- **검수일시**: STG 검수일시·운영 검수일시는 `datetime-local` 입력으로 캘린더(날짜) + 시간 선택을 동시에 지원
- 모든 데이터는 Supabase 테이블(`deployments`)에 저장됩니다

## 1. Supabase 테이블 생성

Supabase 프로젝트의 SQL Editor에서 `supabase/schema.sql` 내용을 그대로 실행하세요.
`deployments` 테이블과 RLS 정책(내부 운영툴 기준으로 anon 키 전체 허용)이 생성됩니다.

> 외부에 URL이 노출될 가능성이 있다면, Supabase Auth 로그인을 붙이고
> RLS 정책을 `authenticated` 사용자만 허용하도록 좁히는 것을 권장합니다.

## 2. 환경변수

로컬에서 테스트하려면 `.env.local.example`을 `.env.local`로 복사한 뒤 값을 채워주세요.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**Vercel에 배포하는 경우**: 이미 Supabase 연동이 등록된 Vercel 프로젝트에 이 코드를
연결(git push 또는 재배포)하면, 위 두 환경변수(또는 Vercel Supabase Integration이
등록한 이름)가 자동으로 주입됩니다. 변수명이 다르게 등록되어 있다면 Vercel
프로젝트 > Settings > Environment Variables 에서 이름을
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 로 맞추거나,
`lib/supabase.ts`에서 읽는 변수명을 실제 등록된 이름으로 바꿔주세요.

## 3. 로컬 실행

```bash
npm install
npm run dev
```

## 4. Vercel 배포

이미 Supabase와 연동된 Vercel 프로젝트가 있다면:

1. 이 코드를 해당 프로젝트에 연결된 Git 저장소로 push
2. Vercel이 자동으로 빌드 & 배포 (Framework: Next.js 자동 감지)
3. 배포 후 바로 `deployments` 테이블 데이터가 로드됩니다

## 컬럼 구성 (시트4 동일)

NO, 배포일, 시간, 배포유형, 분류, 구분, 작업범위, RMS NO, 업무명, 파일목록,
요청자, 기획, 퍼블리싱, 개발담당자, 타서비스 영향도, STG 검수일시, STG 검수자,
운영 검수일시, 운영 검수자, 완료 확인(U+)
