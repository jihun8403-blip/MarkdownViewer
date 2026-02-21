## Chrome 확장 프로그램 개발 문서 패키지 (Markdown Viewer v1)

### 1. 목적과 범위

이 확장 프로그램은 로컬의 `.md` 파일을 크롬에서 안정적으로 열어 렌더링하는 “뷰어 전용” 도구이며, 파일 열기(A안: 사용자가 선택), 문서별 프리셋(저장/내보내기/가져오기), 표 렌더 품질, 대용량 문서 안정성(Worker 파싱 + 섹션 분할 렌더 + IndexedDB 캐시), 탭 종료 시 캐시 정리까지를 v1 범위로 한다.

### 2. 핵심 요구사항 정리

사용자가 로컬 파일을 선택해 열 수 있어야 하고, `.md`를 브라우저에서 직접 열었을 때(예: `file:///.../note.md`) 확장 뷰어로 열 수 있도록 “권한/연결 안내 메시지”를 보여줘야 하며, 문서별 스타일 프리셋을 UI에서 만들고 저장하며 JSON으로 export/import가 가능해야 하고, 표는 “보기”만 제대로 되면 되며, 렌더링은 대량 텍스트에서도 백지/튕김 없이 동작해야 하고, 탭을 닫을 때(또는 문서를 닫을 때) 캐시를 정리하여 IndexedDB가 과도하게 쌓이지 않게 해야 한다.

* * *

## 3. 사용자 시나리오와 UX 플로우

### 3.1 시나리오 A: 확장 내부에서 파일 선택(Open File)

사용자가 확장 뷰어 탭(예: `chrome-extension://.../viewer.html`)을 열고 “파일 열기”를 누르면 File System Access API로 `.md` 파일을 선택하고, 선택 직후 “최근 문서”에 등록되며, 렌더는 즉시(캐시가 있으면 캐시 우선) 표시되고, 뒤에서 Worker가 파싱/섹션 캐시를 갱신하며, 문서별 프리셋이 있으면 자동 적용되고 없으면 기본 프리셋이 적용된다.

### 3.2 시나리오 B: 사용자가 `.md`를 크롬에서 직접 열었을 때(file://)

