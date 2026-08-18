# 기여하기

버그 수정과 Ad-Shield 시그니처 갱신을 환영합니다. 기능을 추가하기 전에 기존 코드로 해결할 수 있는지 먼저 확인해 주세요.

## 개발 환경

- Node.js 24 LTS
- npm

```sh
npm ci
npm run lint
npm test
npm run build
```

빌드 결과는 `dist/tinyShield.user.js`에 생성됩니다. `dist`는 생성물이라 직접 수정하거나 커밋하지 않습니다.

## 변경 방법

1. 런타임 차단 로직은 `src/runtime.js`에서 수정합니다.
2. 유저스크립트 메타데이터와 빌드는 `build.mjs`에서 수정합니다.
3. 동작이 달라지면 `test/runtime.test.mjs`에 가장 작은 회귀 검사를 추가합니다.
4. 위의 lint, test, build 명령을 모두 통과시킨 뒤 Pull Request를 작성합니다.

JavaScript는 저장소의 ESLint 설정을 따릅니다. 세미콜론을 사용하고, 불필요한 의존성이나 추상화는 추가하지 않습니다.

## 배포

배포는 유지관리자가 담당합니다. `main` 브랜치에 push되면 GitHub Actions가 npm의 최신 버전을 기준으로 patch 버전을 자동 생성해 배포합니다. 수동 실행에서는 patch, minor, major 중 하나를 선택할 수 있습니다.

npm trusted publishing에는 이 저장소와 `.github/workflows/publish.yml`이 등록되어 있어야 합니다. jsDelivr purge는 항상 `@latest` 유저스크립트 URL만 대상으로 실행됩니다.

## 라이선스

기여한 코드는 프로젝트와 동일하게 MPL-2.0으로 배포됩니다.

[README로 돌아가기](./README.md)
