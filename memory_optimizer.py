import psutil
import os
import gc
from config import Config

class MemoryOptimizer:
    """AWS t2.micro 환경을 위한 메모리 최적화 도구"""
    
    @staticmethod
    def check_memory():
        """현재 메모리 사용량 확인"""
        memory = psutil.virtual_memory()
        return {
            'total': memory.total / (1024**2),  # MB
            'available': memory.available / (1024**2),  # MB
            'used': memory.used / (1024**2),  # MB
            'percent': memory.percent
        }
    
    @staticmethod
    def log_memory_usage(context=""):
        """메모리 사용량 로깅"""
        memory_info = MemoryOptimizer.check_memory()
        print(f"💾 메모리 사용량 {context}")
        print(f"   전체: {memory_info['total']:.1f}MB")
        print(f"   사용: {memory_info['used']:.1f}MB ({memory_info['percent']:.1f}%)")
        print(f"   가용: {memory_info['available']:.1f}MB")
        
        # 메모리 부족 경고
        if memory_info['percent'] > 80:
            print("⚠️ 메모리 사용량이 80%를 초과했습니다!")
            return False
        return True
    
    @staticmethod
    def force_gc():
        """강제 가비지 컬렉션"""
        gc.collect()
        print("🗑️ 가비지 컬렉션 실행 완료")
    
    @staticmethod
    def optimize_for_aws():
        """AWS t2.micro 환경 최적화"""
        # 가비지 컬렉션 임계값 조정
        gc.set_threshold(100, 10, 10)  # 더 자주 GC 실행
        
        # 메모리 매핑 최적화
        import mmap
        mmap.ALLOCATIONGRANULARITY = 4096  # 4KB 단위로 할당
        
        print("⚡ AWS t2.micro 환경 최적화 적용 완료")
    
    @staticmethod 
    def cleanup_cache(cache_dir=None):
        """캐시 디렉토리 정리"""
        if not cache_dir:
            cache_dir = Config.CACHE_DIR
            
        if not os.path.exists(cache_dir):
            return
            
        # 캐시 파일 목록
        cache_files = []
        for root, dirs, files in os.walk(cache_dir):
            for file in files:
                file_path = os.path.join(root, file)
                cache_files.append((file_path, os.path.getsize(file_path)))
        
        # 크기 순으로 정렬
        cache_files.sort(key=lambda x: x[1], reverse=True)
        
        # 큰 파일부터 삭제 (50MB 이상인 경우)
        deleted_count = 0
        for file_path, size in cache_files:
            if size > 50 * 1024 * 1024:  # 50MB
                try:
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"🗑️ 대용량 캐시 파일 삭제: {os.path.basename(file_path)} ({size/(1024**2):.1f}MB)")
                except Exception as e:
                    print(f"❌ 캐시 파일 삭제 실패: {e}")
        
        if deleted_count > 0:
            print(f"✅ {deleted_count}개 캐시 파일 정리 완료")

# AWS 환경 감지 및 자동 최적화
if Config.IS_AWS or psutil.virtual_memory().total < 2 * 1024**3:  # 2GB 미만
    MemoryOptimizer.optimize_for_aws()
    print("🚀 AWS 저사양 환경 감지 - 메모리 최적화 모드 활성화")
