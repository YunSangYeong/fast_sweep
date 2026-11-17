# Liquidity Sweep Precision Scanner V1.0

Bybit USDT 무기한 선물의 확정 15분봉을 분석하는 정적 React + TypeScript 앱입니다. API 키, 자동 주문, 가짜 기본 결과는 없습니다. 기존 저장소는 제목만 있는 README 상태였으므로 새로 구현했습니다. 기존 1파 탐지기의 코드·스크린샷은 제공되지 않아 모바일 다크 카드 UI로 구성했습니다.

## 실행

Node.js 22 이상 권장 (이 환경에서 Node 24로 검증).

```sh
npm ci
npm run dev
```

`전체 시장 검색 시작`을 누르면 거래 가능한 LinearPerpetual / USDT 종목 목록을 모든 페이지에서 수집하고 24시간 거래대금 1천만 USDT 이상 종목을 검색합니다. 시장 구분 기본값은 **코인만**입니다. `코인만 / 주식만 / 전체`를 선택할 수 있으며 대상 수는 봉 조회 전에 표시됩니다. 시장 구분 변경 시 기존 결과를 초기화하므로 다시 검색하세요. Bybit 공식 `symbolType` 기준으로 빈 값·`innovation`은 코인, `stock`은 주식 연동 선물로 구분합니다. `전체`에는 원자재·외환·ETF 및 기타 유형도 포함됩니다. 실제 주식 현물이 아닌 Bybit USDT 무기한 선물이 대상이며, 거래대금 기준은 모든 시장에 동일하게 적용됩니다. 방향·점수·최근 단계·거래량·정렬은 수집된 결과에 즉시 적용됩니다. 거래대금이나 API 주소를 변경한 경우 다시 검색하세요. 검색 중지는 진행 중 요청을 취소하며 부분 결과로 표시합니다.

```sh
npm test
npm run build
npm run preview
# 선택: 브라우저 설치 후 모바일/데스크톱 통합 테스트
npx playwright install chromium
npm run test:e2e
```

홈 디렉터리 쓰기가 제한된 Cloud 환경에서는 `npm ci --cache /tmp/fast-sweep-npm-cache` 및 `PLAYWRIGHT_BROWSERS_PATH=/tmp/fast-sweep-browsers npx playwright install chromium`, 동일 변수를 지정한 `npm run test:e2e`를 사용합니다. 이미 설치된 Chromium은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`로 사용할 수 있습니다.

## 계산 규칙과 시간

- API 봉을 UTC 오름차순으로 정렬하고 미확정 봉을 제외합니다. 중복·중간 누락·최신 확정 봉 누락·비정상 OHLC·부족한 이력은 오류 처리합니다. 종목별 250봉을 요청합니다. 화면 시각은 KST입니다. 봉 시각은 시작 시각, 단계 확정 시각은 해당 봉의 마감 시각입니다.
- Wilder ATR(14), 스윕 피벗 좌우 3봉, MSS 피벗 좌우 2봉. 피벗 확정 인덱스가 스윕보다 앞서야 합니다. 직전 50봉 내 가장 최근에 확정된 돌파 피벗을 기준으로 한 방향당 한 이벤트를 생성합니다. 동일 복귀 구간 중복을 억제합니다.
- 이탈한 봉부터 3봉 뒤까지 종가 복귀를 허용합니다. 이 기간의 최저/최고 극값으로 이탈폭 ATR 0.1~1.5배를 검사합니다. ATR 기준은 스윕 직전 봉입니다. Equal Highs/Lows는 서로 다른 확정 피벗 간 ATR 0.2배 이내입니다.
- 거래량은 스윕 직전 20봉 평균 및 모집단 표준편차로 배율·Z-score를 계산합니다. 표준편차 0이면 Z-score 0입니다. 거래량은 기본적으로 가점이며 ON 필터는 1.5배 이상을 요구합니다.
- MSS는 스윕 전에 확정된 반대 피벗을 스윕 이후 1~8봉 내 종가로 돌파해야 합니다. 복귀 이전의 돌파는 사용하지 않습니다.
- FVG는 세 봉 모두 스윕 봉 이후(포함)에 있는 패턴 중 MSS+3봉 이내 첫 유효 갭을 선택합니다. 갭 크기는 형성 봉 ATR의 0.15배 이상. MSS와 FVG 형성이 모두 완료된 다음 봉부터 갭 영역과 고저 범위가 겹치면 리테스트로 인정합니다. 동일 이벤트는 최초 선택한 FVG를 유지합니다.
- 단계 전환은 스윕 뒤 최대 20봉까지만 허용합니다. 최근 N봉 필터는 마지막 단계 전환 봉을 사용합니다. 이후 가격 움직임으로 과거 단계를 소급 변경하지 않습니다. Stage 4는 리테스트 사실을 뜻하며 체결이나 현재 유효성을 보장하지 않습니다.
- 점수는 25 + 거래량(15/8/0) + Equal(10) + MSS(25) + FVG(15) + 리테스트(10). 100점은 승률 100%를 의미하지 않습니다.
- 유효 FVG 중간값 진입, 스윕 극값 ± ATR×0.2 손절, RR 1:2 목표. 위험폭·양수 가격 검증을 통과한 계획만 가격선을 표시합니다. 현재 티커 가격이 SL/TP를 넘으면 기회 경과 표시합니다. 과거에 SL/TP를 통과했다 돌아온 이력이나 실제 체결 여부는 판단하지 않습니다. 현재가는 검색 시작 시 수집한 티커 스냅샷입니다.
- 차트: 실제 최근 100봉, 피벗 점, 스윕 기준선, SWEEP/MSS 라벨, 반투명 FVG, 진입/SL/TP. 차트는 화면 진입 시 지연 생성하며 드래그·확대할 수 있습니다.

## 통신 및 선택형 프록시

직접 연결 기본값은 `https://api.bybit.com`입니다. 동시 3요청, 요청 간 대기, 429/5xx/Bybit 10006/일시 네트워크 오류 재시도(최대 4회, 지수 백오프), 20초 요청 제한, 취소를 지원합니다. 종목 일부가 실패해도 계속 검색하고 실패 목록을 보여줍니다. 오류를 '조건 충족 종목 없음'으로 표시하지 않습니다.

