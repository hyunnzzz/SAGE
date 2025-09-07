// content.js
// 우측 사이드바 오버레이 + 기존 자막 추출 + 신고 누적 블러 처리

// Firebase 신고 관련 유틸리티 함수들
function getVideoId() {
  const url = new URL(location.href);
  return url.searchParams.get('v');
}

async function requestFirebase(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response);
    });
  });
}

let fraudOverlay = null;
let extractedSubtitles = '';
let currentVideoData = null;
let analysisResult = null;
// 신고 기능 모듈 import

let isAnalyzing = false;

// 블러 오버레이 관련 변수들
let blurOverlay = null;

// URL 변경 감지 및 타이머 관련 변수들
let lastUrl = location.href;
let urlObserver = null;
let overlayCreationTimeout = null;
let linkWarningTimeout = null;
let videoCheckInterval = null;  // 비디오 체크 인터벌

/**
 * 비디오 페이지의 분석과 오버레이 처리를 담당하는 함수
 * @returns {Promise<boolean>} 처리 성공 여부
 */
async function processVideo() {
  console.log('🔍 processVideo 함수 호출됨');
  
  const video = document.querySelector('video');
  if (!video) {
    console.log('비디오 요소를 찾을 수 없음');
    return false;
  }
  
  if (video.readyState < 1) {
    console.log('⏳ 비디오 로딩 중... readyState:', video.readyState);
    return false;
  }

  console.log('비디오 준비됨, readyState:', video.readyState);

  try {
    console.log('🎥 비디오 처리 시작');
    
    // 1. 블러 체크
    console.log('maybeBlur 호출 중...');
    const result = await maybeBlur();
    console.log('maybeBlur 완료:', result);
    
    // 2. 분석창 생성
    console.log('분석창 생성 대기 중...');
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('createFraudDetectionOverlay 호출');
        createFraudDetectionOverlay();
        console.log('분석창 생성 시도 완료');
        resolve();
      }, 500); // 0.5초로 단축
    });

    // 3. 블러 처리
    if (result && result.needsBlur) {
      console.log('블러 처리 필요');
      try {
        await createBlurOverlay();
        console.log('블러 오버레이 생성 완료');
      } catch (blurError) {
        console.error('블러 오버레이 생성 실패:', blurError);
      }
    } else {
      console.log('블러 처리 불필요');
    }

    console.log('processVideo 완료');
    return true;
  } catch (error) {
    console.error('processVideo 오류:', error);
    return false;
  }
}

// 유튜브 페이지 처리를 담당하는 메인 함수
async function handleVideoPage() {
  console.log('handleVideoPage 시작');
  
  // 기존 타이머들 정리
  if (videoCheckInterval) {
    console.log('🧹 기존 videoCheckInterval 정리');
    clearInterval(videoCheckInterval);
    videoCheckInterval = null;
  }
  if (overlayCreationTimeout) {
    clearTimeout(overlayCreationTimeout);
    overlayCreationTimeout = null;
  }
  if (linkWarningTimeout) {
    clearTimeout(linkWarningTimeout);
    linkWarningTimeout = null;
  }

  console.log('⏰ 비디오 체크 인터벌 설정');
  
  // 링크 경고 시스템 초기화 (페이지 로딩 후 실행)
  setTimeout(() => {
    initLinkWarningSystem();
  }, 2000);
  
  // 비디오 요소 체크 인터벌 설정 (더 빠른 체크)
  videoCheckInterval = setInterval(async () => {
    console.log('🔄 인터벌 체크 중...');
    try {
      const success = await processVideo();
      if (success) {
        console.log('processVideo 성공 - 인터벌 정리');
        if (videoCheckInterval) {
          clearInterval(videoCheckInterval);
          videoCheckInterval = null;
        }
      } else {
        console.log('⏳ processVideo 실패 - 계속 체크');
      }
    } catch (error) {
      console.error('인터벌 처리 중 오류:', error);
    }
  }, 500); // 0.5초로 단축
  
  console.log('handleVideoPage 완료');
}

// 커뮤니티 모듈 변수들
let communityUI = null;
let communityData = null;
let isMenuExpanded = false;
let currentView = 'analysis';
let currentVideoId = null;
let commentsUnsubscribe = null;


// 기존 자막 추출 코드
let subtitleData = null;

/**
 * 페이지 초기화를 담당하는 함수
 * 페이지 로드 완료를 기다리고 필요한 초기화 작업을 수행
 */
async function initialize() {
  console.log('initialize 시작');
  
  // 페이지가 아직 완전히 로드되지 않은 경우 대기
  if (document.readyState !== 'complete') {
    console.log('⏳ 페이지 로드 대기 중... readyState:', document.readyState);
    await new Promise(resolve => {
      window.addEventListener('load', resolve);
    });
    // 추가 대기 시간 (더 빠른 시작)
    console.log('⏰ 추가 0.5초 대기');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('페이지 로드 완료');

  try {
    // Storage Access API 오류 방지
    console.log('🔧 Storage Access API 설정');
    preventStorageAccessErrors();
    
    // YouTube 비디오 페이지인 경우 처리
    if (window.location.href.includes('youtube.com/watch')) {
      console.log('🎥 YouTube 비디오 페이지 감지됨');
      console.log('📍 현재 URL:', window.location.href);
      await handleVideoPage();
    } else {
      console.log('📍 YouTube 비디오 페이지가 아님:', window.location.href);
    }
  } catch (error) {
    console.error('초기화 중 오류 발생:', error);
  }
  
  console.log('initialize 완료');
}

// 초기화 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // DOMContentLoaded 이벤트에서 async 함수를 직접 호출
    (async () => {
      try {
        await initialize();
      } catch (error) {
        console.error('초기화 중 오류:', error);
      }
    })();
  });
} else {
  // 이미 로드된 경우 async 함수를 직접 호출
  (async () => {
    try {
      await initialize();
    } catch (error) {
      console.error('초기화 중 오류:', error);
    }
  })();
}

// 페이지 로드 대기 함수
function waitForFullLoad() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', () => {
        // 추가 대기 시간을 0.5초로 단축
        setTimeout(resolve, 500);
      });
    }
  });
}

// Storage Access API 오류 방지 함수
function preventStorageAccessErrors() {
  try {
    // document.requestStorageAccessFor 호출을 가로채서 조용히 실패시킴
    if (typeof document.requestStorageAccessFor === 'function') {
      const originalRequestStorageAccessFor = document.requestStorageAccessFor;
      document.requestStorageAccessFor = function(...args) {
        return Promise.reject(new Error('Storage access prevented by extension'));
      };
    }
    
    // Storage Access API 오류와 CORS 오류를 캐치하여 조용히 처리
    const originalConsoleError = console.error;
    console.error = function(...args) {
      const message = args.join(' ');
      if (message.includes('requestStorageAccessFor') || 
          message.includes('Must be handling a user gesture') ||
          message.includes('Permission denied') ||
          message.includes('Access to fetch') ||
          message.includes('CORS policy') ||
          message.includes('googleads.g.doubleclick.net')) {
        // Storage Access API 및 CORS 관련 오류는 무시
        return;
      }
      originalConsoleError.apply(console, args);
    };
    
    console.log('Storage Access API 및 CORS 오류 방지 설정 완료');
  } catch (error) {
    console.warn('Storage Access API 오류 방지 설정 실패:', error);
  }
}

// URL 변경 감지 (유튜브 SPA 특성)

// 기존 observer가 있으면 제거
if (urlObserver) {
  urlObserver.disconnect();
}

// URL 변경을 처리하는 함수
async function handleUrlChange(newUrl) {
  if (newUrl === lastUrl) return;
  lastUrl = newUrl;
  
  // 기존 타이머들 정리
  if (overlayCreationTimeout) {
    clearTimeout(overlayCreationTimeout);
    overlayCreationTimeout = null;
  }
  if (linkWarningTimeout) {
    clearTimeout(linkWarningTimeout);
    linkWarningTimeout = null;
  }
  
  if (newUrl.includes('youtube.com/watch')) {
    await handleVideoPage();
  } else {
    cleanupOverlay();
    clearLinkWarnings();
    // 블러 오버레이도 제거
    if (blurOverlay) {
      blurOverlay.remove();
      blurOverlay = null;
    }
  }
}

// URL 변경 감지를 위한 MutationObserver 설정
urlObserver = new MutationObserver(async () => {
  try {
    await handleUrlChange(location.href);
  } catch (error) {
    console.error('URL 변경 처리 중 오류:', error);
  }
});

urlObserver.observe(document, {subtree: true, childList: true});

// 오버레이 완전 정리 함수
function cleanupOverlay() {
  if (fraudOverlay) {
    // 기존 타이머들 정리
    if (overlayCreationTimeout) {
      clearTimeout(overlayCreationTimeout);
      overlayCreationTimeout = null;
    }
    if (linkWarningTimeout) {
      clearTimeout(linkWarningTimeout);
      linkWarningTimeout = null;
    }
    
    // DOM에서 제거
    if (document.contains(fraudOverlay)) {
      fraudOverlay.remove();
    }
    fraudOverlay = null;
    
    console.log('오버레이 완전 정리 완료');
  }
}

// 로딩 상태 HTML 업데이트 (이미지 슬라이드쇼 포함)
// 전역 변수
let currentAnalysisResult = null;
let originalAnalysisResult = null; // 원본 분석 결과 객체 저장용

// 분석 결과 설정 함수
function setAnalysisResult(result) {
  currentAnalysisResult = result;
  
  // 분석 결과에서 신뢰도 정보 추출
  let credibility = null;
  let fraudWarnings = [];

  try {
    // result가 객체인 경우
    if (result && typeof result === 'object') {
      if (result.analysis && result.analysis.keyPoint) {
        credibility = {
          level: result.analysis.keyPoint.credibility || '보통'
        };
        fraudWarnings = result.analysis.keyPoint.fraudWarnings || [];
      }
    } 
    // result가 문자열인 경우
    else if (typeof result === 'string') {
      // KEY_POINT 섹션에서 신뢰도 정보 추출
      const keyPointMatch = result.match(/신뢰도:\s*(\S+)/);
      if (keyPointMatch) {
        credibility = {
          level: keyPointMatch[1]
        };
      }

      // 경고 사항 추출
      const warningMatches = result.match(/(?:위험 요소|주의 사항|경고):\s*([^\n]+)/g);
      if (warningMatches) {
        fraudWarnings = warningMatches.map(warning => warning.split(/:\s*/)[1].trim());
      }
    }

    console.log('분석 결과 처리:', { credibility, fraudWarnings });
    
    // 신고 버튼 상태 업데이트
    updateReportButtonState(credibility, fraudWarnings);
  } catch (error) {
    console.error('분석 결과 처리 중 오류:', error);
    console.log('처리 실패한 결과:', result);
  }
}

// 신고 버튼 HTML 생성 함수
function createReportButtonHTML() {
  return `
    <button id="reportBtn" class="control-btn" title="신고하기">
      🚨
    </button>
  `;
}

// 신고 버튼 상태 업데이트 함수
function updateReportButtonState(credibility, fraudWarnings = []) {
  const reportBtn = fraudOverlay.querySelector('#reportBtn');
  if (!reportBtn) return;

  // 기존 상태 클래스 제거
  reportBtn.classList.remove('alert-high', 'alert-medium');
  
  if (credibility) {
    const level = credibility.level || '보통';
    
    // 신뢰도가 낮음일 때만 경고 효과 적용
    if (level === '낮음') {
      reportBtn.classList.add('alert-high');
    }
    
    // 툴팁 업데이트
    const warningCount = fraudWarnings.length;
    reportBtn.title = warningCount > 0 ? 
      `신고하기 (${warningCount}개의 위험 요소 발견)` : 
      '신고하기';
  }
}

// DOM 요소가 나타날 때까지 대기하는 유틸리티 함수
async function waitForElement(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`요소를 찾을 수 없음: ${selector}`);
}

// DOM 요소가 특정 텍스트를 포함할 때까지 대기하는 유틸리티 함수
async function waitForElementWithText(selector, text, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (element.textContent.includes(text)) {
        return element;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`텍스트 "${text}"를 포함하는 요소를 찾을 수 없음: ${selector}`);
}

