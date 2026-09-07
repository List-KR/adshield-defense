# adShield Defense

Ad-Shield가 차단된 광고를 다시 삽입하거나 차단 방지 검사를 실행하지 못하도록 막는 유저스크립트입니다.

일반적인 광고를 직접 차단하는 도구는 아닙니다. AdGuard 또는 uBlock Origin 같은 광고 차단기와 함께 사용하는 것을 권장합니다.

## 설치

[최신 버전 유저스크립트 설치하기](https://cdn.jsdelivr.net/npm/@list-kr/adshield-defense@latest/dist/tinyShield.user.js)

### iPhone 및 iPad

1. App Store에서 Userscripts 앱을 설치합니다.
2. Safari 설정에서 Userscripts 확장 프로그램을 활성화하고 웹사이트 접근을 허용합니다.
3. 위 설치 링크를 Safari로 연 뒤 Userscripts 확장 메뉴에서 설치합니다.
4. 적용할 웹페이지를 새로고침합니다.

### 다른 유저스크립트 관리자

Tampermonkey 또는 Violentmonkey에서 위 설치 링크를 열어 설치할 수 있습니다. 주된 지원 대상은 iOS 및 iPadOS의 Userscripts입니다.

## 동작 방식

스크립트는 웹페이지가 시작될 때 실행되어 Ad-Shield 특유의 광고 초기화 및 재삽입 코드만 감지해 중단합니다. 동적으로 삽입되는 loader와 재삽입 스크립트는 실행 전에 비활성화하고, 함수 기반 보조 검사는 함수별로 한 번만 수행합니다. WeakMap 검사는 getter를 실행하지 않고 impression 데이터만 확인하며, 타이머는 실행 중인 loader의 출처로 판단합니다.

`data`, `wp-data`, `data-resource`에 담긴 CSS는 별도로 복원합니다. 같은 loader의 토큰 조회와 같은 CSS의 동시 요청을 공유하고, 요청이 5초 동안 완료되지 않으면 다음 호스트를 시도합니다. payload 디코딩 표는 2026-09-07에 확인한 loader 형식과 이전 형식을 지원하며, 형식이 바뀌면 갱신이 필요합니다.

페이지 로드 후 30초 동안 Ad-Shield 시그니처가 감지되지 않으면 설치했던 JavaScript 훅을 원래 상태로 복구하고 DOM 감시도 중단합니다. 시그니처가 한 번이라도 감지된 페이지에서는 광고 재삽입을 계속 막기 위해 훅을 유지합니다.

모든 HTTP 및 HTTPS 웹사이트에서 일찍 실행되어야 감지가 가능하지만, 방문 기록이나 페이지 내용을 저장하거나 외부로 전송하지 않습니다.

## 업데이트

설치한 유저스크립트 관리자가 새 버전을 확인해 자동으로 업데이트합니다. 업데이트가 바로 보이지 않으면 잠시 후 다시 확인하거나 설치 링크에서 재설치해 주세요.

## 문제가 생긴 경우

웹사이트가 정상적으로 동작하지 않으면 adShield Defense를 잠시 끄고 페이지를 새로고침해 보세요. 문제가 사라지면 사이트 주소와 재현 방법을 저장소의 Issue로 알려주세요.

개발 참여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

## 라이선스

이 프로젝트는 [MPL-2.0](./LICENSE)으로 배포됩니다. 2b0ef9a40c2824861e2b11ec395c9c1dce94d4fe 커밋 이전까지의 버전은 [FilteringDev/tinyShield](https://github.com/FilteringDev/tinyShield)를 바탕으로 작성되었습니다. 현재의 탐지·훅 구현은 로더 동작을 분석해 재작성했으며, 기존 기여 이력과 MPL-2.0 고지는 유지합니다.
