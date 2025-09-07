#!/usr/bin/env python3
"""
check_deployment.py - AWS 배포 후 검증 스크립트
"""

import requests
import json
import time
import sys
from datetime import datetime

def check_server_health(host="localhost", port=5000):
    """서버 상태 확인"""
    url = f"http://{host}:{port}/health"
    
    try:
        print(f"🔍 서버 상태 확인 중: {url}")
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 서버 정상 동작: {data.get('message', '상태 불명')}")
            return True
        else:
            print(f"❌ 서버 응답 오류: HTTP {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ 서버 연결 실패: {url}")
        return False
    except Exception as e:
        print(f"❌ 서버 확인 중 오류: {e}")
        return False

def test_analysis_api(host="localhost", port=5000):
    """분석 API 테스트"""
    url = f"http://{host}:{port}/analyze"
    
    test_data = {
        "script": "안녕하세요! 오늘은 삼성전자 주식에 대해 이야기해보겠습니다. 현재 주가가 저점이라고 생각됩니다.",
        "upload_date": "2024-01-15",
        "channel_name": "테스트채널"
    }
    
    try:
        print(f"🧪 분석 API 테스트 중: {url}")
        response = requests.post(url, json=test_data, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ 분석 API 정상 동작")
                print(f"   결과 길이: {len(data.get('result', {}).get('analysis', ''))}")
                return True
            else:
                print(f"❌ 분석 실패: {data.get('error', '알 수 없는 오류')}")
                return False
        else:
            print(f"❌ API 응답 오류: HTTP {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ API 요청 시간 초과 (30초)")
        return False
    except Exception as e:
        print(f"❌ API 테스트 중 오류: {e}")
        return False

def check_memory_usage():
    """메모리 사용량 확인"""
    try:
        import psutil
        memory = psutil.virtual_memory()
        
        print(f"💾 메모리 사용량:")
        print(f"   전체: {memory.total / (1024**3):.1f}GB")
        print(f"   사용: {memory.used / (1024**3):.1f}GB ({memory.percent:.1f}%)")
        print(f"   가용: {memory.available / (1024**3):.1f}GB")
        
        if memory.percent > 90:
            print("⚠️ 메모리 사용량이 90%를 초과했습니다!")
            return False
        elif memory.percent > 70:
            print("⚠️ 메모리 사용량이 70%를 초과했습니다. 모니터링이 필요합니다.")
        
        return True
        
    except ImportError:
        print("❌ psutil 모듈이 설치되지 않았습니다.")
        return False
    except Exception as e:
        print(f"❌ 메모리 확인 중 오류: {e}")
        return False

def check_disk_space():
    """디스크 공간 확인"""
    try:
        import shutil
        
        total, used, free = shutil.disk_usage("/")
        
        print(f"💽 디스크 사용량:")
        print(f"   전체: {total / (1024**3):.1f}GB")
        print(f"   사용: {used / (1024**3):.1f}GB")
        print(f"   여유: {free / (1024**3):.1f}GB ({(free/total)*100:.1f}%)")
        
        if free < 1024**3:  # 1GB 미만
            print("⚠️ 디스크 여유 공간이 1GB 미만입니다!")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ 디스크 확인 중 오류: {e}")
        return False

def main():
    """메인 검증 함수"""
    print("=" * 60)
    print(f"🚀 AWS 배포 검증 시작 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 서버 주소 설정 (AWS 공인 IP 또는 localhost)
    host = sys.argv[1] if len(sys.argv) > 1 else "localhost"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
    
    print(f"📍 검증 대상: {host}:{port}")
    print()
    
    # 검증 항목들
    checks = [
        ("시스템 리소스", [
            ("메모리 사용량", check_memory_usage),
            ("디스크 공간", check_disk_space)
        ]),
        ("서버 동작", [
            ("서버 상태", lambda: check_server_health(host, port)),
            ("분석 API", lambda: test_analysis_api(host, port))
        ])
    ]
    
    total_tests = sum(len(tests) for _, tests in checks)
    passed_tests = 0
    
    # 검증 실행
    for category, tests in checks:
        print(f"📋 {category} 검증:")
        print("-" * 40)
        
        for test_name, test_func in tests:
            print(f"   {test_name}...", end=" ")
            try:
                if test_func():
                    passed_tests += 1
                    print()  # 개행 (테스트 함수에서 이미 출력)
                else:
                    print()  # 개행
            except Exception as e:
                print(f"❌ 예외 발생: {e}")
        
        print()
    
    # 결과 요약
    print("=" * 60)
    print(f"📊 검증 결과: {passed_tests}/{total_tests} 통과")
    
    if passed_tests == total_tests:
        print("🎉 모든 검증을 통과했습니다! 배포가 성공적으로 완료되었습니다.")
        return 0
    else:
        print("⚠️ 일부 검증에 실패했습니다. 로그를 확인해주세요.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