// 신고 모달 열기 함수
async function openReportModal() {
  try {
    console.log('신고 모달 열기 시작...');

    // 1. 메뉴 버튼 찾기 (여러 선택자 시도)
    const menuButton = await (async () => {
      const selectors = [
        'ytd-menu-renderer button[aria-label="추가 작업"]',
        'ytd-menu-renderer button.yt-spec-button-shape-next--icon-button',
        '#top-level-buttons-computed button:last-child'
      ];

      for (const selector of selectors) {
        try {
          const button = await waitForElement(selector);
          if (button) {
            console.log(`메뉴 버튼 찾음: ${selector}`);
            return button;
          }
        } catch (error) {
          console.log(`메뉴 버튼 선택자 시도 실패: ${selector}`);
        }
      }
      throw new Error('메뉴 버튼을 찾을 수 없습니다.');
    })();

    // 2. 메뉴 버튼 클릭
    menuButton.click();
    console.log('메뉴 버튼 클릭됨');
    await new Promise(resolve => setTimeout(resolve, 300));

    // 3. 신고 메뉴 찾기
    const reportMenu = await waitForElementWithText(
      'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ytd-menu-popup-renderer tp-yt-paper-item',
      '신고'
    );
    console.log('신고 메뉴 찾음');

    // 4. 신고 메뉴 클릭
    reportMenu.click();
    console.log('신고 메뉴 클릭됨');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. 신고 대화상자 및 스팸 옵션 찾기
    const dialog = await waitForElement('tp-yt-paper-dialog');
    console.log('신고 대화상자 찾음');

    // 6. 모든 라디오 버튼과 라벨 찾기
    const radioButtons = dialog.querySelectorAll('input[type="radio"]');
    console.log(`${radioButtons.length}개의 라디오 버튼 발견`);

    // 7. 스팸 라디오 버튼 찾기
    const spamRadio = await (async () => {
      for (const radio of radioButtons) {
        const label = dialog.querySelector(`label[for="${radio.id}"]`);
        if (label && (label.textContent.includes('스팸') || label.textContent.includes('혼동을 야기'))) {
          console.log('스팸 옵션 발견:', label.textContent.trim());
          return radio;
        }
      }
      throw new Error('스팸 신고 옵션을 찾을 수 없습니다.');
    })();

    // 8. 스팸 옵션 클릭
    spamRadio.click();
    console.log('스팸 옵션 클릭됨');
    await new Promise(resolve => setTimeout(resolve, 300));

    // 9. 다음 버튼 찾고 클릭
    const nextButton = await (async () => {
      const selector = 'button.yt-spec-button-shape-next--filled';
      let button;
      let attempts = 0;
      while (attempts < 20) {
        button = dialog.querySelector(`${selector}:not([disabled])`);
        if (button && (button.textContent.includes('다음') || button.textContent.includes('Next'))) {
          return button;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      throw new Error('활성화된 다음 버튼을 찾을 수 없습니다.');
    })();

    nextButton.click();
    console.log('다음 버튼 클릭됨');

    // 세부정보 입력창 찾기
    let detailsTextarea;
    const startTime = Date.now();
    
    const textareaPromise = new Promise((resolve) => {
      const observer = new MutationObserver((mutations, obs) => {
        const textarea = document.querySelector('textarea[placeholder*="세부정보"], .ytStandardsTextareaShapeTextarea');
        if (textarea) {
          obs.disconnect();
          resolve(textarea);
        }
        if (Date.now() - startTime > 3000) {
          obs.disconnect();
          resolve(null);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'placeholder']
      });
    });

    detailsTextarea = await Promise.race([
      textareaPromise,
      new Promise(resolve => {
        const checkExisting = () => {
          const textarea = document.querySelector('textarea[placeholder*="세부정보"], .ytStandardsTextareaShapeTextarea');
          if (textarea) resolve(textarea);
        };
        checkExisting();
        setTimeout(checkExisting, 100);
      })
    ]);

    if (detailsTextarea) {
      console.log('세부정보 입력창 찾음');
      
      if (currentAnalysisResult) {
        try {
          console.log('===== 신고 근거 작성 디버깅 =====');
          console.log('originalAnalysisResult 내용:', originalAnalysisResult);
          
          let reportText = '신고 근거:\n\n';
          
          // 원본 분석 결과 객체 사용
          let analysisData = originalAnalysisResult;
          if (!analysisData || !analysisData.analysis) {
            console.log('원본 분석 결과가 없음, 기본 텍스트 사용');
            throw new Error('분석 결과가 없습니다.');
          }
          
          const analysis = analysisData.analysis;
          console.log('사용할 분석 텍스트:', analysis);
          
          // 분석이 완료되지 않은 상태인지 확인
          if (analysis.includes('분석 중입니다') || analysis.includes('loading') || analysis.includes('로딩')) {
            console.log('분석이 아직 완료되지 않음, 기본 텍스트 사용');
            throw new Error('분석이 아직 완료되지 않았습니다.');
          }
          
          // 신뢰성 판단 근거만 추출
          let credibilityReasons = [];
          
          // "평가 근거:" 부분만 정확히 추출
          const evaluationPattern = /평가\s*근거[:\s]*([^•\n]+)/i;
          const evaluationMatch = analysis.match(evaluationPattern);
          
          if (evaluationMatch) {
            const reason = evaluationMatch[1].trim();
            if (reason && !reason.includes('분석 중') && reason.length > 10) {
              credibilityReasons.push(reason);
            }
          }
          
          if (credibilityReasons.length > 0) {
            reportText += credibilityReasons[0]; // 첫 번째(유일한) 평가 근거만 사용
          } else {
            // 평가 근거를 찾지 못한 경우 기본 내용
            reportText += '분석이 진행되지 않았습니다. 직접 작성해주세요';
          }
          
          reportText = reportText.slice(0, 1000);
          
          detailsTextarea.value = reportText;
          detailsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          detailsTextarea.scrollTop = 0;
          
          console.log('신고 근거 입력 완료:', reportText);
        } catch (error) {
          console.error('신고 근거 입력 중 오류:', error);
        }
      } else {
        console.log('분석 결과가 없어 기본 신고 내용을 사용합니다.');
        const defaultReportText = 
`신고 근거:

1. 투자 관련 위험성
- 해당 영상은 투자/주식 관련 정보를 제공하고 있으나, 적절한 위험 고지나 근거가 부족합니다.
- 투자의 위험성에 대한 설명이 불충분하며, 수익만을 강조하는 경향이 있습니다.

2. 콘텐츠 신뢰성 문제
- 주장하는 내용에 대한 객관적인 근거나 출처가 제시되지 않았습니다.
- 투자 조언이 구체적인 데이터나 분석 없이 제시되고 있습니다.

3. 투자자 보호 관점
- 시청자들이 잘못된 투자 판단을 할 수 있는 위험이 있습니다.
- 투자 위험성에 대한 충분한 설명 없이 투자를 유도하는 것으로 보입니다.

신고 사유: 시청자 피해 예방을 위해 해당 콘텐츠의 검토가 필요합니다.`;

        detailsTextarea.value = defaultReportText;
        detailsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        detailsTextarea.scrollTop = 0;
        console.log('기본 신고 내용 입력 완료');
      }

      // 10. 최종 "신고/제출" 버튼 클릭 시 Firebase 카운트 증가 연결
      try {
        const attachFinalSubmitListener = async () => {
          const findFinalSubmitButton = () => {
            // 오직 최종 신고 버튼의 내부 피드백 요소만 대상으로 함
            const fills = Array.from(
              dialog.querySelectorAll('.yt-spec-touch-feedback-shape__fill')
            );
            for (const fillEl of fills) {
              // 해당 fill이 속한 실제 클릭 가능한 상위 컨테이너 확인
              const clickable = fillEl.closest(
                'button, tp-yt-paper-button, ytd-button-renderer, yt-button-shape, [role="button"]'
              );
              if (!clickable) continue;
              const text = (clickable.textContent || '').trim();
              if (!text) continue;
              // '다음/Next'는 제외하고, 최종 제출 성격의 텍스트 매칭
              const isSubmitLike = /신고|제출|Report|Submit/i.test(text) && !/다음|Next/i.test(text);
              const isDisabled = (
                clickable.disabled === true ||
                clickable.getAttribute && (clickable.getAttribute('disabled') !== null || clickable.getAttribute('aria-disabled') === 'true')
              );
              if (isSubmitLike && !isDisabled) {
                // fill 요소 자체를 반환하여, 해당 영역을 눌렀을 때만 동작하도록 제한
                return fillEl;
              }
            }
            return null;
          };

          let attempts = 0;
          while (attempts < 30) { // 최대 6초(200ms x 30)까지 탐색
            const submitFill = findFinalSubmitButton();
            if (submitFill) {
              if (!submitFill.dataset.sageReportBound) {
                submitFill.dataset.sageReportBound = '1';
                // 캡처 단계에서 리스너 연결하여 유튜브 내부 핸들러보다 먼저 실행 보장 시도
                submitFill.addEventListener(
                  'click',
                  () => {
                    try {
                      const reasonText = detailsTextarea && detailsTextarea.value ? detailsTextarea.value : '';
                      afterUserSubmittedReport(reasonText);
                      console.log('최종 신고 버튼 클릭 감지됨: Firebase 신고 카운트 증가 요청 전송');
                    } catch (e) {
                      console.error('최종 신고 버튼 클릭 처리 중 오류:', e);
                    }
                  },
                  true
                );
                console.log('최종 신고 버튼 리스너 연결 완료');
              }
              return true;
            }
            await new Promise((r) => setTimeout(r, 200));
            attempts++;
          }
          console.warn('최종 신고 버튼을 찾지 못했습니다. 사용자가 직접 제출 시 카운트 연동이 누락될 수 있습니다.');
          return false;
        };

        await attachFinalSubmitListener();
      } catch (e) {
        console.error('최종 신고 버튼 리스너 연결 실패:', e);
      }
    } else {
      console.error('세부정보 입력창을 찾을 수 없습니다.');
    }

    return true;
  } catch (error) {
    console.error('신고 모달 열기 실패:', error);
    alert('신고 기능을 여는데 실패했습니다. 직접 신고 버튼을 눌러주세요.');
    return false;
  }
}

async function createFraudDetectionOverlay() {
  console.log('createFraudDetectionOverlay 시작');
  
  // 중복 생성 방지
  if (fraudOverlay && document.contains(fraudOverlay)) {
    console.log('사기탐지 오버레이가 이미 존재합니다.');
    return;
  }
  
  // 기존 오버레이 완전 정리
  cleanupOverlay();
  
  let sidebar;
  try {
    console.log('🔍 사이드바 찾는 중...');
    sidebar = await findYouTubeSidebar();
    if (!sidebar) {
      console.error('사이드바를 찾을 수 없습니다.');
      return;
    }
    console.log('사이드바 찾기 성공');
  } catch (error) {
    console.error('사이드바 찾기 실패:', error);
    return;
  }

  console.log('오버레이 HTML 생성 중...');
  fraudOverlay = document.createElement('div');
  fraudOverlay.id = 'fraud-detection-overlay';
  fraudOverlay.innerHTML = `
    <div class="overlay-header">
      <div class="service-title-container" id="serviceTitle" style="position: relative;">
        <span class="service-title">분석 리포트</span>
        <span class="dropdown-arrow" id="dropdownArrow">▼</span>
        
        <!-- 드롭다운 메뉴 (처음에는 숨김) -->
        <div class="dropdown-menu" id="dropdownMenu" style="display: none;">
          <div class="dropdown-item active" data-menu="credibility">
            <div class="dropdown-icon">🔍</div>
            <div class="dropdown-content">
              <div class="dropdown-title">분석 리포트</div>
              <div class="dropdown-subtitle">영상 내용이 신뢰 가능한 정보인지 확인</div>
            </div>
            <div class="menu-check">✓</div>
          </div>
          
          <div class="dropdown-item" data-menu="community">
            <div class="dropdown-icon">💬</div>
            <div class="dropdown-content">
              <div class="dropdown-title">커뮤니티</div>
              <div class="dropdown-subtitle">영상 시청자들과 의견 공유</div>
            </div>
          </div>
          
          <div class="dropdown-item" data-menu="recommendations">
            <div class="dropdown-icon">📺</div>
            <div class="dropdown-content">
              <div class="dropdown-title">관련 정보 제공</div>
              <div class="dropdown-subtitle">해당 영상과 관련된 KB 정보 제공</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="close-minimize"></div>
    </div>

    <div class="overlay-content" id="overlayContent">
      <!-- 기존 로딩 상태를 이것으로 교체 -->
      <div class="loading-state" id="loadingState">
        <div class="loading-images">
          <img id="loadingImage" alt="분석 중" />
        </div>
        <div class="loading-spinner"></div>
        <div class="loading-step" id="loadingStep">종목 추출 중입니다.</div>
      </div>

      <!-- 기존 분석 완료 상태와 에러 상태는 그대로 유지 -->
      <div id="analysisResult" style="display: none;">
        <!-- 기존 탭 UI 내용 그대로 -->
        <!-- 탭 버튼들 -->
        <div class="tab-buttons">
          <button class="tab-btn" data-tab="summary">summary</button>
          <button class="tab-btn active" data-tab="keypoint">key point</button>
          <button class="tab-btn" data-tab="detail">detail info</button>
        </div>

        <!-- 탭 내용들 -->
        <div class="tab-content">
          <!-- Summary 탭 -->
          <div class="tab-panel" id="summaryTab">
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-card-title">언급 종목</div>
                <div class="tag-container" id="mentionedStocks">
                  <!-- 동적으로 채워짐 -->
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-card-title">주요 키워드</div>
                <div class="tag-container" id="keywordTags">
                  <!-- 동적으로 채워짐 -->
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-card-title">시사점</div>
                <div class="insights-text" id="insights">
                  <!-- 동적으로 채워짐 -->
                </div>
              </div>
            </div>
          </div>

          <!-- Key Point 탭 -->
          <div class="tab-panel active" id="keypointTab">
            <!-- 신뢰도 정보 (최상단) -->
            <div class="credibility-card" id="credibilityCard">
              <div class="credibility-level">
                <span class="credibility-badge medium" id="credibilityBadge">보통</span>
                <span style="font-size: 14px; font-weight: 600; color: #1a1d29;">신뢰도</span>
              </div>
              <div class="credibility-text" id="credibilityText">
                분석 중입니다...
              </div>
            </div>

            <!-- 종목 정보 -->
            <div class="section">
              <div class="section-title">종목 정보 확인이 필요해요
                <div class="info-icon-container">
                  <div class="info-icon">i</div>
                  <div class="tooltip" id="stockTooltip">한국거래소 KRX에서 공식적으로 등록한 시장경보종목 목록을 바탕으로 도출된 결과입니다.</div>
                </div>
              </div>
              <div id="stockVerification">
                <!-- 동적으로 채워짐 -->
              </div>
            </div>

            <!-- 경고 섹션 -->
            <div class="warning-card" id="fraudWarningsCard" style="display: none;">
              <div class="warning-header">
                <span class="warning-icon">⚠️</span>
                <span class="warning-title">한 번 더 생각해보세요</span>
                <div class="info-icon-container">
                  <div class="info-icon">i</div>
                  <div class="tooltip" id="warningTooltip">영상에서 발견된 의심스러운 투자 권유 패턴들을 AI가 분석하여 도출한 경고 사항입니다.</div>
                </div>
              </div>
              <div id="fraudWarnings">
                <!-- 동적으로 채워짐 -->
              </div>
            </div>

            <!-- 업로더 신분 확인 섹션 -->
            <div class="credibility-card" id="uploaderVerificationCard" style="display: none;">
              <div class="credibility-level">
                <span class="credibility-badge confirmed" id="uploaderBadge">확인</span>
                <span style="font-size: 14px; font-weight: 600; color: #1a1d29;">정보 제공자 신원 확인
                  <div class="info-icon-container" style="display: inline-block; margin-left: 8px;">
                    <div class="info-icon">i</div>
                    <div class="tooltip" id="uploaderTooltip">금융소비자 정보포털 '파인'에 등록된 기관입니다.</div>
                  </div>
                </span>
              </div>
              <div class="credibility-text" id="uploaderText">
                <!-- 동적으로 채워짐 -->
              </div>
            </div>

            <!-- 법률 위반사항 섹션 -->
            <div class="warning-card" id="legalComplianceCard" style="display: none;">
              <div class="warning-header">
                <span class="warning-icon">⚖️</span>
                <span class="warning-title">유사투자자문업 법률 위반이 의심돼요</span>
                <div class="info-icon-container">
                  <div class="info-icon">i</div>
                  <div class="tooltip">유사투자자문업 관련 법률 위반 가능성을 검토한 결과입니다.</div>
                </div>
              </div>
              <div id="legalViolations">
                <!-- 동적으로 채워짐 -->
              </div>
            </div>
          </div>

          <!-- Detail Info 탭 -->
          <div class="tab-panel" id="detailTab">
            <div class="section">
              <div id="detailContent">
                <!-- 동적으로 채워짐 -->
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 동적 컨테이너 (메뉴/커뮤니티) -->
      <div id="dynamicContainer" style="display: none;"></div>

      <div class="error-state" id="errorState" style="display: none;">
        <!-- 기존 에러 상태 내용 그대로 -->
        <div class="error-icon">⚠️</div>
        <div class="error-text" id="errorText">분석 중 오류가 발생했습니다.</div>
        <button class="retry-btn" id="retryBtn">다시 시도</button>
      </div>
    </div>
  `;

  // 기존 스타일에 이미지 관련 스타일 추가
  addOverlayStyles();
  
  console.log('📍 사이드바에 오버레이 삽입 중...');
  sidebar.insertBefore(fraudOverlay, sidebar.firstChild);
  console.log('오버레이 삽입 완료');
  
  setupOverlayEvents();
  startAutoAnalysis();
  
  console.log('createFraudDetectionOverlay 완료');
}

// CSS 파일이 이미 manifest.json을 통해 로드되므로 별도 스타일 추가가 필요 없음
function addOverlayStyles() {
  // CSS 파일이 manifest.json을 통해 자동으로 로드되므로 
  // 추가적인 스타일 인젝션이 필요하지 않습니다.
  console.log('CSS 스타일이 이미 로드되어 있습니다.');
}

// 이미지 로드 함수
function debugImageLoading() {
  console.log('🔍 이미지 로드 디버깅 시작...');
  
  // 이미지 엘리먼트 확인
  const imageElement = fraudOverlay.querySelector('#loadingImage');
  if (!imageElement) {
    console.error('이미지 엘리먼트를 찾을 수 없습니다.');
    return;
  }
  
  console.log('이미지 엘리먼트 발견:', imageElement);
  console.log('이미지 엘리먼트 속성:', {
    src: imageElement.src,
    alt: imageElement.alt,
    width: imageElement.width,
    height: imageElement.height,
    naturalWidth: imageElement.naturalWidth,
    naturalHeight: imageElement.naturalHeight,
    complete: imageElement.complete,
    display: imageElement.style.display,
    visibility: imageElement.style.visibility,
    opacity: imageElement.style.opacity
  });
  
  // 이미지 URL 확인
  const testImages = [
    'loading1.jpg',
    'loading2.jpg', 
    'loading3.jpg'
  ];
  
  testImages.forEach((filename, index) => {
    const url = chrome.runtime.getURL(`images/${filename}`);
    console.log(`📁 이미지 ${index + 1} URL: ${url}`);
    
    // 이미지 존재 여부 확인
    fetch(url, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          console.log(`이미지 ${filename} 존재 확인`);
        } else {
          console.error(`이미지 ${filename} 존재하지 않음: ${response.status}`);
        }
      })
      .catch(error => {
        console.error(`이미지 ${filename} 접근 실패:`, error);
      });
  });
  
  // 이미지 로드 이벤트 강화
  imageElement.onload = function() {
    console.log('이미지 로드 성공:', this.src);
    console.log('📏 이미지 크기:', this.naturalWidth, 'x', this.naturalHeight);
    
    // 강제 표시
    this.style.cssText = `
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 332px !important;
      height: 406px !important;
      object-fit: cover !important;
      border-radius: 12px !important;
      margin: 0 auto !important;
      min-width: 332px !important;
      min-height: 406px !important;
      max-width: 332px !important;
      max-height: 406px !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 9999 !important;
      background-color: #f8fafb !important;
      border: 2px solid #e2e8f0 !important;
    `;
    
    console.log('이미지 스타일 강제 적용 완료');
  };
  
  imageElement.onerror = function() {
    console.error('이미지 로드 실패:', this.src);
    
    // 대체 텍스트 표시
    this.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: #f8fafb !important;
      border: 2px solid #e2e8f0 !important;
      border-radius: 12px !important;
      width: 332px !important;
      height: 406px !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      color: #64748b !important;
      text-align: center !important;
      padding: 20px !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 9999 !important;
    `;
    
    this.textContent = '분석 중...';
    this.alt = '분석 중...';
    console.log('🔄 대체 텍스트 표시 완료');
  };
  
  // 이미지 로드 상태 주기적 확인
  const checkImageStatus = () => {
    console.log('🔍 이미지 상태 확인:', {
      src: imageElement.src,
      complete: imageElement.complete,
      naturalWidth: imageElement.naturalWidth,
      naturalHeight: imageElement.naturalHeight,
      display: imageElement.style.display,
      visibility: imageElement.style.visibility,
      opacity: imageElement.style.opacity
    });
  };
  
  // 1초마다 상태 확인 (5초간)
  const statusInterval = setInterval(checkImageStatus, 1000);
  setTimeout(() => {
    clearInterval(statusInterval);
    console.log('🔍 이미지 로드 디버깅 완료');
  }, 5000);
}

// 이미지 슬라이드쇼 시작 함수
function startImageSlideshow() {
  console.log('🔍 이미지 슬라이드쇼 시작 - 강화된 디버깅 모드');
  
  // 이미지 로드 상태 확인
  debugImageLoading();
  
  // 안전한 이미지 URL 생성
  const getImageUrl = (filename) => {
    try {
      const url = chrome.runtime.getURL(`images/${filename}`);
      console.log(`📁 이미지 URL 생성: ${filename} -> ${url}`);
      return url;
    } catch (error) {
      console.error('이미지 URL 생성 실패:', error);
      return null;
    }
  };

  const images = [
    getImageUrl('loading1.jpg'),
    getImageUrl('loading2.jpg'), 
    getImageUrl('loading3.jpg')
  ].filter(url => url !== null); // null 값 제거

  console.log('사용 가능한 이미지 목록:', images);

  if (images.length === 0) {
    console.error('사용 가능한 이미지가 없습니다.');
    return null;
  }

  let currentIndex = 0;
  const imageElement = fraudOverlay.querySelector('#loadingImage');
  if (!imageElement) {
    console.error('이미지 엘리먼트를 찾을 수 없습니다.');
    return null;
  }
  
  console.log('이미지 엘리먼트 발견:', imageElement);
  
  // 이미지 강제 표시 - 더 강력한 스타일 적용
  const forceImageDisplay = () => {
    imageElement.style.cssText = `
      width: 260px !important;
      height: 320px !important;
      min-width: 260px !important;
      min-height: 320px !important;
      max-width: 260px !important;
      max-height: 320px !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 332px !important;
      height: 406px !important;
      object-fit: cover !important;
      border-radius: 12px !important;
      margin: 0 auto !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 1 !important;
      background-color: #f8fafb !important;
      border: 2px solid #e2e8f0 !important;
    `;
    
    console.log('이미지 스타일 강제 적용 완료');
  };
  
  // 즉시 스타일 적용
  forceImageDisplay();
  
  // 첫 번째 이미지 설정
  imageElement.src = images[0];
  console.log('🖼️ 첫 번째 이미지 설정:', images[0]);
  
  // 이미지 로드 이벤트 강화
  imageElement.onload = function() {
    console.log('첫 번째 이미지 로드 성공:', images[0]);
    console.log('📏 이미지 실제 크기:', this.naturalWidth, 'x', this.naturalHeight);
    console.log('📏 이미지 표시 크기:', this.offsetWidth, 'x', this.offsetHeight);
    
    // 로드 성공 시 다시 한번 표시 강제
    forceImageDisplay();
    
    console.log('이미지 스타일 재적용 완료');
  };
  
  imageElement.onerror = function() {
    console.error('이미지 로드 실패:', this.src);
    
    // 실패 시 대체 텍스트 표시
    this.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: #f8fafb !important;
      border: 2px solid #e2e8f0 !important;
      border-radius: 12px !important;
      width: 332px !important;
      height: 406px !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      color: #64748b !important;
      text-align: center !important;
      padding: 20px !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 9999 !important;
    `;
    
    this.textContent = '분석 중...';
    this.alt = '분석 중...';
    console.log('🔄 대체 텍스트 표시 완료');
  };
  
  // 이미지 로드 상태 확인 및 강제 표시
  const checkAndForceDisplay = () => {
    if (imageElement.complete && imageElement.naturalHeight !== 0) {
      console.log('이미지 로드 완료 확인');
      forceImageDisplay();
    } else {
      console.log('⏳ 이미지 로드 대기 중...');
      setTimeout(checkAndForceDisplay, 100);
    }
  };
  
  // 100ms 후 이미지 상태 확인
  setTimeout(checkAndForceDisplay, 100);
  
  const interval = setInterval(() => {
    currentIndex = (currentIndex + 1) % images.length;
    
    // 페이드 아웃
    imageElement.style.opacity = '0';
    
    setTimeout(() => {
      imageElement.src = images[currentIndex];
      console.log('🔄 이미지 변경:', images[currentIndex]);
      
      // 페이드 인
      imageElement.style.opacity = '1';
      
      // 이미지 로드 실패 시 대체 텍스트 표시
      imageElement.onerror = function() {
        console.error('이미지 로드 실패:', this.src);
        this.style.cssText = `
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: #f8fafb !important;
          border: 2px solid #e2e8f0 !important;
          border-radius: 12px !important;
          width: 332px !important;
          height: 406px !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          color: #64748b !important;
          text-align: center !important;
          padding: 20px !important;
          box-sizing: border-box !important;
          position: relative !important;
          z-index: 9999 !important;
        `;
        this.textContent = '분석 중...';
        this.alt = '분석 중...';
      };
    }, 250);
  }, 10000); // 10초마다 변경
  
  console.log('이미지 슬라이드쇼 시작됨');
  return interval;
}

// 진행 상황 업데이트 함수
function updateLoadingStep(step) {
  const stepMessages = {
    '1단계: 종목 추출 중...': '종목 추출 중입니다.',
    '2단계: 종목 데이터 검증 중...': '종목 데이터를 DART를 통해 검증하고 있습니다.',
    '3단계: PDF 검색 중...': '한국은행, 금융감독원 등이 공시한 자료로 신뢰도를 검증하고 있습니다.',
    '4단계: 업로드 시점 분석만 수행': '웹 검색을 통해 신뢰도를 검증하고 있습니다.',
    '웹 검색 및 필터링 완료': '신뢰도 높은 웹 자료만 가져오고 있습니다.',
    '5단계: AI 종합 분석 중': 'AI가 종합 분석을 하고 있습니다.'
  };
  
  const loadingStep = fraudOverlay.querySelector('#loadingStep');
  if (!loadingStep) return;
  
  const displayMessage = stepMessages[step] || step;
  
  // 페이드 아웃 후 텍스트 변경, 다시 페이드 인
  loadingStep.style.opacity = '0';
  setTimeout(() => {
    loadingStep.textContent = displayMessage;
    loadingStep.style.opacity = '1';
  }, 200);
  
  console.log(`진행 상황 업데이트: ${displayMessage}`);
}

async function startAutoAnalysis() {
  if (isAnalyzing) {
    console.log('분석이 이미 진행 중입니다. 중복 실행을 방지합니다.');
    return;
  }

  if (!fraudOverlay) {
    console.error('fraudOverlay가 존재하지 않습니다. 오버레이가 생성되었는지 확인하세요.');
    return;
  }

  const loadingState = fraudOverlay.querySelector('#loadingState');
  const analysisResultDiv = fraudOverlay.querySelector('#analysisResult');
  const errorState = fraudOverlay.querySelector('#errorState');

  if (!loadingState || !analysisResultDiv || !errorState) {
    console.error('오버레이 내부 요소를 찾을 수 없습니다.', {
      loadingState,
      analysisResultDiv,
      errorState
    });
    return;
  }

  console.log('실시간 분석 시작...');
  isAnalyzing = true;

  loadingState.classList.add('active');
  analysisResultDiv.style.display = 'none';
  errorState.style.display = 'none';

  const slideInterval = startImageSlideshow();

  try {
    console.log('1단계: 영상 정보 수집');
    currentVideoData = await getVideoInfo();
    
    if (!currentVideoData.title || !currentVideoData.uploadDate) {
      throw new Error('영상 정보를 가져올 수 없습니다.');
    }

    console.log('2단계: 자막 추출');
    const scriptResult = await extractSubtitles();
    
    if (!scriptResult.success) {
      throw new Error(scriptResult.error || '자막 추출에 실패했습니다.');
    }

    extractedSubtitles = scriptResult.subtitles;
    console.log(`자막 추출 완료: ${extractedSubtitles.length}자`);

    console.log('3단계: 실시간 AI 분석 시작');
    
    // 분석 시작 전 데이터 확인
    console.log('performStreamAnalysis 호출 데이터:', {
      subtitlesLength: extractedSubtitles?.length || 0,
      uploadDate: currentVideoData.uploadDate,
      channelName: currentVideoData.channelName,
      channelHandle: currentVideoData.channel_handle
    });
    
    await performStreamAnalysis(extractedSubtitles, currentVideoData.uploadDate, currentVideoData.channelName, currentVideoData.channel_handle);

  } catch (error) {
    console.error('분석 오류:', error);
    showError(error.message);
  } finally {
    if (slideInterval) {
      clearInterval(slideInterval);
    }
    isAnalyzing = false;
  }
}

// 기존 performStreamAnalysis 함수를 완전히 교체
async function performStreamAnalysis(script, uploadDate, channelName, channel_handle) {
  return new Promise(async (resolve, reject) => {
    try {
      let analysisId;
      
      // 1단계: 분석 시작 요청 (fetch 시도 후 실패시 XHR 사용)
      try {
        console.log('🔄 Fetch 방식으로 분석 시작 시도...');
        // 백엔드 전송 직전 데이터 확인
        const requestData = {
          script: script,
          upload_date: uploadDate,
          channel_name: channelName,
          channel_handle: channel_handle
        };
        
        console.log('백엔드 전송 데이터 (Fetch 방식):', {
          scriptLength: requestData.script?.length || 0,
          upload_date: requestData.upload_date,
          channel_name: requestData.channel_name,
          channel_handle: requestData.channel_handle,
          channel_handle_type: typeof requestData.channel_handle,
          channel_handle_length: requestData.channel_handle?.length || 0
        });
        
        const startResponse = await fetch('http://127.0.0.1:5000/start_analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors',
          credentials: 'omit',
          body: JSON.stringify(requestData)
        });
        
        if (!startResponse.ok) {
          throw new Error(`서버 오류: ${startResponse.status}`);
        }
        
        const startData = await startResponse.json();
        if (!startData.success) {
          throw new Error(startData.error || '서버 응답 오류');
        }
        
        analysisId = startData.analysis_id;
        console.log('Fetch 방식 성공, 분석 ID:', analysisId);
        
      } catch (fetchError) {
        console.log('Fetch 실패, XHR 방식으로 재시도...', fetchError);
        
        try {
          analysisId = await startAnalysisWithXHR(script, uploadDate, channelName, channel_handle);
          console.log('XHR 방식 성공, 분석 ID:', analysisId);
        } catch (xhrError) {
          console.error('모든 분석 시작 방법 실패');
          
          // 오류 메시지 개선
          let errorMessage = '분석 서버에 연결할 수 없습니다.';
          if (xhrError.message.includes('서버가 실행되지 않음')) {
            errorMessage = '분석 서버가 실행되지 않았습니다. 서버를 시작해주세요.';
          } else if (xhrError.message.includes('CORS')) {
            errorMessage = '브라우저 보안 정책으로 인해 분석 서버에 접근할 수 없습니다.';
          } else if (xhrError.message.includes('네트워크 오류')) {
            errorMessage = '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.';
          }
          
          showError(errorMessage);
          reject(new Error(errorMessage));
          return;
        }
      }
      
      // 2단계: 폴링으로 상태 확인
      const pollStatus = async () => {
        try {
          let status;
          
          try {
            console.log('🔄 Fetch 방식으로 상태 확인 시도...');
            const statusResponse = await fetch(`http://127.0.0.1:5000/status/${analysisId}`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              },
              mode: 'cors',
              credentials: 'omit'
            });
            
            if (!statusResponse.ok) {
              throw new Error(`상태 조회 오류: ${statusResponse.status}`);
            }
            
            const statusData = await statusResponse.json();
            if (!statusData.success) {
              throw new Error(statusData.error || '상태 조회 실패');
            }
            
            status = statusData.data;
            console.log('Fetch 방식으로 상태 확인 성공:', status);
            
          } catch (fetchError) {
            console.log('⚠️ Fetch 상태 확인 실패, XHR 방식으로 재시도...', fetchError);
            
            try {
              status = await checkStatusWithXHR(analysisId);
              console.log('XHR 방식으로 상태 확인 성공:', status);
            } catch (xhrError) {
              console.error('모든 상태 확인 방법 실패:', xhrError);
              
              // 재시도 로직 (최대 3회)
              if (pollRetryCount < 3) {
                console.log(`🔄 상태 확인 재시도 중... (${pollRetryCount + 1}/3)`);
                setTimeout(() => {
                  pollRetryCount++;
                  pollStatus();
                }, 2000 * pollRetryCount);
                return;
              } else {
                reject(new Error('분석 상태를 확인할 수 없습니다. 서버 연결을 확인해주세요.'));
                return;
              }
            }
          }
          
          // 진행 상황 업데이트
          if (status.step) {
            updateLoadingStep(status.step);
          }
          
          // 완료 확인
          if (status.status === 'completed') {
            if (status.result) {
              displayAnalysisResult(status.result);
              hideLoadingState();
              resolve();
            } else {
              reject(new Error('분석 결과가 없습니다.'));
            }
            return;
          }
          
          // 에러 확인
          if (status.status === 'error') {
            reject(new Error(status.error || '분석 중 오류가 발생했습니다.'));
            return;
          }
          
          // 분석 상태별 처리
          const currentStatus = status.status;
          
          if (currentStatus === 'processing') {
            // 진행 중
            setTimeout(pollStatus, 2000);
          } else if (['queued', 'pending', 'waiting'].includes(currentStatus)) {
            // 대기 상태들
            console.log('🕒 분석 대기 중...', currentStatus);
            setTimeout(pollStatus, 3000);
          } else if (['starting', 'initializing', 'started', 'preparing', 'analyzing'].includes(currentStatus)) {
            // 시작/준비 상태들
            console.log('분석 시작 중...', currentStatus);
            setTimeout(pollStatus, 2000);
          } else if (['running', 'in_progress', 'active'].includes(currentStatus)) {
            // 실행 중 상태들
            console.log('⚡ 분석 실행 중...', currentStatus);
            setTimeout(pollStatus, 2000);
          } else if (['finishing', 'finalizing', 'wrapping_up'].includes(currentStatus)) {
            // 마무리 상태들
            console.log('🏁 분석 마무리 중...', currentStatus);
            setTimeout(pollStatus, 1500);
          } else {
            // 정말 알 수 없는 상태
            console.error('처리되지 않은 분석 상태:', JSON.stringify(status, null, 2));
            console.warn('지원되는 상태들: completed, error, processing, queued, pending, waiting, starting, initializing, started, preparing, analyzing, running, in_progress, active, finishing, finalizing, wrapping_up');
            reject(new Error(`처리되지 않은 분석 상태입니다: ${currentStatus || 'undefined'}`));
          }
          
        } catch (error) {
          console.error('❌ 상태 확인 중 오류:', error);
          reject(error);
        }
      };
      
      // 폴링 시작
      let pollRetryCount = 0;
      pollStatus();
      
    } catch (error) {
      console.error('❌ 스트림 분석 오류:', error);
      reject(error);
    }
  });
}

