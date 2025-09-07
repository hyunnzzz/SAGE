# KB 비디오 추천 시스템 - 키워드 기반 유사도 매칭
# 복잡한 임베딩 대신 효율적인 키워드 매칭으로 추천 제공

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import pickle
import os
import json
import re
from typing import List, Dict, Tuple
from collections import Counter

class VideoRecommendationSystem:
    def __init__(self, csv_path="data/kb_videos_crawled.csv", cache_dir="cache/"):
        """
        키워드 기반 비디오 추천 시스템 초기화
        
        Args:
            csv_path: KB 비디오 CSV 파일 경로
            cache_dir: 캐시 저장 디렉토리
        """
        self.csv_path = csv_path
        self.cache_dir = cache_dir
        self.videos_df = None
        self.keyword_index = None
        self.investment_keywords = self._load_investment_keywords()
        
        # 캐시 디렉토리 생성
        os.makedirs(cache_dir, exist_ok=True)
        
        self.load_data()
        self.build_keyword_index()
    
    def _load_investment_keywords(self):
        """투자 관련 키워드 사전 로드"""
        return {
            # 투자 기본
            '투자': ['투자', 'invest', 'investment'],
            '주식': ['주식', '증권', 'stock', 'equity', '종목'],
            '펀드': ['펀드', 'fund', '뮤추얼펀드', '투자신탁'],
            '자산': ['자산', 'asset', '재산'],
            '포트폴리오': ['포트폴리오', 'portfolio', '자산배분'],
            
            # 투자 전략
            '분산투자': ['분산', '분산투자', 'diversification', '리밸런싱'],
            '가치투자': ['가치투자', 'value investing', '워렌버핏'],
            '성장투자': ['성장투자', 'growth investing', '성장주'],
            '배당': ['배당', 'dividend', '배당금', '배당수익률'],
            
            # 시장/경제
            '시장': ['시장', 'market', '증시', '주식시장'],
            '경제': ['경제', 'economy', '경제전망', '경기'],
            '금리': ['금리', 'interest rate', '기준금리', '대출금리'],
            '인플레이션': ['인플레이션', 'inflation', '물가'],
            
            # 지역/글로벌
            '해외': ['해외', '글로벌', 'global', '국제', '외국'],
            '미국': ['미국', 'US', 'USA', '달러', '나스닥', 'S&P'],
            '중국': ['중국', 'China', '위안', '상하이'],
            '유럽': ['유럽', 'Europe', '유로'],
            
            # 섹터
            '부동산': ['부동산', 'real estate', 'REIT', '리츠'],
            '기술주': ['기술주', 'tech', '테크', 'IT', '소프트웨어'],
            '바이오': ['바이오', 'bio', '제약', '의료'],
            'ESG': ['ESG', '친환경', '지속가능', 'sustainable'],
            
            # 투자 상품
            'ETF': ['ETF', '상장지수펀드', 'exchange traded fund'],
            '채권': ['채권', 'bond', '국채', '회사채'],
            '금': ['금', 'gold', '귀금속', '원자재'],
            '암호화폐': ['암호화폐', 'crypto', '비트코인', '블록체인'],
            
            # 투자 개념
            '리스크': ['리스크', 'risk', '위험', '변동성'],
            '수익률': ['수익률', 'return', '수익', '성과'],
            '손실': ['손실', 'loss', '하락', '마이너스'],
            
            # 연령/목적별
            '은퇴': ['은퇴', '퇴직', '연금', 'retirement'],
            '청년': ['청년', '2030', '젊은이'],
            '중년': ['중년', '4050', '장년'],
            
            # KB 관련
            'KB': ['KB', '국민은행', 'KB금융그룹', 'KB증권', 'KB자산운용'],
        }
    
    def load_data(self):
        """CSV 데이터 로드 및 전처리"""
        try:
            if os.path.exists(self.csv_path):
                self.videos_df = pd.read_csv(self.csv_path, encoding='utf-8-sig')
                print(f"✅ CSV 데이터 로드 완료: {len(self.videos_df)}개 비디오")
                
                # 데이터 정제
                self.videos_df = self.videos_df.dropna(subset=['title'])
                self.videos_df = self.videos_df[self.videos_df['title'] != '[Private video]']
                
                # 검색용 텍스트 생성 (제목 + 원본제목 결합)
                self.videos_df['search_text'] = (
                    self.videos_df['title'].fillna('') + ' ' + 
                    self.videos_df['original_title'].fillna('')
                ).str.strip()
                
                print(f"✅ 전처리 완료: {len(self.videos_df)}개 유효 비디오")
            else:
                print(f"❌ CSV 파일을 찾을 수 없음: {self.csv_path}")
                print("더미 데이터로 초기화합니다.")
                self.videos_df = self._create_dummy_data()
                
        except Exception as e:
            print(f"❌ CSV 데이터 로드 실패: {e}")
            print("더미 데이터로 초기화합니다.")
            self.videos_df = self._create_dummy_data()
    
    def _create_dummy_data(self):
        """더미 KB 영상 데이터 생성"""

        
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
        
        df = pd.DataFrame(dummy_videos)
        df['search_text'] = df['title'] + ' ' + df['original_title']
        return df
    
    def build_keyword_index(self):
        """각 비디오별 키워드 인덱스 구축"""
        try:
            cache_file = os.path.join(self.cache_dir, "keyword_index.json")
            
            # 캐시 확인
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        cached_data = json.load(f)
                    
                    if cached_data.get('data_hash') == self._get_data_hash():
                        self.keyword_index = cached_data['keyword_index']
                        print("✅ 캐시된 키워드 인덱스 로드")
                        return
                except:
                    pass
            
            print("🔄 키워드 인덱스 구축 중...")
            self.keyword_index = {}
            
            for idx, row in self.videos_df.iterrows():
                video_keywords = self.extract_keywords(row['search_text'])
                self.keyword_index[str(idx)] = {
                    'keywords': video_keywords,
                    'keyword_count': len(video_keywords),
                    'title': row['title']
                }
            
            # 캐시 저장
            cache_data = {
                'keyword_index': self.keyword_index,
                'data_hash': self._get_data_hash(),
                'created_at': pd.Timestamp.now().isoformat()
            }
            
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 키워드 인덱스 구축 완료: {len(self.keyword_index)}개 비디오")
            
        except Exception as e:
            print(f"❌ 키워드 인덱스 구축 실패: {e}")
            self.keyword_index = {}
    
    def extract_keywords(self, text):
        """텍스트에서 투자 관련 키워드 추출"""
        try:
            found_keywords = []
            text_lower = text.lower()
            
            # 키워드 사전 기반 매칭
            for main_keyword, variations in self.investment_keywords.items():
                for variation in variations:
                    if variation.lower() in text_lower:
                        found_keywords.append(main_keyword)
                        break
            
            # 숫자 + 년도 패턴 (예: 2024년, 2025년)
            year_pattern = r'(20\d{2})년?'
            years = re.findall(year_pattern, text)
            for year in years:
                found_keywords.append(f'{year}년')
            
            # 퍼센트 패턴 (예: 10%, 수익률)
            percent_pattern = r'(\d+)%'
            if re.search(percent_pattern, text):
                found_keywords.append('수익률')
            
            return list(set(found_keywords))  # 중복 제거
            
        except Exception as e:
            print(f"키워드 추출 오류: {e}")
            return []
    
    def calculate_keyword_similarity(self, keywords1, keywords2):
        """두 키워드 리스트의 유사도 계산 (개선된 버전)"""
        try:
            if not keywords1 or not keywords2:
                return 0.0
            
            set1 = set(keywords1)
            set2 = set(keywords2)
            
            # Jaccard 유사도
            intersection = len(set1 & set2)
            union = len(set1 | set2)
            
            if union == 0:
                return 0.0
            
            jaccard_similarity = intersection / union
            
            # 가중치 적용 (중요한 키워드에 더 높은 점수)
            important_keywords = ['투자', '주식', '펀드', '자산', '포트폴리오', 'KB']
            important_matches = len(set1 & set2 & set(important_keywords))
            
            # 최종 유사도 = Jaccard 유사도 + 중요 키워드 보너스
            bonus = important_matches * 0.1
            final_similarity = min(jaccard_similarity + bonus, 1.0)
            
            return final_similarity
            
        except:
            return 0.0
    
    def recommend_videos(self, user_query: str, top_k: int = 5) -> List[Dict]:
        """
        사용자 쿼리 기반 비디오 추천 (키워드 매칭 방식)
        
        Args:
            user_query: 사용자 검색 쿼리
            top_k: 반환할 추천 비디오 수
            
        Returns:
            추천 비디오 리스트 (유사도 점수 포함)
        """
        if self.videos_df is None or self.keyword_index is None:
            return []
        
        try:
            # 사용자 쿼리에서 키워드 추출
            query_keywords = self.extract_keywords(user_query)
            print(f"🔍 추출된 쿼리 키워드: {query_keywords}")
            
            if not query_keywords:
                # 키워드가 없으면 기본 추천
                return self._get_default_recommendations(top_k)
            
            # 각 비디오와의 유사도 계산
            similarities = []
            
            for video_idx, video_data in self.keyword_index.items():
                video_keywords = video_data['keywords']
                similarity = self.calculate_keyword_similarity(query_keywords, video_keywords)
                
                if similarity > 0:  # 유사도가 0보다 큰 것만
                    similarities.append({
                        'index': int(video_idx),
                        'similarity': similarity,
                        'matched_keywords': list(set(query_keywords) & set(video_keywords))
                    })
            
            # 유사도 순으로 정렬
            similarities.sort(key=lambda x: x['similarity'], reverse=True)
            
            # 🔥 추가: 유사도 결과가 없으면 기본 추천으로 폴백
            if not similarities:
                print(f"⚠️ '{user_query}' 관련 영상 없음. 기본 추천으로 대체")
                return self._get_default_recommendations(top_k)
            
            # 상위 결과 생성
            recommendations = []
            for sim_data in similarities[:top_k]:
                video_idx = sim_data['index']
                video_row = self.videos_df.iloc[video_idx]
                
                recommendation = {
                    'title': video_row['title'],
                    'original_title': video_row.get('original_title', ''),
                    'video_id': video_row.get('video_id', ''),
                    'url': video_row.get('url', f"https://www.youtube.com/watch?v={video_row.get('video_id', '')}"),
                    'thumbnail': video_row.get('thumbnail', f"https://img.youtube.com/vi/{video_row.get('video_id', '')}/maxresdefault.jpg"),
                    'similarity_score': sim_data['similarity'],
                    'matched_keywords': sim_data['matched_keywords']
                }
                
                recommendations.append(recommendation)
            
            print(f"✅ {len(recommendations)}개 추천 비디오 생성 완료")
            return recommendations
            
        except Exception as e:
            print(f"❌ 추천 생성 오류: {e}")
            return self._get_default_recommendations(top_k)
    
    def _get_default_recommendations(self, top_k: int = 5) -> List[Dict]:
        """기본 추천 비디오 반환"""
        try:
            default_videos = []
            
            for idx, row in self.videos_df.head(top_k).iterrows():
                video = {
                    'title': row['title'],
                    'original_title': row.get('original_title', ''),
                    'video_id': row.get('video_id', ''),
                    'url': row.get('url', f"https://www.youtube.com/watch?v={row.get('video_id', '')}"),
                    'thumbnail': row.get('thumbnail', f"https://img.youtube.com/vi/{row.get('video_id', '')}/maxresdefault.jpg"),
                    'similarity_score': 0.5,  # 기본값
                    'matched_keywords': []
                }
                default_videos.append(video)
            
            return default_videos
            
        except:
            return []
    
    def search_by_keywords(self, keywords: List[str], top_k: int = 10) -> List[Dict]:
        """키워드 리스트 기반 검색"""
        query_text = ' '.join(keywords)
        return self.recommend_videos(query_text, top_k)
    
    def _get_data_hash(self):
        """데이터 변경 감지를 위한 해시 생성"""
        if self.videos_df is None:
            return None
        return str(hash(str(len(self.videos_df)) + str(self.videos_df['search_text'].sum() if len(self.videos_df) > 0 else '')))

