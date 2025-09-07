# historical_checker.py - 과거 vs 현재 비교 분석 모듈 (종목명 추가 개선)

import requests
import json
from datetime import datetime, timedelta

class HistoricalChecker:
    def __init__(self, web_searcher, llm_client, dart_api_key=None):
        """
        과거 vs 현재 비교 분석기 초기화
        
        Args:
            web_searcher: WebSearcher 인스턴스
            llm_client: LLM 클라이언트 (DeepSeek)
            dart_api_key: DART API 키 (선택적)
        """
        self.web_searcher = web_searcher
        self.llm_client = llm_client
        self.dart_api_key = dart_api_key
    
    def check_historical_vs_current(self, user_query, upload_date, stock_list=None):
        """
        업로드 당시 vs 현재 상황 비교 분석
        
        Args:
            user_query: 영상 스크립트
            upload_date: 업로드 날짜 (YYYY-MM-DD)
            stock_list: 검증할 종목 리스트 (선택적)
            
        Returns:
            dict: 과거 vs 현재 비교 분석 결과
        """
        print(f"🔍 과거 vs 현재 비교 분석 시작: {upload_date}")
        
        # 1단계: AI로 팩트체크 가능한 문장들 추출
        factual_claims = self._extract_factual_claims_with_ai(user_query)
        
        if not factual_claims:
            return {
                "upload_date": upload_date,
                "status": "no_claims",
                "message": "팩트체크 대상 문장이 없습니다."
            }
        
        # 2단계: 과거 시점 검색 (업로드일 기준) - 종목명 추가
        historical_results = {}
        print("🔍 과거 시점 정보 수집 중...")
        
        # 중복 제거 및 정리
        unique_claims = []
        seen_claims = set()
        
        for claim in factual_claims:
            # 간단한 정규화 (공백 제거, 소문자 변환)
            normalized_claim = claim.strip().lower()
            if normalized_claim not in seen_claims and len(claim.strip()) > 3:  # 최소 길이를 3자로 낮춤
                unique_claims.append(claim)
                seen_claims.add(normalized_claim)
        
        print(f"📝 총 {len(factual_claims)}개 문장에서 {len(unique_claims)}개 고유 문장 추출")
        
        # 병렬 검색을 위한 쿼리 준비
        search_queries = []
        for claim in unique_claims:
            search_query = self._create_search_query(claim, stock_list)
            search_queries.append(search_query)
        
        print(f"🔍 {len(unique_claims)}개 쿼리 병렬 검색 시작...")
        
        # 병렬 검색 실행
        search_results = self.web_searcher.search_multiple_parallel(search_queries, max_workers=3)
        
        # 결과 정리
        for i, claim in enumerate(unique_claims):
            search_query = search_queries[i]
            search_result = search_results[search_query]
            
            historical_results[f"claim_{i+1}"] = {
                "claim": claim,
                "search_query": search_query,
                "historical_search": search_result
            }
        
        # 3단계: 현재 시점 검색 (한 달 이내 영상은 생략)
        upload_dt = datetime.strptime(upload_date, "%Y-%m-%d")
        current_dt = datetime.now()
        days_diff = (current_dt - upload_dt).days
        
        if days_diff <= 30:
            print(f"📅 영상 업로드일이 {days_diff}일 전으로, 한 달 이내입니다.")
            print("🔍 현재 시점 검색을 생략합니다. (과거와 현재 차이가 크지 않음)")
            
            # 현재 검색 결과를 과거 검색 결과와 동일하게 설정
            for i, claim in enumerate(factual_claims):
                historical_results[f"claim_{i+1}"]["current_search"] = historical_results[f"claim_{i+1}"]["historical_search"]
                historical_results[f"claim_{i+1}"]["search_skipped"] = True
        else:
            print(f"📅 영상 업로드일이 {days_diff}일 전으로, 한 달을 초과합니다.")
            print("🔍 현재 시점 정보 수집 중...")
            
            # 현재 시점 검색 쿼리 준비
            current_search_queries = [historical_results[f"claim_{i+1}"]["search_query"] for i in range(len(unique_claims))]
            
            print(f"🔍 {len(unique_claims)}개 현재 시점 쿼리 병렬 검색 시작...")
            
            # 병렬 검색 실행
            current_search_results = self.web_searcher.search_multiple_parallel(current_search_queries, max_workers=3)
            
            # 결과 정리
            for i, claim in enumerate(unique_claims):
                search_query = current_search_queries[i]
                current_search = current_search_results[search_query]
                
                historical_results[f"claim_{i+1}"]["current_search"] = current_search
                historical_results[f"claim_{i+1}"]["search_skipped"] = False
        
        # 4단계: AI로 과거 vs 현재 비교 분석
        comparison_analysis = self._analyze_historical_vs_current_with_ai(
            user_query=user_query,
            upload_date=upload_date,
            factual_claims=unique_claims,  # 중복 제거된 문장들 사용
            comparison_data=historical_results
        )
        
        results = {
            "upload_date": upload_date,
            "current_date": datetime.now().strftime("%Y-%m-%d"),
            "extracted_claims": unique_claims,  # 중복 제거된 문장들
            "original_claims_count": len(factual_claims),
            "unique_claims_count": len(unique_claims),
            "comparison_data": historical_results,
            "comparison_analysis": comparison_analysis
        }
        
        print("✅ 과거 vs 현재 비교 분석 완료")
        return results
    
    def check_upload_time_only(self, user_query, upload_date, stock_list=None):
        """
        업로드 시점만 분석 (한 달 이내 영상용)
        
        Args:
            user_query: 영상 스크립트
            upload_date: 업로드 날짜 (YYYY-MM-DD)
            stock_list: 검증할 종목 리스트 (선택적)
            
        Returns:
            dict: 업로드 시점 분석 결과
        """
        print(f"🔍 업로드 시점 분석 시작: {upload_date}")
        
        # 1단계: AI로 팩트체크 가능한 문장들 추출
        factual_claims = self._extract_factual_claims_with_ai(user_query)
        
        if not factual_claims:
            return {
                "upload_date": upload_date,
                "status": "no_claims",
                "message": "팩트체크 대상 문장이 없습니다."
            }
        
        # 2단계: 업로드 시점 검색만 수행
        historical_results = {}
        print("🔍 업로드 시점 정보 수집 중...")
        
        # 중복 제거 및 정리
        unique_claims = []
        seen_claims = set()
        
        for claim in factual_claims:
            # 간단한 정규화 (공백 제거, 소문자 변환)
            normalized_claim = claim.strip().lower()
            if normalized_claim not in seen_claims and len(claim.strip()) > 3:
                unique_claims.append(claim)
                seen_claims.add(normalized_claim)
        
        print(f"📝 총 {len(factual_claims)}개 문장에서 {len(unique_claims)}개 고유 문장 추출")
        
        # 병렬 검색을 위한 쿼리 준비
        search_queries = []
        for claim in unique_claims:
            search_query = self._create_search_query(claim, stock_list)
            search_queries.append(search_query)
        
        print(f"🔍 {len(unique_claims)}개 업로드 시점 쿼리 병렬 검색 시작...")
        
        # 병렬 검색 실행 (업로드 시점 검색)
        search_results = self.web_searcher.search_multiple_parallel(search_queries, max_workers=3)
        
        # 결과 정리
        for i, claim in enumerate(unique_claims):
            search_query = search_queries[i]
            search_result = search_results[search_query]
            
            historical_results[f"claim_{i+1}"] = {
                "claim": claim,
                "search_query": search_query,
                "historical_search": search_result,
                "current_search": search_result,  # 현재 검색은 과거와 동일하게 설정
                "search_skipped": True  # 현재 검색 생략됨 표시
            }
        
        # 3단계: AI로 업로드 시점 분석
        analysis_result = self._analyze_upload_time_only_with_ai(
            user_query=user_query,
            upload_date=upload_date,
            factual_claims=unique_claims,
            comparison_data=historical_results
        )
        
        results = {
            "upload_date": upload_date,
            "current_date": datetime.now().strftime("%Y-%m-%d"),
            "extracted_claims": unique_claims,
            "original_claims_count": len(factual_claims),
            "unique_claims_count": len(unique_claims),
            "comparison_data": historical_results,
            "comparison_analysis": analysis_result,
            "analysis_type": "upload_time_only"
        }
        
        print("✅ 업로드 시점 분석 완료")
        return results
    
    def _create_search_query(self, claim, stock_list):
        """
        검색 쿼리 생성 (주가/종목 관련 문장에만 종목명 추가)
        
        Args:
            claim: 원본 문장
            stock_list: 종목 리스트
            
        Returns:
            str: 개선된 검색 쿼리
        """
        # 주가/종목 관련 키워드들
        stock_related_keywords = [
            # 주가 관련
            "주가", "주식", "급등", "급락", "상승", "하락", "조정", "반등", "고점", "저점",
            "상승세", "하락세", "조정받고", "반등하고", "고점 찍고", "저점 찍고",
            "오르고", "내려가고", "올랐다", "내려갔다", "상승중", "하락중",
            
            # 거래량 관련
            "거래량", "거래대금", "거래 활발", "거래 증가", "거래 감소",
            
            # 시가총액 관련
            "시가총액", "시총", "대형주", "중형주", "소형주",
            
            # 투자 관련
            "투자", "매수", "매도", "매수세", "매도세", "기관매수", "기관매도",
            "외국인매수", "외국인매도", "개인매수", "개인매도",
            
            # 종목 관련
            "종목", "기업", "회사", "주식회사", "(주)", "㈜",
            
            # 차트/기술적 분석
            "차트", "이동평균선", "지지선", "저항선", "브레이크아웃", "브레이크다운",
            "골든크로스", "데드크로스", "RSI", "MACD", "볼린저밴드",
            
            # 뉴스/이벤트 관련 (주가에 영향)
            "실적 발표", "분기 실적", "연간 실적", "실적 예상", "실적 전망",
            "배당", "배당금", "배당률", "유상증자", "무상증자", "감자",
            "합병", "분할", "스핀오프", "M&A", "인수",
            "상장", "IPO", "코스닥", "코스피", "신규상장",
            "상장폐지", "관리종목", "투자주의", "투자경고", "투자위험",
            
            # 산업/섹터 관련
            "업종", "섹터", "테마주", "관련주", "수혜주", "대장주", "벤처주"
        ]
        
        # 종목 리스트가 있고, 주가/종목 관련 키워드가 포함된 경우에만 종목명 추가
        if stock_list and len(stock_list) > 0:
            main_stock = stock_list[0]  # 첫 번째 종목을 메인으로 사용
            
            # 주가/종목 관련 키워드가 포함되어 있는지 확인
            claim_lower = claim.lower()
            is_stock_related = any(keyword in claim_lower for keyword in stock_related_keywords)
            
            if is_stock_related:
                return f"{main_stock} {claim}"
        
        # 주가/종목 관련이 아니거나 종목이 없으면 원본 그대로
        return claim
    
    def _extract_factual_claims_with_ai(self, user_query):
        """
        AI로 팩트체크 가능한 문장들 추출
        
        Args:
            user_query: 영상 스크립트
            
        Returns:
            list: 추출된 주장 문장들
        """
        system_prompt = """당신은 투자 영상에서 사실 확인이 필요한 구체적인 주장들을 추출하는 전문가입니다.

다음 영상 스크립트에서 시간이 지나면서 변화할 수 있는 객관적 사실 주장들만 추출해주세요.

추출 기준:
- 주가/주식 관련: "급등", "하락", "상승", "조정", "반등", "고점", "저점" 등 (짧은 표현도 포함)
- 재무/실적 관련: "실적 좋음", "매출 증가", "이익 개선", "부채 감소" 등  
- 뉴스/이슈 관련: "화제의 기업", "최근 발표", "계약 체결", "신제품 출시" 등
- 정책/경제 관련: "정부 지원", "금리 변화", "규제 완화", "업황 개선" 등
- 시장 상황 관련: "업계 호조", "시장 활황", "투자 증가", "경쟁 심화" 등

제외할 것:
- 주관적 의견: "좋은 기업", "추천합니다" 등
- 미래 예측: "오를 것", "될 것" 등
- 불변 사실: "설립 연도", "본사 위치" 등
- 중복된 내용이나 유사한 표현

중요: 
- 각 문장은 서로 다른 내용이어야 하며, 중복되거나 유사한 표현은 제외하세요.
- 짧은 문장이라도 시간에 따라 변화할 수 있는 객관적 사실이면 포함하세요.

다음 형태로만 답변하세요:
---CLAIMS---
문장1
문장2
문장3

추출할 문장이 없으면 "없음"이라고 작성하세요."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 영상 스크립트에서 시간에 따라 변화 가능한 사실 주장들을 추출해주세요:\n\n{user_query}"}
        ]
        
        try:
            print("🤖 AI로 시간 변화 추적 대상 문장 추출 중...")
            completion = self.llm_client.chat.completions.create(
                model="deepseek-ai/DeepSeek-V3-0324",
                messages=messages,
            )
            
            response = completion.choices[0].message.content
            
            # ---CLAIMS--- 구분자로 문장들 추출
            if response and '---CLAIMS---' in response:
                claims_section = response.split('---CLAIMS---')[1].strip()
                
                if claims_section == "없음" or claims_section.lower() == "none":
                    print("📝 시간 변화 추적 대상 문장 없음")
                    return []
                
                # 줄바꿈으로 분리하고 정리
                claims = [claim.strip() for claim in claims_section.split('\n') if claim.strip()]
                claims = [claim for claim in claims if claim and claim != "없음"]
                
                print(f"📝 {len(claims)}개 변화 추적 문장 추출 완료")
                return claims
            else:
                print("⚠️ CLAIMS 구분자를 찾을 수 없습니다.")
                return []
                
        except Exception as e:
            print(f"❌ AI 문장 추출 오류: {e}")
            return []
    
    def _analyze_historical_vs_current_with_ai(self, user_query, upload_date, factual_claims, comparison_data):
        """
        AI로 과거 vs 현재 비교 분석
        
        Args:
            user_query: 원본 스크립트
            upload_date: 업로드 날짜
            factual_claims: 추출된 주장들
            comparison_data: 과거 vs 현재 검색 결과들
            
        Returns:
            dict: 최종 비교 분석 결과
        """
        # 비교 데이터를 텍스트로 정리
        comparison_text = ""
        search_skipped = False
        
        for key, data in comparison_data.items():
            comparison_text += f"\n=== {data['claim']} ===\n"
            comparison_text += f"검색 쿼리: {data['search_query']}\n"
            comparison_text += f"과거 시점({upload_date}) 검색 결과:\n{data['historical_search'][:400]}...\n"
            
            # 검색이 생략된 경우 표시
            if data.get('search_skipped', False):
                comparison_text += f"현재 시점 검색: 생략됨 (영상 업로드일이 한 달 이내)\n"
                search_skipped = True
            else:
                comparison_text += f"현재 시점 검색 결과:\n{data['current_search'][:400]}...\n"
        
        current_date = datetime.now().strftime("%Y-%m-%d")
        
        # 검색 생략 여부에 따른 프롬프트 조정
        if search_skipped:
            system_prompt = f"""당신은 투자 영상의 시간 경과에 따른 변화를 분석하는 전문가입니다.