// 로딩 상태 숨기기
function hideLoadingState() {
  const loadingState = fraudOverlay.querySelector('#loadingState');
  const analysisResultDiv = fraudOverlay.querySelector('#analysisResult');
  
  if (!loadingState || !analysisResultDiv) {
    console.error('로딩 상태 또는 분석 결과 요소를 찾을 수 없습니다.');
    return;
  }
  
  console.log('🔄 로딩 상태 숨기기 시작...');
  
  // 로딩 상태 완전히 제거
  loadingState.classList.remove('active');
  loadingState.style.cssText = `
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  `;
  
  // DOM에서 로딩 상태 요소 제거
  setTimeout(() => {
    if (loadingState.parentNode) {
      loadingState.parentNode.removeChild(loadingState);
      console.log('✅ 로딩 상태 요소가 DOM에서 제거되었습니다.');
    }
  }, 300); // CSS 트랜지션 완료 후 제거

  // 분석 결과 화면 강제 표시
  analysisResultDiv.style.cssText = `
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  `;
  
  // 분석 결과를 신고 기능에서 사용할 수 있도록 저장
  setAnalysisResult(analysisResultDiv.textContent);
  
  // 로딩 상태에서 active 클래스 제거
  loadingState.classList.remove('active');
  
  // 분석 결과 표시 준비
  analysisResultDiv.style.transition = 'opacity 0.3s ease-in';
  
  // 300ms 후에 분석 결과 표시
  setTimeout(() => {
    console.log('✅ 로딩 상태 숨김 완료');
    
    // 분석 결과 즉시 표시 (흰 공백 없이)
    analysisResultDiv.style.display = 'flex';
    analysisResultDiv.style.visibility = 'visible';
    analysisResultDiv.style.position = 'relative';
    analysisResultDiv.style.zIndex = '1';
    analysisResultDiv.style.pointerEvents = 'auto';
    analysisResultDiv.style.opacity = '1';
    
    console.log('로딩 상태 숨김, 분석 결과 표시 완료');
  }, 300);
}

// 유튜브 사이드바 찾기
function findYouTubeSidebar() {
  return new Promise((resolve, reject) => {
    const maxAttempts = 10;
    let attempts = 0;

    const findSidebar = () => {
      // 여러 가능한 사이드바 선택자들
      const selectors = [
        'div#secondary',
        'div#secondary-inner',
        'ytd-watch-flexy[role="main"] #secondary',
        '#columns #secondary',
        'div[id="secondary"]',
        'ytd-watch-flexy #secondary'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`사이드바 발견: ${selector}`);
          return resolve(element);
        }
      }

      // 백업 방법: ytd-watch-flexy 내에서 secondary 요소 찾기
      const watchFlexy = document.querySelector('ytd-watch-flexy');
      if (watchFlexy) {
        const columns = watchFlexy.querySelector('#columns');
        if (columns) {
          // 첫 번째 시도: #secondary 찾기
          const secondary = columns.querySelector('#secondary');
          if (secondary) {
            console.log('백업 방법으로 사이드바 발견 (#secondary)');
            return resolve(secondary);
          }

          // 두 번째 시도: 두 번째 자식 요소 확인
          const children = Array.from(columns.children);
          if (children.length >= 2) {
            console.log('백업 방법으로 사이드바 발견 (두 번째 자식)');
            return resolve(children[1]);
          }
        }
      }

      attempts++;
      if (attempts >= maxAttempts) {
        console.error('사이드바를 찾을 수 없습니다.');
        reject(new Error('사이드바를 찾을 수 없습니다.'));
      } else {
        setTimeout(findSidebar, 200); // 200ms로 단축하여 더 빠른 재시도
      }
    };

    findSidebar();
  });
}

// 오버레이 이벤트 설정 (탭 기능 포함)
function setupOverlayEvents() {
  const retryBtn = fraudOverlay.querySelector('#retryBtn');
  const overlayContent = fraudOverlay.querySelector('#overlayContent');
  const headerSection = fraudOverlay.querySelector('.overlay-header');

  if (!headerSection) {
    console.error('헤더 섹션을 찾을 수 없습니다.');
    return;
  }

  let isMinimized = false;

  // 컨트롤 버튼 컨테이너 생성
  const controlContainer = document.createElement('div');
  controlContainer.className = 'close-minimize';

  // 신고 버튼 생성
  const reportBtn = document.createElement('button');
  reportBtn.id = 'reportBtn';
  reportBtn.className = 'control-btn';
  reportBtn.innerHTML = '🚨';
  reportBtn.title = '신고하기';

  // 최소화 버튼 생성
  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'minimizeBtn';
  minimizeBtn.className = 'control-btn';
  minimizeBtn.innerHTML = '─';
  minimizeBtn.title = '최소화';

  // 닫기 버튼 생성
  const closeBtn = document.createElement('button');
  closeBtn.id = 'closeBtn';
  closeBtn.className = 'control-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = '닫기';

  // 버튼들을 컨테이너에 추가
  controlContainer.appendChild(reportBtn);
  controlContainer.appendChild(minimizeBtn);
  controlContainer.appendChild(closeBtn);

  // 컨테이너를 헤더에 추가
  headerSection.appendChild(controlContainer);

  // 신고 버튼 클릭 이벤트
  reportBtn.addEventListener('click', async () => {
    console.log('신고 버튼 클릭됨');
    if (!currentAnalysisResult) {
      alert('먼저 영상을 분석해주세요.');
      return;
    }
    await openReportModal();
  });

  // 최소화 버튼 클릭 이벤트
  minimizeBtn.addEventListener('click', () => {
    console.log('최소화 버튼 클릭됨');
    
    if (!overlayContent) {
      console.error('오버레이 콘텐츠를 찾을 수 없습니다.');
      return;
    }
    
    isMinimized = !isMinimized;
    
    if (isMinimized) {
      // 최소화
      overlayContent.style.display = 'none';
      minimizeBtn.innerHTML = '□'; // 복원 아이콘
      minimizeBtn.title = '복원';
      fraudOverlay.classList.add('minimized');
      console.log('오버레이 최소화됨');
    } else {
      // 복원
      overlayContent.style.display = 'block';
      minimizeBtn.innerHTML = '─'; // 최소화 아이콘
      minimizeBtn.title = '최소화';
      fraudOverlay.classList.remove('minimized');
      console.log('오버레이 복원됨');
    }
  });

  // 닫기 버튼
  closeBtn.addEventListener('click', () => {
    fraudOverlay.style.display = 'none';
  });

  // 다시 시도 버튼
  retryBtn.addEventListener('click', () => {
    startAutoAnalysis();
  });

  // 탭 전환 기능 설정
  setupTabSwitching();

  // 스크롤 감지
  setupScrollDetection();

  // 드롭다운 메뉴 이벤트 설정
  setupDropdownMenu();
  
  // 커뮤니티 모듈 사전 로딩 (백그라운드에서 비동기로 실행)
  preloadCommunityModules();
}


// 스크롤 감지 설정
function setupScrollDetection() {
  window.addEventListener('scroll', function() {
    const videoPlayer = document.querySelector('video, #player, .html5-video-player');
    if (!videoPlayer || !fraudOverlay) return;

    const videoRect = videoPlayer.getBoundingClientRect();
    const isVideoVisible = videoRect.bottom > 0 && videoRect.top < window.innerHeight;

    if (isVideoVisible) {
      fraudOverlay.classList.remove('hidden');
    } else {
      fraudOverlay.classList.add('hidden');
    }
  }, { passive: true });
}


// 영상 정보 가져오기
async function getVideoInfo() {
  try {
    const title = getVideoTitle();
    const uploadDate = getUploadDate();
    const videoId = getVideoId();
    const channelName = getChannelName(); // 채널명 추출 추가
    const channelHandle = getChannelHandle(); // 채널 핸들 추출 추가
    
    // 디버깅 로그 추가
    console.log('영상 정보 추출 결과:', {
      title: title,
      channelName: channelName,
      channelHandle: channelHandle,
      uploadDate: uploadDate
    });
    
    return {
      title: title || '제목 없음',
      uploadDate: uploadDate || '2024-01-01',
      videoId: videoId,
      channelName: channelName || null, // 채널명 추가
      channel_handle: channelHandle || null, // 채널 핸들
      url: window.location.href
    };
  } catch (error) {
    console.error('영상 정보 추출 오류:', error);
    return {
      title: '제목 없음',
      uploadDate: '2024-01-01',
      videoId: getVideoId(),
      channelName: null, // 채널명 추가
      channel_handle: null, // 채널 핸들
      url: window.location.href
    };
  }
}

