import os

from pdf_processor import PDFProcessor
from web_searcher import WebSearcher  
from stock_checker import StockChecker
from huggingface_hub import InferenceClient


class LLMHandler:
    def __init__(self, token=None, model_name="deepseek-ai/DeepSeek-V3-0324"):
        """
        LLM 핸들러 초기화
        
        Args:
            token: Hugging Face 토큰 (없으면 환경변수에서 자동 로드)
            model_name: 사용할 모델명
        """
        # 환경변수에서 토큰 로드
        if token is None:
            token = os.environ.get('HUGGINGFACE_TOKEN')
        if not token:
            raise ValueError("HUGGINGFACE_TOKEN이 설정되지 않았습니다. 환경변수를 확인해주세요.")
        
        self.client = InferenceClient(token=token)
        self.model_name = model_name
        
        # 업로더 신분 검증을 위한 데이터 초기화
        self.institutional_finance = None
        self.similar_investment_advisors = None
        self.load_financial_institutions()
        
        # RAG 최적화를 위한 투자 키워드 딕셔너리
        self.investment_keywords = {
            '기본투자': ['투자', '투자자', '자금', '자본', '수익', '손실', '위험', '리스크', '자산', '포트폴리오', '수익률', '원금', '투자원칙', '자산운용'],
            '주식시장': ['주식', '주가', '시장', '증시', '상장', '거래', '매매', '증권시장', '코스피', '코스닥', '유가증권시장', '거래소', '주식투자', '주가지수'],
            '투자방법': ['분산투자', '장기투자', '단기투자', '포트폴리오', '자산배분', '가치투자', '성장투자', '기본분석', '기술분석', '투자전략'],
            '경제지표': ['경제', '성장', '인플레이션', '금리', '환율', 'GDP', 'GNI', '경기', '경제성장률', '물가지수', '경제지표', '경기동향지수', '금리정책'],
            '기업분석': ['기업', '회사', '실적', '매출', '이익', '부채', '재무', '재무제표', 'PER', 'PBR', '시가총액', '내재가치', '기업가치', '재무분석'],
            '금융상품': ['펀드', '채권', 'ETF', '파생상품', '선물', '옵션', '금융투자상품', '투자신탁', '뮤추얼펀드', '국채', '회사채', '스왑', '워런트'],
            '부동산': ['부동산', '아파트', '토지', '건물', '임대', '주택', '주택가격', '전세', '매매', '부동산투자', '주택정책', '부동산시장', 'REITs'],
            '투자전략': ['전략', '방법', '원칙', '기준', '분석', '평가', '판단', '투자기법', '매매전략', '시장분석', '투자판단', '의사결정'],
            '가치투자': ['가치', '내재가치', '할인', '저평가', '고평가', '기업가치', '장기보유', '기업분석', '경영진평가', '경쟁우위', '버핏', '그레이엄'],
            '위험관리': ['위험관리', '손실', '변동성', '안전', '보존', '방어', '헤지', '리스크관리', '손실제한', '안전자산', '위험분산', '신용위험'],
            '투자주의': ['주의', '경고', '조심', '신중', '검토', '투자주의종목', '관리종목', '투자위험종목', '상장폐지', '불성실공시', '감리'],
            '금융감독': ['금융감독원', '금융위원회', '증권선물위원회', '감독', '규제', '검사', '제재', '처벌', '금융당국', '감시', '공정거래'],
            '불공정거래': ['불공정거래', '시세조종', '내부자거래', '허위공시', '부정거래', '미공개정보', '조작', '인위적', '부당이득', '시장교란'],
            '투자업계': ['증권회사', '자산운용', '투자자문', '금융회사', '투자은행', '브로커', '딜러', '운용사', '신탁회사', '금융투자업'],
            '주요섹터': ['IT', '바이오', '화학', '자동차', '건설', '금융', '유통', '반도체', '제약', '철강', '조선', '항공', '게임', '통신'],
            '신기술': ['AI', '인공지능', '반도체', '배터리', '신재생에너지', '바이오텍', '전기차', '자율주행', '메타버스', '블록체인', '5G', '로봇'],
            '투자가이드': ['방법', '가이드', '안내', '설명', '소개', '기초', '기본', '투자입문', '투자교육', '학습', '이해', '원리', '개념'],
            '투자교육': ['학습', '공부', '교육', '강의', '세미나', '워크샵', '연수', '투자강좌', '금융교육', '자본시장교육', '투자자교육', '금융이해력'],
            '초보투자': ['초보', '신규', '입문', '처음', '시작', '초보자', '신규투자자', '개인투자자', '소액투자', '기초투자', '투자시작'],
            '투자위험': ['위험성', '손실위험', '변동성', '불확실성', '시장위험', '신용위험', '유동성위험', '환율위험', '금리위험', '인플레이션위험', 'DSR'],
            '금융정책': ['통화정책', '금융정책', '정책금리', '기준금리', '거시건전성', '정책대출', '금융안정', '정책자금', '중앙은행', '한국은행']
        }
    
    def create_simple_rag_query(self, user_script):
        """
        유튜브 스크립트에서 RAG 검색용 최적화된 키워드 쿼리 생성
        
        Args:
            user_script: 유튜브 영상 스크립트 (최대 8000자)
            
        Returns:
            str: RAG 검색에 최적화된 키워드 조합 (200-300자)
        """
        try:
            print("RAG 최적화 키워드 추출 시작...")
            
            # 1. 스크립트 전처리
            script_lower = user_script.lower()
            
            # 2. 카테고리별 키워드 매칭
            found_keywords = {}
            total_matches = 0
            
            print("\n📊 카테고리별 키워드 매칭 결과:")
            print("=" * 60)
            
            for category, keywords in self.investment_keywords.items():
                category_matches = []
                for keyword in keywords:
                    if keyword.lower() in script_lower:
                        category_matches.append(keyword)
                        total_matches += 1
                
                if category_matches:
                    found_keywords[category] = category_matches
                    print(f"🔸 {category}: {category_matches}")
                else:
                    print(f"   {category}: (매칭 없음)")
            
            print("=" * 60)
            print(f"✅ 총 {total_matches}개 키워드 매칭, {len(found_keywords)}개 카테고리에서 발견")
            
            # 3. 키워드 기반 우선순위 선별
            # 3-1. 모든 매칭된 키워드를 하나의 리스트로 수집
            all_keywords = []
            for category, keywords in found_keywords.items():
                all_keywords.extend(keywords)
            
            # 3-2. 중복 제거
            keywords = list(set(all_keywords))
            
            # 3-3. 핵심 투자 키워드 우선 배치 (최대 8개)
            priority_keywords = [kw for kw in keywords if kw in [
                '투자', '위험', '수익', '손실', '주식', '시장', '분석', '방법', '원칙',
                '위험관리', '투자전략', '금융감독', '불공정거래', '투자교육'
            ]]
            selected_keywords = priority_keywords[:8]
            print(f"\n🎯 선별된 핵심 키워드 ({len(selected_keywords)}개): {selected_keywords}")
            
            # 3-4. 나머지 키워드에서 추가 선택
            remaining_keywords = [kw for kw in keywords if kw not in selected_keywords]
            additional_count = min(7, len(remaining_keywords))  # 최대 15개까지 (8+7)
            selected_keywords.extend(remaining_keywords[:additional_count])
            print(f"🔹 추가 선별 키워드 ({additional_count}개): {remaining_keywords[:additional_count]}")
            print(f"📝 최종 선별된 키워드 ({len(selected_keywords)}개): {selected_keywords}")
            
            # 4. 키워드가 부족한 경우 스크립트에서 핵심 단어 추출
            if len(selected_keywords) < 5:
                print("매칭된 키워드 부족, 스크립트에서 핵심 단어 추출...")
                
                # 간단한 핵심 단어 추출 (길이 3자 이상, 자주 등장하는 명사)
                import re
                from collections import Counter
                
                # 한글 명사 추출 (간단한 휴리스틱)
                korean_words = re.findall(r'[가-힣]{3,}', user_script)
                word_counts = Counter(korean_words)
                
                # 빈도수 상위 5개 단어 추가
                for word, count in word_counts.most_common(5):
                    if count >= 2 and word not in selected_keywords:  # 2번 이상 등장
                        selected_keywords.append(word)
                        print(f"핵심단어 추가: {word} ({count}회)")
            
            # 5. 최종 RAG 쿼리 생성
            if not selected_keywords:
                print("⚠️ 키워드 추출 실패, 기본 투자 키워드 사용")
                rag_query = "투자 분석 주식 시장 위험 수익 방법 원칙"
            else:
                # 키워드를 자연스러운 문장으로 조합 (최대 15개 사용)
                rag_query = " ".join(selected_keywords[:15])
                
                # 문장이 너무 긴 경우 줄이기
                if len(rag_query) > 250:
                    words = rag_query.split()
                    rag_query = " ".join(words[:12])
                    print(f"⚡ 길이 조정: {len(rag_query)}자로 단축")
            
            print(f"\n🔍 최종 RAG 검색 쿼리 ({len(rag_query)}자):")
            print(f"「{rag_query}」")
            print("=" * 60)
            return rag_query
            
        except Exception as e:
            print(f"RAG 키워드 추출 실패: {e}")
            # 실패 시 기본 키워드 반환
            return "투자 위험 수익 주식 분석 종목 추천 시장"

    def clean_text_for_analysis(self, text):
        """텍스트 정제 - UTF-8 인코딩 사용 (인코딩 문제만 해결)"""
        try:
            # UTF-8 인코딩 사용
            if isinstance(text, str):
                # 이미 문자열이면 그대로 사용
                original_text = text
                cleaned_text = text
            else:
                # bytes인 경우 UTF-8로 디코딩
                original_text = text.decode('utf-8')
                cleaned_text = original_text
            
            # 제어 문자 제거
            import re
            cleaned_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x84\x86-\x9f]', '', cleaned_text)
            
            # 로그 출력 조건: 실제로 변화가 있을 때만
            if original_text != cleaned_text:
                print(f"UTF-8 인코딩 정제 완료 (원본 {len(original_text)}자 → 정제 {len(cleaned_text)}자)")
            
            return cleaned_text
            
        except UnicodeDecodeError as e:
            print(f"UTF-8 디코딩 실패: {e}")
            # 오류가 있는 문자 무시하고 디코딩
            try:
                cleaned_text = text.decode('utf-8', errors='ignore')
                print(f"일부 문자 무시하고 정제 완료")
                return cleaned_text
            except:
                print(f"텍스트 정제 완전 실패, 원본 반환")
                return str(text)
        
        except Exception as e:
            print(f"텍스트 정제 실패: {e}")
            return str(text)

    def extract_stocks_only(self, user_query):
        """
        유튜브 영상 스크립트에서 종목명만 추출
        
        Args:
            user_query: 유튜브 영상 스크립트
            
        Returns:
            추출된 종목명 리스트
        """
        # 종목 추출 프롬프트
        system_prompt = """당신은 투자 영상에서 종목명을 추출하는 전문가입니다.

                        영상 스크립트에서 직접적으로 투자를 추천하는 종목명만 추출해주세요.

                        다음 형태로만 답변하세요:
                        ---STOCKS---
                        종목명1, 종목명2, 종목명3

                        추출 규칙:
                        - 직접 투자 추천하는 종목만 추출 (단순 언급은 제외)
                        - 정확한 회사명으로 추출
                        - 각 종목은 쉼표로 구분
                        - 다른 설명이나 특수문자 없이 회사명만 작성
                        - 종목이 없으면 "없음"이라고 작성

                        예시: 삼성전자, 카카오, LG화학"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 영상 스크립트에서 직접 추천하는 종목명을 추출해주세요:\n\n{user_query}"}
        ]
        
        # API 호출 및 응답 처리
        response = None 
        for attempt in range(3):
            try:
                # 메시지 인코딩 처리
                encoded_messages = []
                for msg in messages:
                    encoded_msg = {
                        "role": msg["role"],
                        "content": msg["content"]
                    }
                    encoded_messages.append(encoded_msg)
                
                completion = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=encoded_messages,
                    temperature=0.7,
                    max_tokens=1000
                )
                
                response = completion.choices[0].message.content
                break
                
            except Exception as e:
                print(f"시도 {attempt + 1}/3 실패: {e}")
                if attempt == 2:
                    print("모든 시도 실패 - 기본값 반환")
                    if "카카오" in user_query:
                        return ['카카오']
                    return []
                
                import time
                time.sleep(2)
        
        # ---STOCKS--- 구분자로 종목명 추출
        if response and '---STOCKS---' in response:
            stocks_section = response.split('---STOCKS---')[1].strip()
            
            if stocks_section == "없음" or stocks_section.lower() == "none":
                return []
            
            # 쉼표로 분리하여 정리
            stocks = [stock.replace('[', '').replace(']', '').strip() for stock in stocks_section.split(',')]   
            stocks = [stock for stock in stocks if stock and stock != "없음"]
            
            return stocks
        else:
            print("STOCKS 구분자를 찾을 수 없습니다.")
            return []
    
    def _build_stock_analysis_text(self, stock_analysis_results):
        """
        종목 분석 결과를 텍스트로 변환하는 헬퍼 함수
        
        Args:
            stock_analysis_results: 종목 검증 결과
            
        Returns:
            텍스트로 변환된 종목 분석 결과
        """
        if not stock_analysis_results:
            return ""
        
        stock_analysis_text = "\n=== 종목 검증 결과 ===\n"
        
        for stock_name, analysis in stock_analysis_results.items():
            stock_analysis_text += f"\n[{stock_name}]\n"
            
            if not analysis['found']:
                stock_analysis_text += "- 상장되지 않은 종목이거나 종목명을 찾을 수 없습니다.\n"
                continue
            
            # 투자 알림 상태
            alerts = analysis['investment_alerts']
            if alerts['any_alert']:
                alert_details = []
                
                if alerts['caution']:
                    for caution in alerts['caution']:
                        reason = caution.get('type', '투자주의')
                        alert_details.append(f'투자주의 (이유: {reason})')
                
                if alerts['warning']:
                    for warning in alerts['warning']:
                        alert_details.append('투자경고')
                
                if alerts['risk']:
                    for risk in alerts['risk']:
                        alert_details.append('투자위험')
                
                stock_analysis_text += f"- 투자 알림: {', '.join(alert_details)} 종목으로 지정됨\n"
            else:
                stock_analysis_text += "- 투자 알림: 해당 없음\n"
            
            # 재무 상태
            financial = analysis['financial_status']
            if financial['status'] == 'success':
                stock_analysis_text += f"- 부채비율: {financial['debt_ratio']:.1f}%\n"
                if financial['is_high_risk']:
                    stock_analysis_text += "- 재무 상태: 주의 (부채비율 200% 이상)\n"
                else:
                    stock_analysis_text += "- 재무 상태: 정상\n"
            else:
                stock_analysis_text += f"- 재무 정보: {financial.get('message', '데이터 없음')}\n"
        
        print(f"🔍 AI에게 전달될 종목 분석 텍스트:\n{stock_analysis_text}")
        return stock_analysis_text
    
    def _build_historical_analysis_text(self, historical_results):
        """
        과거 vs 현재 비교 결과를 텍스트로 변환하는 헬퍼 함수
        
        Args:
            historical_results: 과거 vs 현재 비교 결과
            
        Returns:
            텍스트로 변환된 비교 분석 결과
        """
        if not historical_results or not historical_results.get("comparison_analysis", {}).get("status") == "completed":
            return ""
        
        historical_analysis_text = f"\n=== 과거 vs 현재 비교 분석 ===\n"
        historical_analysis_text += f"업로드 날짜: {historical_results.get('upload_date')}\n"
        historical_analysis_text += f"현재 날짜: {historical_results.get('current_date')}\n"
        historical_analysis_text += historical_results["comparison_analysis"]["analysis"]
        
        return historical_analysis_text
            
    def _validate_and_fix_response(self, response):
        """
        AI 응답의 형식을 검증하고 수정
        
        Args:
            response: AI 원본 응답
            
        Returns:
            수정된 응답
        """
        # 응답 형식 검증 및 수정
        import re
        
        # 형식 변환 함수
        def fix_stock_format(match):
            stock_name = match.group(1)
            content = match.group(2)
            
            # 아이콘 결정
            if '긍정적' in content or '양호' in content or '정상' in content:
                if '투자주의' in content or '투자경고' in content or '위험' in content:
                    icon = '❌'
                else:
                    icon = '✅'
            elif '부정적' in content or '투자주의' in content or '투자경고' in content or '위험' in content:
                icon = '❌'
            else:
                icon = 'ℹ️'
            
            return f'• {stock_name}: {icon} {content}'
        
        # 패턴 매칭 및 형식 변경
        response = re.sub(r'•\s*\[([^]]+)\]:\s*\[([^]]+)\]', fix_stock_format, response)
        response = re.sub(r'•\s*\[([^]]+)\]:\s*(.+)', fix_stock_format, response)
        
        return response

    def generate_final_analysis(self, user_query, web_results="", pdf_results="", video_date=None, stock_analysis_results=None, historical_results=None, channel_name=None, uploader_verification=None, violation_check=None):
        """
        모든 정보를 종합하여 최종 분석 수행
        
        Args:
            user_query: 유튜브 영상 스크립트
            web_results: 웹 검색 결과
            pdf_results: PDF 검색 결과  
            video_date: 영상 업로드 날짜
            stock_analysis_results: 종목 검증 결과
            historical_results: 과거 vs 현재 비교 결과
            channel_name: 유튜브 채널명 또는 업로더명 (선택)
            uploader_verification: 업로더 신분 검증 결과 (선택)
            violation_check: 법률 위반 검사 결과 (선택)
                
        Returns:
            최종 분석 결과
        """
        
        system_prompt = """당신은 유튜브 투자 영상의 신뢰성을 판단하는 전문 AI 분석가입니다.

                    중요 원칙: 
                    1. 주어진 데이터에 없는 정보는 절대 추측하거나 창작하지 마세요. 모르는 것은 "정보 없음"이라고 명시하세요.
                    2. 영상의 주장을 객관적으로 비판하고 검증하세요. 틀린 것은 틀렸다고, 과장된 것은 과장되었다고 명확히 지적하세요.
                    3. 출력 형식을 정확히 지켜주세요. 프론트엔드 파싱을 위해 형식이 매우 중요합니다.
                    4. 종목 정보는 반드시 "• 종목명: 설명" 형식으로 작성하세요.
                    5. 아이콘, 대괄호[], 별표(*) 등 특수문자를 절대 사용하지 마세요.
                    6. 투자주의 종목만 괄호로 구체적 이유를 표시하고, 투자경고/위험은 이유 없이 표시하세요.

                    비판적 검증 자세:
                    - "확실하다", "반드시", "100%" 같은 확정적 표현은 과장으로 간주
                    - 복잡한 경제 상황을 단순화한 설명은 의심스럽게 검토  
                    - 일부 긍정적 사실만 선택적으로 제시한 경우 편향된 시각으로 판단
                    - 구체적 수치나 날짜가 실제 데이터와 다르면 오류로 지적
                    - 과거 예측이 빗나간 경우 신뢰도 하락 요인으로 평가

                    사기 패턴 감지 기준:
                    - 원금 보장을 장담하는 경우
                    - 매년 20% 이상 수익을 장담하는 경우  
                    - 공짜로 워크숍을 진행하거나, 사은품이 많은 경우
                    - 상장 예정이라고 하지만 예비심사에 없는 경우
                    - 은행이나 제도권 금융기관이 지급보증한다고 허위 주장하는 경우
                    - 정부 등록법인이라고 허위로 내세우는 경우
                    - "확실하다", "반드시", "틀림없이" 등으로 투자 결과를 과도하게 보장하는 표현

                    신뢰도 평가 기준 (기존 시스템 반영):

                    【높음】 다음 조건을 모두 충족:
                    - 업로더: 제도권 금융회사로 확인
                    - 사기 패턴: 7가지 사기 패턴(원금보장, 고수익보장, 무료혜택, 상장사기, 제도권보증허위, 정부등록허위, 단정적표현) 모두 미감지
                    - 팩트체크: 웹검색 결과와 일치 또는 검증 가능

                    【낮음】 다음 조건 중 하나라도 해당:
                    - 사기 패턴: 7가지 패턴 중 2개 이상 감지
                    - 종목 위험: 투자주의/경고/위험 종목을 위험성 고지 없이 추천
                    - 법률 위반: 유사투자자문업 관련 5가지 위반사항 중 2개 이상
                    - 업로더: 미등록 개인/업체 + 사기 패턴 1개 이상
                    - 팩트체크: 웹검색 결과와 명백히 상반되는 주장

                    【보통】 위 두 경우에 해당하지 않는 모든 경우:
                    - 유사투자자문업자 + 법률 준수 + 사기 패턴 1개 이하
                    - 일부 과장 표현 있으나 극단적이지 않음
                    - 종목 정보 일부 부정확하나 심각한 오류 없음

                    다음 구조로 정확히 답변해주세요:

                    ---SUMMARY---
                    - 언급 종목: 종목명들을 정확히 나열. 없으면 "없음"
                    - 주요 키워드: 핵심 키워드들
                    - 시사점: 영상이 말하고자 하는 바를 상세히 설명. 3-5줄 정도로 투자 관점에서 분석

                    ---KEY_POINT---

                    신뢰도 정보
                    - 업로더 신분: 제도권금융회사/유사투자자문업자일 경우 기재
                    - 전체 신뢰도: 높음/보통/낮음 중 선택
                    - 평가 근거: 제공된 정보만 기반으로 서술

                    투자자 유의사항: 구체적인 주의사항을 한 줄로 간결하게 작성
                    
                    중요: "투자자 유의사항:" 라벨은 반드시 정확히 써야 하며, 뒤에 콜론(:)과 공백 한 칸을 넣고 주의사항을 한 줄로 연결해서 작성해주세요.
                    예시: 투자자 유의사항: 단정적 예측 표현과 확실성을 강조하는 내용으로 과도한 낙관론을 유도할 수 있습니다.

                    종목 정보 확인이 필요해요
                    종목이 하나라도 언급된 경우에만 이 섹션을 작성하세요. 반드시 아래 형식을 정확히 지켜주세요:

                    • 종목명: 재무상태 양호, 부채비율 X.X%
                    • 종목명: 투자주의 종목(구체적이유), 부채비율 X.X%
                    • 종목명: 투자경고 종목, 부채비율 X.X%
                    • 종목명: 투자위험 종목, 부채비율 X.X%
                    • 종목명: 상장되지 않은 종목

                    형식 규칙:
                    1. 반드시 "• " 으로 시작
                    2. 종목명 뒤에 ": " 
                    3. 구체적 설명 (아이콘, 대괄호, 기타 특수문자 사용 금지)
                    4. 투자주의만 괄호 안에 구체적 이유 표시
                    5. 투자경고, 투자위험은 이유 없이 그냥 "투자경고 종목", "투자위험 종목"만
                    6. 부채비율이 200% 이상이면 "재무상태 주의"로 표시

                    예시:
                    • 삼성전자: 재무상태 양호, 부채비율 27.9%
                    • LG화학: 투자주의 종목(소수지점/계좌), 부채비율 95.6%
                    • 현대차: 재무상태 정상, 부채비율 182.5%
                    • 카카오: 투자경고 종목, 부채비율 131.0%
                    • 비트코인ETF: 상장되지 않은 종목

                    📋 정보 제공자 신원 확인
                    업로더 신분 검증 결과를 바탕으로 다음 중 해당하는 내용만 작성하세요:

                    제도권 금융회사 확인됨
                    - 업체명: [확인된 금융회사명]
                    - 상태: 금융감독원 등록 제도권 금융기관과 유튜브명이 일치합니다.

                    유사투자자문업자 확인됨  
                    - 업체명: [확인된 유사투자자문업자명]
                    - 상태: 금융위원회에 등록된 유사투자자문업자와 유튜브명이 일치합니다.
                    
                    ---LEGAL_COMPLIANCE---
                    ⚖️ 법률 준수 여부 점검
                    유사투자자문업자로 확인된 경우에만 다음 항목들을 점검하여 해당하는 위반사항만 작성하세요:

                    🚫 일대일 투자자문 금지 위반
                    - 설명: 유사투자자문업자는 불특정 다수를 대상으로 한 일방적 정보 전달만 가능하며, 개별 투자상담은 금지됩니다.

                    🚫 손실보전/이익보장 금지 위반  
                    - 설명: 투자 손실 보전이나 특정 이익을 보장하는 행위는 엄격히 금지됩니다.

                    🚫 필수 고지사항 누락
                    - 필수 고지사항:
                      • "개별적인 투자 상담과 자금운용이 불가능하다는 사항"
                      • "원금에 손실이 발생할 수 있으며 그 손실은 투자자에게 귀속된다는 사항"  
                      • "정식 금융투자업자가 아닌 유사투자자문업자라는 사항"

                    🚫 단정적 판단 제공 금지 위반
                    - 설명: 불확실한 투자 결과에 대해 단정적 판단을 제공하거나 확실하다고 오인하게 하는 표현은 금지됩니다.

                    🚫 허위/과장 광고 금지 위반
                    - 설명: 수익률을 사실과 다르게 표시하거나 객관적 근거 없는 과장 광고는 금지됩니다.

                    한 번 더 생각해보세요
                    사기 패턴이나 의심스러운 표현이 발견된 경우에만 이 섹션을 작성하세요:

                    • 원금보장 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 고수익 보장 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 무료 혜택 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 상장 사기 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 제도권 보증 허위 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 정부 등록 허위 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    • 단정적 표현 패턴: 구체적으로 어떤 표현이 감지되었는지 설명
                    
                    ---DETAIL_INFO---
                    📝 세부 정보
                    영상의 주요 주장들을 사실과 비교하여 객관적으로 검증해주세요. 
                    틀린 내용이나 과장된 표현이 있으면 명확히 지적해주세요:

                    "영상에서 한 정확한 문장"
                    → 사실 확인 결과: [맞음/틀림/과장] 
                    구체적 근거: 실제 데이터나 공식 발표와 어떻게 다른지 상세 설명

                    검증 기준:
                    - 확정적 표현("확실하다", "뚫겠습니다", "반드시")은 무조건 "과장"으로 판정
                    - 구체적 수치(주가, 비율 등)는 공식 데이터와 비교하여 "틀림" 또는 "과장" 판정
                    - "굉장히", "엄청", "완전히" 같은 과장 표현은 "과장" 판정
                    - 웹 검색에서 반박 증거가 나오면 적극적으로 "틀림" 판정
                    - 사실 여부를 확인할 수 없을 경우 임의로 판단하지 말고 결과를 출력하지 말 것

                    예시:
                    "삼성전자 주가 10만원 달성 확실합니다"
                    → 사실 확인 결과: 과장된 표현
                    구체적 근거: 주가 예측에 "확실하다"는 표현은 부적절함. 현재 증권사 목표주가는 8만원대로 10만원과 차이가 있으며, 투자에는 항상 불확실성이 존재함

                    ---SOURCES---
                    참고 자료:
                    실제 제공된 검색 결과나 데이터에서 확인된 출처만 나열
                    - 웹 검색 결과: 실제 검색된 내용 요약 (신뢰할 수 있는 소스에서 수집됨)
                    - PDF 자료: 실제 RAG에서 찾은 내용 요약
                    - 종목 데이터: 실제 조회된 데이터만 명시 (DART API)
                    - 과거 vs 현재 비교: 실제 확인된 시간 변화 정보

                    경고: 제공되지 않은 정보는 "정보 없음" 또는 "데이터 부족"으로 표시하세요.

                    반드시 위 구조(---로 구분)를 지켜서 답변해주세요."""
        
        # 종목 분석 결과를 텍스트로 변환
        stock_analysis_text = self._build_stock_analysis_text(stock_analysis_results)
        
        # 과거 vs 현재 비교 결과를 텍스트로 변환
        historical_analysis_text = self._build_historical_analysis_text(historical_results)
        
        # 사용자 메시지 구성  
        date_info = f"영상 업로드 날짜: {video_date}\n" if video_date else ""
        channel_info = f"채널명: {channel_name}\n" if channel_name else ""
        
        # 업로더 검증 정보 추가
        uploader_info_text = ""
        if uploader_verification:
            uploader_info_text = f"""

            === 업로더 신분 검증 결과 ===
            - 검증 상태: {uploader_verification.get('message', '확인 불가')}
            - 위험도: {uploader_verification.get('risk_level', 'unknown')}
            - 기관명: {uploader_verification.get('institution_name', '해당 없음')}
            - 제도권 금융회사: {'예' if uploader_verification.get('is_institutional') else '아니오'}
            - 유사투자자문업자: {'예' if uploader_verification.get('is_similar_advisor') else '아니오'}"""
        
        # 위반사항 검사 결과 추가
        violation_info_text = ""
        if violation_check and violation_check.get('has_violations'):
            violation_info_text = f"""

