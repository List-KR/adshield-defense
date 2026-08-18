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

스크립트는 웹페이지가 시작될 때 실행되어 Ad-Shield 특유의 광고 초기화 및 재삽입 코드만 감지해 중단합니다. 관련 없는 일반 JavaScript 호출은 원래 동작으로 즉시 넘깁니다.

페이지 로드 후 30초 동안 Ad-Shield 시그니처가 감지되지 않으면 설치했던 JavaScript 훅을 원래 상태로 복구합니다. 시그니처가 한 번이라도 감지된 페이지에서는 광고 재삽입을 계속 막기 위해 훅을 유지합니다.

모든 HTTP 및 HTTPS 웹사이트에서 일찍 실행되어야 감지가 가능하지만, 방문 기록이나 페이지 내용을 저장하거나 외부로 전송하지 않습니다.

## 업데이트

설치한 유저스크립트 관리자가 새 버전을 확인해 자동으로 업데이트합니다. 업데이트가 바로 보이지 않으면 잠시 후 다시 확인하거나 설치 링크에서 재설치해 주세요.

## 문제가 생긴 경우

웹사이트가 정상적으로 동작하지 않으면 adShield Defense를 잠시 끄고 페이지를 새로고침해 보세요. 문제가 사라지면 사이트 주소와 재현 방법을 저장소의 Issue로 알려주세요.

개발 참여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

## 라이선스

이 프로젝트는 [MPL-2.0](./LICENSE)으로 배포됩니다. 핵심 차단 로직은 [FilteringDev/tinyShield](https://github.com/FilteringDev/tinyShield)를 바탕으로 재구성했습니다.