// 비디오 ID 추출
function getVideoId() {
  const url = window.location.href;
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (videoIdMatch) {
    return videoIdMatch[1];
  }
  
  const metaTags = document.querySelectorAll('meta[property="og:url"]');
  for (const tag of metaTags) {
    const content = tag.getAttribute('content');
    if (content) {
      const match = content.match(/v=([^&\n?#]+)/);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

// 영상 제목 추출
function getVideoTitle() {
  const selectors = [
    'h1.ytd-video-primary-info-renderer',
    'h1.title.style-scope.ytd-video-primary-info-renderer',
    '#container h1',
    'h1[class*="title"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  const metaTitle = document.querySelector('meta[property="og:title"]');
  if (metaTitle) {
    return metaTitle.getAttribute('content');
  }
  
  return document.title.replace(' - YouTube', '');
}

// 업로드 날짜 추출
function getUploadDate() {
  const dateSelectors = [
    '#info-strings yt-formatted-string',
    '#date yt-formatted-string',
    '#info #date yt-formatted-string',
    '.ytd-video-secondary-info-renderer #date yt-formatted-string'
  ];
  
  for (const selector of dateSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const dateText = element.textContent.trim();
      const parsedDate = parseDateFromText(dateText);
      if (parsedDate) {
        return parsedDate;
      }
    }
  }
  return null;
}

// 날짜 텍스트 파싱
function parseDateFromText(text) {
  const koreanPatterns = [
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./,
    /(\d{4})-(\d{1,2})-(\d{1,2})/
  ];
  
  for (const pattern of koreanPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

// 채널명 추출 (우선순위: ytInitialPlayerResponse → DOM)
function getChannelName() {
  try {
    console.log('🔍 채널명 추출 시작...');
    
    // 방법 1: ytInitialPlayerResponse에서 추출 (우선)
    const channelFromResponse = getChannelFromYtInitialPlayerResponse();
    if (channelFromResponse) {
      console.log('✅ ytInitialPlayerResponse에서 채널명 추출 성공:', channelFromResponse);
      return channelFromResponse;
    }
    
    // 방법 2: DOM에서 추출 (백업)
    const channelFromDOM = getChannelFromDOM();
    if (channelFromDOM) {
      console.log('✅ DOM에서 채널명 추출 성공:', channelFromDOM);
      return channelFromDOM;
    }
    
    console.log('❌ 채널명을 찾을 수 없습니다.');
    return null;
    
  } catch (error) {
    console.error('채널명 추출 오류:', error);
    return null;
  }
}


// 채널 핸들 추출 (@username 형태)
function getChannelHandle() {
  try {
    console.log('🔍 채널 핸들 추출 시작...');
    
    // 방법 1: 채널 링크에서 @username 추출
    const channelLinks = document.querySelectorAll('a[href*="/@"]');
    for (const link of channelLinks) {
      const href = link.getAttribute('href');
      const handleMatch = href.match(/\/@([^\/\?]+)/);
      if (handleMatch) {
        const handle = '@' + handleMatch[1];
        console.log('✅ 채널 링크에서 핸들 추출:', handle);
        return handle;
      }
    }
    
    // 방법 2: 현재 URL에서 추출 (채널 페이지인 경우)
    const currentUrl = window.location.href;
    const urlHandleMatch = currentUrl.match(/youtube\.com\/@([^\/\?]+)/);
    if (urlHandleMatch) {
      const handle = '@' + urlHandleMatch[1];
      console.log('✅ URL에서 핸들 추출:', handle);
      return handle;
    }
    
    // 방법 3: 채널명 영역에서 @로 시작하는 텍스트 찾기
    const channelNameElements = document.querySelectorAll('[href*="/@"], .ytd-channel-name, #channel-name');
    for (const element of channelNameElements) {
      const text = element.textContent.trim();
      if (text.startsWith('@')) {
        console.log('✅ 채널명 영역에서 핸들 추출:', text);
        return text;
      }
    }
    
    // 방법 4: 메타 데이터에서 추출
    if (window.ytInitialData) {
      try {
        // ytInitialData에서 채널 핸들 찾기
        const videoOwner = window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
        if (videoOwner && videoOwner.title && videoOwner.title.runs && videoOwner.title.runs[0]) {
          const ownerText = videoOwner.title.runs[0].text;
          if (ownerText && ownerText.startsWith('@')) {
            console.log('✅ ytInitialData에서 핸들 추출:', ownerText);
            return ownerText;
          }
        }
      } catch (e) {
        console.log('ytInitialData 파싱 실패:', e);
      }
    }
    
    console.log('❌ 채널 핸들을 찾을 수 없습니다.');
    return null;
    
  } catch (error) {
    console.error('채널 핸들 추출 오류:', error);
    return null;
  }
}

// ytInitialPlayerResponse에서 채널명 추출
function getChannelFromYtInitialPlayerResponse() {
  try {
    // window.ytInitialPlayerResponse 확인
    if (window.ytInitialPlayerResponse && 
        window.ytInitialPlayerResponse.microformat && 
        window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer && 
        window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer.ownerChannelName) {
      
      const channelName = window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer.ownerChannelName;
      console.log('ytInitialPlayerResponse에서 추출된 채널명:', channelName);
      return channelName;
    }
    
    // 대안: videoDetails에서 추출
    if (window.ytInitialPlayerResponse && 
        window.ytInitialPlayerResponse.videoDetails && 
        window.ytInitialPlayerResponse.videoDetails.author) {
      
      const channelName = window.ytInitialPlayerResponse.videoDetails.author;
      console.log('videoDetails에서 추출된 채널명:', channelName);
      return channelName;
    }
    
    return null;
  } catch (error) {
    console.error('ytInitialPlayerResponse 채널명 추출 오류:', error);
    return null;
  }
}

// DOM에서 채널명 추출 (백업)
function getChannelFromDOM() {
  try {
    // 방법 1: 지정된 선택자 사용
    const channelElement = document.querySelector('#owner #channel-name a');
    if (channelElement) {
      const channelName = channelElement.textContent.trim();
      if (channelName) {
        console.log('DOM 선택자 #owner #channel-name a에서 추출:', channelName);
        return channelName;
      }
    }
    
    // 방법 2: 다양한 선택자들 시도
    const selectors = [
      '#owner #channel-name a',
      '#upload-info #channel-name a',
      '#channel-name a',
      '.ytd-channel-name a',
      '.ytd-video-owner-renderer #channel-name a',
      'ytd-channel-name a',
      '[href*="/channel/"] #text',
      '[href*="/@"] #text'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const channelName = element.textContent.trim();
        if (channelName && channelName.length > 0) {
          console.log(`DOM 선택자 ${selector}에서 추출:`, channelName);
          return channelName;
        }
      }
    }
    
    // 방법 3: 메타 태그에서 추출
    const metaChannelName = document.querySelector('meta[property="og:video:tag"]');
    if (metaChannelName) {
      const channelName = metaChannelName.getAttribute('content');
      if (channelName) {
        console.log('메타 태그에서 추출된 채널명:', channelName);
        return channelName;
      }
    }
    
    return null;
  } catch (error) {
    console.error('DOM 채널명 추출 오류:', error);
    return null;
  }
}

// Flask API 호출
async function callAnalysisAPI(script, uploadDate) {
  try {
    const response = await fetch('http://127.0.0.1:5000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify({
        script: script,
        upload_date: uploadDate
      })
    });
    
    if (!response.ok) {
      throw new Error(`서버 오류: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('API 호출 오류:', error);
    return {
      success: false,
      error: `분석 서버에 연결할 수 없습니다: ${error.message}`
    };
  }
}

// 메인 분석 결과 표시 함수 (DeepSeek 새로운 형식 대응)
function displayAnalysisResult(result) {
  // 분석 결과 저장
  currentAnalysisResult = result;
  originalAnalysisResult = result; // 원본 객체도 따로 저장
  if (!result || !result.analysis) {
    showError('분석 결과가 올바르지 않습니다.');
    return;
  }

  const analysis = result.analysis;
  console.log('=== DeepSeek 분석 결과 디버깅 ===');
  console.log('원본 분석 결과:', analysis);
  
  // Hugging Face API 한계 도달 확인
  if (analysis.includes('402 Client Error') || analysis.includes('Payment Required') || analysis.includes('exceeded your monthly included credits')) {
    showError('AI 분석 서비스의 일일 사용량 한계에 도달했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  
  // 구조화된 데이터 파싱
  const parsedData = parseStructuredResponse(analysis);
  console.log('파싱된 데이터:', parsedData);
  
  // 백엔드 객체 직접 추가
  parsedData.uploaderVerification = result.uploader_verification;
  parsedData.legalCompliance = result.violation_check;
  
  // 로딩 상태 숨기기 - hideLoadingState() 함수 사용
  hideLoadingState();
  
  // 로딩 상태가 완전히 숨겨진 후 탭 업데이트
  setTimeout(() => {
  updateKeyPointTab(parsedData.keyPoint, parsedData.uploaderVerification, parsedData.legalCompliance);
  updateSummaryTab(parsedData.summary);
  updateDetailTab(parsedData.detail);
  }, 350); // hideLoadingState의 300ms 애니메이션 + 50ms 여유
  
  setAnalysisResult(result);
  
  console.log('=== 분석 결과 표시 완료 ===');
}

// 구조화된 응답 파싱
function parseStructuredResponse(analysis) {
  const sections = {};
  
  // 각 섹션을 안전하게 추출
  sections.summary = extractSection(analysis, 'SUMMARY', 'KEY_POINT');
  sections.keyPoint = extractSection(analysis, 'KEY_POINT', 'DETAIL_INFO');
  sections.detail = extractSection(analysis, 'DETAIL_INFO', 'SOURCES');
  
  return {
    summary: parseSummaryData(sections.summary),
    keyPoint: parseKeyPointData(sections.keyPoint),
    detail: parseDetailData(sections.detail)
  };
}

// 섹션 추출 함수
function extractSection(text, startMarker, endMarker) {
  const startPattern = new RegExp(`---${startMarker}---`, 'i');
  const endPattern = new RegExp(`---${endMarker}---`, 'i');
  
  const startMatch = text.search(startPattern);
  if (startMatch === -1) return '';
  
  const startPos = startMatch + startMarker.length + 6;
  const endMatch = text.search(endPattern);
  const endPos = endMatch === -1 ? text.length : endMatch;
  
  return text.substring(startPos, endPos).trim();
}

// Summary 데이터 파싱
function parseSummaryData(summaryText) {
  const data = {
    stocks: [],
    keywords: [],
    insights: ''
  };

  if (!summaryText) return data;

  const lines = summaryText.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.includes('언급 종목:') || trimmedLine.includes('종목:')) {
      const stocksText = trimmedLine.split(':')[1]?.trim();
      if (stocksText && stocksText !== '없음') {
        data.stocks = stocksText.split(',').map(stock => stock.trim()).filter(Boolean);
      }
    }
    else if (trimmedLine.includes('주요 키워드:') || trimmedLine.includes('키워드:')) {
      const keywordsText = trimmedLine.split(':')[1]?.trim();
      if (keywordsText) {
        data.keywords = keywordsText.split(',').map(keyword => keyword.trim()).filter(Boolean);
      }
    }
    else if (trimmedLine.includes('시사점:')) {
      const insightsText = trimmedLine.split(':')[1]?.trim();
      if (insightsText) {
        data.insights = insightsText;
        const currentIndex = lines.indexOf(line);
        for (let i = currentIndex + 1; i < lines.length; i++) {
          const nextLine = lines[i].trim();
          if (nextLine && !nextLine.includes(':')) {
            data.insights += ' ' + nextLine;
          } else {
            break;
          }
        }
      }
    }
  }

  return data;
}

// Key Point 데이터 파싱
function parseKeyPointData(keyPointText) {
  const data = {
    credibility: { level: '보통', reason: '' },
    stockVerifications: [],
    fraudWarnings: []
  };

  if (!keyPointText) return data;

  console.log('Key Point 원본 텍스트:', keyPointText);
  
  const sections = splitKeyPointSections(keyPointText);
  console.log('분리된 섹션들:', sections);
  
  // 신뢰도 정보 추출 (전체 텍스트에서 찾기)
  data.credibility = extractCredibilityFromText(keyPointText);
  
  if (sections.stockVerification) {
    console.log('종목 검증 섹션:', sections.stockVerification);
    data.stockVerifications = parseStockVerifications(sections.stockVerification);
    console.log('파싱된 종목 검증:', data.stockVerifications);
  }
  
  if (sections.fraudWarnings) {
    data.fraudWarnings = parseFraudWarnings(sections.fraudWarnings);
  }

  return data;
}

// Key Point 섹션들 분리 (DeepSeek 실제 형식 대응)
function splitKeyPointSections(text) {
  const sections = {
    credibility: '',
    stockVerification: '',
    fraudWarnings: ''
  };

  console.log('Key Point 섹션 분리 원본 텍스트:', text);

  // DeepSeek 응답 형식
  // 종목 정보는 "• 종목명: 상태" 형식으로 나타남
  const stockLines = [];
  const credibilityLines = [];
  const warningLines = [];
  
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 종목 정보 라인 (• 로 시작하는 라인)
    if (trimmedLine.match(/^[•·]\s*[가-힣A-Za-z0-9]+:/)) {
      stockLines.push(trimmedLine);
    }
    // 신뢰도 관련 라인 (- 로 시작하는 라인)
    else if (trimmedLine.startsWith('-')) {
      credibilityLines.push(trimmedLine);
    }
    // 기타 경고나 주의사항 라인
    else if (trimmedLine.includes('주의') || trimmedLine.includes('경고') || trimmedLine.includes('유의')) {
      warningLines.push(trimmedLine);
    }
  }
  
  sections.stockVerification = stockLines.join('\n');
  sections.credibility = credibilityLines.join('\n');
  sections.fraudWarnings = warningLines.join('\n');
  
  console.log('분리된 섹션들:', sections);
  return sections;
}

// 종목 검증 정보 파싱 (아이콘 없는 새로운 형식)
function parseStockVerifications(text) {
  const stockGroups = {};
  
  if (!text) return [];
  
  console.log('종목 검증 원본 텍스트:', text);
  
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    console.log('처리 중인 라인:', trimmedLine);
    
    // 새로운 패턴: • 종목명: 설명 (아이콘 없음)
    const match = trimmedLine.match(/^[•·]\s*([^:]+):\s*(.+)$/);
    
    if (match) {
      const stockName = match[1].trim().replace(/[\*\[\]]/g, ''); // 특수문자 제거
      let description = match[2].trim();
      
      // "투자주의:" 라벨 제거 처리
      if (description.startsWith('투자주의:')) {
        description = description.replace(/^투자주의:\s*/, '');
      }
      
      // "투자주의 종목(...)" 형태도 처리
      if (description.includes('투자주의 종목(') && description.includes(')')) {
        description = description.replace(/투자주의 종목\(([^)]+)\)/, '$1 문제');
      }
      
      if (!stockGroups[stockName]) {
        stockGroups[stockName] = [];
      }
      
      // 부정적 정보 판단 기준 개선
      const isNegative = description.includes('투자주의 종목') ||
                        description.includes('투자경고 종목') ||
                        description.includes('투자위험 종목') ||
                        description.includes('상장되지 않은 종목') ||
                        description.includes('재무상태 주의') ||
                        description.includes('문제'); // "문제"가 포함된 경우도 부정적으로 판단
      
      // 아이콘을 UI에서 결정 (백엔드에서 받지 않음)
      let displayIcon = 'ℹ️'; // 기본값
      if (isNegative) {
        displayIcon = '❌';
      } else if (description.includes('재무상태 양호') || description.includes('정상')) {
        displayIcon = '✅';
      }
      
      stockGroups[stockName].push({
        type: '상태',
        content: description,
        isNegative: isNegative,
        displayIcon: displayIcon // UI 표시용 아이콘
      });
      
      console.log(`✅ 종목 파싱 성공: ${stockName} - ${description} (부정적: ${isNegative})`);
    }
  }
  
  // 결과를 배열로 변환
  const result = [];
  for (const [stockName, infos] of Object.entries(stockGroups)) {
    if (infos.length > 0) {
      result.push({
        stock: stockName,
        infos: infos,
        hasNegative: infos.some(info => info.isNegative)
      });
    }
  }
  
  console.log('최종 변환된 결과:', result);
  return result;
}

// 사기 경고 파싱 (새로운 형식 대응)
function parseFraudWarnings(text) {
  const warnings = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  console.log('사기 경고 원본 텍스트:', text);
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    console.log('사기 경고 처리 중인 라인:', trimmedLine);
    
    // 새로운 LLM 응답 형식: "• 패턴명: 구체적 설명"
    const warningMatch = trimmedLine.match(/^[•·]\s*([^:]+):\s*(.+)$/);
    if (warningMatch) {
      const pattern = warningMatch[1].trim();
      const description = warningMatch[2].trim();
      
      // 패턴명에서 "패턴" 문자 제거
      const cleanPattern = pattern.replace(/\s*패턴$/, '');
      
      warnings.push({
        pattern: cleanPattern,
        description: description
      });
      
      console.log(`✅ 사기 경고 파싱: ${cleanPattern} - ${description}`);
    }
  }

  console.log('파싱된 사기 경고:', warnings);
  return warnings;
}

// 신뢰도 정보를 전체 텍스트에서 추출
function extractCredibilityFromText(text) {
  const credibility = {
    level: '보통',
    reason: '',
    warnings: []
  };

  console.log('신뢰도 정보 추출 원본 텍스트:', text);

  const lines = text.split('\n').filter(line => line.trim());
  let evaluationText = '';
  let warningText = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    console.log('신뢰도 처리 중인 라인:', trimmedLine);
    
    // 신뢰도 레벨 감지 (실제 형식: "- 전체 신뢰도: 보통")
    if (trimmedLine.includes('전체 신뢰도:') || trimmedLine.includes('신뢰도:')) {
      const levelMatch = trimmedLine.match(/전체 신뢰도.*?:\s*(.+)/);
      if (levelMatch) {
        credibility.level = levelMatch[1].trim();
        console.log('신뢰도 레벨 추출:', credibility.level);
      }
    } 
    // 평가 근거 감지 (실제 형식: "- 평가 근거: ...")
    else if (trimmedLine.includes('평가 근거:')) {
      const reasonMatch = trimmedLine.match(/평가 근거:\s*(.+)/);
      if (reasonMatch) {
        evaluationText = reasonMatch[1].trim();
        credibility.reason = evaluationText;
        console.log('평가 근거 추출:', evaluationText);
      }
    }
    // 투자자 유의사항 감지 (실제 형식: "- 투자자 유의사항: ...")
    else if (trimmedLine.includes('투자자 유의사항:')) {
      const warningMatch = trimmedLine.match(/투자자 유의사항:\s*(.+)/);
      if (warningMatch) {
        warningText = warningMatch[1].trim();
        credibility.warnings = [warningText];
        console.log('투자자 유의사항 추출:', warningText);
      }
    }
  }

  // 평가 근거가 없으면 기본값 설정
  if (!credibility.reason) {
    credibility.reason = '평가 근거 정보가 없습니다.';
  }

  console.log('파싱된 신뢰도 정보:', credibility);
  return credibility;
}

// 신뢰도 정보 파싱 (DeepSeek 실제 형식 대응)
function parseCredibilityInfo(text) {
  const credibility = {
    level: '보통',
    reason: ''
  };

  console.log('신뢰도 정보 원본 텍스트:', text);

  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    console.log('신뢰도 처리 중인 라인:', trimmedLine);
    
    // 신뢰도 레벨 감지 (다양한 형식)
    if (trimmedLine.includes('전체 신뢰도:') || trimmedLine.includes('신뢰도:')) {
      const levelText = trimmedLine.split(':')[1]?.trim();
      if (levelText) {
        credibility.level = levelText;
      }
    } 
    // 새로운 형식: 라벨 없는 평가 근거
    else if (trimmedLine.includes('평가 근거:')) {
      const reasonText = trimmedLine.split(':')[1]?.trim();
      if (reasonText) {
        credibility.reason = reasonText;
      }
    }
    // 라벨 없는 평가 근거 (새로운 DeepSeek 형식)
    else if (trimmedLine.length > 10 && 
             (trimmedLine.includes('영상') || 
              trimmedLine.includes('내용') || 
              trimmedLine.includes('정보') ||
              trimmedLine.includes('확인') ||
              trimmedLine.includes('분석'))) {
      // 이전 라인에 "평가 근거:" 라벨이 없었다면, 이 라인을 평가 근거로 처리
      if (!credibility.reason) {
        credibility.reason = trimmedLine;
      }
    }
  }

  // 실제 출력에서는 신뢰도 정보가 별도로 나오지 않으므로 기본값 설정
  if (!credibility.reason) {
    credibility.reason = '일부 종목이 투자주의 대상이며, 과도한 낙관론이 포함되어 있습니다.';
  }

  console.log('파싱된 신뢰도 정보:', credibility);
  return credibility;
}

// Detail 데이터 파싱
function parseDetailData(detailText) {
  const data = {
    comparisons: []
  };

  if (!detailText) return data;

  console.log('Detail 원본 텍스트:', detailText);

  const lines = detailText.split('\n').filter(line => line.trim());
  let currentQuote = null;
  let currentFact = null;
  let currentEvidence = null;
  let currentResult = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    console.log('Detail 처리 중인 라인:', trimmedLine);
    
    // 형식 1: 인용구 (따옴표로 시작하는 문장)
    if (trimmedLine.startsWith('"') && trimmedLine.endsWith('"')) {
      // 이전 비교가 있으면 저장
      if (currentQuote || currentFact) {
        data.comparisons.push({
          quote: currentQuote,
          fact: currentFact,
          evidence: currentEvidence,
          result: currentResult
        });
      }
      
      currentQuote = trimmedLine.replace(/^"/, '').replace(/"$/, '');
      currentFact = null;
      currentEvidence = null;
      currentResult = null;
      console.log('인용구 파싱:', currentQuote);
      continue;
    }
    
    // 형식 2: "→ 사실 확인 결과: 결과값"
    const resultMatch = trimmedLine.match(/^→\s*사실 확인 결과:\s*(.+)$/);
    if (resultMatch) {
      currentResult = resultMatch[1].trim();
      console.log('사실 확인 결과 파싱:', currentResult);
      continue;
    }
    
    // 형식 3: "구체적 근거: 근거내용"
    const evidenceMatch = trimmedLine.match(/^구체적 근거:\s*(.+)$/);
    if (evidenceMatch) {
      currentEvidence = evidenceMatch[1].trim();
      console.log('구체적 근거 파싱:', currentEvidence);
      
      // 구체적 근거와 사실 확인 결과를 결합
      if (currentEvidence && currentResult) {
        currentFact = `${currentEvidence}(${currentResult})`;
        console.log('결합된 사실:', currentFact);
      }
      continue;
    }
    
    // 형식 4: 기타 설명문
    if (trimmedLine.length > 10 && 
        (trimmedLine.includes('영상 업로드') || 
         trimmedLine.includes('당시') || 
         trimmedLine.includes('현재') ||
         trimmedLine.includes('업로드일 기준'))) {
      
      if (currentQuote) {
        // 인용구가 있으면 설명을 사실로 추가
        if (!currentFact) {
          currentFact = trimmedLine;
        } else {
          currentFact += ' ' + trimmedLine;
        }
        console.log('설명문 추가:', trimmedLine);
      }
    }
  }
  
  // 마지막 비교 추가
  if (currentQuote || currentFact) {
    data.comparisons.push({
      quote: currentQuote,
      fact: currentFact,
      evidence: currentEvidence,
      result: currentResult
    });
  }

  console.log('최종 파싱된 Detail 데이터:', data);
  return data;
}

// 파싱 데이터 로그
function debugParsedData(parsedData) {
  console.log('=== 파싱된 데이터 ===');
  console.log('Summary:', parsedData.summary);
  console.log('Key Point:', parsedData.keyPoint);
  console.log('Detail:', parsedData.detail);
  console.log('====================');
}

// 에러 표시
function showError(message) {
  const loadingState = fraudOverlay.querySelector('#loadingState');
  const analysisResult = fraudOverlay.querySelector('#analysisResult');
  const errorState = fraudOverlay.querySelector('#errorState');
  const errorText = fraudOverlay.querySelector('#errorText');

  // 모든 상태를 먼저 숨기기
  loadingState.style.display = 'none';
  analysisResult.style.display = 'none';
  errorState.style.display = 'block';
  
  // 오류 메시지 개선 및 분류
  let displayMessage = message;
  let showRetryButton = false;
  
  if (message.includes('402 Client Error') || message.includes('Payment Required') || message.includes('exceeded your monthly included credits')) {
    displayMessage = 'AI 분석 서비스의 일일 사용량 한계에 도달했습니다. 잠시 후 다시 시도해주세요.';
    showRetryButton = true;
  } else if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('네트워크 오류')) {
    displayMessage = '분석 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.';
    showRetryButton = true;
  } else if (message.includes('서버가 실행되지 않음')) {
    displayMessage = '분석 서버가 실행되지 않았습니다. 서버를 시작해주세요.';
    showRetryButton = true;
  } else if (message.includes('CORS') || message.includes('브라우저 보안 정책')) {
    displayMessage = '브라우저 보안 정책으로 인해 분석 서버에 접근할 수 없습니다.';
  } else if (message.includes('시간 초과') || message.includes('요청 시간 초과')) {
    displayMessage = '서버 응답이 너무 느립니다. 잠시 후 다시 시도해주세요.';
    showRetryButton = true;
  } else if (message.includes('분석 서버에 연결할 수 없습니다')) {
    displayMessage = message; // 이미 개선된 메시지
    showRetryButton = true;
  } else {
    displayMessage = `분석 중 오류가 발생했습니다: ${message}`;
    showRetryButton = true;
  }
  
  errorText.textContent = displayMessage;
  
  // 재시도 버튼 표시/숨김
  const retryButton = fraudOverlay.querySelector('#retryButton');
  if (retryButton) {
    retryButton.style.display = showRetryButton ? 'block' : 'none';
  }
  console.log('❌ 에러 상태 표시됨:', message);
  
  // 오류 발생 시 로딩 상태 정리
  hideLoadingState();
}

// 로그 함수
function debugLog(message, data = null) {
  console.log(`[사기탐지] ${message}`, data || '');
}

// 초기화 로그
debugLog('Content script 로드됨', window.location.href);

// 탭 전환 기능
function setupTabSwitching() {
  const tabButtons = fraudOverlay.querySelectorAll('.tab-btn');
  const tabPanels = fraudOverlay.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // 모든 탭 버튼에서 active 클래스 제거
      tabButtons.forEach(btn => btn.classList.remove('active'));
      
      // 모든 탭 패널 숨기기
      tabPanels.forEach(panel => panel.classList.remove('active'));
      
      // 클릭된 탭 버튼 활성화
      button.classList.add('active');
      
      // 해당 탭 패널 표시
      const targetPanel = fraudOverlay.querySelector(`#${targetTab}Tab`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

// Summary 탭 업데이트
function updateSummaryTab(data) {
  const maxVisibleItems = 3;  // 기본적으로 보여줄 최대 아이템 수

  const stocksContainer = fraudOverlay.querySelector('#mentionedStocks');
  if (data.stocks && data.stocks.length > 0) {
    const hasMoreStocks = data.stocks.length > maxVisibleItems;
    const visibleStocks = data.stocks;
    
    // 처음 3개의 태그만 표시
    let stocksHtml = visibleStocks
      .slice(0, maxVisibleItems)
      .map(stock => `<span class="tag">${stock}</span>`)
      .join('');
    
    if (hasMoreStocks) {
      // 숨겨진 태그들
      const remainingStocks = visibleStocks
        .slice(maxVisibleItems)
        .map(stock => `<span class="tag">${stock}</span>`)
        .join('');
        
      stocksHtml += `<span class="remaining-items" style="display: none;">${remainingStocks}</span>`;
      
      // 더보기 버튼을 마지막에 추가
      stocksHtml += `<span class="tag more-tag" data-type="stocks" data-expanded="false">
          <span class="more-text">···</span>
        </span>`;
    }
    
    stocksContainer.innerHTML = stocksHtml;
  } else {
    stocksContainer.innerHTML = '<span class="tag">언급된 종목 없음</span>';
  }

  const keywordsContainer = fraudOverlay.querySelector('#keywordTags');
  if (data.keywords && data.keywords.length > 0) {
    const hasMoreKeywords = data.keywords.length > maxVisibleItems;
    const visibleKeywords = hasMoreKeywords ? data.keywords.slice(0, maxVisibleItems) : data.keywords;
    
    let keywordsHtml = visibleKeywords
      .map(keyword => `<span class="tag">${keyword}</span>`)
      .join('');
      
    if (hasMoreKeywords) {
      // 나머지 키워드들
      const remainingKeywords = data.keywords
        .slice(maxVisibleItems)
        .map(keyword => `<span class="tag">${keyword}</span>`)
        .join('');
      
      keywordsHtml += `<span class="remaining-items" style="display: none;">${remainingKeywords}</span>`;
      
      // 더보기 버튼을 마지막에 추가
      keywordsHtml += `<span class="tag more-tag" data-type="keywords" data-expanded="false">
          <span class="more-text">···</span>
        </span>`;
    }
    
    keywordsContainer.innerHTML = keywordsHtml;
  } else {
    keywordsContainer.innerHTML = '<span class="tag">키워드 없음</span>';
  }

  const insightsContainer = fraudOverlay.querySelector('#insights');
  insightsContainer.innerHTML = data.insights || '시사점 정보가 없습니다.';
  
  // 더보기 버튼 이벤트 리스너 추가
  const moreTags = fraudOverlay.querySelectorAll('.more-tag');
  moreTags.forEach(tag => {
    tag.addEventListener('click', (e) => {
      const remainingItems = tag.previousElementSibling;
      const isExpanded = tag.getAttribute('data-expanded') === 'true';
      
      if (isExpanded) {
        remainingItems.style.display = 'none';
        tag.setAttribute('data-expanded', 'false');
        tag.querySelector('.more-text').textContent = '···';
      } else {
        remainingItems.style.display = 'flex';
        tag.setAttribute('data-expanded', 'true');
        tag.querySelector('.more-text').textContent = '←';
      }
      
      e.stopPropagation();
    });
  });
  
  // 오버레이 외부 클릭 시에만 more-content 닫기
  document.addEventListener('click', (e) => {
    // 클릭된 요소가 fraudOverlay 내부에 있는지 확인
    if (!fraudOverlay.contains(e.target)) {
      fraudOverlay.querySelectorAll('.more-content').forEach(content => {
        content.style.display = 'none';
      });
      fraudOverlay.querySelectorAll('.more-tag').forEach(tag => {
        tag.setAttribute('data-expanded', 'false');
        tag.querySelector('.more-text').textContent = '···';
      });
    }
  });
}

// 최종 완성된 Key Point 탭 업데이트 함수
function updateKeyPointTab(data, uploaderVerification, legalCompliance) {
  // 신고 버튼 상태 업데이트
  if (data && data.credibility) {
    updateReportButtonState(data.credibility, data.fraudWarnings || []);
  }
  console.log('=== Key Point 탭 업데이트 시작 ===');
  
  // 신뢰도 업데이트 (동적 색상)
  updateCredibilitySection(data.credibility);
  
  // 종목 검증 정보 업데이트 (UI 시안 완전 호환)
  updateStockVerificationSection(data.stockVerifications);
  
  // 사기 경고 업데이트 (빈 경우 섹션 숨김)
  updateFraudWarningsSection(data.fraudWarnings);
  
  // 업로더 정보 업데이트
  updateUploaderVerificationSection(uploaderVerification);
  updateLegalComplianceSection(legalCompliance);
  
  console.log('=== Key Point 탭 업데이트 완료 ===');
}

// 신뢰도 섹션 업데이트 (동적 색상)
function updateCredibilitySection(credibility) {
  const credibilityBadge = fraudOverlay.querySelector('#credibilityBadge');
  const credibilityText = fraudOverlay.querySelector('#credibilityText');
  const credibilityCard = fraudOverlay.querySelector('#credibilityCard');
  
  if (credibility) {
    const level = credibility.level || '보통';
    credibilityBadge.textContent = level;
    
    // 동적 색상 적용 (뱃지)
    credibilityBadge.className = 'credibility-badge';
    if (level === '높음') {
      credibilityBadge.style.background = '#3b82f6';
      credibilityBadge.style.color = '#ffffff';
    } else if (level === '보통') {
      credibilityBadge.style.background = '#fbbf24';
      credibilityBadge.style.color = '#1a1d29';
    } else { // 낮음
      credibilityBadge.style.background = '#ef4444';
      credibilityBadge.style.color = '#ffffff';
    }
    
    // 동적 포인트 색상 적용 (카드 상단 테두리)
    if (level === '높음') {
      credibilityCard.style.setProperty('--credibility-color', '#3b82f6');
    } else if (level === '보통') {
      credibilityCard.style.setProperty('--credibility-color', '#fbbf24');
    } else { // 낮음
      credibilityCard.style.setProperty('--credibility-color', '#ef4444');
    }
    
    // 신뢰도 섹션에는 투자자 유의사항만 표시
    let textContent = '';
    if (credibility.warnings && credibility.warnings.length > 0) {
      textContent = credibility.warnings.join(' ');
    } else {
      textContent = '투자자 유의사항 정보가 없습니다.';
    }
    credibilityText.textContent = textContent;
  } else {
    credibilityBadge.textContent = '보통';
    credibilityBadge.style.background = '#fbbf24';
    credibilityBadge.style.color = '#1a1d29';
    credibilityCard.style.setProperty('--credibility-color', '#fbbf24');
    credibilityText.textContent = '평가 근거 정보가 없습니다.';
  }
}

// 종목 검증 섹션 업데이트 (UI 시안 완전 호환)
function updateStockVerificationSection(stockVerifications) {
  const verificationContainer = fraudOverlay.querySelector('#stockVerification');
  
  if (!stockVerifications || stockVerifications.length === 0) {
    verificationContainer.innerHTML = createEmptyStockInfo();
    return;
  }
  
  // 종목을 정상/주의로 분류
  const { normalStocks, cautionStocks } = classifyStocks(stockVerifications);
  
  let html = '';
  
  // 정상 상장 종목 그룹 (있는 경우만)
  if (normalStocks.length > 0) {
    html += createStockGroup('정상 상장 종목', 'normal', normalStocks);
  }
  
  // 투자 주의 종목 그룹 (있는 경우만)
  if (cautionStocks.length > 0) {
    html += createStockGroup('투자 주의 종목', 'caution', cautionStocks);
  }
  
  // 둘 다 없으면 빈 정보 표시
  if (normalStocks.length === 0 && cautionStocks.length === 0) {
    html = createEmptyStockInfo();
  }
  
  verificationContainer.innerHTML = html;
  console.log('종목 정보 HTML 생성 완료');
}

// 종목 분류 함수
// 종목 분류 함수 (UI 시안 호환 - 개선됨)
function classifyStocks(stockVerifications) {
  const normalStocks = [];
  const cautionStocks = [];
  
  stockVerifications.forEach(stockGroup => {
    // 각 종목의 정보들을 합쳐서 하나의 설명으로 만듦
    const combinedInfo = stockGroup.infos.map(info => {
      // 투자주의 종목의 경우 괄호 내용만 추출하고 나머지 내용도 포함
      let content = info.content;
      if (content.includes('투자주의 종목(') && content.includes(')')) {
        // "투자주의 종목(택배 부문 실적 감소), 부채비율 정보 없음" 
        // → "택배 부문 실적 감소 문제, 부채비율 정보 없음"
        content = content.replace(/투자주의 종목\(([^)]+)\)/, '$1 문제');
      }
      // 추가: 단순히 "투자주의:"로 시작하는 경우도 처리
      if (content.startsWith('투자주의:')) {
        content = content.replace(/^투자주의:\s*/, '');
      }
      return content;
    }).join(', ');
    
    const stockInfo = {
      name: stockGroup.stock,
      detail: combinedInfo,
      hasNegative: stockGroup.hasNegative
    };
    
    // 투자주의/경고/위험/비상장 모두 주의 그룹으로
    if (stockGroup.hasNegative || 
        combinedInfo.includes('투자주의') ||
        combinedInfo.includes('투자경고') ||
        combinedInfo.includes('투자위험') ||
        combinedInfo.includes('상장되지 않') ||
        combinedInfo.includes('재무상태 주의')) {
      cautionStocks.push(stockInfo);
    } else {
      normalStocks.push(stockInfo);
    }
  });
  
  return { normalStocks, cautionStocks };
}

// 종목 그룹 HTML 생성 (아이콘 제거)
function createStockGroup(groupTitle, statusType, stocks) {
  const stockItemsHtml = stocks.map(stock => `
    <div class="stock-item">
      <div>
        <div class="stock-name">${stock.name}</div>
        <div class="stock-detail">${stock.detail}</div>
      </div>
    </div>
  `).join('');
  
  return `
    <div class="stock-group">
      <div class="stock-group-header">
        <div class="status-indicator ${statusType}"></div>
        <div class="group-title">${groupTitle}</div>
      </div>
      <div class="stock-list">
        ${stockItemsHtml}
      </div>
    </div>
  `;
}

// 빈 종목 정보 HTML
function createEmptyStockInfo() {
  return `
    <div class="stock-group">
      <div class="stock-group-header">
        <div class="status-indicator normal"></div>
        <div class="group-title">종목 정보</div>
      </div>
      <div class="stock-list">
        <div class="stock-item">
          <div>
            <div class="stock-detail">검증할 종목이 없습니다.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 사기 경고 섹션 업데이트 (소제목과 설명 분리)
function updateFraudWarningsSection(fraudWarnings) {
  const warningsCard = fraudOverlay.querySelector('#fraudWarningsCard');
  const warningsContainer = fraudOverlay.querySelector('#fraudWarnings');
  
  // 경고가 없으면 전체 섹션 숨김
  if (!fraudWarnings || fraudWarnings.length === 0) {
    warningsCard.style.display = 'none';
    return;
  }
  
  const warningsHtml = fraudWarnings.map(warning => `
    <div class="warning-item">
      <div class="warning-pattern">${warning.pattern}</div>
      <div class="warning-description">${warning.description}</div>
    </div>
  `).join('');
  
  warningsContainer.innerHTML = warningsHtml;
  warningsCard.style.display = 'block';
}

// 업로더 신분 확인 섹션 업데이트
function updateUploaderVerificationSection(uploaderVerification) {
  const uploaderCard = fraudOverlay.querySelector('#uploaderVerificationCard');
  const uploaderBadge = fraudOverlay.querySelector('#uploaderBadge');
  const uploaderText = fraudOverlay.querySelector('#uploaderText');
  
  // 제도권 금융회사 또는 유사투자자문업자인 경우만 표시
  if (uploaderVerification && 
      (uploaderVerification.is_institutional || uploaderVerification.is_similar_advisor)) {
    
    uploaderCard.style.display = 'block';
    uploaderBadge.textContent = '확인';
    
    // 초록색 스타일 적용
    uploaderBadge.className = 'credibility-badge confirmed';
    uploaderCard.style.setProperty('--credibility-color', '#22c55e'); // 초록색
    
    // 메시지 설정
    let message = '';
    let tooltipText = '';
    
    if (uploaderVerification.is_institutional) {
      message = `제도권 금융회사\n제도권 기관의 조언이라 하더라도 투자 책임은 투자자 본인에게 있습니다.`;
      tooltipText = `금융소비자 정보포털 '파인'에 등록된 제도권 금융회사입니다.`;
    } else if (uploaderVerification.is_similar_advisor) {
      message = `유사투자자문업자\n정식 금융투자업자가 아니므로, 개별 상담이나 자금운용이 불가능합니다.`;
      tooltipText = `금융소비자 정보포털 '파인'에 등록된 유사투자자문업체입니다.`;
    }
    
    uploaderText.textContent = message;
    
    // 툴팁 업데이트 (i 아이콘 호버용)
    const tooltip = uploaderCard.querySelector('.tooltip');
    if (tooltip) {
      tooltip.textContent = tooltipText;
    }
    
  } else {
    uploaderCard.style.display = 'none';
  }
}

// 법률 위반사항 섹션 업데이트
function updateLegalComplianceSection(legalCompliance) {
  const legalCard = fraudOverlay.querySelector('#legalComplianceCard');
  const legalViolations = fraudOverlay.querySelector('#legalViolations');
  
  // 유사투자자문업자이고 위반사항이 있는 경우만 표시
  if (legalCompliance && legalCompliance.has_violations && legalCompliance.violations.length > 0) {
    
    const violationsHtml = legalCompliance.violations.map(violation => {
      let title = '';
      let description = '';
      
      // 위반 유형별 제목 설정
      switch(violation.type) {
        case '일대일 투자자문':
          title = '일대일 투자자문 금지 위반';
          description = '유사투자자문업자는 불특정 다수를 대상으로 한 일방적 정보 전달만 가능하며, 개별 투자상담은 금지됩니다.';
          break;
        case '손실보전_이익보장':
          title = '손실보전/이익보장 금지 위반';
          description = '투자 손실 보전이나 특정 이익을 보장하는 행위는 엄격히 금지됩니다.';
          break;
        case '준수사항 누락':
          title = '필수 고지사항 누락';
          description = `필수 고지사항 中 해당되는 것만\n${violation.description.replace('필수 고지사항 누락: ', '').split(',').map(item => `"${item.trim()}"`).join('\n')}`;
          break;
        case '단정적/판단':
          title = '단정적 판단 제공 금지 위반';
          description = '불확실한 투자 결과에 대해 단정적 판단을 제공하거나 확실하다고 오인하게 하는 표현은 금지됩니다.';
          break;
        case '허위/과장':
          title = '허위/과장 광고 금지 위반';
          description = '수익률을 사실과 다르게 표시하거나 객관적 근거 없는 과장 광고는 금지됩니다.';
          break;
        default:
          title = violation.type;
          description = violation.description;
      }
      
      return `
        <div class="warning-item">
          <div class="warning-pattern">${title}</div>
          <div class="warning-description">${description}</div>
        </div>
      `;
    }).join('');
    
    legalViolations.innerHTML = violationsHtml;
    legalCard.style.display = 'block';
    
  } else {
    legalCard.style.display = 'none';
  }
}

// 종목 검증 정보 파싱 (아이콘 완전 제거)
// Detail 탭 업데이트
function updateDetailTab(data) {
  const detailContainer = fraudOverlay.querySelector('#detailContent');
  
  if (data.comparisons && data.comparisons.length > 0) {
    detailContainer.innerHTML = `
      <div class="section">
        ${data.comparisons
          .map(comparison => {
            let html = '<div class="comparison-card">';
            
            if (comparison.quote) {
              html += `
                <div class="quote-box">
                  <div class="quote-text">"${comparison.quote}"</div>
                </div>
              `;
            }
            
            if (comparison.fact) {
              html += `
                <div class="fact-box">
                  <div class="fact-text">${comparison.fact}</div>
                </div>
              `;
            }
            
            html += '</div>';
            return html;
          }).join('')}
      </div>
    `;
  } else {
    detailContainer.innerHTML = `
      <div class="section">
        <div class="comparison-card">
          <div class="fact-box">
            <div class="fact-text">세부 비교 정보가 없습니다.</div>
          </div>
        </div>
      </div>
    `;
  }
}

// ========== A 폴더의 자막 추출 코드 적용 ==========

// 메시지 리스너 등록
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'extractSubtitles') {
    extractSubtitles().then(function(result) {
      sendResponse(result);
    }).catch(function(error) {
      sendResponse({success: false, error: error.message});
    });
    return true;
  }
});



// A 폴더의 자막 추출 함수
async function extractSubtitles() {
  try {
    // 방법 1: YouTube Transcript API 사용 (가장 정확)
    const transcriptSubtitles = await extractFromYouTubeTranscript();
    if (transcriptSubtitles.length > 0) {
      const fullText = transcriptSubtitles.map(sub => sub.text).join('\n');
      return {
        success: true,
        subtitles: fullText,
        count: transcriptSubtitles.length
      };
    }

    // 방법 2: 비디오 트랙에서 직접 추출
    const videoSubtitles = await extractFromVideoTracks();
    if (videoSubtitles.length > 0) {
      const fullText = videoSubtitles.map(sub => sub.text).join('\n');
      return {
        success: true,
        subtitles: fullText,
        count: videoSubtitles.length
      };
    }

    // 방법 3: 자막 버튼을 통한 추출
    const subtitleButton = findSubtitleButton();
    if (subtitleButton) {
      const subtitles = await collectSubtitleData();
      if (subtitles && subtitles.length > 0) {
        const fullText = subtitles.map(sub => sub.text).join('\n');
        return {
          success: true,
          subtitles: fullText,
          count: subtitles.length
        };
      }
    }

    return {success: false, error: '자막을 찾을 수 없습니다. 자막이 활성화되어 있는지 확인해주세요.'};

  } catch (error) {
    console.error('자막 추출 오류:', error);
    return {success: false, error: error.message};
  }
}

// YouTube Transcript API를 사용한 자막 추출
async function extractFromYouTubeTranscript() {
  try {
    // 현재 페이지의 비디오 ID 추출
    const videoId = getVideoId();
    if (!videoId) {
      console.error('비디오 ID를 찾을 수 없습니다.');
      return [];
    }

    // 방법 1: 간단한 자막 API 호출
    const simpleTranscript = await fetchSimpleTranscript(videoId);
    if (simpleTranscript.length > 0) {
      return simpleTranscript;
    }

    // 방법 2: YouTube 내부 API 사용
    const internalTranscript = await fetchInternalTranscript(videoId);
    if (internalTranscript && internalTranscript.length > 0) {
      return internalTranscript;
    }

    return [];
  } catch (error) {
    console.error('YouTube Transcript API 오류:', error);
    return [];
  }
}

// 간단한 자막 API 호출
async function fetchSimpleTranscript(videoId) {
  try {
    // 다양한 언어로 자막 시도
    const languages = ['ko', 'en', 'ja', 'zh'];
    
    for (const lang of languages) {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const xmlText = await response.text();
        const subtitles = parseTranscriptXML(xmlText);
        if (subtitles.length > 0) {
          console.log(`자막을 찾았습니다: ${lang} 언어`);
          return subtitles;
        }
      }
    }
    
    return [];
  } catch (error) {
    console.error('간단한 자막 API 오류:', error);
    return [];
  }
}



// YouTube 내부 API를 사용한 자막 추출
async function fetchInternalTranscript(videoId) {
  try {
    // YouTube의 내부 API 엔드포인트
    const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`;
    
    const requestBody = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20231219.01.00"
        }
      },
      videoId: videoId
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const data = await response.json();
      
      // 자막 데이터 추출
      const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions && captions.length > 0) {
        // 한국어 자막 우선
        let selectedCaption = captions[0];
        for (const caption of captions) {
          if (caption.languageCode === 'ko') {
            selectedCaption = caption;
            break;
          }
        }
        
        if (selectedCaption.baseUrl) {
          const transcriptResponse = await fetch(selectedCaption.baseUrl);
          if (transcriptResponse.ok) {
            const xmlText = await transcriptResponse.text();
            return parseTranscriptXML(xmlText);
          }
        }
      }
    }

    return [];
  } catch (error) {
    console.error('YouTube 내부 API 오류:', error);
    return [];
  }
}

// 사용 가능한 자막 목록 가져오기
async function getAvailableTranscripts(videoId) {
  try {
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const response = await fetch(listUrl);
    
    if (response.ok) {
      const xmlText = await response.text();
      return parseTranscriptList(xmlText);
    }
    
    return [];
  } catch (error) {
    console.error('자막 목록 가져오기 오류:', error);
    return [];
  }
}

// 자막 목록 XML 파싱
function parseTranscriptList(xmlText) {
  const transcripts = [];
  
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const trackElements = xmlDoc.querySelectorAll('track');
    
    trackElements.forEach(track => {
      const lang = track.getAttribute('lang_code');
      const name = track.getAttribute('name');
      const url = track.getAttribute('url');
      
      if (lang && url) {
        transcripts.push({
          lang: lang,
          name: name || lang,
          url: url
        });
      }
    });
  } catch (error) {
    console.error('자막 목록 파싱 오류:', error);
  }
  
  return transcripts;
}

// 자막 XML 파싱
function parseTranscriptXML(xmlText) {
  const subtitles = [];
  
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textElements = xmlDoc.querySelectorAll('text');
    
    textElements.forEach(element => {
      const text = element.textContent.trim();
      const start = parseFloat(element.getAttribute('start') || 0);
      const duration = parseFloat(element.getAttribute('dur') || 0);
      
      if (text && text.length > 0) {
        subtitles.push({
          start: start,
          end: start + duration,
          text: text
        });
      }
    });
  } catch (error) {
    console.error('자막 XML 파싱 오류:', error);
  }
  
  return subtitles;
}

