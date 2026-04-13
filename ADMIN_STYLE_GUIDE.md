# 관리자(Admin) UI 스타일 가이드 (범용)

이 문서는 **Tailwind CSS**만으로 구성한 **관리 콘솔형 웹 UI**를 새 프로젝트에 옮기거나, 디자인 시스템 없이도 **톤·간격·패턴을 통일**할 때 참고할 수 있도록 정리한 레퍼런스입니다. 특정 제품명·저장소 경로에 의존하지 않으며, **Next.js 여부와 무관**하게 동일한 유틸리티 클래스 조합을 적용할 수 있습니다.

---

## 1. 기술 전제 (권장 기본값)

| 항목 | 권장 |
|------|--------|
| 스타일 | **Tailwind CSS v3** (`@tailwind base/components/utilities`) |
| 폰트 | **시스템 폰트** (`system-ui`, `-apple-system`, `sans-serif`) |
| 색상 | **Tailwind 기본 팔레트** (gray, blue, green, amber, red, purple, slate 등). 커스텀 primary 토큰을 추가하면 아래 수치와 시각적 균형이 달라질 수 있음 |

**이식 시**: 위와 같이 맞추면 문서의 클래스 문자열이 **그대로** 재현에 가깝게 동작합니다.

---

## 2. 전역 레이아웃·바디

루트(또는 최상위 레이아웃)의 `<body>` 예시:

```html
<body class="bg-gray-50 text-gray-900 antialiased">
```

| 클래스 | 역할 |
|--------|------|
| `bg-gray-50` | 관리 화면 **콘텐츠 영역 배경** (사이드바는 보통 별도 `gray-800`) |
| `text-gray-900` | 본문 기본 글자색 |
| `antialiased` | OS 폰트 렌더링 다듬기 |

**`globals.css` 최소 예시**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
```

- **`@layer components`에 거대한 프리셋을 두지 않는 방식**을 권장 → 화면은 유틸리티 조합으로 명시적으로 유지.

---

## 3. 앱 셸: 사이드바 + 메인

프레임워크에 관계없이 **“왼쪽 내비 + 오른쪽 본문”** 패턴의 권장 구조입니다.

### 3.1 최상위 래퍼

```txt
div.flex.min-h-screen
```

- 전체 화면 최소 높이, 가로 **플렉스**: 왼쪽 `aside` + 오른쪽 `main`.

### 3.2 사이드바 접힘 시 — 햄버거(열기)

**조건**: 사이드바가 닫힌 상태일 때

| 요소 | 클래스 |
|------|--------|
| 버튼 | `fixed left-2 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-md border border-gray-600 bg-gray-800 text-white shadow-md hover:bg-gray-700` |
| 접근성 | 예: `aria-label="메뉴 보기"` |

**햄버거 아이콘** (세 줄 막대)

- 컨테이너: `flex flex-col justify-center gap-1.5`
- 각 막대: `block h-0.5 w-5 rounded-sm bg-current` (`current` = 버튼의 `text-white`)

### 3.3 사이드바(`aside`)

| 상태 | 클래스 |
|------|--------|
| 공통 | `flex flex-col bg-gray-800 text-white transition-[width,margin] duration-200` |
| 열림 | `w-56 pl-4 pr-4 pt-4 pb-4` (**너비 14rem**) |
| 닫힘 | `w-0 overflow-hidden p-0` |

### 3.4 사이드바 헤더(열림 시)

```txt
div.mb-4.flex.items-center.justify-between.gap-2.pl-0.5.pr-0.5
  h2.min-w-0.flex-1.truncate.text-base.font-semibold  → 앱/섹션 제목
  button (닫기)
