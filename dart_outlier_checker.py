import requests
import logging
from datetime import datetime, timedelta
from typing import Tuple, Optional

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DARTOutlierChecker:
    def __init__(self, dart_api_key):
        self.dart_api_key = dart_api_key
        self.base_url = "https://opendart.fss.or.kr/api"
        
    def check_major_shareholder_outlier(self, corp_code):
        """
        최대주주 지분율이 10% 미만인지 체크
        Returns: True if outlier (지분율 < 10%), False otherwise
        """
        try:
            current_year = datetime.now().year
            
            # 최신 연도부터 시도, 실패시 이전 연도로 fallback
            for year_offset in range(0, 3):  # 최대 3년 전까지 시도
                target_year = current_year - year_offset
                
                url = f"{self.base_url}/majorShareHolder.json"
                params = {
                    'crtfc_key': self.dart_api_key,
                    'corp_code': corp_code,
                    'bsns_year': str(target_year),
                    'reprt_code': '11011'  # 사업보고서
                }
                
                response = requests.get(url, params=params, timeout=10)
                
                if response.status_code != 200:
                    logger.warning(f"HTTP {response.status_code} for year {target_year}")
                    continue
                    
                data = response.json()
                
                if data.get('status') == '000':  # 성공
                    return self._parse_major_shareholder_data(data, target_year)
                elif data.get('status') == '013':  # 데이터 없음
                    logger.info(f"No data for year {target_year}, trying previous year")
                    continue
                else:
                    logger.warning(f"API error {data.get('status')}: {data.get('message', '')}")
                    continue
            
            logger.warning("No shareholder data available for recent years")
            return False
            
        except Exception as e:
            logger.error(f"Error in major shareholder check: {str(e)}")
            return False  # 오류 발생시 조용히 False 반환
    
    def _parse_major_shareholder_data(self, data, year):
        """최대주주 데이터 파싱 - 내부 메서드"""
        shareholders = data.get('list', [])
        if not shareholders:
            logger.warning(f"No shareholder data for {year}")
            return False
        
        # 최대주주 찾기 (지분율이 가장 높은 주주)
        max_ratio = 0.0
        
        for holder in shareholders:
            try:
                # hold_stock_rt가 지분율(%), hold_stock_co는 보유주식수
                # 두 필드 모두 시도해서 더 안정적으로
                ratio_str = holder.get('hold_stock_rt', '') or holder.get('hold_stock_co', '0')
                ratio_str = ratio_str.replace(',', '').replace('%', '').strip()
                
                if ratio_str and ratio_str != '0':
                    ratio = float(ratio_str)
                    # hold_stock_co가 주식수라면 매우 큰 값일 것임 (지분율은 100 이하)
                    if ratio <= 100:  # 지분율로 판단
                        max_ratio = max(max_ratio, ratio)
                    
            except (ValueError, TypeError):
                continue
        
        if max_ratio == 0.0:
            logger.warning("Cannot determine major shareholder ratio")
            return False
        
        logger.info(f"Major shareholder ratio: {max_ratio}% ({year})")
        
        # 10% 미만이면 outlier
        return max_ratio < 10.0
            
    def check_capital_increase_outlier(self, corp_code):
        """
        최근 3년간 자본조달 빈도가 3회 이상인지 체크
        Returns: True if outlier (3회 이상), False otherwise
        """
        try:
            # 검색 기간 설정 (3년)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=3*365)
            
            url = f"{self.base_url}/list.json"
            params = {
                'crtfc_key': self.dart_api_key,
                'corp_code': corp_code,
                'bgn_de': start_date.strftime('%Y%m%d'),
                'end_de': end_date.strftime('%Y%m%d'),
                'page_count': '100'
            }
            
            response = requests.get(url, params=params, timeout=10)
            if response.status_code != 200:
                logger.warning(f"HTTP {response.status_code} in capital increase check")
                return False
                
            data = response.json()
            if data.get('status') != '000':
                logger.warning(f"API error in capital increase: {data.get('message', '')}")
                return False
                
            # 자본조달 관련 키워드 검색 (확장된 키워드 리스트)
            keywords = [
                '유상증자', '무상증자', '전환사채', 'CB', 'BW', 
                '신주인수권부사채', '자본조달', '증자', '사채발행',
                '신주발행', '주식발행'
            ]
            
            unique_reports = set()  # 중복 제거용
            
            for report in data.get('list', []):
                report_title = report.get('report_nm', '')
                rcept_no = report.get('rcept_no', '')  # 공시번호
                
                # 키워드 매칭
                if any(keyword in report_title for keyword in keywords):
                    # 중복 제거 (같은 공시번호는 한 번만 카운트)
                    if rcept_no and rcept_no not in unique_reports:
                        unique_reports.add(rcept_no)
                        logger.info(f"Capital increase found: {report_title}")
            
            capital_count = len(unique_reports)
            logger.info(f"Total capital increases in 3 years: {capital_count}")
            
            # 3회 이상이면 outlier
            return capital_count >= 3
                        
        except Exception as e:
            logger.error(f"Error in capital increase check: {str(e)}")
            return False  # 오류 발생시 False 반환

    def check_all_outliers(self, corp_code):
        """
        모든 outlier 체크를 한 번에 수행 (새로운 메서드)
        Returns: dict with all check results
        """
        result = {
            'corp_code': corp_code,
            'governance_risk': False,
            'capital_risk': False,
            'has_any_risk': False
        }
        
        # 지배구조 위험 체크
        result['governance_risk'] = self.check_major_shareholder_outlier(corp_code)
        
        # 자본조달 위험 체크  
        result['capital_risk'] = self.check_capital_increase_outlier(corp_code)
        
        # 하나라도 위험이 있으면 True
        result['has_any_risk'] = result['governance_risk'] or result['capital_risk']
        
        return result