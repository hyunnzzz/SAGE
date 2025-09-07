# app.py - Flask 웹 API (폴링 방식으로 완전 재설계)
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import traceback
import threading
import time
from datetime import datetime
import uuid

# 기존 시스템 import
from main import IntegratedSearchSystem
from memory_optimizer import MemoryOptimizer
from config import Config

app = Flask(__name__)
CORS(app)

# 시스템 초기화
print("🚀 Flask 서버 초기화 중...")
try:
    # 메모리 사용량 확인
    MemoryOptimizer.log_memory_usage("(시스템 초기화 전)")
    
    system = IntegratedSearchSystem()
    
    # 초기화 후 메모리 정리
    MemoryOptimizer.force_gc()
    MemoryOptimizer.log_memory_usage("(시스템 초기화 후)")
    
    print("✅ 시스템 초기화 완료!")
except Exception as e:
    print(f"❌ 시스템 초기화 실패: {e}")
    system = None

# 분석 상태 저장소 (메모리)
analysis_status = {}

# 에러 핸들러 추가
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({
        "success": False,
        "error": "서버 내부 오류가 발생했습니다."
    }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "success": False,
        "error": "요청한 페이지를 찾을 수 없습니다."
    }), 404

@app.route('/')
def home():
    """서버 상태 확인"""
    return jsonify({
        "status": "running",
        "message": "YouTube 투자 영상 신뢰성 분석 API",
        "system_ready": system is not None
    })