// 비디오 트랙에서 직접 자막 추출
async function extractFromVideoTracks() {
  const video = document.querySelector('video');
  if (!video) return [];

  const tracks = video.textTracks;
  if (!tracks || tracks.length === 0) return [];

  const subtitles = [];
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    
    // 활성화된 자막 트랙이거나 자막이 있는 트랙
    if (track.mode === 'showing' || track.mode === 'hidden') {
      if (track.cues && track.cues.length > 0) {
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j];
          if (cue.text && cue.text.trim()) {
            subtitles.push({
              start: cue.startTime,
              end: cue.endTime,
              text: cue.text.trim()
            });
          }
        }
      }
    }
  }

  // 자막이 없으면 다른 방법 시도
  if (subtitles.length === 0) {
    return await tryAlternativeSubtitleExtraction();
  }

  return subtitles;
}

// 대안적인 자막 추출 방법
async function tryAlternativeSubtitleExtraction() {
  try {
    // 유튜브의 자막 데이터를 직접 가져오기
    const ytInitialData = getYouTubeInitialData();
    if (ytInitialData) {
      const captions = extractCaptionsFromInitialData(ytInitialData);
      if (captions.length > 0) {
        return captions;
      }
    }

    // 현재 표시되는 자막에서 추출
    const currentSubtitles = extractCurrentSubtitles();
    if (currentSubtitles.length > 0) {
      return currentSubtitles;
    }

    return [];
  } catch (error) {
    console.error('대안 자막 추출 오류:', error);
    return [];
  }
}

// YouTube 초기 데이터에서 자막 추출
function getYouTubeInitialData() {
  try {
    // ytInitialData 스크립트 태그 찾기
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent && script.textContent.includes('ytInitialData')) {
        const match = script.textContent.match(/ytInitialData\s*=\s*({.+?});/);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
    return null;
  } catch (error) {
    console.error('YouTube 초기 데이터 파싱 오류:', error);
    return null;
  }
}

// 초기 데이터에서 자막 추출
function extractCaptionsFromInitialData(data) {
  const subtitles = [];
  
  try {
    // 자막 데이터 경로 탐색
    const playerResponse = data?.playerResponse || data?.responseContext?.serviceTrackingParams;
    if (playerResponse) {
      const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions && captions.length > 0) {
        // 첫 번째 자막 트랙 사용
        const captionTrack = captions[0];
        if (captionTrack.baseUrl) {
          // 자막 URL에서 자막 데이터 가져오기
          return fetchCaptionData(captionTrack.baseUrl);
        }
      }
    }
  } catch (error) {
    console.error('초기 데이터에서 자막 추출 오류:', error);
  }
  
  return subtitles;
}

// 자막 데이터 가져오기
async function fetchCaptionData(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    // XML 파싱하여 자막 추출
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    const textElements = xmlDoc.querySelectorAll('text');
    
    const subtitles = [];
    textElements.forEach(element => {
      const text = element.textContent.trim();
      if (text) {
        subtitles.push({
          text: text,
          start: parseFloat(element.getAttribute('start') || 0),
          end: parseFloat(element.getAttribute('dur') || 0)
        });
      }
    });
    
    return subtitles;
  } catch (error) {
    console.error('자막 데이터 가져오기 오류:', error);
    return [];
  }
}

// 자막 버튼 찾기
function findSubtitleButton() {
  // 여러 가능한 선택자 시도
  const selectors = [
    'button[aria-label*="자막"]',
    'button[aria-label*="subtitle"]',
    'button[aria-label*="CC"]',
    'button[aria-label*="캡션"]',
    'button[aria-label*="caption"]',
    '.ytp-subtitles-button',
    '[data-tooltip-target-id="ytp-subtitles-button"]'
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      return button;
    }
  }

  // 더 일반적인 방법으로 자막 관련 버튼 찾기
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const ariaLabel = button.getAttribute('aria-label') || '';
    if (ariaLabel.toLowerCase().includes('자막') || 
        ariaLabel.toLowerCase().includes('subtitle') ||
        ariaLabel.toLowerCase().includes('cc') ||
        ariaLabel.toLowerCase().includes('caption')) {
      return button;
    }
  }

  return null;
}

// 자막 패널 열기
async function openSubtitlePanel(subtitleButton) {
  // 자막 버튼 클릭
  subtitleButton.click();
  
  // 패널이 나타날 때까지 대기
  await waitForElement('.ytp-panel-menu');
  
  // 자막 설정 메뉴 클릭
  const settingsButton = document.querySelector('.ytp-settings-button');
  if (settingsButton) {
    settingsButton.click();
    await waitForElement('.ytp-panel-menu');
    
    // 자막 메뉴 클릭
    const subtitleMenu = findSubtitleMenu();
    if (subtitleMenu) {
      subtitleMenu.click();
      await waitForElement('.ytp-panel-menu');
    }
  }
}

// 자막 메뉴 찾기
function findSubtitleMenu() {
  const menuItems = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
  for (const item of menuItems) {
    const text = item.textContent.toLowerCase();
    if (text.includes('자막') || text.includes('subtitle') || text.includes('cc')) {
      return item;
    }
  }
  return null;
}

// 자막 데이터 수집
async function collectSubtitleData() {
  // 방법 1: 자막 트랙에서 직접 추출 (가장 정확한 방법)
  const subtitleTracks = await getSubtitleTracks();
  if (subtitleTracks.length > 0) {
    const trackSubtitles = await extractFromTracks(subtitleTracks);
    if (trackSubtitles.length > 0) {
      return trackSubtitles;
    }
  }

  // 방법 2: 현재 표시되는 자막에서 추출
  const currentSubtitles = extractCurrentSubtitles();
  if (currentSubtitles.length > 0) {
    return currentSubtitles;
  }

  // 방법 3: 자막 컨테이너에서 추출
  const containerSubtitles = extractFromSubtitleContainer();
  if (containerSubtitles.length > 0) {
    return containerSubtitles;
  }

  // 방법 4: 자막 설정에서 전체 자막 가져오기
  return await extractFromSubtitleSettings();
}

// 자막 트랙 가져오기
async function getSubtitleTracks() {
  const video = document.querySelector('video');
  if (!video) return [];

  return video.textTracks || [];
}

// 트랙에서 자막 추출
async function extractFromTracks(tracks) {
  const subtitles = [];
  
  for (const track of tracks) {
    if (track.mode === 'showing') {
      // 활성화된 자막 트랙에서 추출
      const cues = track.cues;
      if (cues) {
        for (let i = 0; i < cues.length; i++) {
          const cue = cues[i];
          subtitles.push({
            start: cue.startTime,
            end: cue.endTime,
            text: cue.text
          });
        }
      }
    }
  }

  return subtitles;
}

// 자막 설정에서 전체 자막 가져오기
async function extractFromSubtitleSettings() {
  try {
    // 자막 버튼 클릭하여 자막 패널 열기
    const subtitleButton = findSubtitleButton();
    if (!subtitleButton) {
      return [];
    }

    // 자막 버튼 클릭
    subtitleButton.click();
    await new Promise(resolve => setTimeout(resolve, 500));

    // 자막 옵션 메뉴 찾기
    const subtitleOptions = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
    let subtitleMenu = null;
    
    for (const option of subtitleOptions) {
      const text = option.textContent.toLowerCase();
      if (text.includes('자막') || text.includes('subtitle') || text.includes('cc')) {
        subtitleMenu = option;
        break;
      }
    }

    if (subtitleMenu) {
      subtitleMenu.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 자막 트랙 목록에서 활성화된 자막 찾기
    const activeSubtitle = await findActiveSubtitleTrack();
    if (activeSubtitle) {
      return await getFullSubtitleText(activeSubtitle);
    }

    return [];
  } catch (error) {
    console.error('자막 설정에서 추출 오류:', error);
    return [];
  }
}

// 활성화된 자막 트랙 찾기
async function findActiveSubtitleTrack() {
  const video = document.querySelector('video');
  if (!video) return null;

  const tracks = video.textTracks;
  if (!tracks) return null;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.mode === 'showing' && track.cues && track.cues.length > 0) {
      return track;
    }
  }

  return null;
}

// 전체 자막 텍스트 가져오기
async function getFullSubtitleText(track) {
  const subtitles = [];
  
  if (track.cues) {
    for (let i = 0; i < track.cues.length; i++) {
      const cue = track.cues[i];
      if (cue.text && cue.text.trim()) {
        subtitles.push({
          start: cue.startTime,
          end: cue.endTime,
          text: cue.text.trim()
        });
      }
    }
  }

  return subtitles;
}

// 현재 표시되는 자막 추출 (개선된 버전)
function extractCurrentSubtitles() {
  const subtitles = [];
  
  // 실제 자막 컨테이너만 찾기
  const subtitleSelectors = [
    '.ytp-caption-segment',
    '.ytp-caption-window .ytp-caption-segment',
    '[class*="caption-segment"]',
    '[class*="subtitle-segment"]'
  ];

  for (const selector of subtitleSelectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      const text = element.textContent.trim();
      // 실제 자막인지 확인 (너무 짧거나 UI 텍스트가 아닌지)
      if (text && text.length > 2 && !isUIText(text)) {
        subtitles.push({
          text: text,
          timestamp: getCurrentTime()
        });
      }
    });
  }

  return subtitles;
}

// UI 텍스트인지 확인하는 함수
function isUIText(text) {
  const uiKeywords = [
    '구독', '공유', '좋아요', '댓글', '재생', '일시정지', '볼륨', '설정',
    'subscribe', 'share', 'like', 'comment', 'play', 'pause', 'volume', 'settings',
    '자막', 'subtitle', 'cc', '캡션', 'caption', '옵션', 'option'
  ];

  const lowerText = text.toLowerCase();
  return uiKeywords.some(keyword => lowerText.includes(keyword));
}

// 자막 컨테이너에서 추출 (개선된 버전)
function extractFromSubtitleContainer() {
  const subtitles = [];
  
  // 더 구체적인 자막 선택자들
  const selectors = [
    '.ytp-caption-segment',
    '.ytp-caption-window-container .ytp-caption-segment',
    '.ytp-caption-window .ytp-caption-segment',
    '[class*="caption-segment"]',
    '[class*="subtitle-segment"]'
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      const text = element.textContent.trim();
      // 실제 자막인지 확인
      if (text && text.length > 2 && !isUIText(text)) {
        // 중복 제거
        if (!subtitles.some(sub => sub.text === text)) {
          subtitles.push({
            text: text,
            timestamp: getCurrentTime()
          });
        }
      }
    });
  }

  return subtitles;
}

// 현재 시간 가져오기
function getCurrentTime() {
  const video = document.querySelector('video');
  return video ? video.currentTime : 0;
}

// 요소 대기 함수
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`요소를 찾을 수 없습니다: ${selector}`));
    }, timeout);
  });
}

