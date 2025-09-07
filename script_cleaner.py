class ScriptCleaner:
    def __init__(self, llm_handler):
        self.llm_handler = llm_handler
        
    def clean_for_search_and_rag(self, raw_script):
        """웹 검색을 위한 최소한의 정제"""
        
        system_prompt = """음성인식 텍스트 정제기입니다.

**원칙: 원문 길이 90% 이상 유지하며 최소 수정**

수정 항목:
1. 음성인식 오류: 딥시크→DeepSeek, 테슬러→Tesla, 엉크이었는데네→언급했는데
2. 과도한 반복: "네네네네"→"네" (3개 이상만)

금지 항목:
- 문장 재구성/요약
- 회사명 삭제 (삼성전자, 카카오, LG, 현대차, TSMC 등)
- 구어체 변경
- 자연스러운 간투사 제거

의심스러우면 그대로 두세요. 원문과 비슷한 길이로 출력하세요."""

        try:
            completion = self.llm_handler.client.chat.completions.create(
                model=self.llm_handler.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"다음 텍스트를 정제해주세요:\n\n{raw_script}"}
                ]
            )
            
            cleaned_text = completion.choices[0].message.content
            
            # 간단한 검증
            if self._validate_cleaning(raw_script, cleaned_text):
                return cleaned_text
            else:
                print("⚠️ 정제 결과가 부적절하여 원문 사용")
                return raw_script
                
        except Exception as e:
            print(f"❌ 텍스트 정제 실패: {e}")
            return raw_script  # 실패시 원문 반환
    
    def _validate_cleaning(self, original, cleaned):
        """정제 결과 검증"""
        # 길이가 너무 많이 줄어들었는지 확인
        if len(cleaned) < len(original) * 0.7:
            return False
            
        # 핵심 키워드가 보존되었는지 확인
        important_keywords = ['삼성전자', '카카오', 'DeepSeek', 'LG', '현대차', 'TSMC']
        for keyword in important_keywords:
            if keyword in original and keyword not in cleaned:
                return False
                
        return True