@app.route('/start_analysis', methods=['POST'])
def start_analysis():
    """분석 시작 (비동기)"""
    try:
        if system is None:
            return jsonify({
                "success": False,
                "error": "시스템이 초기화되지 않았습니다."
            }), 500
        
        if not request.json:
            return jsonify({
                "success": False,
                "error": "JSON 데이터가 필요합니다."
            }), 400
        
        script = request.json.get('script', '').strip()
        upload_date = request.json.get('upload_date', '').strip()
        channel_name = request.json.get('channel_name', '').strip()
        channel_handle = request.json.get('channel_handle', '').strip()
        
        if not script:
            return jsonify({
                "success": False,
                "error": "스크립트 내용이 필요합니다."
            }), 400
        
        if not upload_date:
            return jsonify({
                "success": False,
                "error": "업로드 날짜가 필요합니다."
            }), 400
        
        if not channel_name:
            return jsonify({
                "success": False,
                "error": "채널명이 필요합니다."
            }), 400
        
        # 날짜 형식 검증
        try:
            datetime.strptime(upload_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({
                "success": False,
                "error": "날짜 형식이 올바르지 않습니다."
            }), 400
        
        # 고유 분석 ID 생성
        analysis_id = str(uuid.uuid4())
        
        # 초기 상태 설정
        analysis_status[analysis_id] = {
            "status": "started",
            "step": "1단계: 종목 추출 중...",
            "progress": 0,
            "result": None,
            "error": None,
            "created_at": datetime.now().isoformat()
        }
        
        # 백그라운드에서 분석 실행
        def run_analysis():
            try:
                perform_background_analysis(analysis_id, script, upload_date, channel_name, channel_handle)
            except Exception as e:
                analysis_status[analysis_id]["status"] = "error"
                analysis_status[analysis_id]["error"] = str(e)
                print(f"❌ 백그라운드 분석 오류: {e}")
        
        thread = threading.Thread(target=run_analysis)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "analysis_id": analysis_id,
            "message": "분석이 시작되었습니다. /status/{analysis_id}로 진행 상황을 확인하세요."
        })
        
    except Exception as e:
        print(f"❌ 분석 시작 오류: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/status/<analysis_id>', methods=['GET'])
def get_analysis_status(analysis_id):
    """분석 상태 조회"""
    if analysis_id not in analysis_status:
        return jsonify({
            "success": False,
            "error": "분석 ID를 찾을 수 없습니다."
        }), 404
    
    return jsonify({
        "success": True,
        "data": analysis_status[analysis_id]
    })

def perform_background_analysis(analysis_id, script, upload_date, channel_name, channel_handle):
    """백그라운드에서 실행되는 실제 분석"""
    try:
        print(f"\n{'='*60}")
        print(f"백그라운드 분석 시작: {script[:50]}...")
        print(f"업로드 날짜: {upload_date}")
        print(f"채널명: {channel_name}")
        print(f"채널 핸들: {channel_handle}")  # 새로 추가된 정보
        print(f"분석 ID: {analysis_id}")
        print(f"{'='*60}")
        
        # 스크립트 정제
        analysis_status[analysis_id].update({
            "step": "0단계: 스크립트 정제 중...",
            "progress": 5
        })
        time.sleep(1)
        
        try:
            cleaned_script = system.script_cleaner.clean_for_search_and_rag(script)
            print(f"정제 완료 (원본 {len(script)}자 → 정제 {len(cleaned_script)}자)")
            script = cleaned_script
        except Exception as e:
            print(f"❌ 스크립트 정제 오류 (원문 사용): {e}")
        
        # 종목 추출
        analysis_status[analysis_id].update({
            "step": "1단계: 종목 추출 중...",
            "progress": 10
        })
        time.sleep(1)
        
        try:
            extracted_stocks = system.llm_handler.extract_stocks_only(script)
            if extracted_stocks:
                print(f"추출된 종목: {', '.join(extracted_stocks)}")
            else:
                print("추출된 종목: 없음")
        except Exception as e:
            print(f"❌ 종목 추출 오류: {e}")
            extracted_stocks = []
        
        # 종목 데이터 검증
        analysis_status[analysis_id].update({
            "step": "2단계: 종목 데이터 검증 중...",
            "progress": 30
        })
        time.sleep(1)
        
        stock_analysis_results = {}
        if extracted_stocks:
            print("2단계: 종목 데이터 검증 중...")
            for stock in extracted_stocks:
                try:
                    print(f"  - {stock} 검증 중...")
                    analysis = system.stock_checker.check_stock_comprehensive(stock, script)
                    stock_analysis_results[stock] = analysis
                    print(f"  - {stock} 검증 완료: {analysis.get('financial_status', {}).get('status', 'unknown')}")
                    if analysis.get('financial_status', {}).get('status') == 'success':
                        debt_ratio = analysis['financial_status'].get('debt_ratio', 'N/A')
                        print(f"    부채비율: {debt_ratio}%")
                except Exception as e:
                    print(f"❌ {stock} 검증 오류: {e}")
                    stock_analysis_results[stock] = {"status": "error", "message": str(e)}
        
        # PDF 검색
        analysis_status[analysis_id].update({
            "step": "3단계: PDF 검색 중...",
            "progress": 50
        })
        time.sleep(1)
        
        pdf_results = ""
        if system.pdf_processor.chunks:
            print("3단계: PDF 검색 중...")
            try:
                similar_chunks = system.pdf_processor.search_similar_chunks(
                    query=script, 
                    top_k=3
                )
                
                if similar_chunks:
                    pdf_results = "\n\n=== RAG 데이터베이스 참고 자료 ==="
                    for i, result in enumerate(similar_chunks):
                        pdf_results += f"\n[참고 {i+1}] (관련도: {result['similarity']:.3f})\n"
                        pdf_results += result['chunk'][:400] + "...\n"
                        
            except Exception as e:
                print(f"❌ PDF 검색 오류: {e}")
        
        # 4단계: 과거 vs 현재 비교 분석
        analysis_status[analysis_id].update({
            "step": "4단계: 업로드 시점 분석만 수행",
            "progress": 70
        })
        time.sleep(1)
        
        historical_results = {}
        try:
            upload_dt = datetime.strptime(upload_date, "%Y-%m-%d")
            current_dt = datetime.now()
            days_diff = (current_dt - upload_dt).days
            
            if days_diff <= 30:
                print(f"4단계: 업로드 시점 분석만 수행 (업로드일이 {days_diff}일 전)")
                historical_results = system.historical_checker.check_upload_time_only(
                    user_query=script,
                    upload_date=upload_date,
                    stock_list=extracted_stocks
                )
            else:
                print(f"4단계: 업로드 시점 + 현재 시점 비교 분석 수행 (업로드일이 {days_diff}일 전)")
                historical_results = system.historical_checker.check_historical_vs_current(
                    user_query=script,
                    upload_date=upload_date,
                    stock_list=extracted_stocks
                )
            
            # 웹 검색 완료 단계
            analysis_status[analysis_id].update({
                "step": "웹 검색 및 필터링 완료",
                "progress": 80
            })
            time.sleep(1)
            
        except Exception as e:
            print(f"❌ 과거 vs 현재 비교 분석 오류: {e}")
            historical_results = {
                "status": "error",
                "message": f"과거 vs 현재 비교 분석 실패: {str(e)}"
            }
        
        # 5단계: 업로더 신분 검증 및 위반사항 확인
        analysis_status[analysis_id].update({
            "step": "5단계: 업로더 신분 검증 중",
            "progress": 80
        })
        time.sleep(1)
        
        print("5단계: 업로더 신분 검증 중...")
        uploader_verification = system.llm_handler.verify_uploader_identity(channel_name, channel_handle)  # 🔥 channel_handle 추가
        print(f"  - 검증 결과: {uploader_verification['message']}")

        violation_check = None
        if uploader_verification.get("is_similar_advisor"):
            print("⚖️ 유사투자자문업자 법률 위반 검사 중...")
            violation_check = system.llm_handler.check_similar_advisor_violations(script, uploader_verification)
            if violation_check.get("has_violations"):
                print(f"  - 위반 감지: {len(violation_check['violations'])}건")

        # 6단계: AI 종합 분석
        analysis_status[analysis_id].update({
            "step": "6단계: AI 종합 분석 중",
            "progress": 90
        })
        time.sleep(2)
        
        try:
            final_analysis = system.llm_handler.generate_final_analysis(
                user_query=script,
                web_results="",
                pdf_results=pdf_results,
                video_date=upload_date,
                stock_analysis_results=stock_analysis_results,
                historical_results=historical_results,
                channel_name=channel_name,
                uploader_verification=uploader_verification,
                violation_check=violation_check
            )
            
            print("AI 종합 분석 완료")
            
            # 최종 결과 저장
            final_result = {
                'analysis': final_analysis,
                'extracted_stocks': extracted_stocks,
                'stock_analysis': stock_analysis_results,
                'historical_analysis': historical_results,
                'uploader_verification': uploader_verification,
                'violation_check': violation_check,
                'channel_name': channel_name,
                'upload_date': upload_date,
                'script_length': len(script),
                'processed_at': datetime.now().isoformat()
            }
            
            analysis_status[analysis_id].update({
                "status": "completed",
                "step": "분석 완료",
                "progress": 100,
                "result": final_result
            })
            
        except Exception as e:
            print(f"❌ 최종 분석 오류: {e}")
            analysis_status[analysis_id].update({
                "status": "error",
                "error": f"최종 분석 중 오류가 발생했습니다: {str(e)}"
            })
            
    except Exception as e:
        print(f"❌ 전체 분석 프로세스 오류: {e}")
        print(f"상세 오류:\n{traceback.format_exc()}")
        analysis_status[analysis_id].update({
            "status": "error",
            "error": f"분석 중 오류가 발생했습니다: {str(e)}"
        })

@app.route('/analyze', methods=['POST'])
def analyze_script():
    """
    유튜브 스크립트 분석 API (기존 방식 - 호환성 유지)
    """
    try:
        if system is None:
            return jsonify({
                "success": False,
                "error": "시스템이 초기화되지 않았습니다.",
                "code": "SYSTEM_NOT_READY"
            }), 500
        
        if not request.json:
            return jsonify({
                "success": False,
                "error": "JSON 데이터가 필요합니다.",
                "code": "NO_JSON_DATA"
            }), 400
        
        script = request.json.get('script', '').strip()
        upload_date = request.json.get('upload_date', '').strip()
        channel_name = request.json.get('channel_name', '').strip()
        channel_handle = request.json.get('channel_handle', '').strip()  # 🔥 추가
        
        if not script:
            return jsonify({
                "success": False,
                "error": "스크립트 내용이 필요합니다.",
                "code": "NO_SCRIPT"
            }), 400
        
        if not upload_date:
            return jsonify({
                "success": False,
                "error": "업로드 날짜가 필요합니다. (YYYY-MM-DD 형식)",
                "code": "NO_DATE"
            }), 400
        
        if not channel_name:
            return jsonify({
                "success": False,
                "error": "채널명이 필요합니다.",
                "code": "NO_CHANNEL"
            }), 400
        
        # 날짜 형식 검증
        try:
            datetime.strptime(upload_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({
                "success": False,
                "error": "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.",
                "code": "INVALID_DATE_FORMAT"
            }), 400
        
        print(f"📝 분석 요청 받음:")
        print(f"   - 스크립트 길이: {len(script)}자")
        print(f"   - 업로드 날짜: {upload_date}")
        print(f"   - 채널명: {channel_name}")
        
        # 1차: 채널 ID/핸들 검증 (확장 가능한 구조)
        channel_verification = None
        if channel_handle:  # 채널 핸들이 있으면 1차 검증 시도
            try:
                # TODO: 실제 채널 ID/핸들 검증 로직 구현
                # 현재는 임시로 KB 관련 핸들만 확인
                if 'kb' in channel_handle.lower() or (channel_name and 'kb' in channel_name.lower()):
                    channel_verification = {
                        'verified': True,
                        'is_institutional': True,
                        'institution_name': 'KB증권',
                        'message': '제도권금융회사 KB증권에서 전달하는 정보입니다.',
                        'risk_level': 'safe',
                        'verification_method': 'channel_handle'
                    }
                    print(f"✅ 1차 검증 성공: {channel_verification['institution_name']}")
                else:
                    print("⚠️ 1차 검증 결과 없음, 2차 검증으로 진행")
            except Exception as e:
                print(f"❌ 1차 검증 오류: {e}, 2차 검증으로 진행")
        
        # 분석 실행 (검증 결과 전달)
        result = system.search_and_answer(
            user_query=script,  # 이미 정제됨
            video_date=upload_date,
            channel_name=channel_name,
            channel_handle=channel_handle,
            use_pdf=True,
            use_web=True,
            skip_cleaning=True,  # 중복 정제 방지
            pre_verified_uploader=channel_verification  # 1차 검증 결과 전달
        )
        
        return jsonify({
            "success": True,
            "result": {
                "analysis": result,
                "upload_date": upload_date,
                "script_length": len(script),
                "processed_at": datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        print(f"❌ 분석 중 오류 발생: {e}")
        print(f"상세 오류:\n{traceback.format_exc()}")
        
        return jsonify({
            "success": False,
            "error": f"분석 중 오류가 발생했습니다: {str(e)}",
            "code": "ANALYSIS_ERROR"
        }), 500

@app.route('/recommend_videos', methods=['POST'])
def recommend_videos():
    """관련 영상 추천 API"""
    try:
        if system is None:
            return jsonify({
                "success": False,
                "error": "시스템이 초기화되지 않았습니다."
            }), 500
            
        if not request.json:
            return jsonify({
                "success": False,
                "error": "JSON 데이터가 필요합니다."
            }), 400
        
        current_title = request.json.get('current_title', '').strip()
        top_k = request.json.get('top_k', 3)
        
        if not current_title:
            return jsonify({
                "success": False,
                "error": "현재 영상 제목이 필요합니다."
            }), 400
        
        print(f"📺 관련영상추천 요청:")
        print(f"   - 현재 영상: {current_title}")
        print(f"   - 요청 개수: {top_k}")
        
        #  main.py의 추천 시스템 사용
        recommendation_result = system.recommend_videos(current_title, top_k)
        
        if recommendation_result["status"] == "success":
            # 프론트엔드가 기대하는 형식으로 변환
            recommendations = []
            for video in recommendation_result["recommendations"]:
                recommendations.append({
                    "title": video.get("title", "제목 없음"),
                    "url": video.get("url", "#"),
                    "thumbnail": video.get("thumbnail", "")
                })
            
            return jsonify({
                "success": True,
                "recommendations": recommendations,
                "total_count": len(recommendations),
                "query": current_title,
                "processed_at": datetime.now().isoformat()
            })
        else:
            return jsonify({
                "success": False,
                "error": recommendation_result.get("error", "추천 시스템 오류")
            }), 500
        
    except Exception as e:
        print(f"❌ 관련영상추천 오류: {e}")
        return jsonify({
            "success": False,
            "error": f"관련영상추천 중 오류가 발생했습니다: {str(e)}"
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 체크"""
    try:
        if system is None:
            return jsonify({
                "status": "unhealthy",
                "message": "시스템이 초기화되지 않았습니다."
            }), 500
        
        return jsonify({
            "status": "healthy",
            "message": "모든 시스템이 정상 작동 중입니다.",
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "message": f"상태 확인 중 오류: {str(e)}"
        }), 500

@app.route('/test', methods=['POST'])
def test_analysis():
    """테스트용 간단 분석"""
    try:
        test_script = """
        안녕하세요 여러분! 오늘은 정말 좋은 투자 기회를 소개해드릴게요.
        삼성전자 주식이 지금 완전 저점이에요. 무조건 오를 수밖에 없어요!
        제가 추천하는 종목들은 100% 수익 보장해드립니다.
        """
        
        test_date = "2024-01-15"
        
        result = system.search_and_answer(
            user_query=test_script,
            video_date=test_date,
            use_pdf=True,
            use_web=False,
            skip_cleaning=False  # 테스트는 정제 진행
        )
        
        return jsonify({
            "success": True,
            "test_result": result,
            "message": "테스트 분석 완료"
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"테스트 중 오류: {str(e)}"
        }), 500

if __name__ == '__main__':
    import logging
    import sys
    import os
    
    # Flask의 기본 로깅 비활성화
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    # 포트 환경변수 처리
    port = int(os.environ.get('PORT', 5000))
    
    # CLI 출력만 최소화
    print("🌐 Flask 서버 시작...")
    print(f"📍 접속 주소: http://localhost:{port}")
    print("🔥 서버 실행 중... (Ctrl+C로 종료)")
    
    # 더 조용한 서버 실행
    app.run(
        debug=False,
        host='0.0.0.0',
        port=port,
        threaded=True,
        use_reloader=False  # 리로더 비활성화로 중복 메시지 방지
    )
