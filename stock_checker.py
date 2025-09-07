# stock_checker.py - 종목 데이터 검증 모듈

import pandas as pd
import requests
import json
from datetime import datetime, timedelta
import os
import zipfile
import xml.etree.ElementTree as ET
from urllib.request import urlretrieve

class StockChecker:
    def __init__(self, dart_api_key):
        """
        종목 검증기 초기화
        
        Args:
            dart_api_key: DART API 키
        """
        self.dart_api_key = dart_api_key
        self.data_dir = "data"
        self.cache_dir = "cache"
        
        # 캐시 디렉토리 생성
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
        
        # 데이터 파일 경로
        self.caution_file = os.path.join(self.data_dir, "투자주의종목_3년.xls")
        self.warning_file = os.path.join(self.data_dir, "투자경고종목_3년.xls")
        self.risk_file = os.path.join(self.data_dir, "투자위험종목_3년.xls")
        
        # DART Outlier Checker 초기화
        from dart_outlier_checker import DARTOutlierChecker
        self.outlier_checker = DARTOutlierChecker(dart_api_key)
        
        # corpCode 파일 경로
        self.corp_code_zip = os.path.join(self.cache_dir, "corpCode.zip")
        self.corp_code_xml = os.path.join(self.cache_dir, "corpCode.xml")
        
        # 데이터 로드
        self.load_data()
        
        # DART 기업코드 매핑 로드
        self.corp_code_mapping = self.load_corp_code_mapping()
    
    def load_data(self):
        """데이터 파일들 로드"""
        try:
            # data 폴더 생성
            if not os.path.exists(self.data_dir):
                os.makedirs(self.data_dir)
                print(f"'{self.data_dir}' 폴더를 생성했습니다. 데이터 파일들을 넣어주세요.")
                return
            
            # 투자주의종목 로드
            if os.path.exists(self.caution_file):
                self.caution_df = pd.read_excel(self.caution_file)
                print(f"투자주의종목 로드: {len(self.caution_df)}건")
            else:
                self.caution_df = pd.DataFrame()
                print("투자주의종목 파일이 없습니다.")
            
            # 투자경고종목 로드
            if os.path.exists(self.warning_file):
                self.warning_df = pd.read_excel(self.warning_file)
                print(f"투자경고종목 로드: {len(self.warning_df)}건")
            else:
                self.warning_df = pd.DataFrame()
                print("투자경고종목 파일이 없습니다.")
            
            # 투자위험종목 로드
            if os.path.exists(self.risk_file):
                self.risk_df = pd.read_excel(self.risk_file)
                print(f"투자위험종목 로드: {len(self.risk_df)}건")
            else:
                self.risk_df = pd.DataFrame()
                print("투자위험종목 파일이 없습니다.")
                
        except Exception as e:
            print(f"데이터 로드 실패: {e}")
            self.caution_df = pd.DataFrame()
            self.warning_df = pd.DataFrame()
            self.risk_df = pd.DataFrame()
    
    def normalize_stock_name(self, stock_name):
        """종목명 정규화(간단한 버전)"""
        if not stock_name:
            return ""
        
        # 공백 제거, 특수문자 정리
        normalized = stock_name.strip()
        normalized = normalized.replace("(주)", "").replace("㈜", "")
        normalized = normalized.replace(" ", "")
        
        return normalized
    
    def safe_parse_date(self, date_value):
        """안전한 날짜 파싱"""
        if pd.isna(date_value) or str(date_value).strip() in ['-', '', 'NaT']:
            return None
        try:
            return pd.to_datetime(date_value).date()
        except:
            return None
        
    def find_stock_info(self, stock_name):
        """
        종목명으로 종목 정보 찾기
        
        Args:
            stock_name: 종목명
            
        Returns:
            dict: 종목 정보 (종목코드, 정규화된 종목명)
        """
        normalized_name = self.normalize_stock_name(stock_name)
        
        # 우선순위: 투자주의 -> 투자경고 -> 투자위험 순서로 검색
        dfs = [self.caution_df, self.warning_df, self.risk_df]
        
        for df in dfs:
            if not df.empty and '종목명' in df.columns:
                for _, row in df.iterrows():
                    if self.normalize_stock_name(str(row['종목명'])) == normalized_name:
                        return {
                            'code': str(row['종목코드']).zfill(6),
                            'name': str(row['종목명']),
                            'found': True
                        }
        
        return {'code': None, 'name': stock_name, 'found': False}
    
    def check_investment_status(self, stock_name):
        """
        투자주의/경고/위험 종목 여부 확인
        
        Args:
            stock_name: 종목명
            
        Returns:
            dict: 투자 상태 정보
        """
        today = datetime.now().date()
        result = {
            'caution': [],
            'warning': [],
            'risk': [],
            'any_alert': False
        }
        
        stock_info = self.find_stock_info(stock_name)
        if not stock_info['found']:
            return result
        
        stock_code = stock_info['code']
        
        # 투자주의종목 확인
        if not self.caution_df.empty:
            caution_stocks = self.caution_df[self.caution_df['종목코드'].astype(str).str.zfill(6) == stock_code]
            
            # 가장 최근 지정만 유효하도록 정렬
            if not caution_stocks.empty:
                # 지정일 기준으로 최신순 정렬
                caution_stocks = caution_stocks.sort_values('지정일', ascending=False)
                
                # 가장 최근 지정만 확인
                latest_row = caution_stocks.iloc[0]
                start_date = self.safe_parse_date(latest_row['지정일'])
                
                if start_date and start_date <= today:
                    result['caution'].append({
                        'type': latest_row.get('구분', '투자주의'),
                        'start_date': start_date.strftime('%Y-%m-%d'),
                        'end_date': '현재'  # 투자주의는 해제일이 없음
                    })
                    result['any_alert'] = True
        
        # 투자경고종목 확인
        if not self.warning_df.empty:
            warning_stocks = self.warning_df[self.warning_df['종목코드'].astype(str).str.zfill(6) == stock_code]
            
            # 가장 최근 지정만 유효하도록 정렬
            if not warning_stocks.empty:
                # 공시일 기준으로 최신순 정렬
                warning_stocks = warning_stocks.sort_values('공시일', ascending=False)
                
                # 가장 최근 지정만 확인
                latest_row = warning_stocks.iloc[0]
                start_date = self.safe_parse_date(latest_row['공시일'])
                end_date = self.safe_parse_date(latest_row.get('해제일', None))
                
                # 공시일과 해제일 사이에 현재 날짜가 있는지 확인
                if start_date and (not end_date or start_date <= today <= end_date):
                    result['warning'].append({
                        'start_date': start_date.strftime('%Y-%m-%d'),
                        'end_date': end_date.strftime('%Y-%m-%d') if end_date else '현재'
                    })
                    result['any_alert'] = True
        
        # 투자위험종목 확인
        if not self.risk_df.empty:
            risk_stocks = self.risk_df[self.risk_df['종목코드'].astype(str).str.zfill(6) == stock_code]
            
            # 가장 최근 지정만 유효하도록 정렬
            if not risk_stocks.empty:
                # 공시일 기준으로 최신순 정렬
                risk_stocks = risk_stocks.sort_values('공시일', ascending=False)
                
                # 가장 최근 지정만 확인
                latest_row = risk_stocks.iloc[0]
                start_date = self.safe_parse_date(latest_row['공시일'])
                end_date = self.safe_parse_date(latest_row.get('해제일', None))
                
                # 공시일과 해제일 사이에 현재 날짜가 있는지 확인
                if start_date and (not end_date or start_date <= today <= end_date):
                    result['risk'].append({
                        'start_date': start_date.strftime('%Y-%m-%d'),
                        'end_date': end_date.strftime('%Y-%m-%d') if end_date else '현재'
                    })
                    result['any_alert'] = True
        
        return result
    
    def load_corp_code_mapping(self):
        """
        DART 기업코드 매핑 로드/생성
        
        Returns:
            dict: {종목코드: 기업코드} 매핑
        """
        # 캐시 파일 확인 (30일 이내면 재사용)
        if os.path.exists(self.corp_code_xml):
            file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(self.corp_code_xml))
            if file_age < timedelta(days=30):
                print("기존 corpCode.xml 사용 (30일 이내)")
                return self.parse_corp_code_xml()
        
        # corpCode.zip 다운로드
        try:
            print("DART corpCode.zip 다운로드 중...")
            url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={self.dart_api_key}"
            urlretrieve(url, self.corp_code_zip)
            print("다운로드 완료")
            
            # ZIP 압축 해제
            print("압축 해제 중...")
            with zipfile.ZipFile(self.corp_code_zip, 'r') as zip_file:
                zip_file.extractall(self.cache_dir)
            print("압축 해제 완료")
            
            # XML 파싱
            return self.parse_corp_code_xml()
            
        except Exception as e:
            print(f"corpCode 다운로드/파싱 실패: {e}")
            return {}
    
    def parse_corp_code_xml(self):
        """
        corpCode.xml 파싱하여 종목코드 -> 기업코드 매핑 생성
        
        Returns:
            dict: {종목코드: 기업코드} 매핑
        """
        if not os.path.exists(self.corp_code_xml):
            print("corpCode.xml 파일이 없습니다.")
            return {}
        
        try:
            print("corpCode.xml 파싱 중...")
            tree = ET.parse(self.corp_code_xml)
            root = tree.getroot()
            
            mapping = {}
            count = 0
            
            for company in root.findall('list'):
                stock_code = company.find('stock_code')
                corp_code = company.find('corp_code')
                
                if stock_code is not None and corp_code is not None:
                    stock_code_text = stock_code.text
                    corp_code_text = corp_code.text
                    
                    # 6자리 종목코드만 처리
                    if stock_code_text and len(stock_code_text.strip()) == 6:
                        mapping[stock_code_text.strip()] = corp_code_text.strip()
                        count += 1
            
            print(f"corpCode 매핑 완료: {count}개 기업")
            return mapping
            
        except Exception as e:
            print(f"corpCode.xml 파싱 실패: {e}")
            return {}
    
    def get_corp_code(self, stock_code):
        """
        종목코드로 기업코드 조회
        
        Args:
            stock_code: 6자리 종목코드
            
        Returns:
            str: 8자리 기업코드 또는 None
        """
        # 6자리로 정규화
        stock_code = str(stock_code).zfill(6)
        return self.corp_code_mapping.get(stock_code)
    
    def fetch_debt_ratio_from_dart(self, corp_code, bsns_year=2024):
        """
        DART API에서 부채비율 조회
        
        Args:
            corp_code: 8자리 기업코드
            bsns_year: 사업연도
            
        Returns:
            dict: 부채비율 정보
        """
        print(f"🔍 DART API 부채비율 조회 시작 - 기업코드: {corp_code}, 연도: {bsns_year}")
        
        # 보고서 우선순위: 사업보고서 -> 3Q -> 2Q -> 1Q
        report_codes = ["11011", "11014", "11012", "11013"]
        
        for reprt_code in report_codes:
            try:
                # DART API 호출
                url = "https://opendart.fss.or.kr/api/fnlttSinglIndx.json"
                params = {
                    'crtfc_key': self.dart_api_key,
                    'corp_code': corp_code,
                    'bsns_year': str(bsns_year),
                    'reprt_code': reprt_code,
                    'idx_cl_code': 'M220000'  # 안정성지표(부채비율)
                }
                
                print(f"🌐 DART API 호출 중 - 보고서코드: {reprt_code}")
                print(f"📋 요청 파라미터: {params}")
                
                response = requests.get(url, params=params, timeout=10)
                
                print(f"📡 응답 상태코드: {response.status_code}")
                
                if response.status_code != 200:
                    print(f"❌ HTTP 오류: {response.status_code}")
                    continue
                
                data = response.json()
                print(f"📄 응답 데이터: {json.dumps(data, ensure_ascii=False, indent=2)}")
                
                if data.get('status') != '000':
                    print(f"❌ DART API 상태 오류: {data.get('status')} - {data.get('message', '')}")
                    continue
                
                # 부채비율 찾기
                for item in data.get('list', []):
                    if '부채비율' in item.get('idx_nm', ''):
                        debt_ratio = item.get('idx_val', '').replace(',', '')
                        print(f"✅ 부채비율 발견: {debt_ratio}")
                        try:
                            debt_ratio_float = float(debt_ratio)
                            result = {
                                'status': 'success',
                                'debt_ratio': debt_ratio_float,
                                'report_type': reprt_code,
                                'year': bsns_year,
                                'is_high_risk': debt_ratio_float >= 200.0
                            }
                            print(f"🎉 부채비율 조회 성공: {result}")
                            return result
                        except ValueError:
                            print(f"❌ 부채비율 파싱 실패: {debt_ratio}")
                            continue
                            
            except Exception as e:
                print(f"❌ DART API 호출 오류 ({reprt_code}): {e}")
                continue
        
        print(f"❌ 모든 보고서에서 부채비율 데이터를 찾을 수 없음")
        return {
            'status': 'not_found',
            'message': f'{bsns_year}년 부채비율 데이터를 찾을 수 없습니다.'
        }
    
    def find_stock_code_by_name(self, stock_name):
        """
        종목명으로 corpCode.xml에서 직접 종목코드 검색
        
        Args:
            stock_name: 검색할 종목명
            
        Returns:
            str: 종목코드 (6자리) 또는 None
        """
        if not os.path.exists(self.corp_code_xml):
            return None
        
        try:
            tree = ET.parse(self.corp_code_xml)
            root = tree.getroot()
            
            # 1단계: 정확한 매칭
            for company in root.findall('list'):
                corp_name_elem = company.find('corp_name')
                stock_code_elem = company.find('stock_code')
                
                if corp_name_elem is not None and stock_code_elem is not None:
                    corp_name = corp_name_elem.text
                    stock_code = stock_code_elem.text
                    
                    # 정확히 일치하는 경우
                    if corp_name == stock_name:
                        return stock_code
            
            # 2단계: 정규화 후 매칭
            normalized_input = self.normalize_stock_name(stock_name)
            
            for company in root.findall('list'):
                corp_name_elem = company.find('corp_name')
                stock_code_elem = company.find('stock_code')
                
                if corp_name_elem is not None and stock_code_elem is not None:
                    corp_name = corp_name_elem.text
                    stock_code = stock_code_elem.text
                    
                    # 정규화 후 일치하는 경우
                    normalized_corp_name = self.normalize_stock_name(corp_name)
                    if normalized_corp_name == normalized_input:
                        return stock_code
            
            # 3단계: 주요 별칭 매칭
            common_aliases = {
                '삼성': '삼성전자',
                'LG': 'LG전자',
                '네이버': 'NAVER',
                '현대차': '현대자동차',
                '포스코': 'POSCO',
                'SK': 'SK이노베이션',
                'KT': 'KT',
                '하나': '하나금융지주',
                '우리': '우리금융지주',
                'CJ': 'CJ제일제당',
                '아모레': '아모레퍼시픽',
                '셀트리온': '셀트리온',
                'KB': 'KB금융',
                'LG화학': 'LG에너지솔루션',
                'LG솔루션' : 'LG에너지솔루션',
                'LS 일레트릭' : 'LS ELECTRIC',
                'LGU플러스' : 'LG유플러스'

            }
            
            if stock_name in common_aliases:
                return self.find_stock_code_by_name(common_aliases[stock_name])
            
            # 4단계: 부분 매칭 (포함 관계)
            for company in root.findall('list'):
                corp_name_elem = company.find('corp_name')
                stock_code_elem = company.find('stock_code')
                
                if corp_name_elem is not None and stock_code_elem is not None:
                    corp_name = corp_name_elem.text
                    stock_code = stock_code_elem.text
                    
                    # 입력한 이름이 회사명에 포함되는 경우
                    if stock_name in corp_name:
                        return stock_code
            
            return None
            
        except Exception as e:
            return None

    def check_financial_status_dart(self, stock_name):
        """
        DART API로 재무 상태 확인 (개선된 버전)
        
        Args:
            stock_name: 종목명
            
        Returns:
            dict: 재무 상태 정보
        """
        print(f"🔍 재무상태 확인 시작 - 종목명: {stock_name}")
        
        # 기존 Excel 파일 검색은 그대로 유지
        stock_info = self.find_stock_info(stock_name)
        
        # 종목코드 찾기
        if stock_info['found']:
            # Excel 파일에서 찾은 경우
            stock_code = stock_info['code']
            print(f"📋 Excel에서 종목코드 발견: {stock_code}")
        else:
            print(f"📋 Excel에서 종목 없음, 다른 방법으로 검색 중...")
            # 1단계: stock_mappings.py에서 먼저 시도 (우선순위 있음)
            try:
                from stock_mappings import get_stock_code
                stock_code = get_stock_code(stock_name)
                if stock_code:
                    print(f"📋 stock_mappings에서 종목코드 발견: {stock_code}")
                else:
                    print(f"📋 stock_mappings에서 종목코드 없음")
            except ImportError:
                print(f"📋 stock_mappings 모듈 없음")
                stock_code = None
            
            # 2단계: stock_mappings 실패시 XML 검색 시도
            if not stock_code:
                print(f"📋 XML에서 종목코드 검색 중...")
                stock_code = self.find_stock_code_by_name(stock_name)
                if stock_code and stock_code.strip():
                    print(f"📋 XML에서 종목코드 발견: {stock_code}")
                else:
                    print(f"📋 XML에서 종목코드 없음")
                    stock_code = None
            
            if not stock_code:
                print(f"❌ 종목코드를 찾을 수 없음: {stock_name}")
                return {
                    'status': 'not_found',
                    'message': '종목을 찾을 수 없습니다.'
                }
        
        # 기업코드 조회
        print(f"🔍 기업코드 조회 중 - 종목코드: {stock_code}")
        corp_code = self.get_corp_code(stock_code)
        if not corp_code:
            print(f"❌ DART 기업코드를 찾을 수 없음: {stock_code}")
            return {
                'status': 'not_found',
                'message': 'DART 기업코드를 찾을 수 없습니다.'
            }
        
        print(f"✅ 기업코드 발견: {corp_code}")
        
        # DART API로 부채비율 조회
        result = self.fetch_debt_ratio_from_dart(corp_code)
        
        print(f"🎯 최종 결과: {result}")
        return result
        
    def check_stock_comprehensive(self, stock_name, full_script=""):
        """
        종목 종합 검증(최종 로직)
        
        Args:
            stock_name: 종목명
            full_script: 전체 영상 스크립트 (예비심사 체크용)
            
        Returns:
            dict: 종합 검증 결과
        """
        
        result = {
            'stock_name': stock_name,
            'found': False,
            'investment_alerts': {},
            'financial_status': {},
            'preliminary_status': {},
            'summary': []
        }
            
        # 1. 투자 알림 확인 (Excel 파일에서 문제 종목들)
        print("1단계: 투자 알림 확인 중...")
        investment_status = self.check_investment_status(stock_name)
        result['investment_alerts'] = investment_status
        
        if investment_status['any_alert']:
            alert_details = []
            
            if investment_status['caution']:
                for caution in investment_status['caution']:
                    reason = caution.get('type', '투자주의')
                    alert_details.append(f'투자주의 (이유: {reason})')
            
            if investment_status['warning']:
                alert_details.append('투자경고')
            
            if investment_status['risk']:
                alert_details.append('투자위험')
            
            result['summary'].append(f'현재 {", ".join(alert_details)} 종목으로 지정되어 있습니다.')
            print(f"투자 알림 발견: {', '.join(alert_details)}")
        else:
            print("투자 알림 없음")
        
        # 2. 재무 상태 확인 (DART API - 모든 종목 시도)
        print("2단계: DART 재무정보 확인 중...")
        financial_status = self.check_financial_status_dart(stock_name)
        result['financial_status'] = financial_status
        
        if financial_status['status'] == 'success':
            print(f"DART 재무정보 조회 성공!")
            if financial_status['is_high_risk']:
                result['summary'].append('재무상태가 불안정합니다 (부채비율 200% 이상).')
                
            # 추가 DART outlier 체크 - 기존 투자알림이 없는 경우만
            if not investment_status['any_alert']:
                corp_code = self.get_corp_code(stock_name)
                if corp_code:
                    # 지배구조 outlier 체크
                    shareholder_outlier = self.outlier_checker.check_major_shareholder_outlier(corp_code)
                    # 자본조달 outlier 체크
                    capital_outlier = self.outlier_checker.check_capital_increase_outlier(corp_code)
                    
                    # outlier가 감지되면 투자주의로 변경
                    if shareholder_outlier or capital_outlier:
                        investment_status['any_alert'] = True
                        investment_status['caution'] = []
                        
                        outlier_reasons = []
                        if shareholder_outlier:
                            outlier_reasons.append('지배구조위험')
                        if capital_outlier:
                            outlier_reasons.append('자본조달위험')
                        
                        investment_status['caution'].append({
                            'type': ', '.join(outlier_reasons),
                            'start_date': datetime.now().strftime('%Y-%m-%d')
                        })
                        
                        result['investment_alerts'] = investment_status
                        result['summary'].append(f"투자주의 (이유: {', '.join(outlier_reasons)})")
        else:
            print(f"DART 재무정보 조회 실패: {financial_status['message']}")

        # 3. 예비심사 확인 (상장 언급이 있는 경우만)
        print("3단계: 예비심사 확인 중...")
        preliminary_status = self.check_preliminary_if_mentioned(stock_name, full_script)
        
        if preliminary_status:
            result['preliminary_status'] = preliminary_status
            if preliminary_status['status'] == 'found':
                print(f"예비심사 확인: {preliminary_status['message']}")
            elif preliminary_status['status'] == 'not_found':
                print(f"예비심사 미확인: {preliminary_status['message']}")
                result['summary'].append('상장 예정이라고 했으나 예비심사 명단에 없습니다.')
        else:
            result['preliminary_status'] = {'status': 'not_checked', 'message': '상장 언급 없음'}
            print("상장 언급이 없어서 예비심사 체크 스킵")


        # 4. found 여부 결정 (투자 알림이 있거나 DART 조회가 성공하면 found=True)
        if investment_status['any_alert'] or financial_status['status'] == 'success':
            result['found'] = True
            print(f"종목 '{stock_name}' 검증 완료 (found: True)")
        else:
            result['summary'].append('상장되지 않은 종목이거나 데이터를 찾을 수 없습니다.')
            print(f"종목 '{stock_name}' 데이터 없음 (found: False)")
        
        return result
    
    def check_preliminary_listing(self, company_name):
            """
            예비심사 기업 여부 확인
            
            Args:
                company_name: 회사명
                
            Returns:
                dict: 예비심사 정보
            """
            try:
                # 예비심사 파일 경로
                preliminary_file = os.path.join(self.data_dir, "예비심사기업.xlsx")
                
                if not os.path.exists(preliminary_file):
                    return {
                        'status': 'file_not_found',
                        'message': '예비심사 데이터 파일을 찾을 수 없습니다.'
                    }
                
                # Excel 파일 읽기
                preliminary_df = pd.read_excel(preliminary_file)
                
                if preliminary_df.empty or '회사명' not in preliminary_df.columns:
                    return {
                        'status': 'no_data',
                        'message': '예비심사 데이터가 없습니다.'
                    }
                
                # 회사명 정규화해서 매칭
                normalized_input = self.normalize_stock_name(company_name)
                
                for _, row in preliminary_df.iterrows():
                    company_in_file = str(row['회사명'])
                    normalized_company = self.normalize_stock_name(company_in_file)
                    
                    if normalized_company == normalized_input:
                        return {
                            'status': 'found',
                            'company_name': company_in_file,
                            'listing_type': row.get('상장유형', ''),
                            'request_date': str(row.get('신청일', '')),
                            'result_date': str(row.get('결과확정일', '')),
                            'result': str(row.get('심사결과', '')),
                            'message': f'{company_in_file}는 예비심사 신청 기업입니다.'
                        }
                
                # 못 찾은 경우
                return {
                    'status': 'not_found',
                    'message': f'{company_name}는 예비심사 명단에 없습니다.'
                }
                
            except Exception as e:
                return {
                    'status': 'error',
                    'message': f'예비심사 확인 중 오류: {str(e)}'
                }
            
    def check_preliminary_if_mentioned(self, stock_name, full_script):
        """
        상장 언급이 해당 종목과 함께 언급된 경우만 예비심사 체크
        
        Args:
            stock_name: 종목명
            full_script: 전체 영상 스크립트
            
        Returns:
            dict: 예비심사 정보 또는 None
        """
        # 상장 관련 키워드들
        ipo_keywords = [
            "신규상장", "상장 예정", "IPO 예정", "코스피 진입", "상장이 예정",
            "상장한다", "상장될", "상장 계획", "코스피 상장", "코스닥 상장",
            "신규상장", "상장 준비", "상장 신청"
        ]
        
        # 종목명이 스크립트에 있는지 확인
        if stock_name not in full_script:
            return None
        
        # 상장 키워드가 스크립트에 있는지 확인
        has_ipo_keyword = False
        for keyword in ipo_keywords:
            if keyword in full_script:
                has_ipo_keyword = True
                break
        
        # 상장 키워드가 있는 경우만 예비심사 체크
        if has_ipo_keyword:
            print(f"상장 키워드 감지 - {stock_name} 예비심사 확인 중...")
            return self.check_preliminary_listing(stock_name)
        
        # 상장 언급이 없으면 None 반환
        return None
