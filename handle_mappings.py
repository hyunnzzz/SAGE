# 금융회사 유튜브 핸들명 → 회사명 매핑 시스템

# 유튜브 핸들명과 금융회사명 매핑
YOUTUBE_HANDLE_TO_COMPANY = {
    '@KBIAHLL': 'KB증권주식회사',
    '@shinhanbank_official': '신한은행',
    '@KB손해보험official': '주식회사KB손해보험',
    '@OPENKBSTAR': '국민은행',
    '@kdb3719': '한국산업은행',
    '@nhinvest': 'NH투자증권',
    '@toss_securities': '토스증권',
    '@ibkbank_official': 'IBK기업은행',
    '@ibk8427': 'IBK투자증권',
    '@SmartMoney0': '미래에셋증권 주식회사'
}

def get_company_name(youtube_handle):
    """
    유튜브 핸들명으로 금융회사명 조회 (완전 일치만)
    
    Args:
        youtube_handle (str): 유튜브 핸들명 (예: '@SmartMoney0')
        
    Returns:
        str: 금융회사명 또는 None
    """
    if not youtube_handle:
        return None
    
    # @ 기호가 없다면 추가
    if not youtube_handle.startswith('@'):
        youtube_handle = '@' + youtube_handle
    
    # 완전 일치 확인 (대소문자 구분)
    return YOUTUBE_HANDLE_TO_COMPANY.get(youtube_handle)

def get_company_info_message(youtube_handle):
    """
    유튜브 핸들명으로 제도권 금융회사 정보 메시지 생성
    
    Args:
        youtube_handle (str): 유튜브 핸들명
        
    Returns:
        str: 정보 메시지 또는 None
    """
    company_name = get_company_name(youtube_handle)
    if company_name:
        return f"제도권금융회사 {company_name}가 제공하는 정보입니다."
    return None

def is_registered_financial_company(youtube_handle):
    """
    등록된 제도권 금융회사 핸들인지 확인
    
    Args:
        youtube_handle (str): 유튜브 핸들명
        
    Returns:
        bool: 등록된 금융회사 여부
    """
    return get_company_name(youtube_handle) is not None

def get_all_registered_handles():
    """등록된 모든 유튜브 핸들명 반환"""
    return list(YOUTUBE_HANDLE_TO_COMPANY.keys())

def get_all_companies():
    """등록된 모든 금융회사명 반환"""
    return list(YOUTUBE_HANDLE_TO_COMPANY.values())

# 통계 정보
TOTAL_REGISTERED_COMPANIES = len(YOUTUBE_HANDLE_TO_COMPANY)

def run_test():
    """테스트 실행"""
    print("=== 금융회사 유튜브 핸들명 매핑 테스트 ===")
    print(f"총 등록된 제도권 금융회사: {TOTAL_REGISTERED_COMPANIES}개")
    print()
    
    # 테스트 케이스들
    test_handles = [
        '@SmartMoney0',           # 정확한 핸들명
        '@KBIAHLL',              # 정확한 핸들명
        '@toss_securities',      # 정확한 핸들명
        'SmartMoney0',           # @ 없는 핸들명
        'KBIAHLL',               # @ 없는 핸들명
        '@smartmoney0',          # 대소문자 다른 핸들명 (실패해야 함)
        '@nonexistent',          # 존재하지 않는 핸들명
        ''                       # 빈 문자열
    ]
    
    print("=== 핸들명 → 회사명 매핑 테스트 ===")
    for handle in test_handles:
        company = get_company_name(handle)
        message = get_company_info_message(handle)
        status = "✓" if company else "✗"
        
        print(f"{status} 입력: '{handle}'")
        if company:
            print(f"  -> 회사명: {company}")
            print(f"  -> 메시지: {message}")
        else:
            print(f"  -> 결과: NOT_FOUND")
        print()
    
    print("=== 전체 등록된 매핑 목록 ===")
    for handle, company in YOUTUBE_HANDLE_TO_COMPANY.items():
        print(f"{handle:25} -> {company}")

if __name__ == "__main__":
    # 기본 테스트 실행
    run_test()
    
    print("\n=== 대화형 테스트 ===")
    print("유튜브 핸들명을 입력하면 제도권 금융회사 정보를 알려드립니다.")
    print("종료하려면 'quit' 또는 'exit'를 입력하세요.")
    
    while True:
        try:
            user_input = input("\n유튜브 핸들명 입력: ").strip()
            if user_input.lower() in ['quit', 'exit', '종료']:
                break
            
            if not user_input:
                continue
            
            message = get_company_info_message(user_input)
            if message:
                print(f"✓ {message}")
            else:
                print("✗ 등록되지 않은 핸들명입니다.")
        
        except KeyboardInterrupt:
            print("\n\n프로그램을 종료합니다.")
            break
        except Exception as e:
            print(f"오류가 발생했습니다: {e}")