# API 엔드포인트용 전역 변수
recommendation_system = None

def initialize_recommendation_system():
    """추천 시스템 초기화 (전역 변수로 관리)"""
    global recommendation_system
    try:
        recommendation_system = VideoRecommendationSystem()
        print("✅ 키워드 기반 비디오 추천 시스템 초기화 완료")
        return True
    except Exception as e:
        print(f"❌ 추천 시스템 초기화 실패: {e}")
        return False

def get_video_recommendations(user_query: str, top_k: int = 5) -> Dict:
    """
    사용자 쿼리 기반 비디오 추천 API
    
    Args:
        user_query: 사용자 검색 쿼리
        top_k: 반환할 추천 비디오 수
        
    Returns:
        JSON 형태의 추천 결과
    """
    try:
        if recommendation_system is None:
            if not initialize_recommendation_system():
                return {"error": "추천 시스템 초기화 실패", "recommendations": [], "status": "error"}
        
        recommendations = recommendation_system.recommend_videos(user_query, top_k)
        
        return {
            "query": user_query,
            "total_results": len(recommendations),
            "recommendations": recommendations,
            "status": "success"
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "query": user_query,
            "recommendations": [],
            "status": "error"
        }

def search_videos_by_keywords(keywords: List[str], top_k: int = 10) -> Dict:
    """키워드 기반 비디오 검색 API"""
    try:
        if recommendation_system is None:
            if not initialize_recommendation_system():
                return {"error": "추천 시스템 초기화 실패", "results": [], "status": "error"}
        
        results = recommendation_system.search_by_keywords(keywords, top_k)
        
        return {
            "keywords": keywords,
            "total_results": len(results),
            "results": results,
            "status": "success"
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "keywords": keywords,
            "results": [],
            "status": "error"
        }

# 테스트 함수
def test_recommendation_system():
    """키워드 기반 추천 시스템 테스트"""
    print("🧪 키워드 기반 비디오 추천 시스템 테스트 시작")
    
    # 시스템 초기화
    if not initialize_recommendation_system():
        return
    
    # 테스트 쿼리들
    test_queries = [
        "2025년 투자 전략",
        "해외주식 투자 방법", 
        "부동산 시장 전망",
        "연금 투자 포트폴리오",
        "ESG 투자 가이드",
        "ETF 추천"
    ]
    
    for query in test_queries:
        print(f"\n📝 테스트 쿼리: '{query}'")
        result = get_video_recommendations(query, top_k=3)
        
        if result["status"] == "success":
            for i, video in enumerate(result["recommendations"], 1):
                matched_keywords = ', '.join(video.get('matched_keywords', []))
                print(f"  {i}. {video['title'][:50]}...")
                print(f"     유사도: {video['similarity_score']:.3f}, 매칭 키워드: [{matched_keywords}]")
        else:
            print(f"  ❌ 에러: {result['error']}")
    
    print("\n✅ 테스트 완료")

if __name__ == "__main__":
    test_recommendation_system()
