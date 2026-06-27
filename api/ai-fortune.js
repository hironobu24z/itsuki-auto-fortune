const MODEL = 'gemini-3.1-flash-lite';

const SYSTEM_INSTRUCTION = `
あなたはプロの算命学鑑定師「いつき」です。
お客様から送られてきた【命式データ】と【相談内容・占いたいこと】をベースに、算命学の知識に基づいて、お客様の心に優しく寄り添う詳細な鑑定書を作成してください。

⚠️【最重要ルール：専門用語の排除と完全な日常語への翻訳】
一般のお客様が読んで一発で理解できるよう、専門用語はできる限りそのまま使わないか、使う場合は必ず分かりやすい日常の言葉に完全に翻訳して文章に織り込んでください。

🌟【最重要マインド：前向きな提案と乗り越え方の提示】
不安を煽る鑑定は絶対にしないでください。厳しい条件があっても、どう乗り越えていけるかという具体的な提案をセットで提示し、前向きなエールとして着地させてください。

📝【出力フォーマットの絶対ルール】
見出し記号（# ##）、箇条書き（* - ・）、強調（**太字**）、番号付きリスト（1. 2.）を一切使わないこと。自然な日本語の手紙文・段落の文章として、改行と空行だけで構成してください。

👤【お名前の扱い】
渡された実際のお名前をそのまま使って語りかけてください。「〇〇様」のような伏せ字は絶対に使わないこと。名前がない場合は「あなた」と語りかけてください。

📅【日付の扱い】
渡される＜現在の日時＞を正としてください。学習データの古い日付の感覚は一切使わないこと。

📊【運勢データの読み方：絶対に自分で計算しないこと】
渡された計算済みの運勢データ（大運・年運・月運・日運）をそのまま根拠として使ってください。自分で干支を計算し直すことは絶対にしないこと。isTcはその期間が天中殺、isIjouは異常干支であることを示します。

🎂【誕生日の絶対ルール】
現在の日時の月日と実際の生年月日の月日が完全一致する場合のみ「誕生日」と言ってよい。干支の一致を誕生日と混同することは絶対禁止。
`.trim();

function getTodayInfoJP() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  return `本日は${formatter.format(now)}です。時間表現は必ずこの日付を基準にしてください。`;
}

function buildPrompt(requestData) {
  const isAisho = !!(requestData.meishikiA && requestData.meishikiB);
  const todayInfo = getTodayInfoJP();
  if (isAisho) {
    return `＜現在の日時＞\n${todayInfo}\n\n【相性鑑定リクエスト】\n＜${requestData.nameA || '依頼者'}様の生年月日＞\n${requestData.birthDateA || '不明'}\n\n＜${requestData.nameA || '依頼者'}様の命式データ＞\n${JSON.stringify(requestData.meishikiA, null, 2)}\n\n＜${requestData.nameA || '依頼者'}様の運勢データ＞\n${JSON.stringify(requestData.rangeDataA || {}, null, 2)}\n\n＜${requestData.nameB || 'お相手'}様の生年月日＞\n${requestData.birthDateB || '不明'}\n\n＜${requestData.nameB || 'お相手'}様の命式データ＞\n${JSON.stringify(requestData.meishikiB, null, 2)}\n\n＜${requestData.nameB || 'お相手'}様の運勢データ＞\n${JSON.stringify(requestData.rangeDataB || {}, null, 2)}\n\n【お客様の占いたいこと】\n${requestData.consultation || '二人の相性と、これからの関係について詳しく教えてください。'}`;
  }
  return `＜現在の日時＞\n${todayInfo}\n\n【個人鑑定リクエスト】\n＜お客様のお名前＞\n${requestData.name || '（名前なし。「あなた」と語りかけてください）'}\n\n＜生年月日（西暦）＞\n${requestData.birthDate || '不明'}\n\n＜命式データ＞\n${JSON.stringify(requestData.meishiki, null, 2)}\n\n＜運勢データ（大運・年運・月運・日運）＞\n${JSON.stringify(requestData.rangeData || {}, null, 2)}\n\n【お客様の占いたいこと】\n${requestData.consultation || '全体の運勢、これからのアドバイスについて詳しく教えてください。'}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY が設定されていません' });

  let requestData;
  try {
    requestData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'リクエストの形式が正しくありません' });
  }

  const prompt = buildPrompt(requestData);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: { temperature: 0.7 }
  });

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      const message = errData?.error?.message || `Gemini APIエラー（status ${geminiRes.status}）`;
      return res.status(502).json({ error: message });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;
        try {
          const chunk = JSON.parse(trimmed.replace(/^,/, ''));
          const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          res.write(JSON.stringify({raw: trimmed}) + "
"); if (text) res.write(text);
        } catch {}
      }
    }
    res.end();

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