=== 유사투자자문업 법률 위반사항 검사 ===
총 {len(violation_check['violations'])}건의 위반사항이 감지되었습니다:
"""
            for i, violation in enumerate(violation_check['violations'], 1):
                violation_info_text += f"""
{i}. {violation['type']} (심각도: {violation['severity']})
   - {violation['description']}"""
        
        user_content = f"""다음 유튜브 투자 영상 스크립트를 종합 분석해주세요:

{date_info}{channel_info}
=== 영상 스크립트 ===
{user_query}

=== 웹 검색 결과 (최신 정보) ===
{web_results}

=== RAG 데이터베이스 (투자 가이드라인/사기 패턴) ===
{pdf_results}

{stock_analysis_text}

{historical_analysis_text}

{uploader_info_text}

{violation_info_text}

위 모든 정보를 종합하여 구조화된 형태로 최종 분석해주세요."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]
        
        try:
            print("AI 종합 분석 중...")
            # 메시지 인코딩 처리
            encoded_messages = []
            for msg in messages:
                encoded_msg = {
                    "role": msg["role"],
                    "content": self.clean_text_for_analysis(msg["content"])
                }
                encoded_messages.append(encoded_msg)
            
            completion = self.client.chat.completions.create(
                model=self.model_name,
                messages=encoded_messages,
                temperature=0.7,
                max_tokens=2000
            )
            
            answer = completion.choices[0].message.content
            
            # 응답 형식 검증
            answer = self._validate_and_fix_response(answer)
            
            print("AI 종합 분석 완료")
            return answer
            
        except Exception as e:
            print(f"AI 종합 분석 오류: {e}")
            return f"죄송합니다. 분석 중 오류가 발생했습니다: {str(e)}"
                
    def load_financial_institutions(self):
        """
        전처리된 제도권금융회사 및 유사투자자문업자 목록 로드
        """
        import pandas as pd
        
        # 절대경로 기반으로 파일 경로 설정
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        try:
            # 전처리된 제도권금융회사 목록 로드
            csv_path = os.path.join(base_dir, 'data', '제도권금융회사_전처리.csv')
            self.institutional_finance = pd.read_csv(csv_path)
            print(f"제도권금융회사 전처리 파일 {len(self.institutional_finance)}건 로드 완료")
        except Exception as e:
            print(f"제도권금융회사 전처리 파일 로드 실패: {e}")
            print("먼저 csv_preprocessor.py를 실행해서 전처리 파일을 생성하세요!")
            self.institutional_finance = pd.DataFrame()
        
        try:
            # 전처리된 유사투자자문업자 목록 로드  
            csv_path = os.path.join(base_dir, 'data', '유사투자자문업자_전처리.csv')
            self.similar_investment_advisors = pd.read_csv(csv_path)
            print(f"유사투자자문업자 전처리 파일 {len(self.similar_investment_advisors)}건 로드 완료")
        except Exception as e:
            print(f"유사투자자문업자 전처리 파일 로드 실패: {e}")
            print("먼저 csv_preprocessor.py를 실행해서 전처리 파일을 생성하세요!")
            self.similar_investment_advisors = pd.DataFrame()
    
    def _clean_channel_name(self, channel_name):
        """채널명 정리: 띄어쓰기 제거, 불용어 제거"""
        import re
        
        # 문자열로 변환
        if not channel_name:
            return ""
        
        channel_name = str(channel_name)
        
        # 채널명 정리: 띄어쓰기 및 불용어 제거
        cleaned = re.sub(r'\s+', '', channel_name)
        
        # 불용어 제거
        stopwords = ['주식회사', '회사', '(주)', '㈜', 'TV', 'tv', '투자', '자산운용', '증권']
        for word in stopwords:
            # 대소문자 구분 없이 제거
            cleaned = re.sub(re.escape(word), '', cleaned, flags=re.IGNORECASE)
        
        # 특수문자 제거
        cleaned = re.sub(r'[^\w가-힣]', '', cleaned)
        
        # 소문자로 통일
        cleaned = cleaned.lower()
        
        return cleaned

    def verify_uploader_identity(self, channel_name, channel_handle=None, channel_id=None):
        """
        계층적 업로더 신분 검증:
        1차: 채널 ID 검증 (있는 경우)
        2차: 채널 핸들 검증 (있는 경우) 
        3차: 채널명 검증 (마지막 수단)
        
        Args:
            channel_name: 유튜브 채널명 또는 업로더명
            channel_handle: 유튜브 채널 핸들 (@username)
            channel_id: 유튜브 채널 ID
            
        Returns:
            dict: 검증 결과
        """
        # 1차: 채널 ID 검증
        if channel_id:
            print(f"채널 ID 검증 중: {channel_id}")
            id_result = self._verify_by_channel_id(channel_id)
            if id_result.get('verified'):
                print(f"채널 ID 검증 성공: {id_result['institution_name']}")
                return id_result
            else:
                print("채널 ID 검증 실패")
        
        # 2차: 채널 핸들 검증  
        if channel_handle:
            print(f"채널 핸들 검증 중: {channel_handle}")
            handle_result = self._verify_by_channel_handle(channel_handle)
            if handle_result.get('verified'):
                print(f"채널 핸들 검증 성공: {handle_result['institution_name']}")
                return handle_result
            else:
                print("채널 핸들 검증 실패")
        
        # 3차: 채널명 검증 (기존 로직)
        print(f"채널명 검증 중: {channel_name}")
        return self._verify_by_channel_name(channel_name)
    
    def _verify_by_channel_id(self, channel_id):
        """채널 ID 기반 검증 (화이트리스트)"""
        # KB증권 공식 채널 ID들 (예시)
        verified_channels = {
            'UC_KB_OFFICIAL_ID': {
                'verified': True,
                'is_institutional': True,
                'institution_name': 'KB증권',
                'message': '제도권금융회사 KB증권에서 전달하는 정보입니다.',
                'risk_level': 'safe',
                'verification_method': 'channel_id'
            }
        }
        
        return verified_channels.get(channel_id, {'verified': False})

    def _verify_by_channel_handle(self, channel_handle):
        """채널 핸들 기반 검증"""
        # 공식 채널 핸들들 (예시)
        verified_handles = {
            '@kbsecurities': {
                'verified': True,
                'is_institutional': True,
                'institution_name': 'KB증권',
                'message': '제도권금융회사 KB증권에서 전달하는 정보입니다.',
                'risk_level': 'safe',
                'verification_method': 'channel_handle'
            },
            '@kb_official': {
                'verified': True,
                'is_institutional': True,
                'institution_name': 'KB금융그룹',
                'message': '제도권금융회사 KB금융그룹에서 전달하는 정보입니다.',
                'risk_level': 'safe',
                'verification_method': 'channel_handle'
            },
            '@kbiahll': {
                'verified': True,
                'is_institutional': True,
                'institution_name': 'KB증권',
                'message': '제도권금융회사 KB증권에서 전달하는 정보입니다.',
                'risk_level': 'safe',
                'verification_method': 'channel_handle'
            }
        }
        
        # 대소문자 구분 없이 검색
        channel_handle_lower = channel_handle.lower() if channel_handle else ""
        return verified_handles.get(channel_handle_lower, {'verified': False})

    def _verify_by_channel_name(self, channel_name):
        """채널명 기반 검증 (기존 로직)"""
        result = {
            'is_institutional': False,
            'is_similar_advisor': False,
            'institution_name': '',
            'message': '',
            'risk_level': 'unknown'
        }
        
        if self.institutional_finance.empty and self.similar_investment_advisors.empty:
            result['message'] = "금융기관 데이터를 확인할 수 없습니다."
            result['risk_level'] = 'unknown'
            return result
        
        # 입력 채널명 정리
        cleaned_input = self._clean_channel_name(channel_name)
        print(f"검색 입력: '{channel_name}' → 정리됨: '{cleaned_input}'")
        
        # 1. 제도권금융회사 확인
        if not self.institutional_finance.empty and '정리된명' in self.institutional_finance.columns:
            # 정리된명 컬럼에서 직접 매칭
            matches = self.institutional_finance[
                (self.institutional_finance['정리된명'].str.contains(cleaned_input, na=False)) |
                (self.institutional_finance['정리된명'] == cleaned_input)
            ]
            
            if not matches.empty:
                matched_row = matches.iloc[0]
                original_name = matched_row['원본명']
                print(f"제도권금융회사 매칭: '{original_name}'")
                
                result['is_institutional'] = True
                result['institution_name'] = original_name
                result['message'] = f"제도권금융회사 '{original_name}'에서 전달하는 정보입니다."
                result['risk_level'] = 'safe'
                return result
        
        # 2. 유사투자자문업자 확인
        if not self.similar_investment_advisors.empty and '정리된명' in self.similar_investment_advisors.columns:
            # 정리된명 컬럼에서 직접 매칭
            matches = self.similar_investment_advisors[
                (self.similar_investment_advisors['정리된명'].str.contains(cleaned_input, na=False)) |
                (self.similar_investment_advisors['정리된명'] == cleaned_input)
            ]
            
            if not matches.empty:
                matched_row = matches.iloc[0]
                original_name = matched_row['원본명']
                print(f"유사투자자문업자 매칭: '{original_name}'")
                
                result['is_similar_advisor'] = True
                result['institution_name'] = original_name
                result['message'] = f"유사투자자문업자로 등록된 '{original_name}'가 전달하는 정보입니다."
                result['risk_level'] = 'caution'
                return result
        
        # 3. 둘 다 아닌 경우
        print(f"매칭 실패: '{cleaned_input}' - 등록되지 않은 업로더")
        result['message'] = "등록되지 않은 개인 또는 업체에서 전달하는 정보입니다. 투자 시 각별한 주의가 필요합니다."
        result['risk_level'] = 'high'
        return result

    def check_similar_advisor_violations(self, script, uploader_info):
        """
        유사투자자문업 법률 위반 여부 확인
        
        Args:
            script: 영상 스크립트
            uploader_info: 업로더 신분 정보
            
        Returns:
            dict: 위반 사항 검사 결과
        """
        if not uploader_info.get('is_similar_advisor', False):
            return {'has_violations': False, 'violations': []}
        
        violations = []
        
        # 위반 패턴 검사
        violation_patterns = {
            '일대일 투자자문': ['개별 상담', '1:1 상담', '개인 상담', '맞춤 상담', '전화 상담'],
            '손실보전_이익보장': ['100% 수익', '손실 보장', '원금 보장', '이익 보장', '수익 보장'],
            '단정적_판단': ['반드시', '확실히', '무조건', '100%', '절대'],
            '허위_과장_광고': ['최고 수익률', '업계 1위', '검증된 수익률'],
            '준수사항_누락': True  # 필수 고지사항 확인
        }
        
        script_lower = script.lower()
        
        for violation_type, patterns in violation_patterns.items():
            if violation_type == '준수사항_누락':
                # 필수 고지사항 확인
                required_notices = [
                    '개별적인 투자 상담과 자금운용이 불가능',
                    '원금에 손실이 발생할 수 있으며',
                    '정식 금융투자업자가 아닌 유사투자자문업자'
                ]
                
                missing_notices = []
                for notice in required_notices:
                    if notice not in script:
                        missing_notices.append(notice)
                
                if missing_notices:
                    violations.append({
                        'type': '준수사항 누락',
                        'description': f"필수 고지사항 누락: {', '.join(missing_notices)}",
                        'severity': 'high'
                    })
            else:
                # 패턴 매칭 검사
                found_patterns = [p for p in patterns if p in script_lower]
                if found_patterns:
                    violations.append({
                        'type': violation_type.replace('_', '/'),
                        'description': f"위반 표현 감지: {', '.join(found_patterns)}",
                        'severity': 'high' if violation_type in ['손실보전_이익보장', '일대일 투자자문'] else 'medium'
                    })
        
        return {
            'has_violations': len(violations) > 0,
            'violations': violations
        }
