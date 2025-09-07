# web_searcher.py

import requests
import json
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

class WebSearcher:
    def __init__(self, api_key):
        """
        웹 검색기 초기화
        
        Args:
            api_key: Serper API 키
        """
        self.api_key = api_key
        self.base_url = "https://google.serper.dev/search"
        
        # 신뢰도 높은 도메인 리스트
        self.reliable_domains = [
            # 금융 공식 기관
            'fss.or.kr',           # 금융감독원
            'krx.co.kr',           # 한국거래소
            'kofia.or.kr',         # 금융투자협회
            'kdic.or.kr',          # 예금보험공사
            'bok.or.kr',           # 한국은행
            'koscom.co.kr',        # 코스콤
            'kfb.or.kr',           # 전국은행연합회
            'ksds.or.kr',          # 한국예탁결제원
            'ksfc.co.kr',          # 한국증권금융
            'kreia.or.kr',         # 한국신용정보원
            'crefia.or.kr',        # 여신금융협회
            'kibo.or.kr',          # 신용보증기금
            'kdb.co.kr',           # 한국산업은행
            'finter.co.kr',        # 파인 금융감독원 금융소비자 포털
            
            # 정부 기관 및 연구소
            'moef.go.kr',          # 기획재정부  
            'motie.go.kr',         # 산업통상자원부
            'msit.go.kr',          # 과학기술정보통신부
            'gov.kr',              # 정부 통합
            'kostat.go.kr',        # 통계청
            'kif.re.kr',           # 한국금융연구원
            'kcmi.re.kr',          # 자본시장연구원
            'kdi.re.kr',           # 한국개발연구원
            'korcham.net',         # 대한상공회의소
            'kist.re.kr',          # 한국과학기술연구원
            'krict.re.kr',         # 한국화학연구원
            'kiri.re.kr',          # 보험연구원
            
            # 대학 및 연구기관 (종합대학)
            'snu.ac.kr',           # 서울대학교
            'yonsei.ac.kr',        # 연세대학교
            'korea.ac.kr',         # 고려대학교
            'skku.edu',            # 성균관대학교
            'hanyang.ac.kr',       # 한양대학교
            'kaist.ac.kr',         # KAIST
            'postech.ac.kr',       # 포항공과대학교
            'unist.ac.kr',         # 울산과기원
            'gist.ac.kr',          # 광주과기원
            'kau.ac.kr',           # 한국항공대학교
            'cau.ac.kr',           # 중앙대학교
            
            # 특화/산업중심 대학
            'ajou.ac.kr',          # 아주대학교
            'chungbuk.ac.kr',      # 충북대학교
            'knu.ac.kr',           # 경북대학교
            'kentech.ac.kr',       # 한국에너지공과대학교
            'inha.ac.kr',          # 인하대학교
            'pusan.ac.kr',         # 부산대학교
            
            # 대학 부설연구소 (금융/경제 특화)
            'econ.snu.ac.kr',      # 서울대 경제연구소
            'ifc.yonsei.ac.kr',    # 연세대 금융연구센터
            'biz.korea.ac.kr',     # 고려대 경영연구소
            'dsl.korea.ac.kr',     # 고려대 데이터사이언스 연구소
            'fsc.kaist.ac.kr',     # KAIST 금융공학센터
            'datasci.skku.edu',    # 성균관대 데이터사이언스
            
            # 대학 통합 도메인
            'ac.kr',               # 대학 통합 도메인
            're.kr',               # 연구기관 통합 도메인
            
            # 공식 투자정보 및 데이터포털
            'dart.fss.or.kr',      # 전자공시시스템 DART
            'kind.krx.co.kr',      # KRX 상장공시시스템
            'seibro.or.kr',        # 증권정보포털 세이브로
            'comp.fnguide.com',    # 에프앤가이드 기업분석
            'consensus.hankyung.com', # 한국경제 컨센서스
            'bigfinance.co.kr',    # BigFinance
            
            # 주요 언론사
            'yna.co.kr',           # 연합뉴스
            'chosun.com',          # 조선일보
            'joongang.co.kr',      # 중앙일보
            'donga.com',           # 동아일보
            'hankyung.com',        # 한국경제
            'mk.co.kr',            # 매일경제
            'edaily.co.kr',        # 이데일리
            'etnews.com',          # 전자신문
            'businesspost.co.kr',  # 비즈니스포스트
            'newsis.com',          # 뉴시스
            'news1.kr',            # 뉴스1
            'mt.co.kr',            # 머니투데이
            'fnnews.com',          # 파이낸셜뉴스
            'wowtv.co.kr',         # 한국경제TV
            'sbscnbc.co.kr',       # SBS CNBC
            'sedaily.com',         # 서울경제
            'asiae.co.kr',         # 아시아경제
            'economist.co.kr',     # 이코노미스트(조선)
            'ajunews.com',         # 아주경제
            'heraldcorp.com',      # 헤럴드경제
            'dt.co.kr',            # 디지털타임스
            'getnews.co.kr',       # 지디넷코리아
            'newspim.com',         # 뉴스핌
            'finance.naver.com',   # 네이버 금융
            
            # 증권사 및 자산운용사
            'nhqv.com',            # NH투자증권
            'securities.koreainvestment.com', # 한국투자증권
            'kbsec.com',           # KB증권
            'rc.kbsec.com',        # KB증권 리서치본부
            'samsungpop.com',      # 삼성증권
            'samsungsecurities.com', # 삼성증권
            'securities.miraeasset.com', # 미래에셋증권
            'miraeasset.com',      # 미래에셋증권
            'iprovest.com',        # DB금융투자
            'hmsec.com',           # 현대차증권
            'sk-securities.co.kr', # SK증권
            'daishin.com',         # 대신증권
            'cape.co.kr',          # 카프투자증권
            'shinhansec.com',      # 신한투자증권
            'hanwhawm.com',        # 한화투자증권
            'kiwoom.com',          # 키움증권
            'truefriend.com',      # 유진투자증권
            
            # 금융 서비스 플랫폼
            'koreakbland.kr',      # KB부동산
            'toss.im',             # 토스 가이드
            
            # 상장회사 공식 사이트 (주요 기업들)
            'samsung.com',         # 삼성
            'sec.samsung.com',     # 삼성전자
            'lge.co.kr',           # LG
            'hyundai.com',         # 현대
            'sk.com',              # SK
            'skhynix.com',         # SK하이닉스
            'posco.com',           # POSCO
            'hanwha.com',          # 한화
            'lgchem.com',          # LG화학
            'sktelecom.com',       # SK텔레콤
            'kt.com',              # KT
            'lguplus.co.kr',       # LG유플러스
            'navercorp.com',       # NAVER
            
            # 국제 신뢰 기관
            'reuters.com',         # 로이터
            'bloomberg.com',       # 블룸버그
            'wsj.com',             # 월스트리트저널 
            'ft.com',              # 파이낸셜타임스
            'nikkei.com',          # 니혼게이자이신문
            'moodys.com',          # 무디스
            'standardandpoors.com', # S&P
            'fitchratings.com',    # 피치
            
            # 기타 신뢰할 수 있는 금융 정보원
            'investingkr.com',     # 인베스팅코리아
            'fnguide.com',         # FN가이드
            'quantplus.co.kr',     # 퀀트플러스
        ]
    
    def filter_reliable_results(self, search_results):
        """
        검색 결과에서 신뢰도 높은 소스만 필터링
        
        Args:
            search_results: 원본 검색 결과 (JSON 문자열)
            
        Returns:
            필터링된 검색 결과 (JSON 문자열)
        """
        try:
            results_data = json.loads(search_results)
            
            if 'organic' not in results_data:
                return search_results
            
            # 신뢰도 높은 결과만 필터링
            filtered_organic = []
            for result in results_data['organic']:
                link = result.get('link', '')
                
                # 신뢰할 수 있는 도메인인지 확인
                is_reliable = any(domain in link for domain in self.reliable_domains)
                
                if is_reliable:
                    filtered_organic.append(result)
                    print(f"✅ 신뢰 소스 포함: {link}")
                else:
                    print(f"❌ 신뢰도 낮은 소스 제외: {link}")
            
            # 필터링된 결과로 업데이트
            results_data['organic'] = filtered_organic
            
            print(f"📊 검색 결과 필터링: {len(results_data.get('organic', []))}개 소스만 사용")
            
            # 필터링된 결과가 너무 적으면 상위 3개 결과는 포함 (완화 정책)
            if len(filtered_organic) < 2:
                print("⚠️ 신뢰할 수 있는 검색 결과가 부족합니다. 상위 결과 일부 포함...")
                original_results = json.loads(search_results).get('organic', [])
                
                # 현재 filtered_organic에 있는 링크들 추출
                existing_links = {result.get('link', '') for result in filtered_organic}
                
                # 원본 결과 상위 3개를 추가 (중복 제거)
                added_count = 0
                for result in original_results:
                    if added_count >= 3:
                        break
                        
                    link = result.get('link', '')
                    if link not in existing_links:
                        filtered_organic.append(result)
                        existing_links.add(link)
                        print(f"🔄 예외 포함: {link}")
                        added_count += 1
                
                results_data['organic'] = filtered_organic
                print(f"📊 최종 결과: {len(filtered_organic)}개 소스 사용")
            
            return json.dumps(results_data, ensure_ascii=False, indent=2)
            
        except Exception as e:
            print(f"검색 결과 필터링 오류: {e}")
            return search_results  # 오류 시 원본 반환
    
    def search(self, query):
        """
        웹 검색 수행 (신뢰도 필터링 적용)
        
        Args:
            query: 검색 질의
            
        Returns:
            필터링된 검색 결과 (JSON 문자열)
        """
        try:
            # 신뢰할 수 있는 사이트 우선 검색을 위한 쿼리 조정
            enhanced_query = f"{query} site:fss.or.kr OR site:krx.co.kr OR site:yna.co.kr OR site:hankyung.com OR site:mk.co.kr OR site:edaily.co.kr"
            
            payload = json.dumps({"q": enhanced_query, "num": 20})  # 더 많은 결과 요청
            headers = {
                'X-API-KEY': self.api_key,
                'Content-Type': 'application/json'
            }
            
            print(f"웹 검색 중: {query}")
            response = requests.request("POST", self.base_url, headers=headers, data=payload)
            
            if response.status_code == 200:
                # 신뢰도 필터링 적용
                filtered_results = self.filter_reliable_results(response.text)
                print("웹 검색 및 필터링 완료")
                return filtered_results
            else:
                print(f"웹 검색 실패: HTTP {response.status_code}")
                return f"검색 실패: {response.status_code}"
                
        except Exception as e:
            print(f"웹 검색 오류: {e}")
            return f"검색 오류: {str(e)}"
        
    def get_reliable_domains(self):
        """
        현재 설정된 신뢰할 수 있는 도메인 리스트 반환
        
        Returns:
            신뢰 도메인 리스트
        """
        return self.reliable_domains.copy()
    
    def search_with_date(self, query, upload_date, days_range=7):
        """
        특정 날짜 기준으로 웹 검색 수행 (신뢰도 필터링 적용)
        
        Args:
            query: 검색 질의
            upload_date: 영상 업로드 날짜 (YYYY-MM-DD 형식)
            days_range: 검색 범위 (업로드일 ±N일, 기본값 7일)
            
        Returns:
            필터링된 검색 결과 (JSON 문자열)
        """
        try:
            # 날짜 파싱
            if isinstance(upload_date, str):
                upload_dt = datetime.strptime(upload_date, "%Y-%m-%d")
            else:
                upload_dt = upload_date
            
            # 검색 날짜 범위 계산
            start_date = upload_dt - timedelta(days=days_range)
            end_date = upload_dt + timedelta(days=days_range)
            
            # Google 날짜 필터 형식으로 변환
            start_str = start_date.strftime("%Y-%m-%d")
            end_str = end_date.strftime("%Y-%m-%d")
            
            # 날짜 필터 + 신뢰 사이트 필터가 포함된 검색 쿼리
            date_filtered_query = f"{query} after:{start_str} before:{end_str} site:fss.or.kr OR site:krx.co.kr OR site:yna.co.kr OR site:hankyung.com"
            
            payload = json.dumps({"q": date_filtered_query, "num": 20})
            headers = {
                'X-API-KEY': self.api_key,
                'Content-Type': 'application/json'
            }
            
            print(f"과거 시점 웹 검색 중: {date_filtered_query}")
            response = requests.request("POST", self.base_url, headers=headers, data=payload)
            
            if response.status_code == 200:
                # 신뢰도 필터링 적용
                filtered_results = self.filter_reliable_results(response.text)
                print("과거 시점 웹 검색 및 필터링 완료")
                return filtered_results
            else:
                print(f"과거 시점 웹 검색 실패: HTTP {response.status_code}")
                # 실패 시 현재 시점 검색으로 fallback
                print("현재 시점 검색으로 대체...")
                return self.search(query)
                
        except Exception as e:
            print(f"과거 시점 웹 검색 오류: {e}")
            # 오류 시 현재 시점 검색으로 fallback
            print("현재 시점 검색으로 대체...")
            return self.search(query)
    
    def search_multiple(self, queries):
        """
        여러 검색어로 동시 검색 (신뢰도 필터링 적용)
        
        Args:
            queries: 검색어 리스트
            
        Returns:
            필터링된 검색 결과들의 딕셔너리
        """
        results = {}
        for query in queries:
            results[query] = self.search(query)
        return results
    
    def search_multiple_parallel(self, queries, max_workers=3):
        """
        여러 검색어로 병렬 검색 수행 (신뢰도 필터링 적용)
        
        Args:
            queries: 검색어 리스트
            max_workers: 최대 워커 수 (기본값 3)
            
        Returns:
            필터링된 검색 결과들의 딕셔너리
        """
        results = {}
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 각 검색어에 대해 검색 작업 제출
            future_to_query = {executor.submit(self.search, query): query for query in queries}
            
            # 완료된 작업들 처리
            for future in as_completed(future_to_query):
                query = future_to_query[future]
                try:
                    result = future.result()
                    results[query] = result
                    print(f"병렬 검색 완료: {query}")
                except Exception as e:
                    print(f"병렬 검색 오류 ({query}): {e}")
                    results[query] = f"검색 오류: {str(e)}"
        
        return results
    
    def search_multiple_with_date(self, queries, upload_date, days_range=7):
        """
        여러 검색어로 과거 시점 동시 검색 (신뢰도 필터링 적용)
        
        Args:
            queries: 검색어 리스트
            upload_date: 영상 업로드 날짜
            days_range: 검색 범위 (기본값 7일)
            
        Returns:
            필터링된 검색 결과들의 딕셔너리
        """
        results = {}
        for query in queries:
            results[query] = self.search_with_date(query, upload_date, days_range)
        return results
    
    def add_reliable_domain(self, domain):
        """
        신뢰할 수 있는 도메인 추가
        
        Args:
            domain: 추가할 도메인
        """
        if domain not in self.reliable_domains:
            self.reliable_domains.append(domain)
            print(f"✅ 신뢰 도메인 추가: {domain}")
    
    def remove_reliable_domain(self, domain):
        """
        신뢰할 수 있는 도메인 제거
        
        Args:
            domain: 제거할 도메인
        """
        if domain in self.reliable_domains:
            self.reliable_domains.remove(domain)
            print(f"❌ 신뢰 도메인 제거: {domain}")
    
    def get_reliable_domains(self):
        """
        현재 설정된 신뢰할 수 있는 도메인 리스트 반환
        
        Returns:
            신뢰 도메인 리스트
        """
