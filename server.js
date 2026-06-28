const express = require('express');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/ai-feedback', async (req, res) => {
  const { schedule } = req.body;
  if (!schedule || !schedule.trim()) {
    return res.status(400).json({ error: '일정을 입력해주세요.' });
  }

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: '당신은 홈스쿨러를 진심으로 응원하는 따뜻한 학습 코치입니다. 항상 유효한 JSON만 반환합니다.'
        },
        {
          role: 'user',
          content: `오늘의 공부 일정:\n${schedule}\n\n위 일정을 분석해서 아래 JSON 형식으로만 응답해주세요.\n{\n  "tips": [\n    {"subject": "과목명 그대로", "tip": "이 과목에 딱 맞는 구체적이고 실용적인 공부 팁 1-2문장"},\n    ...\n  ],\n  "motivation": "이 학생이 지금 당장 책상에 앉고 싶어지는 따뜻하고 강력한 동기부여 메시지 2-3문장. 오늘 일정의 내용을 반영해서 개인화해주세요."\n}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const text = completion.choices[0].message.content;
    try {
      res.json(JSON.parse(text));
    } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      res.json(match ? JSON.parse(match[0]) : { tips: [], motivation: text });
    }
  } catch (error) {
    console.error('AI API error:', error.message);
    res.status(500).json({ error: 'AI 피드백 오류: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌿 홈스쿨 플랫폼 시작!`);
  console.log(`📚 브라우저: http://localhost:${PORT}\n`);
});
