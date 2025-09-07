import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

class Config:
    """애플리케이션 설정 클래스"""
    
    # API 토큰들
    HUGGINGFACE_TOKEN = os.getenv('HUGGINGFACE_TOKEN')
    SERPER_API_KEY = os.getenv('SERPER_API_KEY') 
    DART_API_KEY = os.getenv('DART_API_KEY')
    
    # Flask 설정
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('FLASK_ENV') != 'production'
    
    # 파일 경로 설정
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CACHE_DIR = os.getenv('CACHE_DIR', os.path.join(BASE_DIR, 'cache'))
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    PDF_DIR = os.path.join(BASE_DIR, 'pdfs')
    
    # 메모리 설정
    MAX_MEMORY_MB = int(os.getenv('MAX_MEMORY_MB', '500'))
    
    # AWS 배포 감지
    IS_AWS = bool(os.getenv('AWS_EXECUTION_ENV'))
    
    @classmethod
    def validate(cls):
        """필수 환경변수 검증"""
        required_vars = [
            'HUGGINGFACE_TOKEN',
            'SERPER_API_KEY',
            'DART_API_KEY'
        ]
        
        missing_vars = []
        for var in required_vars:
            if not getattr(cls, var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"다음 환경변수가 설정되지 않았습니다: {', '.join(missing_vars)}")
        
        return True

# 설정 검증
if __name__ == "__main__":
    try:
        Config.validate()
        print("✅ 모든 환경변수가 올바르게 설정되었습니다.")
        print(f"📁 BASE_DIR: {Config.BASE_DIR}")
        print(f"📁 CACHE_DIR: {Config.CACHE_DIR}")
        print(f"🌐 PORT: {Config.PORT}")
        print(f"🚀 FLASK_ENV: {Config.FLASK_ENV}")
        print(f"☁️ AWS 환경: {'예' if Config.IS_AWS else '아니오'}")
    except ValueError as e:
        print(f"❌ 설정 오류: {e}")
