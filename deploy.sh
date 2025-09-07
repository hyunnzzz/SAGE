#!/bin/bash
# deploy.sh - AWS EC2 배포 스크립트

echo "🚀 AWS EC2 배포 시작..."

# 시스템 업데이트
echo "📦 시스템 업데이트 중..."
sudo apt update && sudo apt upgrade -y

# Python 및 필수 패키지 설치
echo "🐍 Python 환경 설정 중..."
sudo apt install python3 python3-pip python3-venv git htop -y

# 프로젝트 디렉토리로 이동
PROJECT_DIR="/home/ubuntu/LLM"
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 프로젝트 디렉토리가 없습니다: $PROJECT_DIR"
    exit 1
fi

cd $PROJECT_DIR

# Python 가상환경 생성 및 활성화
echo "🔧 Python 가상환경 설정 중..."
python3 -m venv venv
source venv/bin/activate

# 의존성 설치
echo "📚 의존성 설치 중..."
pip install --upgrade pip
pip install -r requirements.txt

# 환경변수 확인
echo "🔍 환경변수 설정 중..."

# 환경변수가 설정되어 있는지 확인
if [ -z "$HUGGINGFACE_TOKEN" ] || [ -z "$SERPER_API_KEY" ] || [ -z "$DART_API_KEY" ]; then
    echo "⚠️ 환경변수가 설정되지 않았습니다."
    echo "📝 다음 명령어로 환경변수를 먼저 설정해주세요:"
    echo ""
    echo "export HUGGINGFACE_TOKEN='your_hf_token'"
    echo "export SERPER_API_KEY='your_serper_key'"  
    echo "export DART_API_KEY='your_dart_key'"
    echo ""
    echo "또는 다음 명령어를 실행해서 영구 저장:"
    echo "echo 'export HUGGINGFACE_TOKEN=\"your_token\"' >> ~/.bashrc"
    echo "echo 'export SERPER_API_KEY=\"your_key\"' >> ~/.bashrc"
    echo "echo 'export DART_API_KEY=\"your_key\"' >> ~/.bashrc"
    echo "source ~/.bashrc"
    echo ""
    exit 1
else
    echo "✅ 환경변수 설정 확인됨"
fi

# 설정 검증
echo "✅ 설정 검증 중..."
python3 config.py
if [ $? -ne 0 ]; then
    echo "❌ 설정 검증 실패"
    exit 1
fi

# 데이터 디렉토리 생성
echo "📁 디렉토리 구조 생성 중..."
mkdir -p data cache pdfs

# 권한 설정
echo "🔐 권한 설정 중..."
chmod +x *.py
chmod 755 cache

# systemd 서비스 파일 생성
echo "⚙️ 시스템 서비스 설정 중..."
sudo tee /etc/systemd/system/investment-analyzer.service > /dev/null << EOF
[Unit]
Description=Investment Video Analyzer
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=$PROJECT_DIR
Environment=PATH=$PROJECT_DIR/venv/bin
ExecStart=$PROJECT_DIR/venv/bin/python app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 서비스 등록 및 시작
echo "🚀 서비스 시작 중..."
sudo systemctl daemon-reload
sudo systemctl enable investment-analyzer
sudo systemctl restart investment-analyzer

# 서비스 상태 확인
echo "📊 서비스 상태 확인 중..."
sleep 3
sudo systemctl status investment-analyzer --no-pager

# 방화벽 설정 (포트 5000 열기)
echo "🔥 방화벽 설정 중..."
sudo ufw allow 5000

# 메모리 사용량 확인
echo "💾 메모리 사용량 확인 중..."
free -h

# 배포 완료 메시지
echo ""
echo "✅ 배포 완료!"
echo "📍 서비스 접속: http://$(curl -s http://checkip.amazonaws.com/):5000"
echo ""
echo "🛠️ 유용한 명령어:"
echo "   서비스 상태 확인: sudo systemctl status investment-analyzer"
echo "   서비스 재시작: sudo systemctl restart investment-analyzer"
echo "   로그 확인: sudo journalctl -u investment-analyzer -f"
echo "   메모리 확인: free -h"
echo ""

# 자동 재부팅 설정 (선택사항)
read -p "🔄 일일 자동 재시작을 설정하시겠습니까? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "0 3 * * * sudo systemctl restart investment-analyzer" | sudo crontab -
    echo "✅ 매일 오전 3시 자동 재시작 설정 완료"
fi

echo "🎉 배포 스크립트 실행 완료!"
