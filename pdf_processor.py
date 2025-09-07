# pdf_processor.py - PDF 처리 전용 모듈

import pdfplumber
import numpy as np
import os
import glob
import json
import hashlib
from sklearn.metrics.pairwise import cosine_similarity

class PDFProcessor:
    def __init__(self, client):
        """
        PDF 처리기 초기화
        
        Args:
            client: Hugging Face InferenceClient
        """
        self.client = client
        self.chunks = []
        self.embeddings = []
        self.cache_dir = "cache"  # 캐시 디렉토리
        
        # 캐시 디렉토리 생성
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
            print(f"캐시 디렉토리 생성: {self.cache_dir}")
    
    def _get_folder_hash(self, folder_path):
        """폴더 내 PDF 파일들의 해시값 계산 (변경 감지용)"""
        pdf_files = glob.glob(os.path.join(folder_path, "*.pdf"))
        pdf_files.sort()  # 순서 일정하게
        
        hash_string = ""
        for pdf_file in pdf_files:
            # 파일명 + 파일 크기 + 수정 시간
            stat = os.stat(pdf_file)
            hash_string += f"{pdf_file}_{stat.st_size}_{stat.st_mtime}"
        
        return hashlib.md5(hash_string.encode()).hexdigest()
    
    def _save_cache(self, folder_path, chunks, embeddings):
        """캐시 저장"""
        folder_hash = self._get_folder_hash(folder_path)
        
        # 청크 저장
        chunks_file = os.path.join(self.cache_dir, f"chunks_{folder_hash}.json")
        with open(chunks_file, 'w', encoding='utf-8') as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)
        
        # 임베딩 저장
        embeddings_file = os.path.join(self.cache_dir, f"embeddings_{folder_hash}.npy")
        np.save(embeddings_file, np.array(embeddings))
        
        print(f"캐시 저장 완료: {folder_hash}")
    
    def _load_cache(self, folder_path):
        """캐시 로드"""
        folder_hash = self._get_folder_hash(folder_path)
        
        chunks_file = os.path.join(self.cache_dir, f"chunks_{folder_hash}.json")
        embeddings_file = os.path.join(self.cache_dir, f"embeddings_{folder_hash}.npy")
        
        # 캐시 파일 존재 확인
        if not (os.path.exists(chunks_file) and os.path.exists(embeddings_file)):
            return False, None, None
        
        try:
            # 청크 로드
            with open(chunks_file, 'r', encoding='utf-8') as f:
                chunks = json.load(f)
            
            # 임베딩 로드
            embeddings = np.load(embeddings_file).tolist()
            
            print(f"캐시 로드 완료: {len(chunks)}개 청크, {len(embeddings)}개 임베딩")
            return True, chunks, embeddings
            
        except Exception as e:
            print(f"캐시 로드 실패: {e}")
            return False, None, None
        
    def extract_text_from_pdf(self, pdf_path):
        """PDF에서 텍스트를 추출하는 함수"""
        text = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                print(f"PDF 총 페이지 수: {len(pdf.pages)}")
                
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:  # 텍스트가 있는 경우만
                        text += f"\n--- 페이지 {i+1} ---\n"
                        text += page_text + "\n"
                        
                print(f"추출된 텍스트 길이: {len(text)}자")
                return text
                
        except Exception as e:
            print(f"PDF 읽기 오류: {e}")
            return None

    def chunk_text(self, text, chunk_size=1000, overlap=200):
        """
        텍스트를 지정된 크기로 분할하는 함수
        
        Args:
            text: 분할할 텍스트
            chunk_size: 각 청크의 크기 (글자 수)
            overlap: 청크 간 겹치는 부분 (연결성 유지용)
        
        Returns:
            청크 리스트
        """
        if not text:
            return []
        
        chunks = []
        start = 0
        
        while start < len(text):
            # 청크 끝 위치 계산
            end = start + chunk_size
            
            # 텍스트가 남은 길이보다 청크 크기가 크면 끝까지
            if end >= len(text):
                chunks.append(text[start:])
                break
            
            # 문장 중간에 끊어지지 않도록 조정
            # 마지막 마침표나 줄바꿈을 찾아서 거기서 자르기
            chunk_end = end
            for i in range(end, max(start + chunk_size//2, end - 100), -1):
                if text[i] in '.!?\n':
                    chunk_end = i + 1
                    break
            
            chunks.append(text[start:chunk_end])
            start = chunk_end - overlap  # 겹치는 부분 설정
        
        self.chunks = chunks
        return chunks

    def create_embeddings(self, chunks=None):
        """
        텍스트 청크들을 임베딩 벡터로 변환
        
        Args:
            chunks: 텍스트 청크 리스트 (없으면 self.chunks 사용)
        
        Returns:
            임베딩 벡터 리스트
        """
        if chunks is None:
            chunks = self.chunks
            
        embeddings = []
        
        print(f"총 {len(chunks)}개 청크의 임베딩 생성 중...")
        
        for i, chunk in enumerate(chunks):
            try:
                # Hugging Face embedding API 사용
                embedding = self.client.feature_extraction(
                    text=chunk,
                    model="sentence-transformers/all-MiniLM-L6-v2"
                )
                embeddings.append(embedding)
                
                if (i + 1) % 10 == 0:  # 10개마다 진행상황 출력
                    print(f"진행상황: {i + 1}/{len(chunks)}")
                    
            except Exception as e:
                print(f"청크 {i} 임베딩 생성 실패: {e}")
                # 실패한 경우 빈 벡터로 채우기
                embeddings.append([0] * 384)  # all-MiniLM-L6-v2는 384차원
        
        print("임베딩 생성 완료!")
        self.embeddings = embeddings
        return embeddings

    def search_similar_chunks(self, query, top_k=3, show_preview=True, show_full_text=False):
        """
        사용자 질문과 가장 유사한 PDF 청크들을 찾는 함수
        
        Args:
            query: 사용자 질문
            top_k: 반환할 상위 결과 개수
            show_preview: 검색 결과 미리보기 출력 여부
            show_full_text: 검색된 전체 문단 출력 여부
        
        Returns:
            가장 유사한 청크들과 유사도 점수
        """
        if not self.chunks or not self.embeddings:
            print("PDF 데이터가 없습니다. 먼저 PDF를 처리하세요.")
            return []
            
        print(f"🔍 질문 분석 중: {query}")
        
        # 1. 사용자 질문을 임베딩으로 변환
        try:
            query_embedding = self.client.feature_extraction(
                text=query,
                model="sentence-transformers/all-MiniLM-L6-v2"
            )
        except Exception as e:
            print(f"질문 임베딩 생성 실패: {e}")
            return []
        
        # 2. 질문 임베딩과 모든 청크 임베딩 간 유사도 계산
        query_embedding = np.array(query_embedding).reshape(1, -1)
        chunk_embeddings = np.array(self.embeddings)
        
        # 코사인 유사도 계산
        similarities = cosine_similarity(query_embedding, chunk_embeddings)[0]
        
        # 3. 유사도가 높은 순으로 정렬
        similar_indices = np.argsort(similarities)[::-1][:top_k]
        
        # 4. 결과 반환
        results = []
        for i, idx in enumerate(similar_indices):
            results.append({
                'rank': i + 1,
                'chunk': self.chunks[idx],
                'similarity': similarities[idx],
                'chunk_index': idx
            })
        
        # 5. 간단한 미리보기 출력 (옵션)
        if show_preview:
            print(f"\n📊 검색 결과 Top {top_k}:")
            for result in results:
                score = result['similarity']
                if show_full_text:
                    # 전체 문단 출력
                    print(f"\n🏆 {result['rank']}위 (유사도: {score:.3f})")
                    print(f"📍 청크 인덱스: {result['chunk_index']}")
                    print(f"📝 전체 내용:")
                    print("=" * 80)
                    print(result['chunk'])
                    print("=" * 80)
                else:
                    # 미리보기만 출력 (기존 방식)
                    preview = result['chunk'][:100] + "..." if len(result['chunk']) > 100 else result['chunk']
                    print(f"  {result['rank']}위 (유사도: {score:.3f}) - {preview}")
            print()
        
        print(f"✅ 가장 관련성 높은 {top_k}개 결과를 찾았습니다.")
        return results
    
    def process_pdf(self, pdf_path, chunk_size=1000, overlap=200):
        """
        PDF 전체 처리 파이프라인 (텍스트 추출 → 분할 → 임베딩)
        
        Args:
            pdf_path: PDF 파일 경로
            chunk_size: 청크 크기
            overlap: 청크 겹침
        
        Returns:
            처리 성공 여부 (bool)
        """
        print("=== PDF 처리 시작 ===")
        
        # 1. 텍스트 추출
        text = self.extract_text_from_pdf(pdf_path)
        if not text:
            return False
        
        # 2. 텍스트 분할
        chunks = self.chunk_text(text, chunk_size, overlap)
        print(f"텍스트 분할 완료: {len(chunks)}개 청크")
        
        # 3. 임베딩 생성
        embeddings = self.create_embeddings(chunks)
        print(f"임베딩 생성 완료: {len(embeddings)}개")
        
        print("=== PDF 처리 완료 ===")
        return True
    
    def process_pdf_folder(self, folder_path, chunk_size=1000, overlap=200):
        """
        폴더 내 모든 PDF 파일을 처리하는 함수 (캐싱 지원)
        
        Args:
            folder_path: PDF 파일들이 있는 폴더 경로
            chunk_size: 청크 크기
            overlap: 청크 겹침
        
        Returns:
            처리 성공 여부 (bool)
        """
        print(f"=== 폴더 내 PDF 처리 시작: {folder_path} ===")
        
        # 1. 캐시 확인
        cache_loaded, cached_chunks, cached_embeddings = self._load_cache(folder_path)
        
        if cache_loaded:
            print("🚀 캐시에서 데이터 로드 완료! (즉시 사용 가능)")
            self.chunks = cached_chunks
            self.embeddings = cached_embeddings
            return True
        
        # 2. 캐시가 없으면 새로 처리
        print("⏳ 캐시가 없습니다. 새로 처리합니다...")
        
        # PDF 파일 목록 찾기
        pdf_files = glob.glob(os.path.join(folder_path, "*.pdf"))
        
        if not pdf_files:
            print("폴더에 PDF 파일이 없습니다.")
            return False
        
        print(f"발견된 PDF 파일: {len(pdf_files)}개")
        for pdf_file in pdf_files:
            print(f"  - {os.path.basename(pdf_file)}")
        
        all_text = ""
        processed_count = 0
        
        # 각 PDF 파일 처리
        for pdf_file in pdf_files:
            print(f"\n처리 중: {os.path.basename(pdf_file)}")
            text = self.extract_text_from_pdf(pdf_file)
            
            if text:
                all_text += f"\n\n=== {os.path.basename(pdf_file)} ===\n"
                all_text += text
                processed_count += 1
            else:
                print(f"실패: {os.path.basename(pdf_file)}")
        
        if not all_text:
            print("처리된 PDF가 없습니다.")
            return False
        
        print(f"\n성공적으로 처리된 PDF: {processed_count}개")
        
        # 통합 텍스트 분할
        chunks = self.chunk_text(all_text, chunk_size, overlap)
        print(f"통합 텍스트 분할 완료: {len(chunks)}개 청크")
        
        # 임베딩 생성
        embeddings = self.create_embeddings(chunks)
        print(f"임베딩 생성 완료: {len(embeddings)}개")
        
        # 3. 캐시 저장
        self._save_cache(folder_path, chunks, embeddings)
        
        print("=== 폴더 내 PDF 처리 완료 ===")
        return True