```

**닫기 버튼**: `flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white hover:bg-gray-700`, `aria-label="메뉴 숨기기"` 등.

### 3.5 내비게이션

- 컨테이너: `nav.flex-1.space-y-1`

**아코디언 그룹 헤더(버튼)**

```txt
w-full flex items-center justify-between rounded px-3 py-2 text-left text-sm font-semibold bg-gray-900/30 hover:bg-gray-700
```

- 펼침 표시: `span.text-xs.text-gray-300` 에 `▲` / `▼` 문자.

**그룹 내 링크**

```txt
block rounded px-3 py-2 pl-5 text-sm
```

- 활성(현재 경로): `bg-gray-700`
- 비활성: `hover:bg-gray-700` 만 (배경 없음)

**단일 링크(예: 설정)**

```txt
block rounded px-3 py-2
```

- 동일하게 활성 `bg-gray-700`, 비활성 `hover:bg-gray-700`.

**로그아웃·하단 보조 링크**

```txt
mt-4 text-sm text-gray-300 hover:text-white
```

### 3.6 메인 영역(`main`)

```txt
flex-1 overflow-auto transition-[margin] duration-200
```

| 조건 | 추가 클래스 (예시) |
|------|---------------------|
| 일반 관리 페이지 | `p-6` |
| 대시보드·맵 등 **전체 폭**이 필요한 경로 | 해당 라우트만 `p-0` 등으로 분기 |
| 사이드바 닫힘 | `ml-14` (햄버거 `w-10` + `left-2` 여유에 맞춤) |

---

## 4. 페이지 공통 패턴

### 4.1 페이지 제목(`h1`)

```txt
h1.text-xl.font-semibold.mb-4
```

**부제가 있는 경우**

- 제목: `mb-2`
- 부제: `p.text-sm.text-gray-600.mb-4`

### 4.2 상단 설명 문단

```txt
p.text-sm.text-gray-600.mb-4
```

- 강조 일부: `span.ml-1.font-medium.text-gray-800`
- 인라인 코드·필드명: `<code>...</code>` (프로젝트에서 `prose` 또는 `font-mono`를 추가해도 됨)

### 4.3 필터·툴바 한 줄(목록 페이지)

**가장 흔한 패턴**

```txt
div.flex.flex-wrap.gap-2.mb-4.items-center
```

**여백을 조금 더 줄 때**

```txt
div.flex.gap-2.mb-6.items-center.flex-wrap
```

- 내부에 `input` / `select` / `button` / 링크 / `label` 을 나란히 배치.

### 4.4 로딩 문구

단순 텍스트:

```txt
<p>로딩 중...</p>
```

(스피너·스켈레톤은 프로젝트 정책에 맞게 선택.)

---

## 5. 폼 컨트롤

### 5.1 기본 텍스트 입력·셀렉트 (목록 필터·짧은 폼)

공통 베이스:

```txt
border rounded px-2 py-1
```

**폭 제어(자주 쓰는 값)**

| 용도 | 예시 클래스 |
|------|-------------|
| 짧은 검색 | `w-28`, `w-32`, `w-36`, `w-40`, `w-48` |
| 전체 폭(모달/편집) | `w-full` |
| 숫자 짧음 | `w-16`, `w-24` |

**날짜/시간 네이티브 컨트롤**

```txt
input type="date"   → border rounded px-2 py-1
input type="time"   → border rounded px-2 py-1 w-full (그리드 셀 안)
input type="datetime-local" → border rounded px-2 py-1 w-full
```

### 5.2 로그인·강조 폼 입력 (패딩 약간 큼)

```txt
w-full border rounded px-3 py-2
```

### 5.3 설정형 페이지 — 블록 라벨

- 라벨: `label.block.mb-2`
- 도움말: `p.text-sm.text-gray-500.mt-1`

### 5.4 편집·모달 — 작은 회색 라벨

```txt
label.block.text-sm.text-gray-600.mb-1
```

### 5.5 읽기 전용 필드

입력 베이스에 추가:

```txt
bg-gray-50
```

### 5.6 체크박스

```txt
input type="checkbox" className="rounded"
```

**라벨과 한 줄**

```txt
label.flex.items-center.gap-2.cursor-pointer
```

또는 `gap-1.5`, 보조 텍스트에 `text-sm.font-medium`.

### 5.7 폼 세로 간격

- 넓은 설정 폼: `form.max-w-sm.space-y-6`
- 일반 편집: `form.max-w-md.space-y-4`
- 모달 본문: `div.space-y-3`

---

## 6. 버튼

### 6.1 Primary (저장·확인·주요 CTA)

```txt
bg-blue-600 text-white px-4 py-2 rounded
```

툴바에서 조금 작게:

```txt
bg-blue-600 text-white px-3 py-1.5 rounded text-sm
```

로그인 제출 예:

```txt
w-full mt-4 bg-blue-600 text-white py-2 rounded
```

**비활성**: `disabled:opacity-50`  
**로딩**: 버튼 텍스트만 `저장 중...` 등으로 교체.

### 6.2 보조 / 취소 (테두리만)

```txt
border rounded px-4 py-2
```

모달 하단: `flex justify-end gap-2` 와 조합.

### 6.3 목록 상단 “추가” 등 강조 링크·버튼

```txt
bg-blue-600 text-white px-3 py-1.5 rounded text-sm
```

### 6.4 성공·긍정 계열

```txt
bg-green-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50
```

### 6.5 주의·운영 액션

```txt
bg-amber-600 text-white px-4 py-2 rounded disabled:opacity-50
```

### 6.6 엑셀·중립 액션

```txt
border rounded px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50
```

### 6.7 아주 약한 보조

```txt
border rounded px-2 py-1 bg-gray-50 text-sm
```

### 6.8 윤곽 강조(보조 CTA)

```txt
border rounded px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700
```

### 6.9 다크 서브 액션 (로그·원시 데이터 등)

```txt
bg-gray-700 text-white px-3 py-1.5 rounded text-sm
```

### 6.10 강조 2차 액션(예: 외부 연동)

```txt
bg-purple-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50
```

### 6.11 모달 헤더 닫기(텍스트만)

```txt
text-gray-500
```

(배경 없는 `button`)

### 6.12 인라인 테이블 액션 (`button`)

```txt
text-blue-600 underline
```

### 6.13 테이블 내 `Link` 스타일(“수정” 등)

```txt
text-blue-600 text-sm
```

### 6.14 뒤로가기·브레드크럼

```txt
text-blue-600
```

예: `← 목록으로`

---

## 7. 테이블

### 7.1 메인 데이터 그리드

```txt
table.border-collapse.border.w-full
```

**헤더 행**

```txt
thead tr.bg-gray-100
```

**셀**

```txt
th|td.border.p-2
```

- 정렬: `text-center`, `align-middle`, `align-top`
- 좁은 컬럼: `w-16`, `w-20` 등

### 7.2 텍스트 크기 축소

```txt
table ... text-sm
```

또는 밀집 표: `text-xs`

### 7.3 모달 내 스크롤 테이블 래퍼

```txt
div.border.rounded.max-h-72.overflow-auto
```

긴 이력:

```txt
div.max-h-[60vh].overflow-auto.border.rounded
```

### 7.4 정렬 가능 헤더

```txt
th.border.p-2.cursor-pointer.select-none
```

- 정렬 표시: 헤더 텍스트 뒤에 ` ▲` / ` ▼` 문자열.

### 7.5 행 상태

| 의미 | 클래스 |
|------|--------|
| 비활성/제외 행 | `bg-gray-100 text-gray-500` |
| 호버 하이라이트(클릭 가능 행) | `cursor-pointer hover:bg-blue-50` |
| 펼친 상세 영역 | `tr.bg-slate-50` |
| 경고 셀 배경 | `bg-yellow-100` |

### 7.6 코드·ID 표시

```txt
font-mono text-xs
```

---

## 8. 콜아웃·알림

**규칙·주의(amber)**

```txt
div.bg-amber-50.border.border-amber-200.rounded.p-3.text-sm.mb-4
```

내부 제목은 `strong` 등으로 구분.

**성공 한 줄**

```txt
p.text-green-700
```

**에러·실패**

```txt
text-red-600
```

**중립 피드백**

```txt
text-sm text-gray-700
```

---

## 9. 모달(오버레이) 패턴

### 9.1 구조

1. **오버레이**: `fixed inset-0 bg-black/40 flex items-center justify-center p-4`
2. **패널**: `bg-white rounded-lg shadow-lg w-full` + `max-w-lg` | `max-w-2xl` | `max-w-3xl` | `max-w-4xl`
3. **패딩**: `p-4`
4. 오버레이 클릭 시 닫기: 오버레이에 `onClick`, 패널에 `onClick`에서 전파 중단(`stopPropagation`)

### 9.2 z-index 계층 (중첩 모달)

같은 숫자 체계를 유지하면 **겹침 순서**를 예측하기 쉽습니다.

| 단계 | z-index 클래스 (예) |
|------|---------------------|
| 1단 모달 | `z-50` |
| 2단 | `z-[60]` |
| 3단 | `z-[70]` |
| 4단 | `z-[80]` |

### 9.3 모달 제목

```txt
h3.text-lg.font-semibold.mb-3
```

### 9.4 보조 설명(모달 상단)

```txt
p.text-xs.text-gray-600.mb-2
```

### 9.5 JSON·로그 프리뷰

```txt
pre.text-xs.bg-gray-50.p-2.rounded.overflow-auto
```

---

## 10. 로그인(앱 셸 밖)

앱 셸(사이드바) 없이 **단독 카드**로 두는 패턴.

- 전체: `min-h-screen flex items-center justify-center`
- 카드: `w-full max-w-xs border rounded-lg p-6 shadow bg-white`
- 제목: `text-xl font-semibold mb-4`
- 필드 간격: `space-y-3`
- 에러: `text-red-600 text-sm mt-2`

---

## 11. 이미지·썸네일

**아바타·썸네일(정사각)**

```txt
img.w-10.h-10.object-cover.rounded
```

---

## 12. 그리드(모달 내부 2열 등)

```txt
div.grid.grid-cols-2.gap-3
```

---

## 13. 이식 체크리스트

1. **Tailwind** 설치 및 `content`에 소스 경로 포함.
2. **전역**: `body`에 `bg-gray-50 text-gray-900 antialiased`, 폰트는 `system-ui` 계열.
3. **앱 셸**: `gray-800` 사이드 `w-56`, `main` `p-6`, 접힘 시 `ml-14` + 고정 햄버거(위 §3).
4. **페이지 제목** `text-xl font-semibold mb-4` 통일.
5. **필터바** `flex flex-wrap gap-2 mb-4 items-center`.
6. **표** `border-collapse border w-full` + 헤더 `bg-gray-100` + 셀 `border p-2`.
7. **Primary** `bg-blue-600 text-white … rounded`, 비활성 `disabled:opacity-50`.
8. **모달** `bg-black/40` + 흰 패널 `rounded-lg shadow-lg` + 필요 시 `z-50`~`z-[80]`.
9. 브랜드 전용 색을 과도하게 넣기보다, 우선 **gray / blue / green / amber / red / purple / slate** 로 톤을 맞춘 뒤 필요 시 점진적으로 확장.

---

## 14. 프로젝트에 맞게 채울 참조 테이블 (템플릿)

아래는 **본 저장소에 실제 경로를 적어 두는 용도**의 빈 템플릿입니다. 복사 후 팀 규칙에 맞게 수정하세요.

| 영역 | 이 프로젝트의 경로/컴포넌트명 |
|------|-----------------------------|
| 셸·사이드바 | |
| 전역 CSS | |
| 루트 레이아웃 | |
| 로그인 | |
| 설정 폼 | |
| 목록 + 표 + 필터 | |
| 필터 + 중첩 모달 | |
| 정렬·콜아웃·복잡 표 | |
| 편집 폼 | |

---

*문서는 **Tailwind 유틸 조합** 중심의 범용 가이드입니다. 실제 코드베이스의 레이아웃·토큰이 바뀌면 §14에 반영하거나, 팀 위키에 링크해 동기화하는 것을 권장합니다.*