**이 개발 환경에서 직접 Bybit 요청은 egress 프록시의 CONNECT 403으로 차단되었습니다. 따라서 실제 브라우저 교차 출처 fetch도 `TypeError: Failed to fetch`로 실패했습니다. 실제 Bybit 수집과 Bybit 자체의 CORS 허용 여부는 검증되지 않았습니다. 이 결과는 Bybit 자체 CORS 정책의 증거가 아닙니다.** 클라우드에서 실제 수집 검증에는 네트워크 설정의 `api.bybit.com` 허용이 필요합니다. GitHub Pages 이용자의 네트워크와 지역에 따라서도 접근이 달라질 수 있습니다.

직접 연결이 불가능하면 `worker/`의 Cloudflare Worker를 별도로 배포할 수 있습니다. 인증 우회 용도가 아니며 해당 서비스의 접근 가능 지역·이용 조건을 확인하세요.

1. `worker/wrangler.toml`의 `ALLOWED_ORIGIN`을 실제 Pages origin으로 설정합니다 (경로·끝 슬래시 제외).
2. Cloudflare 계정에서 `cd worker && npx wrangler deploy` 실행. Worker는 읽기 전용 시장 API 3개 경로만 허용하며 사용자 인증 정보는 받지 않습니다.
3. 앱의 **API 연결 설정**에 Worker origin을 입력하고 재검색합니다. URL은 브라우저 localStorage에 저장됩니다.
4. Worker가 있는 지역에서도 Bybit가 접근 불가능하면 오류가 그대로 전달됩니다. 공개 프록시 운영 시 Cloudflare 측 Rate Limit/남용 방지를 추가하세요.

Worker 배포 및 실제 프록시 수집은 수행하지 않았습니다. 앱 자체에 서버는 필요 없습니다.

## 검증과 과거 데이터 리플레이

`tests/engine.test.ts`는 합성 캔들로 롱/숏, 미복귀 제외, 미확정 봉, 피벗 확정 지연, MSS/FVG 순서, 리테스트, 중복, 데이터 누락, 최근 단계 필터, RR, API 오류·페이지네이션·취소를 검사합니다. `e2e/`는 통제된 API 응답을 이용해 실제 UI·엔진·차트 연결과 오류 표시를 모바일/데스크톱에서 검증합니다. 제품 실행 중에는 테스트 응답을 사용하지 않습니다.

실제 과거 데이터 리플레이는 `tests/historical.test.ts`에서 지원합니다:

```sh
HISTORICAL_CANDLES=/absolute/path/btc-15m.json npm test
```

JSON 배열 형식은 `{ "time": 1800000000000, "open": 100, "high": 102, "low": 99, "close": 101, "volume": 1000 }`이며 `time`은 UTC 밀리초, 15분 정렬·연속 데이터 100봉 이상이어야 합니다. 과거 데이터가 제공되지 않으면 이 테스트만 명시적으로 skip됩니다. 매 봉의 prefix만 입력해 미래 참조 없이 단계 확정·사실 불변성을 확인하며 수익률이나 승률을 추정하지 않습니다. 실제 과거 데이터 검증은 아직 미완료입니다.

## GitHub Pages 배포

`.github/workflows/deploy.yml`은 main push 또는 수동 실행 시 `npm ci` → 단위 테스트 → 타입 검사/빌드 → Pages artifact 업로드 → 배포를 수행합니다. 저장소 **Settings → Pages → Source: GitHub Actions**를 선택하세요. `base: './'`로 저장소 하위 경로에서도 정적 자산을 불러옵니다. main에 푸시하면 이 워크플로가 자동 배포합니다.

## 구조

- `src/api.ts`: Bybit 수집, 페이지네이션, 재시도, 취소
- `src/indicators.ts`: Wilder ATR, 확정 지연 피벗
- `src/engine.ts`: 스윕/MSS/FVG/점수/거래 계획
- `src/Chart.tsx`: Lightweight Charts v5와 FVG 오버레이
- `src/main.tsx`, `src/style.css`: 반응형 검색 UI
- `tests/`, `e2e/`: 단위·리플레이·브라우저 검증
- `worker/`: 선택형 별도 배포 프록시

개발 작업은 기존 체크아웃에서 진행하면 됩니다. 각 클라우드 작업은 이미 격리되어 있으므로 별도 Git worktree를 만들 필요가 없습니다.
