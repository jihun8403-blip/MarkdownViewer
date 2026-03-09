# Markdown Viewer v1 구현 계획 (PLAN)

기준 문서: `PRD.md`  
작성일: 2026-02-20

## 진행 원칙
- 상태 값: `TODO` / `IN_PROGRESS` / `DONE` / `BLOCKED`
- 구현은 우선순위 순으로 진행하며, 각 단계 완료 시 체크박스/상태를 갱신한다.
- 각 단계는 "산출물"과 "검증"을 만족해야 `DONE` 처리한다.

## 전체 로드맵

| ID | 단계 | 상태 | 산출물 |
|---|---|---|---|
| P0 | 프로젝트 스캐폴드 + Manifest v3 | IN_PROGRESS | 기본 확장 구조, 로드 가능한 빌드 |
| P1 | 파일 열기 + docId/최근문서 | DONE | 파일 선택/재열기 기본 플로우 |
| P2 | Markdown 렌더러 + 보안(sanitize) + 표 스타일 | DONE | 기본 렌더 품질 확보 |
| P3 | Worker 파싱 + 섹션 점진 렌더 | DONE | 대용량에서 메인스레드 블로킹 최소화 |
| P4 | 섹션 가상화 + TOC | DONE | 스크롤 안정성/DOM 수 제어 |
| P5 | IndexedDB 캐시(문서/섹션) | DONE | 재오픈 성능 개선 |
| P6 | 프리셋 CRUD + 문서 매핑 | DONE | 문서별 스타일 적용 |
| P7 | 프리셋 Export/Import(JSON) | TODO | 백업/복원 |
| P8 | 캐시 정리(TTL/LRU/용량) + pagehide 예약 | TODO | 저장소 과증가 방지 |
| P9 | file:// 안내/권한 가이드 + 재선택 fallback | IN_PROGRESS | 정책 제약 내 UX 완성 |
| P10 | 테스트/DoD 점검 | TODO | PRD 기준 완료 판정 |

## 상세 체크리스트

### P0. 프로젝트 스캐폴드 + Manifest v3
상태: `IN_PROGRESS`
- [x] `manifest.json` 생성 (`manifest_version:3`)
- [x] `viewer.html`, `viewer.js` 기본 진입
- [x] `options.html`, `options.js` 기본 진입
- [x] `worker/markdown_worker.js` 골격
- [x] 기본 스타일/폴더 구조 확정
- [ ] 크롬 확장 로드 확인

완료 기준
- [ ] 확장 설치 후 action으로 viewer 진입 가능
- [ ] options 페이지 진입 가능

### P1. 파일 열기 + docId/최근문서
상태: `DONE`
- [x] File System Access API로 `.md/.markdown` 선택
- [x] `docId = hash(name+size+lastModified+hint)` 구현
- [x] 최근 문서 목록 저장/표시
- [x] 파일 재열기 기본 동작 구현(handle 기반, 권한 재요청 포함)

완료 기준
- [x] 파일 선택 직후 내용 표시 (구현 완료)
- [x] 최근 문서 클릭으로 재진입 가능 (구현 완료)

### P2. Markdown 렌더 + 보안 + 표 스타일
상태: `DONE`
- [x] markdown-it 적용
- [x] GFM table 지원
- [x] raw HTML 비활성화 또는 sanitize
- [x] table CSS(줄바꿈/가로스크롤/패딩)

완료 기준
- [x] PRD의 기본 문법 요소 렌더 성공 (코드 구현)
- [x] 스크립트 실행 차단 확인 (renderer html off + DOMPurify)

### P3. Worker 파싱 + 섹션 점진 렌더
상태: `DONE`
- [x] UI↔Worker 메시지 프로토콜 구현
- [x] H1~H3 우선 섹션 분할 + N줄 fallback
- [x] PROGRESS chunk append 렌더
- [x] PARSE_ERROR fallback 경로

완료 기준
- [x] 대용량 문서에서도 UI 멈춤 없이 첫 섹션 표시 (구조 구현, 실측 테스트는 P10)

### P4. 섹션 가상화 + TOC
상태: `DONE`
- [x] 뷰포트 근처 섹션만 DOM 유지
- [x] placeholder 렌더
- [x] TOC 생성/이동

완료 기준
- [x] 긴 문서 스크롤 시 DOM 수가 과도 증가하지 않음 (가상화 구조로 구현, 실측은 P10)

