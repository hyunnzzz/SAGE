## YouTube Investment Video Credibility Analyzer

AI 기반 유튜브 투자 영상 신뢰성 분석 시스템입니다. 유튜브 영상의 스크립트를 분석하여 사기 패턴을 감지하고, 종목 정보를 DART/공식 데이터로 검증하며, 업로더 신분도 확인합니다. 크롬 확장프로그램과 로컬 백엔드(Flask)로 구성됩니다.

## Tech Stack
- **Backend**: Python, Flask(CORS), Hugging Face Inference API(DeepSeek V3)
- **Frontend**: Chrome Extension (Manifest V3)
- **APIs**: DART API, Serper API, Hugging Face API
- **Database**: Firebase Realtime DB(신고 집계), JSON/NPY 캐시
- **AI/ML**: Sentence Transformers, scikit-learn

## 폴더 구조
```
LLM/                    # 백엔드 서버 및 AI 로직
  app.py                # Flask API 서버 (비동기/폴링 포함)
  main.py               # 통합 시스템 초기화(LLM, RAG, Web, Stock 등)
  llm_handler.py        # DeepSeek 호출, 업로더 신분 검증, 최종 분석 생성
  pdf_processor.py      # PDF RAG(청크/임베딩/검색, 캐시 지원)
  web_searcher.py       # Serper 기반 신뢰도 필터 웹검색
  stock_checker.py      # DART(부채비율), 투자주의/경고/위험, 예비심사 검증
  historical_checker.py # 업로드 시점/현재 시점 비교 분석
  recommend_video.py    # 키워드 기반 영상 추천
  script_cleaner.py     # 경량 스크립트 정제
  requirements.txt      # 파이썬 의존성

extension/              # 크롬 확장프로그램 (YouTube content script)
  manifest.json         # MV3, host 권한 및 CSP 포함
  content.js            # 유튜브 페이지에서 스크립트 추출/표시
  background.js         # Firebase 신고 집계 관리
  modules/              # UI, Firebase 핸들러
  styles/               # 오버레이 스타일
  images/               # 로딩 이미지
```


### 사전 준비
- 권장 Python: 3.10+ (Windows 10/11 확인)
- `LLM/requirements.txt` 설치 필요


### 의존성 설치 및 서버 실행
```bash
cd LLM
pip install -r requirements.txt
python app.py
```



### 데이터/RAG 준비(선택)
- PDF RAG: `LLM/pdfs/` 폴더에 PDF를 넣으면 서버 기동 시 자동 로드됩니다(캐시: `LLM/cache/`).
- 종목 검증: `LLM/data/` 경로에 다음 파일이 있을 경우 정확도가 높아집니다.
  - `제도권금융회사_전처리.csv`
  - `유사투자자문업자_전처리.csv`
  - `투자주의종목_3년.xls`, `투자경고종목_3년.xls`, `투자위험종목_3년.xls`
- DART 기업코드(`corpCode.xml`)는 자동 다운로드/캐시됩니다.




# 1) Backend Server 실행

1. API 키 설정(3개)
API 할당량 초과시 main.py 파일에서 다음 값들을 새로운 API 키로 설정해야 함
각 홈페이지 방문 시 무료 발급 가능

- HF_TOKEN (HuggingFace)
- serper_api_key (Serper)
- dart_api_key (DART)


2. 서버 실행
명령 프롬프트(터미널)에서 LLM폴더 경로 설정 후

python app.py 
입력



## 2) Chrome Extension 테스트
1. 크롬 주소창에 `chrome://extensions/` 이동
2. 우측 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭 후 `extension/` 폴더 선택
4. YouTube 접속 후 투자 관련 영상에서 동작 확인

# 주의 #
- 확장 프로그램 로드 직후 첫 시도에서 UI가 보이지 않으면 새로고침하세요.

메모:
- 백엔드가 `http://localhost:5000`에서 실행 중이어야 합니다. `manifest.json`의 `host_permissions`/`CSP`에 해당 주소가 이미 포함되어 있습니다.
- 신고 집계는 Firebase Realtime DB(`background.js`)를 사용합니다(프로젝트 설정 포함).

## 구현상 체크리스트(놓친 부분 점검)
- **의존성 파일**: `LLM/requirements.txt` 추가됨. 새 환경에서 바로 설치 가능
- **프레임워크 표기**: 백엔드는 FastAPI가 아닌 Flask 사용. README/문서 표기 정정 완료
- **API 키 관리**: 실제 운영 시 `LLM/main.py`의 하드코딩 키 제거하고 `.env` 기반으로 수정 권장
- **RAG 캐시**: `LLM/cache/`에 청크/임베딩 캐시 저장. 배포 환경에서는 쓰기 권한 필요
- **데이터 파일**: `LLM/data/` 내 전처리 CSV/XLS 파일 존재 여부 확인 필요
- **포맷 유효성**: 날짜는 `YYYY-MM-DD` 형식 필수(서버에서 검증)
- **엔드포인트 합의**: 확장프로그램이 사용하는 엔드포인트(주로 `/start_analysis` → `/status`)가 실행 환경과 일치하는지 확인

## 트러블슈팅
- 분석이 지연/실패: HF/Serper/DART 키의 쿼터를 확인하고 교체(환경변수 업데이트) 후 재시도
- PDF RAG 미동작: `LLM/pdfs/`에 PDF가 있나 확인. 최초 처리 시 시간이 다소 걸릴 수 있음
- 종목 정보 미검출: DART 기업코드 캐시(`LLM/cache/corpCode.xml`) 갱신 후 재시도
- 확장 UI 미표시: 유튜브 페이지를 새로고침하거나 백엔드 서버 상태(`/health`) 확인