영상에서 주장한 내용이 업로드 당시({upload_date})의 상황을 분석해주세요.
(참고: 영상 업로드일이 한 달 이내로, 현재 시점 검색은 생략되었습니다)

⚠️ 중요한 제약 조건:
- 구체적 수치(주가, 퍼센트 등)는 검색 결과에 명확히 나온 경우에만 사용
- 수치가 불명확하면 "상승/하락 경향", "호조/부진" 등 추상적 표현 사용
- 추측하거나 대략적 수치 창작 금지
- 확인되지 않은 정보는 "확인되지 않음" 표시

다음 구조로 답변해주세요:

---ANALYSIS_SUMMARY---
업로드 당시 상황에 대한 요약

---DETAILED_ANALYSIS---
각 주장별 당시 상황 분석:

"영상에서 한 정확한 문장 인용"
- 당시({upload_date}): 실제 상황 (검색 결과 기반, 추측 금지)
- 검증 결과: 사실 여부 및 신뢰도 평가"""
        else:
            system_prompt = f"""당신은 투자 영상의 시간 경과에 따른 변화를 분석하는 전문가입니다.

영상에서 주장한 내용이 업로드 당시({upload_date})와 현재({current_date}) 어떻게 달라졌는지 분석해주세요.

⚠️ 중요한 제약 조건:
- 구체적 수치(주가, 퍼센트 등)는 검색 결과에 명확히 나온 경우에만 사용
- 수치가 불명확하면 "상승/하락 경향", "호조/부진" 등 추상적 표현 사용
- 추측하거나 대략적 수치 창작 금지
- 확인되지 않은 정보는 "확인되지 않음" 표시

