// background.js - 백그라운드 서비스 + Firebase 신고 누적 관리

// Firebase 설정
const DB = "https://kb-ai-challenge-e37c4-default-rtdb.asia-southeast1.firebasedatabase.app";
const THRESHOLD = 10;

// Firebase 신고 누적 데이터 조회
async function getAggregate(videoId) {
  try {
    const response = await fetch(`${DB}/videos/${videoId}/aggregate.json`);
    if (!response.ok) throw new Error(`GET aggregate ${response.status}`);
    const data = await response.json();
    return { count: (data && typeof data.count === 'number') ? data.count : 0 };
  } catch (error) {
    console.error('신고 데이터 조회 실패:', error);
    throw error;
  }
}

// Firebase 신고 수 증가
async function addOne(videoId, reason) {
  try {
    const current = await getAggregate(videoId);
    const nextCount = (current.count || 0) + 1;
    const body = { 
      count: nextCount, 
      lastReportedAt: Date.now() 
    };
    
    const response = await fetch(`${DB}/videos/${videoId}/aggregate.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) throw new Error(`PATCH aggregate ${response.status}`);
    console.log(`영상 ${videoId} 신고 수 증가: ${nextCount}`);
    return { count: nextCount };
  } catch (error) {
    console.error('신고 수 증가 실패:', error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(function() {
  console.log('YouTube 투자영상 사기탐지 서비스가 설치되었습니다.');
});

// 탭 업데이트 감지
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // 유튜브 영상 페이지가 완전히 로드되면
  if (changeInfo.status === 'complete' && 
      tab.url && 
      tab.url.includes('youtube.com/watch')) {
    
    console.log('유튜브 영상 페이지 로드 완료:', tab.url);
    
    // content script가 자동으로 오버레이를 생성할 것임
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      sendResponse({tab: tabs[0]});
    });
    return true;
  }
  
  // Firebase 관련 메시지 처리
  if (request.type === 'REPORT_GET') {
    getAggregate(request.videoId)
      .then(agg => {
        sendResponse({
          ok: true,
          agg: {
            ...agg,
            threshold: THRESHOLD
          }
        });
      })
      .catch(error => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true;
  }
  
  if (request.type === 'REPORT_ADD') {
    addOne(request.videoId, request.reason)
      .then(agg => {
        sendResponse({
          ok: true,
          agg: {
            ...agg,
            threshold: THRESHOLD
          }
        });
      })
      .catch(error => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true;
  }
});

// 확장 프로그램 아이콘 클릭 시 (필요시)
// 확장 프로그램 아이콘 클릭 이벤트는 제거 (자동으로 동작하므로)