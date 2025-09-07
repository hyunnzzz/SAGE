# main.py - 통합 실행 파일
import os
from config import Config

from script_cleaner import ScriptCleaner 
from pdf_processor import PDFProcessor
from web_searcher import WebSearcher  
from llm_handler import LLMHandler
from stock_checker import StockChecker
from historical_checker import HistoricalChecker
from datetime import datetime



class IntegratedSearchSystem:
    def __init__(self):
        """통합 검색 시스템 초기화"""
        
        # 설정 검증
        Config.validate()
        
        # 환경변수에서 API 키 로드
        self.hf_token = Config.HUGGINGFACE_TOKEN
        self.serper_api_key = Config.SERPER_API_KEY
        dart_api_key = Config.DART_API_KEY
        
        # 각 모듈 초기화
        self.llm_handler = LLMHandler(token=self.hf_token)
        self.web_searcher = WebSearcher(api_key=self.serper_api_key)
        self.pdf_processor = PDFProcessor(client=self.llm_handler.client)
        self.stock_checker = StockChecker(dart_api_key=dart_api_key)
        
        # 과거 시점 검증기 초기화
        self.historical_checker = HistoricalChecker(
            web_searcher=self.web_searcher,
            llm_client=self.llm_handler.client
        )
        
        # 스크립트 정제기 초기화
        self.script_cleaner = ScriptCleaner(self.llm_handler)
        
        self._initialize_recommendation_system()        
        
        # RAG 자동 로딩
        self._auto_load_rag()
        
        print("=== 통합 검색 시스템 초기화 완료 ===")
    
    def _initialize_recommendation_system(self):
        """키워드 기반 추천 시스템 초기화""" 
        try:
            from recommend_video import VideoRecommendationSystem
            self.recommendation_system = VideoRecommendationSystem()
            print("키워드 기반 추천 시스템 초기화 완료")
        except Exception as e:
            print(f"추천 시스템 초기화 실패: {e}")
            print("   - data/kb_videos_crawled.csv 파일 확인 필요")
            print("   - video_recommendation.py 모듈 확인 필요") 
            print("   - 더미 추천으로 대체됩니다")
            self.recommendation_system = None

    def _auto_load_rag(self):
        """pdfs 폴더 자동 로딩"""
        default_pdf_folder = "pdfs"
        
        # pdfs 폴더와 PDF 파일 존재 확인
        if os.path.exists(default_pdf_folder):
            import glob
            pdf_files = glob.glob(os.path.join(default_pdf_folder, "*.pdf"))
            
            if pdf_files:
                print(f"pdfs 폴더 발견 - 자동 로딩 중...")
                self.pdf_processor.process_pdf_folder(default_pdf_folder)
    
    def load_pdf(self, pdf_path):
        """
        PDF 파일 로드 및 처리 (수동)
        
        Args:
            pdf_path: PDF 파일 경로
            
        Returns:
            처리 성공 여부
        """
        return self.pdf_processor.process_pdf(pdf_path)
    
    def load_pdf_folder(self, folder_path):
        """
        PDF 폴더 로드 및 처리 (수동)
        
        Args:
            folder_path: PDF 폴더 경로
            
        Returns:
            처리 성공 여부
        """
        return self.pdf_processor.process_pdf_folder(folder_path)
    
    def search_and_answer(self, user_query, video_date, channel_name=None, channel_handle=None, use_pdf=True, use_web=True, skip_cleaning=False, pre_verified_uploader=None):
        """
        통합 검색 및 답변 생성 (과거 시점 검증 + 업로더 신분 검증 포함)
        
        Args:
            user_query: 유튜브 영상 스크립트
            video_date: 영상 업로드 날짜 (필수, YYYY-MM-DD 형식)
            channel_name: 유튜브 채널명 또는 업로더명 (선택, 신분 검증용)
            use_pdf: PDF 검색 사용 여부
            use_web: 웹 검색 사용 여부
            skip_cleaning: 스크립트 정제 건너뛰기 (이미 정제된 경우)
            pre_verified_uploader: 사전 검증된 업로더 정보 (app.py에서 전달)
            
        Returns:
            최종 답변
        """
        try:
            print(f"\n{'='*60}")
            print(f"영상 스크립트 분석: {user_query[:50]}...")
            print(f"업로드 날짜: {video_date}")
            if channel_name:
                print(f"채널명: {channel_name}")
            print(f"{'='*60}")
            
            # 스크립트 정제 단계 (조건부)
            if not skip_cleaning:
                print("0단계: 스크립트 정제 중...")
                try:
                    cleaned_query = self.script_cleaner.clean_for_search_and_rag(user_query)
                    print(f"정제 완료 (원본 {len(user_query)}자 → 정제 {len(cleaned_query)}자)")
                    user_query = cleaned_query
                except Exception as e:
                    print(f"스크립트 정제 오류 (원문 사용): {e}")
            else:
                print("0단계: 스크립트 정제 건너뜀 (이미 정제됨)")
            
            # 종목 추출
            print("1단계: 종목 추출 중...")
            try:
                extracted_stocks = self.llm_handler.extract_stocks_only(user_query)
                if extracted_stocks:
                    print(f"추출된 종목: {', '.join(extracted_stocks)}")
                else:
                    print("추출된 종목: 없음")
            except Exception as e:
                print(f"종목 추출 오류: {e}")
                extracted_stocks = []
                
            # 종목 데이터 검증 (종목이 있을 경우)
            stock_analysis_results = {}
            if extracted_stocks:
                print("2단계: 종목 데이터 검증 중...")
                for stock in extracted_stocks:
                    try:
                        print(f"  - {stock} 검증 중...")
                        analysis = self.stock_checker.check_stock_comprehensive(stock, user_query)
                        stock_analysis_results[stock] = analysis
                    except Exception as e:
                        print(f"{stock} 검증 오류: {e}")
                        stock_analysis_results[stock] = {"status": "error", "message": str(e)}
            
            # PDF 검색 (투자 가이드라인, 패턴) - RAG 최적화
            pdf_results = ""
            
            # PDF 검색 수행
            if use_pdf and self.pdf_processor.chunks:
                print("3단계: RAG 최적화 PDF 검색 중...")
                try:
                    # RAG 최적화: 키워드 기반 쿼리 생성
                    optimized_rag_query = self.llm_handler.create_simple_rag_query(user_query)
                    print(f"RAG 쿼리: {optimized_rag_query}")
                    
                    # 검색 수행
                    similar_chunks = self.pdf_processor.search_similar_chunks(
                        query=optimized_rag_query, 
                        top_k=3
                    )
                    
                    if similar_chunks:
                        pdf_results = "\n\n=== RAG 데이터베이스 참고 자료 ==="
                        for i, result in enumerate(similar_chunks):
                            pdf_results += f"\n[참고 {i+1}] (관련도: {result['similarity']:.3f})\n"
                            pdf_results += result['chunk'][:400] + "...\n"
                        print(f"RAG 검색 완료: {len(similar_chunks)}개 문서 매칭")
                    else:
                        print("RAG 검색 결과 없음")
                            
                except Exception as e:
                    print(f"RAG 검색 오류: {e}")
            elif use_pdf and not self.pdf_processor.chunks:
                print("PDF 데이터가 로드되지 않았습니다.")
            
            # 4단계: 과거 vs 현재 비교 분석 (조건부 실행)
            historical_results = {}
            try:
                upload_dt = datetime.strptime(video_date, "%Y-%m-%d")
                current_dt = datetime.now()
                days_diff = (current_dt - upload_dt).days
                
                if days_diff <= 30:
                    print(f"4단계: 업로드 시점 분석만 수행 (업로드일이 {days_diff}일 전)")
                    try:
                        historical_results = self.historical_checker.check_upload_time_only(
                            user_query=user_query,
                            upload_date=video_date,
                            stock_list=extracted_stocks
                        )
                        print("업로드 시점 분석 완료")
                    except Exception as e:
                        print(f"업로드 시점 분석 오류: {e}")
                        import traceback
                        print(f"상세 오류:\n{traceback.format_exc()}")
                        historical_results = {
                            "status": "error",
                            "message": f"업로드 시점 분석 실패: {str(e)}"
                        }
                else:
                    print(f"4단계: 업로드 시점 + 현재 시점 비교 분석 수행 (업로드일이 {days_diff}일 전)")
                    try:
                        historical_results = self.historical_checker.check_historical_vs_current(
                            user_query=user_query,
                            upload_date=video_date,
                            stock_list=extracted_stocks
                        )
                        print("과거 vs 현재 비교 분석 완료")
                    except Exception as e:
                        print(f"과거 vs 현재 비교 분석 오류: {e}")
                        import traceback
                        print(f"상세 오류:\n{traceback.format_exc()}")
                        historical_results = {
                            "status": "error",
                            "message": f"과거 vs 현재 비교 분석 실패: {str(e)}"
                        }
            except Exception as e:
                print(f"❌ 날짜 처리 오류: {e}")
                historical_results = {
                    "status": "error",
                    "message": f"날짜 처리 실패: {str(e)}"
                }
            
            # 5단계: 업로더 신분 검증 및 위반사항 확인 (계층적 검증)
            uploader_verification = None
            violation_check = None

            if pre_verified_uploader and pre_verified_uploader.get('verified'):
                # 1차 검증 성공한 경우 그 결과 사용
                print(f"사전 검증 결과 사용: {pre_verified_uploader.get('institution_name', '확인된 기관')}")
                uploader_verification = pre_verified_uploader
            elif channel_name:
                # 1차 검증 실패하거나 없는 경우 2차 검증 수행
                print("채널명 기반 검증 수행...")
                uploader_verification = self.llm_handler.verify_uploader_identity(channel_name, channel_handle)
                print(f"  - 검증 결과: {uploader_verification['message']}")

            if uploader_verification and uploader_verification.get("is_similar_advisor"):
                print("⚖️ 유사투자자문업자 법률 위반 검사 중...")
                violation_check = self.llm_handler.check_similar_advisor_violations(user_query, uploader_verification)
                if violation_check.get("has_violations"):
                    print(f"  - 위반 감지: {len(violation_check['violations'])}건")


            # 6단계: 최종 종합 분석 (업로더 신분 검증 포함)
            print("6단계: AI 종합 분석 중...")
            try:
                answer = self.llm_handler.generate_final_analysis(
                    user_query=user_query,
                    web_results="",
                    pdf_results=pdf_results,
                    video_date=video_date,
                    stock_analysis_results=stock_analysis_results,
                    historical_results=historical_results,
                    channel_name=channel_name,
                    uploader_verification=uploader_verification,
                    violation_check=violation_check
                )
                
                print(f"\n{'='*60}")
                print("신뢰성 분석 결과:")
                print(f"{'='*60}")
                print(answer)
                
                return answer
            except Exception as e:
                print(f"❌ 최종 분석 오류: {e}")
                import traceback
                print(f"상세 오류:\n{traceback.format_exc()}")
                return f"분석 중 오류가 발생했습니다: {str(e)}"
                
        except Exception as e:
            print(f"❌ 전체 분석 프로세스 오류: {e}")
            import traceback
            print(f"상세 오류:\n{traceback.format_exc()}")
            return f"분석 중 오류가 발생했습니다: {str(e)}"

       # 🔥 추천 관련 메서드들 추가 
    def recommend_videos(self, current_title, top_k=5):
        """
        키워드 기반 영상 추천
        
        Args:
            current_title: 현재 영상 제목
            top_k: 추천할 영상 수
            
        Returns:
            추천 결과 딕셔너리
        """
        if self.recommendation_system is None:
            print("⚠️ 추천 시스템이 초기화되지 않음, 더미 데이터 반환")
            return self._get_dummy_recommendations(current_title, top_k)
        
        try:
            from recommend_video import get_video_recommendations
            result = get_video_recommendations(current_title, top_k)
            
            if result["status"] == "success" and len(result["recommendations"]) > 0:
                print(f"✅ 키워드 기반 추천 완료: {len(result['recommendations'])}개 영상")
                
                # 매칭된 키워드 로깅
                for i, rec in enumerate(result["recommendations"], 1):
                    keywords = ', '.join(rec.get('matched_keywords', []))
                    similarity = rec.get('similarity_score', 0)
                    title = rec.get('title', '제목없음')[:30]
                    print(f"   {i}. {title}... (유사도: {similarity:.3f}, 키워드: [{keywords}])")
                
                return result
            else:
                print(f"⚠️ 추천 결과 없음: {result.get('error', '알 수 없는 오류')}")
                return self._get_dummy_recommendations(current_title, top_k)
                
        except Exception as e:
            print(f"❌ 추천 시스템 실행 오류: {e}")
            return self._get_dummy_recommendations(current_title, top_k)
    
    def _get_dummy_recommendations(self, current_title, top_k):
        """더미 추천 데이터 생성"""
        dummy_videos = [
            {
                "title": "2025년 어디에 투자할까요? 당신의 질문에 KB가 답을 드립니다",
                "original_title": "KB 인베스터 인사이트 2025 - 투자의 경계를 넓혀라",
                "video_id": "KB2025_01", 
                "url": "https://youtu.be/3E59AgFFwDs?si=r0gE6pS-zLfgHhC9",
                "thumbnail": "https://img.youtube.com/vi/3E59AgFFwDs/maxresdefault.jpg",
                "matched_keywords": ["투자", "2025년"]
            },
            {
                "title": "'버블장세'의 시작! 투자의 시야를 확대할 때",
                "original_title": "KB 인베스터 인사이트 2025 - 국내주식 전망",
                "video_id": "KB2025_02",
                "url": "https://youtu.be/KB_stock2025?si=abc123def456",
                "thumbnail": "https://img.youtube.com/vi/KB_stock2025/maxresdefault.jpg", 
                "matched_keywords": ["국내주식", "버블장세", "투자"]
            },
            {
                "title": "해외주식, 당신이 몰랐던 필수 투자 팁!",
                "original_title": "KB 인베스터 인사이트 2025 - 해외주식 가이드",
                "video_id": "KB2025_03",
                "url": "https://youtu.be/KB_global2025?si=def456ghi789",
                "thumbnail": "https://img.youtube.com/vi/KB_global2025/maxresdefault.jpg",
                "matched_keywords": ["해외주식", "투자팁", "글로벌투자"]
            }
        ]
        
        selected_videos = dummy_videos[:top_k]
        
        return {
            "query": current_title,
            "total_results": len(selected_videos),
            "recommendations": selected_videos,
            "status": "success",
            "fallback": True
        }
    
    def get_recommendation_status(self):
        """추천 시스템 상태 확인"""
        return {
            "initialized": self.recommendation_system is not None,
            "type": "keyword_based" if self.recommendation_system else "dummy_fallback",
            "ready": True
        }       
     
    def interactive_mode(self):
        """대화형 모드 실행 (업로드 날짜 + 채널명 입력 추가)"""
        print("\n🤖 통합 검색 시스템에 오신 것을 환영합니다!")
        print("명령어:")
        print("- 'load <파일경로>': PDF 파일 로드")
        print("- 'load_folder <폴더경로>': 폴더 내 모든 PDF 로드")
        print("- 'quit': 종료")
        print("- 그 외: 질문 입력")
        print("\n📋 입력 방법: 아래 항목을 차례로 입력해주세요.")

        while True:
            try:
                user_input = input("\n📝 스크립트를 입력하세요: ").strip()
                
                if user_input.lower() == 'quit':
                    print("👋 프로그램을 종료합니다.")
                    break

                elif user_input.lower().startswith('load_folder '):
                    folder_path = user_input[12:].strip()
                    if self.load_pdf_folder(folder_path):
                        print(f"✅ PDF 폴더 로드 완료: {folder_path}")
                    else:
                        print("❌ PDF 폴더 로드 실패")

                elif user_input.lower().startswith('load '):
                    pdf_path = user_input[5:].strip()
                    if self.load_pdf(pdf_path):
                        print(f"✅ PDF 로드 완료: {pdf_path}")
                    else:
                        print("❌ PDF 로드 실패")

                elif user_input:
                    query = user_input

                    video_date = input("📅 업로드 날짜 (YYYY-MM-DD 형식): ").strip()
                    if not self._is_valid_date(video_date):
                        print("❌ 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.")
                        continue

                    channel_name = input("📺 채널명 (선택 입력, Enter만 눌러도 됩니다): ").strip()
                    if not channel_name:
                        channel_name = None
                    else:
                        # ✅ 불용어 제거 및 정제
                        if hasattr(self.llm_handler, "_clean_channel_name"):
                            original_channel = channel_name
                            channel_name = self.llm_handler._clean_channel_name(channel_name)
                            print(f"📺 입력된 채널명 정제됨: '{original_channel}' → '{channel_name}'")

                    self.search_and_answer(query, video_date, channel_name)
                
            except KeyboardInterrupt:
                print("\n👋 프로그램을 종료합니다.")
                break
            except Exception as e:
                print(f"❌ 오류 발생: {e}")
    
    def _is_valid_date(self, date_str):
        """날짜 형식 검증"""
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
            return True
        except ValueError:
            return False

def main():
    """메인 함수"""
    try:
        # 시스템 초기화 (RAG 자동 로딩 포함)
        system = IntegratedSearchSystem()
        
        # 대화형 모드 실행
        system.interactive_mode()
        
    except Exception as e:
        print(f"시스템 초기화 실패: {e}")

if __name__ == "__main__":
    main()