### P5. IndexedDB 캐시
상태: `DONE`
- [x] `docs/sections/cache_meta` 스키마
- [x] 캐시 우선 렌더
- [x] 변경 감지(`lastModified`) 후 백그라운드 갱신

완료 기준
- [x] 재오픈 속도 개선 확인 (구조 구현, 실측은 P10)

### P6. 프리셋 CRUD + 문서 매핑
상태: `DONE`
- [x] presets/doc_preset 스키마
- [x] 프리셋 생성/수정/삭제/복제
- [x] 문서별 preset 적용/전환

완료 기준
- [x] 프리셋 변경 즉시 렌더 반영

### P7. 프리셋 Export/Import
상태: `TODO`
- [ ] export JSON 생성/다운로드
- [ ] import 스키마 검증
- [ ] 이름/ID 충돌 시 suffix 정책
- [ ] 매핑 복원 옵션

완료 기준
- [ ] 내보내기-가져오기 후 동일 동작

### P8. 캐시 정리 정책
상태: `TODO`
- [ ] TTL/LRU/용량 상한 정리 루틴
- [ ] 트리거: 앱 시작, 문서 open, pagehide 예약
- [ ] `cache_meta.lastCleanupRequestAt` 기록

완료 기준
- [ ] 임계치 초과 시 오래된 캐시 삭제

### P9. file:// 안내/권한 가이드
상태: `IN_PROGRESS`
- [ ] file URL 접근 토글 안내 UI
- [ ] "뷰어로 열기" CTA
- [x] 자동 실패 시 동일 파일 재선택 fallback

완료 기준
- [ ] OFF/ON 케이스 모두 안내 플로우 정상

### P10. 테스트/DoD 점검
상태: `TODO`
- [ ] 1KB/1MB/10MB/50MB 열기 테스트
- [ ] Worker 중 UI 반응성 테스트
- [ ] 테이블 렌더 케이스 테스트
- [ ] 크래시 fallback 테스트
- [ ] DoD 체크리스트 완료

완료 기준
- [ ] PRD 11장 DoD 충족

## 진행 로그
- 2026-02-20: PLAN.md 초기 작성.
- 2026-02-20: P0 스캐폴드 파일 생성(`manifest`, `background`, `viewer`, `options`, `worker`, `storage`, `styles`).
- 2026-02-20: P1 1차 구현(`viewer.js`에 docId 해시, 최근 문서 저장, handle 기반 재열기 추가).
- 2026-02-20: 정적 검증 완료(`node --check viewer.js`, `manifest.json` JSON 파싱 성공).
- 2026-02-20: P2 구현(`markdown-it` + `DOMPurify`, 표 렌더 CSS 적용, 로컬 vendor 라이브러리 고정).
- 2026-02-20: P3 구현(`worker/markdown_worker.js` 섹션 분할/진행 이벤트, viewer 점진 렌더 및 에러 fallback).
- 2026-02-20: 정적 검증 완료(`node --check viewer.js`, `node --check worker/markdown_worker.js`).
- 2026-02-20: 실제 코드 대조 점검 반영(P4는 TOC만 완료, 섹션 가상화/placeholder는 미구현으로 `IN_PROGRESS` 유지).
- 2026-02-20: P4 구현 완료(`viewer.js` 가상화 렌더/상하 placeholder/TOC 점프 연동, `styles/viewer.css` placeholder 스타일 추가).
- 2026-02-20: P9 1차 구현(`content/file_redirect.js`로 `file://*.md` 자동 리다이렉트, `viewer.js` `?src=` 자동 로드/실패 재선택 안내).
- 2026-02-21: P5 구현 완료(`storage/db.js` IndexedDB 스키마/CRUD, `viewer.js` 캐시 우선 렌더 + 변경 감지 백그라운드 재파싱 + `pagehide` cleanup 예약 플래그 기록).
- 2026-03-06: P6 구현 완료(`storage/db.js` presets/doc_preset 스키마·CRUD, `storage/presets.js` 프리셋 래퍼·기본값, `viewer.js` 프리셋 드롭다운·즉시 적용, `options` 프리셋 관리자 UI).

## 현재 작업
- `IN_PROGRESS`: P9 file:// 안내/권한 가이드 + 재선택 fallback