다음 구조로 답변해주세요:

---COMPARISON_SUMMARY---
업로드 당시 vs 현재의 주요 차이점들을 간단히 요약 (변화가 있는 경우에만 작성)

---DETAILED_COMPARISON---
각 주장별 과거 vs 현재 상세 비교 (변화가 있는 문장만 작성):

"영상에서 한 정확한 문장 인용"
- 당시({upload_date}): 실제 상황 (검색 결과 기반, 추측 금지)
- 현재({current_date}): 현재 상황 (검색 결과 기반, 추측 금지)"""

        user_content = f"""영상 업로드 날짜: {upload_date}
현재 날짜: {current_date}

=== 원본 영상 스크립트 ===
{user_query}

=== 추출된 시간 변화 추적 주장들 ===
{chr(10).join([f"{i+1}. {claim}" for i, claim in enumerate(factual_claims)])}

=== 과거 vs 현재 검색 결과 비교 ===
{comparison_text}

위 정보를 바탕으로 영상 주장들이 시간이 지나면서 어떻게 변화했는지 분석해주세요."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]
        
        try:
            print("🤖 AI 과거 vs 현재 비교 분석 중...")
            completion = self.llm_client.chat.completions.create(
                model="deepseek-ai/DeepSeek-V3-0324",
                messages=messages,
            )
            
            analysis_result = completion.choices[0].message.content
            print("✅ AI 과거 vs 현재 비교 분석 완료")
            
            return {
                "status": "completed",
                "analysis": analysis_result,
                "claims_count": len(factual_claims),
                "time_span": f"{upload_date} ~ {current_date}"
            }
            
        except Exception as e:
            print(f"❌ AI 비교 분석 오류: {e}")
            return {
                "status": "error",
                "message": f"분석 중 오류: {str(e)}"
            }
    
    def _analyze_upload_time_only_with_ai(self, user_query, upload_date, factual_claims, comparison_data):
        """
        AI로 업로드 시점만 분석
        
        Args:
            user_query: 원본 스크립트
            upload_date: 업로드 날짜
            factual_claims: 추출된 주장들
            comparison_data: 업로드 시점 검색 결과들
            
        Returns:
            dict: 업로드 시점 분석 결과
        """
        # 비교 데이터를 텍스트로 정리
        comparison_text = ""
        
        for key, data in comparison_data.items():
            comparison_text += f"\n=== {data['claim']} ===\n"
            comparison_text += f"검색 쿼리: {data['search_query']}\n"
            comparison_text += f"업로드 시점({upload_date}) 검색 결과:\n{data['historical_search'][:400]}...\n"
            comparison_text += f"현재 시점 검색: 생략됨 (영상 업로드일이 한 달 이내)\n"
        
        system_prompt = f"""당신은 투자 영상의 업로드 시점 상황을 분석하는 전문가입니다.

영상에서 주장한 내용이 업로드 당시({upload_date})의 상황을 분석해주세요.
(참고: 영상 업로드일이 한 달 이내로, 현재 시점 검색은 생략되었습니다)

⚠️ 중요한 제약 조건:
- 구체적 수치(주가, 퍼센트 등)는 검색 결과에 명확히 나온 경우에만 사용
- 수치가 불명확하면 "상승/하락 경향", "호조/부진" 등 추상적 표현 사용
- 추측하거나 대략적 수치 창작 금지
- 확인되지 않은 정보는 "확인되지 않음" 표시

다음 구조로 답변해주세요:

---ANALYSIS_SUMMARY---
업로드 당시 상황에 대한 요약

---DETAILED_ANALYSIS---
각 주장별 당시 상황 분석:

"영상에서 한 정확한 문장 인용"
- 당시({upload_date}): 실제 상황 (검색 결과 기반, 추측 금지)
- 검증 결과: 사실 여부 및 신뢰도 평가"""

        user_content = f"""영상 업로드 날짜: {upload_date}

=== 원본 영상 스크립트 ===
{user_query}

=== 추출된 시간 변화 추적 주장들 ===
{chr(10).join([f"{i+1}. {claim}" for i, claim in enumerate(factual_claims)])}

=== 업로드 시점 검색 결과 ===
{comparison_text}

위 정보를 바탕으로 영상 주장들이 업로드 당시 실제로 어떤 상황이었는지 분석해주세요."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]
        
        try:
            print("🤖 AI 업로드 시점 분석 중...")
            completion = self.llm_client.chat.completions.create(
                model="deepseek-ai/DeepSeek-V3-0324",
                messages=messages,
            )
            
            analysis_result = completion.choices[0].message.content
            print("✅ AI 업로드 시점 분석 완료")
            
            return {
                "status": "completed",
                "analysis": analysis_result,
                "claims_count": len(factual_claims),
                "analysis_type": "upload_time_only"
            }
            
        except Exception as e:
            print(f"❌ AI 업로드 시점 분석 오류: {e}")
            return {
                "status": "error",
                "message": f"분석 중 오류: {str(e)}"
            }
