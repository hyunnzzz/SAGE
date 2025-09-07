# 🛡️ YouTube Investment Video Reliability Analyzer

A comprehensive system for analyzing the reliability and credibility of investment-related YouTube videos using AI and various verification methods.

## 📋 Features

- **Stock Information Verification**: Validates mentioned stocks against official DART database
- **Content Analysis**: Uses LLM to analyze script content for investment advice quality
- **Historical Comparison**: Compares claims made in videos with actual market data
- **Uploader Verification**: Checks if uploaders are registered financial institutions
- **Legal Compliance**: Verifies compliance with investment advisory regulations
- **Related Video Recommendations**: Suggests related educational content

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Required API keys (see Environment Setup)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd LLM
```

2. **Create virtual environment**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Environment Setup**
```bash
# Copy template and configure
cp .env.example .env
# Edit .env with your actual API keys
```

5. **Run the application**
```bash
python app.py
```

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```env
# Required API Keys
HUGGINGFACE_TOKEN=your_huggingface_token_here
SERPER_API_KEY=your_serper_api_key_here  
DART_API_KEY=your_dart_api_key_here

# Optional Configuration
FLASK_ENV=production
PORT=5000
CACHE_DIR=cache
MAX_MEMORY_MB=500
```

### API Key Sources

- **Hugging Face Token**: [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- **Serper API Key**: [https://serper.dev/](https://serper.dev/)
- **DART API Key**: [https://opendart.fss.or.kr/](https://opendart.fss.or.kr/)

## 📁 Project Structure

```
LLM/
├── app.py                 # Flask web API
├── main.py               # Main integration system
├── config.py             # Configuration management
├── llm_handler.py        # LLM processing logic
├── pdf_processor.py      # RAG document processing
├── web_searcher.py       # Web search functionality
├── stock_checker.py      # Stock verification
├── historical_checker.py # Historical data analysis
├── script_cleaner.py     # Text preprocessing
├── memory_optimizer.py   # Memory optimization for AWS
├── recommend_video.py    # Video recommendation system
├── data/                 # Data files (Excel, CSV)
├── cache/               # Cached embeddings and data
├── pdfs/                # PDF documents for RAG
└── requirements.txt     # Python dependencies
```

## 🌐 API Endpoints

### Health Check
```
GET /health
```

### Analyze Video Script
```
POST /analyze
Content-Type: application/json

{
  "script": "Video transcript text",
  "upload_date": "2024-01-15",
  "channel_name": "Channel Name"
}
```

### Get Video Recommendations
```
POST /recommend_videos
Content-Type: application/json

{
  "current_title": "Current video title",
  "top_k": 5
}
```

## ☁️ AWS Deployment

### For AWS EC2 t2.micro (Free Tier)

1. **Upload code to EC2**
2. **Run deployment script**
```bash
chmod +x deploy.sh
./deploy.sh
```

3. **Verify deployment**
```bash
python check_deployment.py
```

### Environment Variables for Production

Set environment variables in AWS instead of using .env file:

```bash
export HUGGINGFACE_TOKEN="your_token"
export SERPER_API_KEY="your_key"
export DART_API_KEY="your_key"
```

## 🛠️ Development

### Running Tests
```bash
python check_deployment.py localhost 5000
```

### Memory Optimization
The system includes automatic memory optimization for AWS t2.micro:
- Garbage collection tuning
- Cache size limits
- Memory usage monitoring

### Adding New Features

1. **PDF Documents**: Add educational PDFs to `pdfs/` folder
2. **Data Sources**: Update CSV files in `data/` folder
3. **API Extensions**: Modify `app.py` for new endpoints

## 📊 System Components

### 1. LLM Handler (`llm_handler.py`)
- Processes video scripts using Hugging Face models
- Extracts stock mentions
- Generates reliability analysis
- Verifies uploader credentials

### 2. Stock Checker (`stock_checker.py`)
- Validates stocks against DART database
- Checks investment alerts (caution/warning/risk)
- Retrieves financial data

### 3. PDF Processor (`pdf_processor.py`)
- RAG (Retrieval Augmented Generation) system
- Processes investment guideline documents
- Semantic search for relevant information

### 4. Web Searcher (`web_searcher.py`)
- Real-time web search for fact-checking
- Filters reliable financial sources
- Provides current market information

## 🚨 Security Notes

- **Never commit `.env` files** with real API keys
- **Use AWS environment variables** in production
- **Rotate API keys** regularly
- **Monitor usage** to prevent API key abuse

## 📝 License

This project is for educational and research purposes.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For issues and questions, please check the documentation or create an issue in the repository.