사용자가 크롬에서 `.md` 파일을 직접 열면(혹은 로컬에서 더블클릭으로 크롬이 열림) 확장은 “이 파일을 확장 뷰어로 열까요?” 배너/페이지를 띄우고, 필요한 경우 “파일 URL 접근 허용(Allow access to file URLs)” 토글을 켜야 한다는 안내를 보여주며, 사용자가 “열기”를 누르면 동일 파일을 확장 뷰어에서 열도록 리다이렉트한다(단, file:// 원본 탭에 대한 자동 접근은 제한될 수 있으므로, 안정적으로는 “사용자 재선택” 또는 “링크된 경로 안내 + 파일 재선택”을 제공한다).

### 3.3 시나리오 C: 프리셋 관리

사용자는 “프리셋 관리자”에서 (1) 새 프리셋 생성, (2) 태그별 스타일 편집(H1~H6, P, CODE, PRE, TABLE, TH/TD, BLOCKQUOTE 등), (3) 문서에 프리셋 연결, (4) JSON export/import를 수행하고, 가져오기 시 이름 충돌이면 “덮어쓰기/새 이름으로 저장/건너뛰기” 정책 중 하나를 자동 적용한다(v1에서는 “새 이름으로 저장(자동 suffix)”를 기본값으로 둔다).

* * *

## 4. 기능 요구사항 상세 (FRD)

### FR-01 파일 열기 (A안)

* “파일 열기” 버튼으로 `.md`, `.markdown`, `.mdx(선택)` 파일을 선택할 수 있다.
    
* 선택한 파일은 FileSystemFileHandle을 통해 읽으며, 최근 목록에 기록한다(문서 식별자 포함).
    
* 문서 재열기 시 사용자가 권한을 취소하지 않았다면 재읽기가 가능해야 한다(브라우저 정책상 재권한 요구 가능).
    

### FR-02 `.md`를 직접 열었을 때 권한 확인/안내

* file://로 열린 `.md`에 대해 “뷰어로 열기” CTA를 제공한다.
    
* 확장이 file://에 접근 불가한 상태이면 사용자가 확장 관리 화면에서 토글을 켜야 한다는 안내를 명확히 보여준다(스크린샷/짧은 가이드 텍스트).
    
* 제약: 크롬 정책상 file:// 페이지 내용을 확장이 임의로 읽는 방식은 제한되므로, v1에서는 “사용자 파일 재선택”을 fallback으로 제공한다(“같은 파일 선택하면 이어서 열림”).
    

### FR-03 마크다운 렌더링

* CommonMark 기반으로 렌더하되, 표(GFM 테이블), 코드블록, 인라인 코드, 인용문, 목록, 링크, 이미지, 수평선 정도를 기본 지원한다.
    
* 표 렌더는 `border-collapse`, 적절한 padding, 긴 문자열 줄바꿈, 가로 스크롤 대응을 제공한다.
    
* 보안: 기본적으로 HTML raw 삽입은 비활성화하거나 sanitize한다(로컬 문서라도 스크립트 실행은 막는다).
    

### FR-04 문서별 프리셋

* 프리셋은 “전역 기본 프리셋” + “문서별 오버라이드” 형태로 적용된다.
    
* 연결 방식은 `docId -> presetId` 맵으로 관리하며, 사용자가 문서 탭에서 빠르게 전환 가능해야 한다.
    
* 프리셋 항목은 폰트 패밀리, 기본 글자 크기, 라인하이트, 콘텐츠 폭, 태그별 폰트 크기/굵기/여백, 코드 폰트, 테이블 스타일 등을 포함한다.
    

### FR-05 프리셋 export/import

* export는 JSON 파일로 내려받는다(사용자 저장).
    
* import는 JSON 선택 후 검증(스키마/버전)하고, 문제 있으면 어떤 필드가 왜 실패했는지 메시지를 제공한다.
    
* 프리셋과 문서-프리셋 매핑을 “선택적으로” 포함할 수 있다(v1에서는 둘 다 포함하되, import 옵션에서 매핑 복원 체크박스를 제공).
    

### FR-06 안정성: Worker 파싱 + 섹션 분할 렌더

* Worker가 마크다운을 파싱/토큰화하여 섹션 단위 결과를 만들고, UI는 섹션을 점진적으로 렌더한다.
    
* 섹션 분할 기준은 “헤더 단위(H1~H3)” 우선 + 헤더가 드문 문서는 “N줄 단위”로 fallback 한다.
    
* UI는 “현재 뷰포트 근처 섹션만 DOM에 올리고” 나머지는 placeholder로 유지한다(가상화).
    

### FR-07 IndexedDB 캐시 + 탭 종료 시 정리

* 캐시는 “문서 원문(옵션)” + “섹션별 파싱 결과(필수)”를 저장한다.
    
* 문서를 다시 열면 캐시가 있으면 즉시 화면을 띄우고, 파일의 `lastModified`가 바뀌었으면 백그라운드에서 재파싱 후 섹션별로 갱신한다.
    
* 페이지 unload(탭 닫기) 시 “세션 캐시”를 우선 정리하고, 장기 캐시는 LRU/TTL 정책으로 유지하며, 저장량이 임계치를 넘으면 오래된 문서부터 삭제한다.
    

* * *

## 5. 비기능 요구사항 (NFR)

### 성능

대용량(예: 수 MB~수십 MB 텍스트)에서도 초기 표시가 “즉시(캐시) 또는 수 초 내(최소 첫 섹션)”에 나오고, 스크롤 중 프레임 드랍이 체감되지 않게 섹션 렌더링을 분할하며, 메인 스레드는 파싱을 직접 수행하지 않는다.

### 안정성

파싱 실패/메모리 부족/Worker 크래시가 나도 “백지” 대신 최소한 원문 텍스트 fallback(프리 텍스트 뷰)로 표시하고, 오류 로그/리포트 버튼(로컬 콘솔 로그 복사)을 제공한다.

### 보안

로컬 문서이더라도 스크립트 실행/XSS를 막기 위해 HTML sanitize를 적용하고, 외부 리소스(원격 이미지 등)는 기본 허용하되 사용자가 끌 수 있는 옵션을 제공한다(사내망 문서에서 원격 요청이 보안 이슈일 수 있음).

* * *

## 6. 기술 설계 (TDD)

### 6.1 확장 구조

* `viewer.html / viewer.js`: 렌더링 UI(React 없이도 가능, v1은 Vanilla 또는 Preact 추천).
    
* `options.html / options.js`: 프리셋 관리자, export/import.
    
* `worker/markdown_worker.js`: 마크다운 파싱/섹션 분할/캐시 키 생성.
    
* `lib/markdown-it + plugins`: GFM table 지원 플러그인 포함.
    
* `storage/`: IndexedDB 래퍼(Dexie.js 같은 경량 ORM 사용 가능).
    

### 6.2 Manifest v3 권장 설정(개요)

* `manifest_version: 3`
    
* `action`으로 뷰어 열기
    
* `options_page` 또는 `options_ui`
    
* `permissions`: `storage`(필수), `activeTab`(상황에 따라), `scripting`(file:// 안내 페이지에 주입할 때), `downloads`(export 저장)
    
* `host_permissions`: file:// 접근을 쓰려면 관련 설정이 필요하지만 실제로는 “사용자 토글”에 의존하므로, 안내/flow 중심으로 설계한다.
    
* `web_accessible_resources`: viewer 자원 등
    

### 6.3 문서 식별자(docId) 설계

A안(FileHandle) 기반에서는 “파일 핸들 자체를 직렬화”하기보단, 다음 조합을 docId로 쓴다: `docId = hash( fileName + fileSize + lastModified + (optional) filePathHint )`이며, FileHandle 재사용이 가능하면 별도로 `handleId`를 저장해 “재열기 UX”를 돕고, file:// 진입 시에는 “경로 기반 힌트”를 docId 생성에 포함하되, 최종 오픈은 사용자가 재선택하도록 유도해 docId 매칭(가장 최근 열었던 후보 자동 하이라이트)으로 UX를 매끈하게 만든다.

### 6.4 Worker 메시지 프로토콜

UI → Worker는 `{type: "PARSE_REQUEST", docId, text, settingsHash, splitStrategy}`를 보내고, Worker → UI는 `{type:"PARSE_PROGRESS", docId, sections:[...], done:false}`로 섹션 chunk를 스트리밍하며, 완료 시 `{type:"PARSE_DONE", docId, meta:{toc,...}}`를 보내고, 에러 시 `{type:"PARSE_ERROR", docId, error}`를 보내며, UI는 progress 수신 즉시 화면에 섹션을 append하되 가상화 규칙에 따라 DOM에 올릴 섹션만 유지한다.

### 6.5 섹션 데이터 구조(예시)

각 섹션은 `{sectionId, order, headerLevel, headerText, startOffset, endOffset, html, plainTextPreview}`를 포함하고, 렌더는 `html`을 사용하되 검색/프리뷰/가상화 placeholder에는 `plainTextPreview`를 사용해 빠르게 표시한다.

### 6.6 IndexedDB 스키마(권장)

* `docs` 테이블: `docId(pk)`, `title`, `lastOpenedAt`, `sourceType(fileHandle|fileUrl|paste)`, `fileMeta(size,lastModified,name)`
    
* `sections` 테이블: `[docId+sectionId](pk)`, `docId(index)`, `order`, `html`, `plainTextPreview`, `range(start,end)`, `updatedAt`
    
* `presets` 테이블: `presetId(pk)`, `name`, `version`, `styleJson`, `createdAt`, `updatedAt`
    
* `doc_preset` 테이블: `docId(pk)`, `presetId`
    
* `cache_meta` 테이블: `key(pk)`, `value`(예: totalBytesEstimate, lastCleanupAt)
    

### 6.7 캐시 정책(정리 포함)

* “세션 캐시”: 현재 탭에서만 쓰는 메모리 캐시(섹션 DOM/최근 파싱 결과)는 `beforeunload/pagehide`에서 즉시 해제한다.
    
* “장기 캐시”: IndexedDB에 저장된 섹션은 TTL(예: 30일) + LRU(예: 최근 50문서) + 용량 상한(예: 200MB 추정치) 중 하나라도 초과하면 정리하며, 정리 트리거는 (1) 앱 시작 시, (2) 문서 open 시, (3) 탭 닫기 직전 best-effort 순으로 실행한다.
    
* 브라우저가 unload에서 비동기 작업을 보장하지 않으므로 “탭 닫을 때 정리”는 보조 수단으로 두고, 실질적으로는 “다음 실행 시 정리”가 안전하며, 탭 닫기 이벤트에서는 `navigator.sendBeacon` 같은 네트워크가 아니라 로컬이라 의미가 없으니, v1에서는 `pagehide`에서 “정리 예약 플래그(cache_meta.lastCleanupRequestAt)”를 기록하고, 다음 앱 오픈에서 정리를 실행하는 방식이 가장 안정적이다.
    

* * *

## 7. 화면/컴포넌트 명세

### 7.1 Viewer 화면

상단 바: 파일 열기, 최근 문서, 프리셋 선택 드롭다운, 검색(옵션), 새로고침(재파싱), 캐시 삭제(이 문서) 버튼을 제공하고, 본문은 좌측(옵션) TOC 패널 + 우측 렌더 영역으로 구성하며, 렌더 영역은 섹션 가상화 리스트로 구현한다.

### 7.2 Options(설정) 화면

프리셋 목록(생성/복제/삭제), 프리셋 에디터(태그별 폰트/크기/여백/테이블 스타일), export/import(파일 선택) 섹션, 캐시 정책(문서 수/기간/용량 상한) 섹션, 보안 옵션(원격 이미지 로딩 허용 여부) 섹션을 제공한다.

* * *

## 8. 데이터 포맷 (Preset export/import)

### 8.1 Export JSON 스키마(권장)

`{ "schemaVersion": 1, "exportedAt": "...", "presets": [...], "docPresetMap": [...], "app": {"name":"md-viewer","version":"1.x"} }` 형태로 내보내고, 각 preset은 `{presetId, name, version, styleJson}`를 포함하며, docPresetMap은 `{docId, presetId, docHint:{name,lastOpenedAt}}`를 포함해 import 시 사용자가 매핑 복원을 이해하기 쉽게 만든다.

### 8.2 Import 정책

스키마 버전이 다르면 마이그레이션을 시도하고 실패하면 중단하며, presetId 충돌 시 새 presetId를 발급하고 이름이 같으면 suffix를 붙이며, docId는 환경마다 달라질 수 있으므로 docPresetMap은 “완전 자동 복원”이 아니라 “후보 매칭(파일명 유사/최근 오픈)” 기반으로 사용자에게 적용 여부를 보여주는 UX가 안정적이다(최소 v1에서는 docPresetMap import를 옵션으로 둔다).

* * *

## 9. 테스트 계획

### 기능 테스트

(1) 파일 선택으로 1KB/1MB/10MB/50MB 문서가 열리는지, (2) 캐시가 있을 때 재오픈 속도 개선이 있는지, (3) 프리셋 변경이 즉시 반영되는지, (4) export/import로 프리셋이 동일하게 복원되는지, (5) 표가 다양한 케이스(긴 텍스트, 줄바꿈, 정렬, 다중 라인)에서 깨지지 않는지, (6) file://로 직접 열었을 때 안내/리다이렉트 흐름이 동작하는지(토글 OFF/ON 각각) 를 확인한다.

### 안정성/성능 테스트

Worker 파싱 도중 스크롤/검색/프리셋 변경을 해도 UI가 멈추지 않는지, 섹션 가상화로 DOM 노드 수가 일정 수준 이상 증가하지 않는지, 캐시 정리 정책이 적용되어 IndexedDB 크기가 임계치에서 유지되는지, 그리고 Worker 크래시를 강제로 유도했을 때도 “원문 텍스트 fallback”이 뜨는지 확인한다.

* * *

## 10. 구현 우선순위(권장)

v1은 “파일 선택 → Worker 파싱 → 섹션 점진 렌더 → 프리셋 저장/적용 → IndexedDB 캐시 → 캐시 정리 → file:// 안내 페이지” 순으로 구현하면 리스크가 낮고, 특히 file:// 처리는 크롬 정책 변수로 흔들릴 수 있으니 “안내/가이드 + 재선택 fallback”을 먼저 넣고, 가능한 범위에서만 자동화를 얹는 방향이 안전하다.

* * *

## 11. 완료 정의(DoD)

대용량 문서를 열어도 백지/튕김 없이 최소 첫 화면이 표시되고, Worker 파싱이 진행되는 동안 UI가 부드럽게 동작하며, 표가 보기 좋게 렌더되고, 문서별 프리셋을 만들고 저장/적용/내보내기/가져오기가 가능하며, 캐시가 재오픈 성능을 개선하면서도 일정 수준 이상 쌓이지 않게 정리 정책이 동작하고, `.md`를 직접 열었을 때 “권한/연결 안내 + 뷰어로 열기(최소 재선택)” 경험이 제공되면 v1 완료로 본다.

* * *

## 12. 개발 메모(현실 체크)

탭 닫는 순간에 IndexedDB 삭제 같은 무거운 정리를 “항상 성공”시키는 건 브라우저가 보장하지 않아서, 설계상 “닫을 때도 시도하되, 다음 실행 시 정리로 마무리”가 정답 루트고, file:// 페이지 내용을 확장이 직접 읽는 것도 환경에 따라 제약이 있으니 “권한 안내 + 동일 파일 재선택”을 기본 UX로 두면 개발/배포 둘 다 마음이 편해진다.