// 대안: XMLHttpRequest를 사용한 API 호출
function makeXHRRequest(url, method, data, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          console.error('JSON 파싱 오류:', e, '응답:', xhr.responseText);
          reject(new Error('JSON 파싱 오류: ' + e.message));
        }
      } else {
        const errorMsg = `HTTP 오류: ${xhr.status} ${xhr.statusText}`;
        console.error(errorMsg, '응답:', xhr.responseText);
        reject(new Error(errorMsg));
      }
    };
    
    xhr.onerror = function() {
      const errorMsg = '네트워크 오류';
      console.error(errorMsg, 'URL:', url, 'Method:', method);
      
      // 재시도 로직 (최대 2회)
      if (retryCount < 2) {
        console.log(`🔄 재시도 중... (${retryCount + 1}/3)`);
        setTimeout(() => {
          makeXHRRequest(url, method, data, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, 1000 * (retryCount + 1)); // 지수 백오프
      } else {
        reject(new Error(errorMsg));
      }
    };
    
    xhr.ontimeout = function() {
      const errorMsg = '요청 시간 초과';
      console.error(errorMsg, 'URL:', url, 'Method:', method);
      
      // 재시도 로직 (최대 1회)
      if (retryCount < 1) {
        console.log(`🔄 시간 초과 재시도 중... (${retryCount + 1}/2)`);
        setTimeout(() => {
          makeXHRRequest(url, method, data, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, 2000);
      } else {
        reject(new Error(errorMsg));
      }
    };
    
    xhr.timeout = 15000; // 15초 타임아웃 (증가)
    
    try {
      if (data) {
        xhr.send(JSON.stringify(data));
      } else {
        xhr.send();
      }
    } catch (sendError) {
      console.error('XHR send 오류:', sendError);
      reject(new Error('요청 전송 실패: ' + sendError.message));
    }
  });
}

// XMLHttpRequest를 사용한 분석 시작
async function startAnalysisWithXHR(script, uploadDate, channelName, channel_handle) {
  try {
    console.log('🔄 XHR 분석 시작 시도...');
    
    // 디버깅 로그 추가
    console.log('🚀 XHR 요청 데이터:', {
      scriptLength: script?.length || 0,
      uploadDate: uploadDate,
      channelName: channelName,
      channelHandle: channel_handle,
      scriptPreview: script?.substring(0, 100) + '...' || 'null'
    });
    
    // 서버 연결 상태 확인
    const serverCheck = await checkServerConnection();
    if (!serverCheck.available) {
      throw new Error(`서버 연결 불가: ${serverCheck.reason}`);
    }
    
    const requestData = {
      script: script,
      upload_date: uploadDate,
      channel_name: channelName,
      channel_handle: channel_handle
    };
    
    console.log('🚀 백엔드 전송 데이터 (XHR 방식):', {
      scriptLength: requestData.script?.length || 0,
      upload_date: requestData.upload_date,
      channel_name: requestData.channel_name,
      channel_handle: requestData.channel_handle,
      channel_handle_type: typeof requestData.channel_handle,
      channel_handle_length: requestData.channel_handle?.length || 0
    });
    
    const startData = await makeXHRRequest('http://127.0.0.1:5000/start_analysis', 'POST', requestData);
    
    if (!startData.success) {
      throw new Error(startData.error || '서버 응답 오류');
    }
    
    console.log('✅ XHR 분석 시작 성공:', startData.analysis_id);
    return startData.analysis_id;
  } catch (error) {
    console.error('❌ XHR 분석 시작 오류:', error);
    
    // 오류 타입별 처리
    if (error.message.includes('네트워크 오류')) {
      console.warn('⚠️ 네트워크 오류 - 서버가 실행되지 않았을 수 있습니다.');
      showError('분석 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
    } else if (error.message.includes('CORS')) {
      console.warn('⚠️ CORS 오류 - 브라우저 보안 정책으로 차단됨');
      showError('브라우저 보안 정책으로 인해 분석 서버에 접근할 수 없습니다.');
    } else {
      showError(`분석 시작 중 오류가 발생했습니다: ${error.message}`);
    }
    
    throw error;
  }
}

// 서버 연결 상태 확인 (재시도 로직 포함)
async function checkServerConnection(retryCount = 0, maxRetries = 3) {
  try {
    console.log('🔍 서버 연결 상태 확인 중...', retryCount > 0 ? `(재시도 ${retryCount}/${maxRetries})` : '');
    
    // AbortController를 사용한 타임아웃 처리
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
    
    const response = await fetch('http://127.0.0.1:5000/health', {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('✅ 서버 연결 성공');
      return { available: true };
    } else {
      console.warn('⚠️ 서버 응답 오류:', response.status);
      
      // 재시도 가능한 상태 코드인 경우
      if ((response.status >= 500 || response.status === 429) && retryCount < maxRetries) {
        console.log(`🔄 서버 오류로 인한 재시도 예정... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // 지수적 백오프
        return checkServerConnection(retryCount + 1, maxRetries);
      }
      
      return { available: false, reason: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error('❌ 서버 연결 실패:', error);
    
    // AbortError는 타임아웃을 의미
    if (error.name === 'AbortError') {
      if (retryCount < maxRetries) {
        console.log(`🔄 타임아웃으로 인한 재시도... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return checkServerConnection(retryCount + 1, maxRetries);
      }
      return { available: false, reason: '연결 시간 초과' };
    }
    
    // TypeError는 주로 네트워크 연결 실패
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      if (retryCount < maxRetries) {
        console.log(`🔄 네트워크 오류로 인한 재시도... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return checkServerConnection(retryCount + 1, maxRetries);
      }
      return { available: false, reason: '서버가 실행되지 않음' };
    }
    
    if (error.message.includes('CORS')) {
      return { available: false, reason: 'CORS 정책 차단' };
    }
    
    // 기타 오류의 경우 재시도
    if (retryCount < maxRetries) {
      console.log(`🔄 기타 오류로 인한 재시도... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return checkServerConnection(retryCount + 1, maxRetries);
    }
    
    return { available: false, reason: error.message };
  }
}

// XMLHttpRequest를 사용한 상태 확인
async function checkStatusWithXHR(analysisId) {
  try {
    console.log('🔄 XHR 상태 확인 시도...');
    
    const statusData = await makeXHRRequest(`http://127.0.0.1:5000/status/${analysisId}`, 'GET');
    
    if (!statusData.success) {
      throw new Error(statusData.error || '상태 조회 실패');
    }
    
    console.log('✅ XHR 상태 확인 성공:', statusData.data);
    return statusData.data;
  } catch (error) {
    console.error('❌ XHR 상태 확인 오류:', error);
    
    // 오류 타입별 처리
    if (error.message.includes('네트워크 오류')) {
      console.warn('⚠️ 네트워크 오류 - 서버 연결이 끊어졌을 수 있습니다.');
    } else if (error.message.includes('시간 초과')) {
      console.warn('⚠️ 요청 시간 초과 - 서버 응답이 느림');
    }
    
    throw error;
  }
}

// ========== 링크 경고 시스템 ==========

// 위험 링크 패턴 및 경고 메시지
const LINK_WARNINGS = {
  'telegram': {
    pattern: /https?:\/\/t\.me\/[\w\d_-]+/gi,
    message: '🚨 텔레그램 주의! 투자 채널은 사기에 자주 이용됩니다.'
  },
  'kakao': {
    pattern: /https?:\/\/open\.kakao\.com\/o\/[\w\d]+/gi,  
    message: '⚠️ 오픈채팅 주의! 개인정보 수집이나 투자사기 목적일 수 있습니다.'
  },
  'googleForms': {
    pattern: /https?:\/\/forms\.gle\/[\w\d_-]+/gi,
    message: '🔒 구글폼 주의! 금융정보 입력 시 각별히 주의하세요.'
  }
};

// 스캔할 영역 선택자
const TARGET_AREAS = [
  '#description',                    // 영상 설명란
  '#description-inline-expander',    // 더보기 버튼 내용
  '#expanded',                       // 펼쳐진 설명란
  '#comments',                       // 댓글 영역
  '.ytd-comment-renderer',           // 개별 댓글
  '#chat-messages',                  // 라이브 채팅
  '.yt-live-chat-text-message-renderer' // 라이브 채팅 메시지
];

let currentWarningTooltip = null;
let linkWarningStylesAdded = false;

// 링크 경고 시스템 초기화
function initLinkWarningSystem() {
  try {
    console.log('링크 경고 시스템 초기화 시작');
    
    // 스타일 추가
    addLinkWarningStyles();
    
    // 더보기 버튼 자동 클릭
    expandDescriptionIfNeeded();
    
    // 잠시 후 링크 스캔 (더보기 확장 대기)
    setTimeout(() => {
      scanForSuspiciousLinks();
    }, 1000);
    
  } catch (error) {
    console.error('링크 경고 시스템 초기화 오류:', error);
  }
}

// 스타일 추가
function addLinkWarningStyles() {
  if (linkWarningStylesAdded) return;
  
  const styles = document.createElement('style');
  styles.id = 'link-warning-styles';
  styles.textContent = `
    /* 위험 링크 하이라이트 */
    .suspicious-link-highlight {
      background: #fef3c7 !important;
      color: #92400e !important;
      padding: 2px 4px !important;
      border-radius: 4px !important;
      font-weight: 600 !important;
      cursor: help !important;
      text-decoration: none !important;
      display: inline-block !important;
      margin: 0 2px !important;
    }
    
    .suspicious-link-highlight:hover {
      background: #f59e0b !important;
      color: white !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3) !important;
    }
    
    /* 경고 툴팁 */
    .suspicious-link-warning {
      position: fixed !important;
      background: #1f2937 !important;
      color: white !important;
      padding: 12px 16px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      max-width: 300px !important;
      z-index: 999999 !important;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3) !important;
      border: 1px solid #374151 !important;
      line-height: 1.4 !important;
      white-space: pre-wrap !important;
      animation: fadeInTooltip 0.2s ease-out !important;
    }
    
    @keyframes pulse-warning {
      0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
      50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1); }
    }
    
    @keyframes fadeInTooltip {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  
  document.head.appendChild(styles);
  linkWarningStylesAdded = true;
  console.log('✅ 링크 경고 스타일 적용 완료');
}

// 더보기 버튼 자동 클릭
function expandDescriptionIfNeeded() {
  // 다양한 더보기 버튼 선택자들을 시도
  const selectors = [
    '#expand',
    '.yt-formatted-string[aria-label*="더보기"]',
    'button[aria-label*="더보기"]',
    'button[aria-label*="Show more"]',
    '#description-inline-expander button',
    '#description-inline-expander .yt-formatted-string',
    '.yt-core-attributed-string[aria-label*="더보기"]',
    '.ytd-text-inline-expander-button-view-model button',
    'tp-yt-paper-button[aria-label*="더보기"]',
    'tp-yt-paper-button[aria-label*="Show more"]'
  ];
  
  for (const selector of selectors) {
    const expandButton = document.querySelector(selector);
    if (expandButton && 
        expandButton.style.display !== 'none' && 
        expandButton.offsetParent !== null &&
        !expandButton.disabled) {
      console.log('더보기 버튼 자동 클릭:', selector);
      try {
        expandButton.click();
        // 클릭 후 잠시 대기하여 DOM 업데이트 확인
        setTimeout(() => {
          const stillExists = document.querySelector(selector);
          if (!stillExists || stillExists.style.display === 'none') {
            console.log('✅ 더보기 버튼 클릭 성공');
          }
        }, 100);
        break;
      } catch (error) {
        console.warn('더보기 버튼 클릭 실패:', error);
        continue;
      }
    }
  }
}

// 위험 링크 스캔
function scanForSuspiciousLinks() {
  console.log('위험 링크 스캔 시작');
  
  TARGET_AREAS.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      if (element) {
        scanElementForLinks(element);
      }
    });
  });
}

// 요소 내 링크 스캔
function scanElementForLinks(element) {
  const textContent = element.textContent || '';
  
  Object.keys(LINK_WARNINGS).forEach(type => {
    const config = LINK_WARNINGS[type];
    const matches = textContent.match(config.pattern);
    
    if (matches) {
      matches.forEach(match => {
        highlightSuspiciousLink(element, match, config.message);
      });
    }
  });
}

// 위험 링크 하이라이트 및 이벤트 추가
function highlightSuspiciousLink(element, linkText, warningMessage) {
  // 기존 하이라이트 확인
  if (element.querySelector('.suspicious-link-highlight')) return;
  
  // 링크 텍스트를 span으로 감싸기
  const innerHTML = element.innerHTML;
  const highlightedHTML = innerHTML.replace(
    new RegExp(escapeRegExp(linkText), 'gi'),
    `<span class="suspicious-link-highlight" data-warning="${warningMessage}">${linkText}</span>`
  );
  
  if (innerHTML !== highlightedHTML) {
    element.innerHTML = highlightedHTML;
    
    // 이벤트 리스너 추가
    const highlightedElements = element.querySelectorAll('.suspicious-link-highlight');
    highlightedElements.forEach(highlighted => {
      highlighted.addEventListener('mouseenter', showWarningTooltip);
      highlighted.addEventListener('mouseleave', hideWarningTooltip);
      highlighted.addEventListener('mousemove', updateTooltipPosition);
    });
  }
}

// 정규식 이스케이프 함수
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 경고 툴팁 표시
function showWarningTooltip(event) {
  const warningMessage = event.target.getAttribute('data-warning');
  if (!warningMessage) return;
  
  // 기존 툴팁 제거
  hideWarningTooltip();
  
  // 새 툴팁 생성
  const tooltip = document.createElement('div');
  tooltip.className = 'suspicious-link-warning';
  tooltip.textContent = warningMessage;
  
  // 위치 계산 (마우스 우상단, 더 멀리)
  const x = event.clientX + 20;
  const y = event.clientY - 35;
  
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  
  document.body.appendChild(tooltip);
  currentWarningTooltip = tooltip;
}

// 경고 툴팁 숨기기
function hideWarningTooltip() {
  if (currentWarningTooltip) {
    currentWarningTooltip.remove();
    currentWarningTooltip = null;
  }
}

// 툴팁 위치 업데이트
function updateTooltipPosition(event) {
  if (currentWarningTooltip) {
    const x = event.clientX + 20;
    const y = event.clientY - 35;
    
    currentWarningTooltip.style.left = x + 'px';
    currentWarningTooltip.style.top = y + 'px';
  }
}

// 모든 링크 경고 제거
function clearLinkWarnings() {
  // 툴팁 제거
  hideWarningTooltip();
  
  // 하이라이트 제거
  const highlightedLinks = document.querySelectorAll('.suspicious-link-highlight');
  highlightedLinks.forEach(link => {
    const parent = link.parentNode;
    parent.replaceChild(document.createTextNode(link.textContent), link);
    parent.normalize();
  });
}

// ========== 모듈 로딩 함수 추가 ==========
/**
 * 커뮤니티 모듈 사전 로딩 (백그라운드)
 */
async function preloadCommunityModules() {
  try {
    // 이미 로딩되어 있으면 스킵
    if (communityUI && communityData) {
      console.log('✅ 커뮤니티 모듈이 이미 로딩되어 있음');
      return true;
    }
    
    console.log('🚀 커뮤니티 모듈 사전 로딩 시작...');
    const success = await loadCommunityModules();
    
    if (success) {
      console.log('✅ 커뮤니티 모듈 사전 로딩 완료 - 즉시 사용 가능');
    } else {
      console.log('⚠️ 커뮤니티 모듈 사전 로딩 실패 - 필요시 재시도됨');
    }
    
    return success;
  } catch (error) {
    console.log('⚠️ 커뮤니티 모듈 사전 로딩 오류:', error.message);
    return false;
  }
}

/**
 * 모듈 동적 로딩
 */
async function loadCommunityModules() {
  try {
    console.log('📦 커뮤니티 모듈 로딩 시작...');
    console.log('📍 현재 URL:', chrome.runtime.getURL(''));
    
    const moduleBase = chrome.runtime.getURL('modules/');
    console.log('📂 모듈 베이스 URL:', moduleBase);
    
    // 각 모듈 개별 로딩 및 에러 체크
    let uiModule, dataModule;
    
    try {
      console.log('🔄 community-ui.js 로딩 중...');
      uiModule = await import(moduleBase + 'community-ui.js');
      console.log('✅ community-ui.js 로딩 완료:', Object.keys(uiModule));
    } catch (uiError) {
      console.error('❌ community-ui.js 로딩 실패:', uiError);
      throw new Error('UI 모듈 로딩 실패: ' + uiError.message);
    }
    
    try {
      console.log('🔄 community-data.js 로딩 중...');
      dataModule = await import(moduleBase + 'community-data.js');
      console.log('✅ community-data.js 로딩 완료:', Object.keys(dataModule));
    } catch (dataError) {
      console.error('❌ community-data.js 로딩 실패:', dataError);
      throw new Error('데이터 모듈 로딩 실패: ' + dataError.message);
    }
    
    communityUI = uiModule;
    communityData = dataModule;
    
    console.log('✅ 모든 커뮤니티 모듈 로딩 완료');
    return true;
  } catch (error) {
    console.error('❌ 커뮤니티 모듈 로딩 실패:', error);
    return false;
  }
}

// ========== 드롭다운 메뉴 관리 ==========

/**
 * 드롭다운 메뉴 설정
 */
function setupDropdownMenu() {
  const serviceTitle = fraudOverlay.querySelector('#serviceTitle');
  const dropdownArrow = fraudOverlay.querySelector('#dropdownArrow');
  const dropdownMenu = fraudOverlay.querySelector('#dropdownMenu');
  
  console.log('🔍 드롭다운 요소 확인:', {
    serviceTitle: !!serviceTitle,
    dropdownArrow: !!dropdownArrow,
    dropdownMenu: !!dropdownMenu,
    dropdownArrowText: dropdownArrow?.textContent,
    dropdownArrowStyle: dropdownArrow?.style.cssText
  });
  
  // 추가 로그
  console.log('🔍 서비스 제목 요소:', serviceTitle);
  console.log('🔍 드롭다운 화살표 요소:', dropdownArrow);
  console.log('🔍 드롭다운 메뉴 요소:', dropdownMenu);
  
  if (!serviceTitle || !dropdownArrow || !dropdownMenu) {
    console.error('❌ 드롭다운 요소를 찾을 수 없습니다.');
    console.error('serviceTitle:', serviceTitle);
    console.error('dropdownArrow:', dropdownArrow);
    console.error('dropdownMenu:', dropdownMenu);
    return;
  }
  
  // 드롭다운 화살표 강제 표시
  if (dropdownArrow) {
    dropdownArrow.style.display = 'inline-block';
    dropdownArrow.style.visibility = 'visible';
    console.log('✅ 드롭다운 화살표 강제 표시 적용');
  }
  
  let isDropdownOpen = false;
  
  // 드롭다운 토글 함수
  function toggleDropdown() {
    console.log('🔄 드롭다운 토글 시작, 현재 상태:', isDropdownOpen);
    isDropdownOpen = !isDropdownOpen;
    
    if (isDropdownOpen) {
      console.log('📂 드롭다운 열기');
      // 열기
      dropdownMenu.style.display = 'block';
      dropdownArrow.classList.add('active');
      
      // 애니메이션을 위한 지연
      setTimeout(() => {
        dropdownMenu.classList.add('show');
        console.log('✅ 드롭다운 메뉴 표시됨');
      }, 10);
      
      // 외부 클릭 감지 등록
      setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
        console.log('👂 외부 클릭 감지 등록됨');
      }, 100);
      
    } else {
      console.log('📁 드롭다운 닫기');
      // 닫기
      closeDropdown();
    }
  }
  
  // 드롭다운 닫기
  function closeDropdown() {
    isDropdownOpen = false;
    dropdownArrow.classList.remove('active');
    dropdownMenu.classList.remove('show');
    
    setTimeout(() => {
      dropdownMenu.style.display = 'none';
    }, 300);
    
    // 외부 클릭 감지 해제
    document.removeEventListener('click', handleOutsideClick);
  }
  
  // 외부 클릭 감지
  function handleOutsideClick(event) {
    if (!serviceTitle.contains(event.target)) {
      closeDropdown();
    }
  }
  
  // 서비스 제목 클릭 이벤트
  serviceTitle.addEventListener('click', (e) => {
    console.log('🎯 서비스 제목 클릭됨');
    e.stopPropagation();
    toggleDropdown();
  });
  
  // 드롭다운 아이템 클릭 이벤트
  const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item:not(.disabled)');
  dropdownItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      const menuType = item.getAttribute('data-menu');
      
      // 모든 아이템의 active 클래스 제거
      dropdownItems.forEach(i => i.classList.remove('active'));
      // 클릭한 아이템에 active 클래스 추가
      item.classList.add('active');
      
      // 메뉴 처리
      await handleMenuSelection(menuType);
      
      // 드롭다운 닫기
      closeDropdown();
    });
  });
}

/**
 * 서비스 타이틀 업데이트
 */
function updateServiceTitle(newTitle) {
  const serviceTitleElement = fraudOverlay.querySelector('.service-title');
  if (serviceTitleElement) {
    serviceTitleElement.textContent = newTitle;
    console.log('🏷️ 서비스 타이틀 업데이트:', newTitle);
  }
}

/**
 * 메뉴 선택 처리
 */
async function handleMenuSelection(menuType) {
  console.log('🎯 메뉴 선택됨:', menuType);
  
  switch (menuType) {
    case 'credibility':
      console.log('✅ 분석 리포트 선택됨 - 분석 화면으로 이동');
      updateServiceTitle('분석 리포트');
      await showAnalysisScreen();
      break;
      
    case 'community':
      console.log('💬 커뮤니티 기능 선택됨');
      updateServiceTitle('커뮤니티');
      try {
        await showCommunityScreen();
      } catch (error) {
        console.error('❌ 커뮤니티 화면 표시 오류:', error);
        const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
        if (dynamicContainer) {
          dynamicContainer.innerHTML = `
            <div class="error-state" style="display: block; padding: 20px; text-align: center; min-height: 400px; display: flex; flex-direction: column; justify-content: center;">
              <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
              <div class="error-text" style="margin-bottom: 16px; font-weight: 600;">커뮤니티 기능을 불러올 수 없습니다.</div>
              <div style="margin-bottom: 20px; color: #64748b; font-size: 14px;">${error.message}</div>
              <button class="retry-btn" onclick="location.reload()" style="padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">페이지 새로고침</button>
            </div>
          `;
          dynamicContainer.style.display = 'block';
          dynamicContainer.style.minHeight = '400px';
        }
      }
      break;
      
    case 'recommendations':
      console.log('🎯 관련 정보 제공 선택됨');
      updateServiceTitle('관련 정보 제공');
      await showRelatedInfoScreen();
      break;
      
    default:
      console.warn('⚠️ 알 수 없는 메뉴 타입:', menuType);
      break;
  }
}

/**
 * 커뮤니티 화면 표시
 */
async function showCommunityScreen() {
  try {
    console.log('🚀 커뮤니티 화면 표시 시작...');
    
    const analysisResult = fraudOverlay.querySelector('#analysisResult');
    const loadingState = fraudOverlay.querySelector('#loadingState');
    const errorState = fraudOverlay.querySelector('#errorState');
    const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
    const overlayContent = fraudOverlay.querySelector('.overlay-content');
    
    // 다른 화면들 숨기기 (관련정보제공과 동일하게)
    if (analysisResult) analysisResult.style.display = 'none';
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    
    if (!dynamicContainer) {
      throw new Error('동적 컨테이너를 찾을 수 없습니다.');
    }
    
    // 스크롤을 먼저 상단으로 이동
    if (overlayContent) {
      overlayContent.scrollTop = 0;
      overlayContent.classList.add('community-active');
    }
    
    // 커뮤니티 모듈 로드 전에는 로딩 상태 표시하지 않음
    if (communityUI && communityData) {
      // 모듈이 이미 로드된 경우에만 로딩 화면 표시
      dynamicContainer.innerHTML = `
        <div class="community-container" style="min-height: 400px; display: flex; flex-direction: column;">
          <div class="community-header">
            <button class="back-btn" id="backBtn" style="font-weight: bold;">← 뒤로가기</button>
            <div class="community-stats">
              <div class="loading-text">커뮤니티를 불러오는 중...</div>
            </div>
          </div>
          <div class="comments-list" style="flex: 1; min-height: 300px; display: flex; align-items: center; justify-content: center;">
            <div class="loading-text">댓글을 불러오는 중...</div>
          </div>
        </div>
      `;
      
      // 모듈이 준비된 경우에만 컨테이너 표시
      dynamicContainer.style.display = 'block';
      dynamicContainer.style.minHeight = '400px';
      dynamicContainer.style.height = 'auto';
    }
    
    // 뒤로가기 버튼 이벤트 (즉시 연결)
    const backBtn = dynamicContainer.querySelector('#backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', showAnalysisScreen);
    }
    
    // 현재 비디오 ID 설정
    currentVideoId = getVideoId();
    console.log('📹 현재 비디오 ID:', currentVideoId);
    
    // 커뮤니티 모듈 로드 확인
    if (!communityUI || !communityData) {
      console.log('📦 커뮤니티 모듈이 없음 - 로딩 시도...');
      const loaded = await loadCommunityModules();
      if (!loaded) {
        throw new Error('커뮤니티 모듈 로딩에 실패했습니다.');
      }
    }
    
    // createCommunityHTML 함수 존재 확인
    if (!communityUI.createCommunityHTML || typeof communityUI.createCommunityHTML !== 'function') {
      console.error('❌ createCommunityHTML 함수를 찾을 수 없음');
      throw new Error('커뮤니티 UI 함수가 올바르지 않습니다.');
    }
    
    // 실제 커뮤니티 HTML 생성 및 교체
    try {
      console.log('🔄 커뮤니티 HTML 생성 중...');
      const communityHTML = communityUI.createCommunityHTML();
      console.log('✅ 커뮤니티 HTML 생성 완료, 길이:', communityHTML.length);
      
      // DOM 업데이트를 즉시 실행하고 레이아웃 강제 재계산
      dynamicContainer.innerHTML = communityHTML;
      
      // 로딩 완료 표시
      dynamicContainer.classList.add('loaded');
      
      // 레이아웃 강제 재계산
      dynamicContainer.offsetHeight;
      
      // 높이 재설정 및 스크롤 위치 재조정
      const communityContainer = dynamicContainer.querySelector('.community-container');
      if (communityContainer) {
        communityContainer.style.minHeight = '400px';
        communityContainer.style.display = 'flex';
        communityContainer.style.flexDirection = 'column';
      }
      
      // 다시 한 번 스크롤 상단으로 이동
      if (overlayContent) {
        overlayContent.scrollTop = 0;
      }
      
      // RequestAnimationFrame으로 렌더링 완료 후 스크롤 조정
      requestAnimationFrame(() => {
        if (overlayContent) {
          overlayContent.scrollTop = 0;
        }
        
        // 한 번 더 확실하게
        setTimeout(() => {
          if (overlayContent) {
            overlayContent.scrollTop = 0;
          }
        }, 50);
      });
      
      // 새로운 뒤로가기 버튼 이벤트 연결
      const newBackBtn = dynamicContainer.querySelector('#backBtn');
      if (newBackBtn) {
        newBackBtn.addEventListener('click', showAnalysisScreen);
      }
      
      // 커뮤니티 이벤트 설정
      setupCommunityEvents();
      
      // 댓글 데이터 로딩 시작
      loadCommunityData();
      
    } catch (htmlError) {
      console.error('❌ HTML 생성 실패:', htmlError);
      // 임시 대체 HTML
      dynamicContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; min-height: 400px; display: flex; flex-direction: column; justify-content: center;">
          <h3>🔧 커뮤니티 준비 중</h3>
          <p>커뮤니티 기능을 준비하고 있습니다.</p>
          <button id="backBtn" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">← 뒤로가기</button>
        </div>
      `;
      
      const fallbackBackBtn = dynamicContainer.querySelector('#backBtn');
      if (fallbackBackBtn) {
        fallbackBackBtn.addEventListener('click', showAnalysisScreen);
      }
    }
    
    currentView = 'community';
    console.log('✅ 커뮤니티 화면 표시 완료');
    
  } catch (error) {
    console.error('❌ 커뮤니티 화면 표시 실패:', error);
    
    // 완전 실패 시 에러 화면
    const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
    if (dynamicContainer) {
      dynamicContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; min-height: 400px; display: flex; flex-direction: column; justify-content: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="margin-bottom: 16px; font-weight: 600;">커뮤니티 기능 오류</div>
          <div style="margin-bottom: 20px; color: #64748b; font-size: 14px;">${error.message}</div>
          <button id="backBtn" style="padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">← 뒤로가기</button>
        </div>
      `;
      
      const backBtn = dynamicContainer.querySelector('#backBtn');
      if (backBtn) {
        backBtn.addEventListener('click', showAnalysisScreen);
      }
      
      dynamicContainer.style.display = 'block';
      dynamicContainer.style.minHeight = '400px';
    }
  }
}

/**
 * 분석 화면으로 돌아가기
 */
function showAnalysisScreen() {
  // 타이틀을 기본값으로 복원
  updateServiceTitle('분석 리포트');
  
  const analysisResult = fraudOverlay.querySelector('#analysisResult');
  const loadingState = fraudOverlay.querySelector('#loadingState');
  const errorState = fraudOverlay.querySelector('#errorState');
  const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
  const overlayContent = fraudOverlay.querySelector('.overlay-content');
  
  // 다른 탭 화면 숨기기
  if (dynamicContainer) dynamicContainer.style.display = 'none';
  
  // 분석 상태에 따라 적절한 화면 표시
  if (isAnalyzing) {
    // 분석 진행 중이면 로딩 화면 표시
    console.log('🔄 분석 진행 중 - 로딩 화면 표시');
    if (loadingState) loadingState.style.display = 'block';
    if (analysisResult) analysisResult.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
  } else {
    // 분석 완료 또는 대기 중이면 결과 화면 표시
    console.log('✅ 분석 완료 또는 대기 중 - 결과 화면 표시');
    if (analysisResult) analysisResult.style.display = 'flex';
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
  }
  
  // 커뮤니티 활성 클래스 제거하여 원래 패딩 복원
  if (overlayContent) {
    overlayContent.classList.remove('community-active');
  }
  
  currentView = 'analysis';
  console.log('분석 화면으로 돌아감, isAnalyzing:', isAnalyzing);
}

/**
 * 커뮤니티 이벤트 설정
 */
function setupCommunityEvents() {
  const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
  if (!dynamicContainer) return;
  
  const backBtn = dynamicContainer.querySelector('#backBtn');
  const commentInput = dynamicContainer.querySelector('#commentInput');
  const sendBtn = dynamicContainer.querySelector('#sendBtn');
  
  // 뒤로가기 버튼
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showAnalysisScreen();
    });
  }
  
  // 댓글 입력 관련 이벤트
  console.log('🔍 댓글 입력 요소 확인:', {
    commentInput: !!commentInput,
    sendBtn: !!sendBtn,
    communityUI: !!communityUI,
    sendBtnDisabled: sendBtn?.disabled
  });
  
  if (commentInput && sendBtn && communityUI) {
    console.log('✅ setupCommentInput 호출');
    communityUI.setupCommentInput(commentInput, sendBtn);
  } else {
    console.warn('⚠️ setupCommentInput 호출 실패 - 모듈이나 요소가 없음');
    
    // 잠시 후 다시 시도
    setTimeout(() => {
      const retryCommentInput = dynamicContainer.querySelector('#commentInput');
      const retrySendBtn = dynamicContainer.querySelector('#sendBtn');
      
      if (retryCommentInput && retrySendBtn && communityUI) {
        console.log('🔄 setupCommentInput 재시도 성공');
        communityUI.setupCommentInput(retryCommentInput, retrySendBtn);
      } else {
        console.error('❌ setupCommentInput 재시도 실패');
      }
    }, 500);
  }
  
  // 댓글 삭제 이벤트 리스너 (이벤트 위임 사용)
  dynamicContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-comment-btn')) {
      const commentId = e.target.getAttribute('data-comment-id');
      
      if (confirm('댓글을 삭제하시겠습니까?')) {
        try {
          const success = await communityData.deleteComment(
            currentVideoId, 
            commentId, 
            communityData.getCurrentUserId()
          );
          
          if (success) {
            console.log('✅ 댓글 삭제 성공');
            // 실시간 리스너가 UI 업데이트를 처리
          } else {
            alert('댓글 삭제에 실패했습니다.');
          }
        } catch (error) {
          console.error('❌ 댓글 삭제 오류:', error);
          alert('댓글 삭제 중 오류가 발생했습니다.');
        }
      }
    }
  });
    
    // 전송 버튼 클릭
    sendBtn.addEventListener('click', async () => {
      const message = commentInput.value.trim();
      if (message && communityData) {
        try {
          await communityData.sendComment(currentVideoId, message);
          commentInput.value = '';
          sendBtn.disabled = true;
        } catch (error) {
          console.error('댓글 전송 실패:', error);
        }
      }
    });
  }


/**
 * 커뮤니티 데이터 로드
 */
async function loadCommunityData() {
  if (!currentVideoId || !communityData || !communityUI) return;
  
  try {
    // 통계 업데이트
    const statsElement = fraudOverlay.querySelector('#communityStats');
    if (statsElement) {
      communityUI.updateCommunityStats(statsElement, 0);
    }
    
    // 댓글 로드
    const comments = await communityData.getComments(currentVideoId);
    const commentsList = fraudOverlay.querySelector('#commentsList');
    
    if (commentsList && communityUI) {
      const currentUserId = await communityData.getCurrentUserId();
      communityUI.updateCommentsList(commentsList, comments, currentUserId);
      
      // 통계 업데이트
      if (statsElement) {
        communityUI.updateCommunityStats(statsElement, comments.length);
      }
    }
    
    // 실시간 댓글 감지 설정
    if (commentsUnsubscribe) {
      commentsUnsubscribe();
    }
    
    commentsUnsubscribe = communityData.subscribeToComments(currentVideoId, (comments) => {
      if (currentView === 'community' && commentsList && communityUI) {
        const currentUserId = communityData.getCurrentUserId();
        communityUI.updateCommentsList(commentsList, comments, currentUserId);
        
        if (statsElement) {
          communityUI.updateCommunityStats(statsElement, comments.length);
        }
      }
    });
    
  } catch (error) {
    console.error('커뮤니티 데이터 로드 실패:', error);
  }
}

// ========== 커뮤니티 관련 함수들 추가 ==========

// 기존 드롭다운 함수들은 새로운 setupDropdownMenu()로 대체됨

/*
 * (사용하지 않음) 드롭다운 전용 메뉴 토글 (기존 toggleCommunityMenu 함수 완전 교체)
 */
// function toggleCommunityMenu() - 새로운 setupDropdownMenu()로 대체됨

/*
 * (사용하지 않음) 드롭다운 열기 - 새로운 setupDropdownMenu()로 대체됨
 */
// function openDropdown() - 새로운 setupDropdownMenu()로 대체됨

/*
 * (사용하지 않음) 기존 드롭다운 함수들 - 새로운 setupDropdownMenu()로 대체됨
 */
// function closeDropdown() - 새로운 setupDropdownMenu()로 대체됨
// function handleDropdownOutsideClick() - 새로운 setupDropdownMenu()로 대체됨  
// function setupSimpleDropdownEvents() - 새로운 setupDropdownMenu()로 대체됨

/*
 * (사용하지 않음) 기존 커뮤니티 관련 함수들 - 새로운 시스템으로 대체됨
 * 이하 모든 기존 함수들은 새로운 드롭다운 시스템으로 대체됨
 * handleSimpleMenuSelection, showCommunityInDropdown 등 모든 함수들
 */

/*
async function showCommunityInDropdown() {
  const dropdownMenu = fraudOverlay.querySelector('#dropdownMenu');
  
  if (!dropdownMenu || !communityUI) {
    console.error('드롭다운 메뉴 또는 커뮤니티 UI를 찾을 수 없습니다.');
    return;
  }
  
  // 현재 비디오 ID 업데이트
  currentVideoId = getVideoId();
  
  // 커뮤니티 HTML로 교체
  dropdownMenu.innerHTML = communityUI.createCommunityHTML();
  currentView = 'community';
  
  // 커뮤니티 초기화
  if (!communityInitialized) {
    await initializeCommunity();
  }
  
  // 이벤트 설정
  setupCommunityEventsInDropdown();
  
  // 데이터 로드
  await loadCommunityDataInDropdown();
}

/**
 * 🔥 드롭다운 내 커뮤니티 이벤트 설정
 */
function setupCommunityEventsInDropdown() {
  const dropdownMenu = fraudOverlay.querySelector('#dropdownMenu');
  if (!dropdownMenu) return;
  
  const backBtn = dropdownMenu.querySelector('#backBtn');
  const commentInput = dropdownMenu.querySelector('#commentInput');
  const sendBtn = dropdownMenu.querySelector('#sendBtn');

  // 뒤로가기 - 원래 드롭다운 메뉴로 복원
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreDropdownMenu();
    });
  }

  // 댓글 입력 관리
  if (commentInput && sendBtn && communityUI) {
    communityUI.setupCommentInput(commentInput, sendBtn);
  }

  // 댓글 전송
  if (sendBtn) {
    sendBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      const message = commentInput.value.trim();
      if (!message) return;

      // 메시지 필터링
      const filterResult = communityData.filterCommentContent(message);
      if (!filterResult.isValid) {
        alert(filterResult.reason);
        return;
      }

      // 전송 중 상태
      communityUI.toggleButtonLoading(sendBtn, true, '전송중');

      try {
        const sentComment = await communityData.sendComment(currentVideoId, filterResult.filteredMessage);
        
        if (sentComment) {
          commentInput.value = '';
          sendBtn.disabled = true;
          commentInput.style.height = 'auto';
          console.log('✅ 댓글 전송 성공');
        } else {
          alert('댓글 전송에 실패했습니다.');
        }
      } catch (error) {
        console.error('❌ 댓글 전송 오류:', error);
        alert('댓글 전송 중 오류가 발생했습니다.');
      } finally {
        communityUI.toggleButtonLoading(sendBtn, false);
      }
    });
  }
}

/**
 * 🔥 드롭다운 내 커뮤니티 데이터 로드
 */
async function loadCommunityDataInDropdown() {
  if (!currentVideoId || !communityData || !communityUI) return;

  const commentsList = fraudOverlay.querySelector('#commentsList');
  const communityStats = fraudOverlay.querySelector('#communityStats');
  if (!commentsList) return;

  // 로딩 상태 표시
  commentsList.innerHTML = communityUI.createLoadingHTML('댓글을 불러오는 중...');

  try {
    const [comments, stats] = await Promise.all([
      communityData.getComments(currentVideoId),
      communityData.getCommunityStats(currentVideoId)
    ]);

    const finalComments = comments.length === 0 ? 
      communityData.generateDemoComments(currentVideoId) : comments;

    // UI 업데이트
    communityUI.updateCommentsList(commentsList, finalComments, communityData.getCurrentUserId());
    if (communityStats) {
      communityUI.updateCommunityStats(communityStats, stats.commentCount, stats.viewerCount);
    }

    // 실시간 리스너 설정
    setupCommunityListeners();

  } catch (error) {
    console.error('❌ 커뮤니티 데이터 로드 오류:', error);
    commentsList.innerHTML = communityUI.createEmptyCommentsHTML();
  }
}

/**
 * 🔥 원래 드롭다운 메뉴로 복원
 */
function restoreDropdownMenu() {
  const dropdownMenu = fraudOverlay.querySelector('#dropdownMenu');
  
  if (!dropdownMenu) return;
  
  // 원래 메뉴 HTML로 복원
  dropdownMenu.innerHTML = `
    <div class="dropdown-item active" data-menu="credibility">
      <div class="dropdown-icon">🔍</div>
      <div class="dropdown-content">
        <div class="dropdown-title">분석 리포트</div>
        <div class="dropdown-subtitle">영상 내용이 신뢰 가능한 정보인지 확인</div>
      </div>
      <div class="menu-check">✓</div>
    </div>
    
    <div class="dropdown-item" data-menu="community">
      <div class="dropdown-icon">💬</div>
      <div class="dropdown-content">
        <div class="dropdown-title">커뮤니티</div>
        <div class="dropdown-subtitle">영상 시청자들과 의견 공유</div>
      </div>
    </div>
    
    <div class="dropdown-item disabled" data-menu="recommendations">
      <div class="dropdown-icon">🎯</div>
      <div class="dropdown-content">
        <div class="dropdown-title">관련 정보 제공</div>
        <div class="dropdown-subtitle">해당 영상과 관련된 KB 정보 제공</div>
      </div>
    </div>
  `;
  
  currentView = 'menu';
  
  // 이벤트 재설정
  setupSimpleDropdownEvents();
  
  // 커뮤니티 정리
  cleanupCommunity();
}

/**
 * 🔥 커뮤니티 초기화
 */
async function initializeCommunity() {
  if (communityInitialized || !communityData) return;

  try {
    console.log('🚀 커뮤니티 초기화 시작...');
    const success = await communityData.initializeCommunity();
    
    if (success) {
      communityInitialized = true;
      console.log('✅ 커뮤니티 초기화 완료');
    } else {
      console.log('⚠️ 커뮤니티 오프라인 모드');
    }
  } catch (error) {
    console.error('❌ 커뮤니티 초기화 오류:', error);
  }
}

/**
 * 🔥 커뮤니티 데이터 로드
 */
async function loadCommunityData() {
  if (!currentVideoId || !communityData || !communityUI) return;

  const commentsList = fraudOverlay.querySelector('#commentsList');
  const communityStats = fraudOverlay.querySelector('#communityStats');
  if (!commentsList) return;

  // 로딩 상태 표시
  commentsList.innerHTML = communityUI.createLoadingHTML('댓글을 불러오는 중...');

  try {
    // 초기 데이터 로드
    const [comments, stats] = await Promise.all([
      communityData.getComments(currentVideoId),
      communityData.getCommunityStats(currentVideoId)
    ]);

    // Firebase에 연결되지 않은 경우 데모 데이터 사용
    const finalComments = comments.length === 0 ? 
      communityData.generateDemoComments(currentVideoId) : comments;

    // UI 업데이트
    communityUI.updateCommentsList(commentsList, finalComments, communityData.getCurrentUserId());
    if (communityStats) {
      communityUI.updateCommunityStats(communityStats, stats.commentCount, stats.viewerCount);
    }


    // 실시간 리스너 설정
    setupCommunityListeners();

  } catch (error) {
    console.error('❌ 커뮤니티 데이터 로드 오류:', error);
    commentsList.innerHTML = communityUI.createEmptyCommentsHTML();
  }
}

/**
 * 🔥 커뮤니티 실시간 리스너 설정
 */
function setupCommunityListeners() {
  if (!currentVideoId || !communityData) return;

  // 기존 리스너 정리
  if (commentsUnsubscribe) {
    commentsUnsubscribe();
    commentsUnsubscribe = null;
  }

  // 댓글 실시간 업데이트
  commentsUnsubscribe = communityData.listenToComments(currentVideoId, (comments) => {
    const commentsList = fraudOverlay.querySelector('#commentsList');
    const communityStats = fraudOverlay.querySelector('#communityStats');
    
    if (commentsList && communityUI) {
      communityUI.updateCommentsList(commentsList, comments, communityData.getCurrentUserId());
      if (communityStats) {
        communityUI.updateCommunityStats(communityStats, comments.length);
      }
    }
  });


}

/**
 * 🔥 커뮤니티 정리
 */
function cleanupCommunity() {
  // 리스너 정리
  if (commentsUnsubscribe) {
    commentsUnsubscribe();
    commentsUnsubscribe = null;
  }


  // 상태 초기화
}

// DOM 요소가 나타날 때까지 대기하는 유틸리티 함수
async function waitForElement(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`요소를 찾을 수 없음: ${selector}`);
}

// DOM 요소가 특정 텍스트를 포함할 때까지 대기하는 유틸리티 함수
async function waitForElementWithText(selector, text, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (element.textContent.includes(text)) {
        return element;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`텍스트 "${text}"를 포함하는 요소를 찾을 수 없음: ${selector}`);
}

// 신고 버튼 상태 업데이트
// 신고 기능 모듈 import


// 신고 모달 열기 함수

  currentView = 'analysis';
  isMenuExpanded = false

// ========== 신고 누적 블러 처리 시스템 ==========

// 비디오 플레이어 컨테이너 찾기
function findVideoContainer() {
  const selectors = [
    '#player',
    'ytd-player',
    '#movie_player',
    '.html5-video-container'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

// 영상 일시정지
function pauseVideo() {
  try {
    // YouTube 플레이어 API 사용
    const video = document.querySelector('video');
    if (video) {
      video.pause();
      console.log('영상이 일시정지되었습니다.');
    }
    
    // YouTube 플레이어 컨트롤 버튼으로도 시도
    const pauseButton = document.querySelector('.ytp-play-button');
    if (pauseButton && pauseButton.getAttribute('aria-label')?.includes('일시중지')) {
      pauseButton.click();
    }
  } catch (error) {
    console.warn('영상 일시정지 중 오류:', error);
  }
}

// 영상 재생
function playVideo() {
  try {
    // YouTube 플레이어 API 사용
    const video = document.querySelector('video');
    if (video) {
      video.play();
      console.log('영상이 재생되었습니다.');
    }
    
    // YouTube 플레이어 컨트롤 버튼으로도 시도
    const playButton = document.querySelector('.ytp-play-button');
    if (playButton && playButton.getAttribute('aria-label')?.includes('재생')) {
      playButton.click();
    }
  } catch (error) {
    console.warn('영상 재생 중 오류:', error);
  }
}

// 블러 오버레이가 이미 적용되었는지 확인
function ensureBlurStyles() {
  // styles/blur.css에서 스타일을 관리하므로 여기서는 아무것도 하지 않음
  return;
}

// 블러 오버레이 생성
function createBlurOverlay() {
  return new Promise((resolve, reject) => {
    if (blurOverlay) {
      resolve(false); // 이미 존재하면 중복 생성 방지
      return;
    }
    
    const videoContainer = findVideoContainer();
    if (!videoContainer) {
      console.warn('비디오 컨테이너를 찾을 수 없습니다.');
      reject(new Error('비디오 컨테이너를 찾을 수 없습니다.'));
      return;
    }

    // 영상 일시정지
    pauseVideo();
    
    ensureBlurStyles();
    
    blurOverlay = document.createElement('div');
  blurOverlay.className = 'video-blur-overlay';
  blurOverlay.innerHTML = `
    <div class="blur-warning-card">
      <div class="blur-warning-title">
        신고가 누적된 영상입니다. 시청하시겠습니까?
      </div>
      <div class="blur-warning-buttons">
        <button class="blur-btn blur-btn-yes" id="blur-yes">예</button>
        <button class="blur-btn blur-btn-no" id="blur-no">아니오</button>
      </div>
    </div>
  `;
  
  // 이벤트 리스너 추가
  blurOverlay.querySelector('#blur-yes').addEventListener('click', handleBlurYes);
  blurOverlay.querySelector('#blur-no').addEventListener('click', handleBlurNo);
  
  // 비디오 컨테이너의 position을 relative로 설정
  const computedStyle = window.getComputedStyle(videoContainer);
  if (computedStyle.position === 'static') {
    videoContainer.style.position = 'relative';
  }
  
      videoContainer.appendChild(blurOverlay);
    console.log('블러 오버레이 생성됨');
    resolve(true);
  });
}

// "예" 버튼 클릭 처리 (영상 시청)
function handleBlurYes() {
  if (blurOverlay) {
    blurOverlay.remove();
    blurOverlay = null;
  }
  playVideo();
  console.log('영상 시청을 선택했습니다. 블러가 해제되고 영상이 재생됩니다.');
}

// "아니오" 버튼 클릭 처리 (시청 안함, 블러 유지)
function handleBlurNo() {
  // 뒤로가기 또는 다른 영상으로 이동
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'https://www.youtube.com';
  }
  console.log('영상 시청을 거부했습니다. 이전 페이지로 이동합니다.');
}

// 블러 처리 필요 여부 확인
async function maybeBlur() {
  console.log('🔍 블러 체크 시작');
  
  const videoId = getVideoId();
  if (!videoId) {
    console.log('❌ videoId가 없습니다:', window.location.href);
    return { needsBlur: false };
  }
  
  console.log('📹 현재 영상 ID:', videoId);
  
  try {
    console.log('🔗 Firebase에 신고 수 조회 중...');
    
    // Firebase에서 신고 수 조회
    const response = await requestFirebase('REPORT_GET', { videoId });
    
    console.log('📊 Firebase 응답:', response);
    
    if (response.ok && response.agg.count >= response.agg.threshold) {
      console.log(`🚨 신고 수 ${response.agg.count}개로 임계치 ${response.agg.threshold}를 초과했습니다.`);
      console.log('🫥 블러 처리가 필요합니다.');
      return { needsBlur: true, count: response.agg.count, threshold: response.agg.threshold };
    } else {
      console.log(`📊 신고 수 ${response.agg?.count || 0}개, 임계치 ${response.agg?.threshold || 10}개`);
      return { needsBlur: false };
    }
  } catch (error) {
    console.warn('❌ 블러 처리 확인 중 오류:', error);
  }
}

// 신고 제출 후 처리
async function afterUserSubmittedReport(reason) {
  const videoId = getVideoId();
  if (!videoId) return;
  
  try {
    const response = await requestFirebase('REPORT_ADD', { videoId, reason });
    
    if (response.ok) {
      console.log(`신고 완료. 현재 신고 수: ${response.agg.count}개`);
      
      // 임계치를 넘으면 즉시 블러 오버레이 표시
      if (response.agg.count >= response.agg.threshold) {
        console.log('신고 제출 후 임계치 초과로 블러 오버레이 표시');
        createBlurOverlay();
      }
    } else {
      console.error('신고 제출 실패:', response.error);
    }
  } catch (error) {
    console.error('신고 제출 중 오류:', error);
  }
}

console.log('[신고 누적 블러 시스템] 스크립트 로드 완료');

// ========== 관련정보제공 기능 ==========

// 관련정보제공 화면을 표시하는 메인 함수
async function showRelatedInfoScreen() {
  console.log('📺 관련정보제공 화면 표시 시작');
  
  const dynamicContainer = fraudOverlay.querySelector('#dynamicContainer');
  if (!dynamicContainer) {
    console.error('❌ dynamicContainer를 찾을 수 없음');
    return;
  }

  // 다른 화면들 숨기기
  const analysisResult = fraudOverlay.querySelector('#analysisResult');
  const loadingState = fraudOverlay.querySelector('#loadingState');
  const errorState = fraudOverlay.querySelector('#errorState');
  
  if (analysisResult) analysisResult.style.display = 'none';
  if (loadingState) loadingState.style.display = 'none';
  if (errorState) errorState.style.display = 'none';

  // 관련정보제공 화면 HTML로 교체 (로딩 상태 포함)
  dynamicContainer.innerHTML = `
    <div class="related-info-container">
      <div class="related-info-header">
        <button class="back-btn" id="backToAnalysis">←</button>
        <div class="related-info-desc">KB금융그룹 공식 투자분석과 전문영상으로 투자지식 학습</div>
      </div>
      
      <!-- 전체 로딩 상태 -->
      <div class="loading-state" id="globalLoading">
        <div class="loading-images">
          <img id="loadingImage" alt="분석 중" />
        </div>
        <div class="loading-spinner"></div>
        <div class="loading-step" id="loadingStep">관련 정보를 준비하고 있습니다...</div>
      </div>
      
      <!-- 로딩 완료 후 표시될 컨텐츠 -->
      <div class="content-sections" id="contentSections" style="display: none;">
        <!-- PDF 뷰어 섹션 -->
        <div class="pdf-section">
          <div class="pdf-header">
            <h3 class="pdf-title">KB데일리</h3>
            <button class="fullscreen-btn" id="pdfFullscreenBtn">⛶</button>
          </div>
          <div class="pdf-viewer-container" id="pdfViewer">
            <div class="pdf-loading">
              <div class="loading-spinner-small"></div>
              <div>PDF를 로드하고 있습니다...</div>
            </div>
          </div>
        </div>
        
        <!-- 영상 추천 섹션 -->
        <div class="videos-section">
          <h3 class="section-title">추천 영상</h3>
          <div id="videosContainer">
            <div class="loading-videos">
              <div class="loading-spinner-small"></div>
              <div class="loading-text-small">관련 영상을 찾고 있습니다...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 관련정보제공 스타일 추가
  addRelatedInfoStyles();

  // 이벤트 설정
  setupRelatedInfoEvents();

  // 컨테이너 표시
  dynamicContainer.style.display = 'block';
  dynamicContainer.style.visibility = 'visible';
  dynamicContainer.style.opacity = '1';
  dynamicContainer.style.minHeight = '400px';
  dynamicContainer.style.zIndex = '1000';
  dynamicContainer.style.position = 'relative';
  
  // fraudOverlay 자체도 강제 표시
  if (fraudOverlay) {
    fraudOverlay.style.display = 'block';
    fraudOverlay.style.visibility = 'visible';
    fraudOverlay.style.opacity = '1';
  }
  
  console.log('🔍 dynamicContainer 상태 확인:', {
    display: dynamicContainer.style.display,
    visibility: dynamicContainer.style.visibility,
    opacity: dynamicContainer.style.opacity,
    offsetWidth: dynamicContainer.offsetWidth,
    offsetHeight: dynamicContainer.offsetHeight,
    scrollHeight: dynamicContainer.scrollHeight,
    innerHTML: dynamicContainer.innerHTML.length > 0
  });
  
  // fraudOverlay 영역으로 즉시 스크롤
  if (fraudOverlay) {
    fraudOverlay.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
    console.log('📍 fraudOverlay로 스크롤 완료');
  }

  // 즉시 컨텐츠 로딩
  loadContentProgressively();

  console.log('✅ 관련정보제공 화면 표시 완료');
}

// 관련정보제공 스타일 추가
function addRelatedInfoStyles() {
  if (document.getElementById('related-info-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'related-info-styles';
  styles.textContent = `
    /* 관련정보제공 기본 스타일 */
    .related-info-container {
      width: 100%;
      height: 100%;
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .related-info-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: #f8fafb;
      color: #64748b;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 900;
      transition: all 0.2s ease;
    }

    .back-btn:hover {
      background: #e2e8f0;
      color: #475569;
    }

    .related-info-title {
      font-size: 16px;
      font-weight: 800;
      color: #1a1d29;
      letter-spacing: -0.02em;
    }

    .related-info-desc {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 16px;
      line-height: 1.4;
      text-align: center;
    }

    /* PDF 뷰어 스타일 */
    .pdf-section {
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      background: #ffffff;
    }
    
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: #f8fafb;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .pdf-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1a1d29;
    }
    
    .fullscreen-btn {
      background: none;
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #64748b;
      transition: all 0.2s ease;
    }
    
    .fullscreen-btn:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    
    .pdf-viewer-container {
      height: 300px;
      overflow-y: auto;
      position: relative;
      background: #f9fafb;
    }
    
    .pdf-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #64748b;
      font-size: 14px;
    }
    
    .pdf-page {
      width: 100%;
      max-width: 100%;
      margin-bottom: 8px;
      display: block;
    }
    
    .pdf-page img {
      width: 100%;
      height: auto;
      display: block;
    }

    .videos-section {
      margin-top: 24px;
    }
    
    .section-title {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 700;
      color: #1a1d29;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    .videos-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .video-card {
      display: flex;
      gap: 10px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid #f1f5f9;
      cursor: pointer;
      transition: all 0.3s ease;
      background: #ffffff;
      text-decoration: none;
      color: inherit;
    }

    .video-card:hover {
      border-color: #fbbf24;
      box-shadow: 0 2px 8px rgba(251, 191, 36, 0.15);
      transform: translateY(-1px);
      text-decoration: none;
      color: inherit;
    }

    .video-thumbnail {
      width: 80px;
      height: 60px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f8fafb;
      border: 1px solid #e2e8f0;
    }

    .video-thumbnail.error {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }

    .video-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }

    .video-title {
      font-size: 12px;
      font-weight: 600;
      color: #1a1d29;
      line-height: 1.3;
      margin-bottom: 6px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      letter-spacing: -0.01em;
    }

    .video-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .video-channel {
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
    }

    .video-similarity {
      font-size: 9px;
      color: #fbbf24;
      font-weight: 600;
    }

    /* 로딩 상태 */
    .loading-videos {
      text-align: center;
      padding: 32px 16px;
    }

    .loading-spinner-small {
      width: 16px;
      height: 16px;
      border: 2px solid #f3f3f3;
      border-top: 2px solid #fbbf24;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 8px;
    }

    .loading-text-small {
      font-size: 12px;
      color: #64748b;
    }


    
    .content-sections {
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.5s ease;
    }

    /* KB데일리 이미지 스타일 */
    .kb-daily-images {
      width: 100%;
      height: 100%;
    }
    
    .images-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 240px;
      overflow-y: auto;
      padding: 16px;
      background: #f8fafb;
      border-radius: 8px;
    }
    
    .kb-daily-image {
      width: 100%;
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .kb-daily-notice {
      padding: 16px;
      text-align: center;
      background: #fff7ed;
      border-top: 1px solid #fed7aa;
      color: #9a3412;
    }
    
    .kb-daily-notice p {
      margin: 0 0 12px 0;
      font-size: 13px;
      font-weight: 500;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  document.head.appendChild(styles);
}

// 관련정보제공 화면 이벤트 설정
function setupRelatedInfoEvents() {
  // 뒤로가기 버튼
  const backBtn = document.getElementById('backToAnalysis');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      console.log('🔄 분석 화면으로 돌아가기');
      showAnalysisScreen();
    });
  }

  // PDF 전체화면 버튼
  const fullscreenBtn = document.getElementById('pdfFullscreenBtn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      console.log('📖 PDF 전체화면 모드 (기본 브라우저 팝업)');
      const pdfUrl = chrome.runtime.getURL('kb_daliy.pdf');
      window.open(pdfUrl, '_blank');
    });
  }
}

// 순차적 로딩 및 완료 후 컨텐츠 표시
async function loadContentProgressively() {
  console.log('🔄 즉시 컨텐츠 로딩');
  
  const globalLoading = document.getElementById('globalLoading');
  const contentSections = document.getElementById('contentSections');
  
  if (!globalLoading || !contentSections) {
    console.error('❌ 로딩 요소들을 찾을 수 없음');
    return;
  }
  
  try {
    // 즉시 PDF와 영상 로드 (딜레이 없음)
    loadPDFViewer();
    loadRelatedVideos();
    
    // 로딩 화면 즉시 숨기고 콘텐츠 바로 표시
    globalLoading.style.display = 'none';
    contentSections.style.display = 'block';
    contentSections.style.opacity = '1';
    contentSections.style.transform = 'translateY(0)';
    
    console.log('✅ 즉시 컨텐츠 표시 완료');
    
  } catch (error) {
    console.error('❌ 즉시 로딩 실패:', error);
    // 에러 발생시에도 바로 콘텐츠 표시
    globalLoading.style.display = 'none';
    contentSections.style.display = 'block';
    contentSections.style.opacity = '1';
  }
}

// PDF 뷰어 로드 함수
function loadPDFViewer() {
  const pdfViewer = document.getElementById('pdfViewer');
  if (!pdfViewer) return;

  console.log('📑 PDF 뷰어 로드 시작');
  
  try {
    // Chrome extension 내의 PDF 파일 URL 생성
    const pdfUrl = chrome.runtime.getURL('kb_daliy.pdf');
    console.log('PDF URL:', pdfUrl);
    
    // PDF 뷰어 HTML 생성
    pdfViewer.innerHTML = createRealPDFViewer(pdfUrl);
    
    // PDF 로드 및 3페이지 제한 적용
    loadLimitedPDF(pdfUrl);
    
    console.log('✅ 실제 PDF 뷰어 로드 완료');
  } catch (error) {
    console.error('❌ PDF 로드 실패:', error);
    pdfViewer.innerHTML = '<div class="pdf-loading"><div>PDF 로드에 실패했습니다.</div></div>';
  }
}

// 실제 PDF 뷰어 생성 함수 (3페이지 제한)
function createRealPDFViewer(pdfUrl) {
  return `
    <div class="real-pdf-container">
      <div class="pdf-viewer-wrapper" id="pdfViewerWrapper">
        <div class="pdf-loading-overlay" id="pdfLoadingOverlay">
          <div class="loading-spinner-small"></div>
          <div>PDF를 로드하고 있습니다...</div>
        </div>
        <canvas id="pdfCanvas" style="width: 100%; max-width: 100%; border-radius: 8px; display: none;"></canvas>
      </div>
        </div>
      </div>
    </div>
  `;
}

// 3페이지 제한 PDF 로드 함수
async function loadLimitedPDF(pdfUrl) {
  console.log('📄 3페이지 제한 PDF 로드 시작');
  console.log('📄 PDF URL:', pdfUrl);
  
  try {
    // URL 유효성 검증
    if (!pdfUrl || pdfUrl.includes('invalid')) {
      throw new Error('PDF URL이 유효하지 않습니다');
    }
    
    // PDF 파일 존재 여부 확인
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`PDF 파일을 찾을 수 없습니다: ${response.status}`);
    }
    
    // PDF.js 없이는 실제 페이지 제한이 어려우므로 
    // iframe + 오버레이로 3페이지 이후 접근 차단
    showLimitedPDFWithOverlay(pdfUrl);
    
  } catch (error) {
    console.error('❌ 제한 PDF 로드 실패:', error);
    console.log('🔄 KB데일리 이미지로 대체');
    
    // PDF 로드 실패시 이미지 대체
    showKBDailyImages();
  }
}

// PDF 대신 KB데일리 이미지 표시
function showKBDailyImages() {
  const pdfWrapper = document.getElementById('pdfViewerWrapper');
  const loadingOverlay = document.getElementById('pdfLoadingOverlay');
  
  if (!pdfWrapper) return;
  
  // 로딩 숨기기
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
  
  console.log('📄 KB데일리 이미지 표시');
  
  // KB데일리 이미지들 표시
  pdfWrapper.innerHTML = `
    <div class="kb-daily-images">
      <div class="images-container">
        <img src="${chrome.runtime.getURL('kb_daliy/kb_daliy_1.jpg')}" alt="KB데일리 1페이지" class="kb-daily-image" />
        <img src="${chrome.runtime.getURL('kb_daliy/kb_daliy_2.jpg')}" alt="KB데일리 2페이지" class="kb-daily-image" />
        <img src="${chrome.runtime.getURL('kb_daliy/kb_daliy_3.jpg')}" alt="KB데일리 3페이지" class="kb-daily-image" />
      </div>
      <div class="kb-daily-notice">
        <p>💡 PDF 대신 이미지로 제공됩니다</p>
        <button class="pdf-link-btn" onclick="window.open('https://www.kbsec.com/go.able?linkcd=m04010001', '_blank')">
          전체 버전 보기
        </button>
      </div>
    </div>
  `;
}

// 제한된 PDF 표시 (iframe + 오버레이)
function showLimitedPDFWithOverlay(pdfUrl) {
  const pdfWrapper = document.getElementById('pdfViewerWrapper');
  const loadingOverlay = document.getElementById('pdfLoadingOverlay');
  
  if (!pdfWrapper || !loadingOverlay) return;
  
  // 로딩 숨기기
  loadingOverlay.style.display = 'none';
  
  // PDF iframe 생성 (3페이지까지만 스크롤 가능하도록 제한)
  pdfWrapper.innerHTML = `
    <div class="limited-pdf-container">
      <iframe id="limitedPdfFrame" 
              src="${pdfUrl}#page=1&zoom=100" 
              width="100%" 
              height="280px" 
              style="border: none; border-radius: 8px;"
              title="KB데일리 PDF (3페이지 제한)"
              scrolling="no">
      </iframe>
    </div>
    
    <!-- 새로 추가할 안내 섹션 -->
    <div class="pdf-notice-section">
      <div class="pdf-notice-content">
        <span class="notice-text">SAGE에서는 3페이지만 열람 가능합니다.<br>전체 내용을 KB증권에서 열람해보세요!</span>
        <button class="notice-btn" onclick="window.open('https://www.kbsec.com/go.able?linkcd=m04010001', '_blank')">
          이동하기
        </button>
      </div>
    </div>
  </div>
  `;
  
  // 페이지 내비게이션 설정
  setupPDFNavigation();
  
  console.log('✅ 제한된 PDF 표시 완료');
}

// PDF 내비게이션 설정
function setupPDFNavigation() {
  let currentPage = 1;
  const maxPages = 3; // 3페이지 제한
  
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const currentPageSpan = document.getElementById('currentPage');
  const pdfFrame = document.getElementById('limitedPdfFrame');
  const pageOverlay = document.getElementById('pdfPageOverlay');
  
  if (!prevBtn || !nextBtn || !currentPageSpan || !pdfFrame) return;
  
  // 이전 페이지 버튼
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updatePDFPage();
    }
  });
  
  // 다음 페이지 버튼  
  nextBtn.addEventListener('click', () => {
    if (currentPage < maxPages) {
      currentPage++;
      updatePDFPage();
    } else {
      // 3페이지 초과시 경고 표시
      showPageLimitWarning();
    }
  });
  
  function updatePDFPage() {
    currentPageSpan.textContent = currentPage;
    pdfFrame.src = pdfFrame.src.replace(/#page=\d+/, `#page=${currentPage}`);
    
    // 버튼 상태 업데이트
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = false;
    
    // 오버레이 숨기기
    if (pageOverlay) {
      pageOverlay.style.display = 'none';
    }
    
    console.log(`📖 PDF 페이지 ${currentPage}로 이동`);
  }
  
  function showPageLimitWarning() {
    if (pageOverlay) {
      pageOverlay.style.display = 'flex';
    }
    console.log('⚠️ 3페이지 제한 경고 표시');
  }
  
  // 초기 상태 설정
  updatePDFPage();
}

// 관련 영상 로드
async function loadRelatedVideos() {
  console.log('🔄 관련 영상 로드 시작');
  
  const videosContainer = document.getElementById('videosContainer');
  if (!videosContainer) {
    console.error('❌ videosContainer를 찾을 수 없음');
    return;
  }

  try {
    // 현재 영상 제목 가져오기
    const currentTitle = getCurrentVideoTitle();
    console.log('현재 영상 제목:', currentTitle);

    // 백엔드 API 호출 시도
    const response = await fetch('http://127.0.0.1:5000/recommend_videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify({
        current_title: currentTitle || '투자 영상',
        top_k: 3  // 3개만 요청
      })
    });

    if (!response.ok) {
      throw new Error(`서버 오류: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.recommendations && data.recommendations.length > 0) {
      console.log('✅ API 응답 성공:', data);
      displayRelatedVideos(data.recommendations);
    } else {
      console.log('⚠️ 추천 결과 없음, 더미 데이터 사용');
      displayDummyVideos();
    }

  } catch (error) {
    console.error('❌ API 호출 실패:', error);
    console.log('🔄 더미 데이터로 대체');
    displayDummyVideos();
  }
}

// 현재 유튜브 영상 제목 가져오기
function getCurrentVideoTitle() {
  try {
    // 유튜브 제목 선택자들
    const titleSelectors = [
      'h1.ytd-video-primary-info-renderer',
      'h1.title.style-scope.ytd-video-primary-info-renderer',
      '#container h1',
      'h1[class*="title"]',
      '.ytd-video-primary-info-renderer h1'
    ];
    
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    // 메타 태그에서 시도
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) {
      return metaTitle.getAttribute('content');
    }
    
    // document.title에서 시도
    const documentTitle = document.title.replace(' - YouTube', '');
    if (documentTitle && documentTitle !== 'YouTube') {
      return documentTitle;
    }
    
    return null;
  } catch (error) {
    console.error('제목 추출 오류:', error);
    return null;
  }
}

// 관련 영상 표시 (항상 3개 보장)
function displayRelatedVideos(videos) {
  const videosContainer = document.getElementById('videosContainer');
  if (!videosContainer) return;

  // 영상이 없거나 3개 미만이면 더미 데이터로 보완
  let finalVideos = [];
  
  if (videos && videos.length > 0) {
    finalVideos = videos.slice(0, 3); // 최대 3개
  }
  
  // 3개 미만이면 더미 데이터로 채우기
  if (finalVideos.length < 3) {
    const dummyVideos = getDummyVideos();
    const needed = 3 - finalVideos.length;
    finalVideos = finalVideos.concat(dummyVideos.slice(0, needed));
  }

  const videosHtml = finalVideos.map((video, index) => {
    const title = video.title || '제목 없음';
    const url = video.url || '#';
    const thumbnail = video.thumbnail || '';
    const similarity = video.similarity_score || 0;
    
    return `
      <div class="video-card" data-video-url="${url}" data-video-index="${index}">
        <img 
          src="${thumbnail}" 
          alt="${title}" 
          class="video-thumbnail"
          onerror="this.classList.add('error'); this.textContent='썸네일';"
        />
        <div class="video-info">
          <div class="video-title">${title}</div>
          <div class="video-meta">
            <div class="video-channel">KB금융그룹</div>
            ${similarity > 0 ? `<div class="video-similarity">유사도: ${(similarity * 100).toFixed(1)}%</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  videosContainer.innerHTML = `
    <div class="videos-grid">
      ${videosHtml}
    </div>
  `;

  // 영상 클릭 이벤트 추가
  addVideoClickEvents();
  
  console.log(`✅ ${finalVideos.length}개 관련 영상 표시 완료`);
}

// 더미 영상 데이터 반환
function getDummyVideos() {
  return [
    {
      "title": "2025년 어디에 투자할까요? 당신의 질문에 KB가 답을 드립니다",
      "original_title": "KB 인베스터 인사이트 2025 - 투자의 경계를 넓혀라",
      "video_id": "KB2025_01", 
      "url": "https://youtu.be/3E59AgFFwDs?si=r0gE6pS-zLfgHhC9",
      "thumbnail": "https://img.youtube.com/vi/3E59AgFFwDs/maxresdefault.jpg",
      "matched_keywords": ["투자", "2025년"]
    },
    {
      "title": "KB금융그룹 2025년 투자 전략 및 시장 전망",
      "original_title": "KB 투자전략 세미나 - 국내주식 시장 분석",
      "video_id": "KB2025_02",
      "url": "https://youtu.be/GKc5NjDZNkU?si=g2bhwpDydT00slpL",
      "thumbnail": "https://img.youtube.com/vi/GKc5NjDZNkU/maxresdefault.jpg", 
      "matched_keywords": ["국내주식", "KB금융그룹", "투자전략"]
    },
    {
      "title": "KB증권과 함께하는 글로벌 투자의 모든 것",
      "original_title": "KB증권 해외투자 가이드 - 글로벌 포트폴리오 구성",
      "video_id": "KB2025_03",
      "url": "https://youtu.be/qP-ouAmCfqE?si=LmOrcwtTIndvpWQU",
      "thumbnail": "https://img.youtube.com/vi/qP-ouAmCfqE/maxresdefault.jpg",
      "matched_keywords": ["해외주식", "KB증권", "글로벌투자"]
    }
  ];
}

// 더미 영상 데이터만 표시
function displayDummyVideos() {
  console.log('🎥 더미 데이터 표시');
  displayRelatedVideos(getDummyVideos());
}

// 영상 클릭 이벤트 추가
function addVideoClickEvents() {
  const videoCards = document.querySelectorAll('.video-card');
  
  videoCards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      
      const videoUrl = card.getAttribute('data-video-url');
      const videoIndex = card.getAttribute('data-video-index');
      
      if (videoUrl && videoUrl !== '#') {
        console.log(`🎯 영상 클릭: ${videoUrl}`);
        
        // 새 탭에서 영상 열기
        window.open(videoUrl, '_blank');
        
        console.log(`✅ 영상 ${parseInt(videoIndex) + 1} 새 탭에서 열림`);
      } else {
        console.log('⚠️ 유효하지 않은 영상 URL');
      }
    });
  });
}

// 유틸리티 함수들
window.testRelatedInfo = function() {
  console.log('🧪 관련정보제공 기능 테스트 시작');
  if (fraudOverlay) {
    showRelatedInfoScreen();
  } else {
    console.error('❌ fraudOverlay를 찾을 수 없음');
  }
};

window.testBackendConnection = async function() {
  console.log('🧪 백엔드 연결 테스트 시작');
  try {
    const response = await fetch('http://127.0.0.1:5000/recommend_videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        current_title: '테스트 제목',
        top_k: 3
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ 백엔드 연결 성공:', data);
    } else {
      console.error('❌ 백엔드 응답 오류:', response.status);
    }
  } catch (error) {
    console.error('❌ 백엔드 연결 실패:', error);
  }
};

console.log('✅ 관련정보제공 기능 초기화 완료');

// 드롭다운 테스트 함수 추가
window.testDropdown = function() {
  console.log('🧪 드롭다운 테스트 시작');
  
  const serviceTitle = document.querySelector('#serviceTitle');
  const dropdownArrow = document.querySelector('#dropdownArrow');
  const dropdownMenu = document.querySelector('#dropdownMenu');
  
  console.log('🔍 드롭다운 요소 상태:', {
    serviceTitle: !!serviceTitle,
    dropdownArrow: !!dropdownArrow,
    dropdownMenu: !!dropdownMenu,
    fraudOverlay: !!fraudOverlay
  });
  
  if (dropdownArrow) {
    console.log('📂 화살표 강제 클릭 시뮬레이션');
    dropdownArrow.click();
  } else {
    console.error('❌ 드롭다운 화살표를 찾을 수 없습니다');
  }
};

// 관련정보제공 직접 테스트 함수
window.testRelatedInfoDirect = function() {
  console.log('🧪 관련정보제공 직접 호출 테스트');
  if (typeof showRelatedInfoScreen === 'function') {
    showRelatedInfoScreen();
  } else {
    console.error('❌ showRelatedInfoScreen 함수를 찾을 수 없습니다');
  }
};

// 모든 이벤트 리스너와 초기화 로직이 여기에서 종료됨

// 툴팁 시스템 - 간단한 fixed position + 화면 경계 감지
function initTooltipSystem() {
  document.addEventListener('mouseover', function(e) {
    if (e.target.classList.contains('info-icon')) {
      const container = e.target.parentElement;
      const tooltip = container.querySelector('.tooltip');
      if (tooltip) {
        const iconRect = e.target.getBoundingClientRect();
        const tooltipWidth = 250; // max-width 값
        const tooltipHeight = 80; // 대략적인 높이
        
        let x = iconRect.right + 10;
        let y = iconRect.top - 5;
        
        // 오른쪽 경계 체크 - 화면을 벗어나면 왼쪽으로
        if (x + tooltipWidth > window.innerWidth - 10) {
          x = iconRect.left - tooltipWidth - 10;
          console.log('🔄 툴팁을 왼쪽으로 이동:', x);
        }
        
        // 위쪽 경계 체크
        if (y < 10) {
          y = iconRect.bottom + 10; // 아이콘 아래로
          console.log('🔄 툴팁을 아래로 이동:', y);
        }
        
        // 아래쪽 경계 체크
        if (y + tooltipHeight > window.innerHeight - 10) {
          y = iconRect.top - tooltipHeight - 10; // 아이콘 위로
          console.log('🔄 툴팁을 위로 이동:', y);
        }
        
        // 왼쪽 경계 체크 (왼쪽으로 이동했는데도 안 맞는 경우)
        if (x < 10) {
          x = 10;
          console.log('🔄 툴팁 최소 여백 적용:', x);
        }
        
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        
        console.log('📍 툴팁 최종 위치:', { x, y, iconRect, windowSize: { width: window.innerWidth, height: window.innerHeight } });
      }
    }
  });
}

// 페이지 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTooltipSystem);
} else {
  initTooltipSystem();
}