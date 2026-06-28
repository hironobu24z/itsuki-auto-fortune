// いつきの算命学 - AI自動鑑定 Vercel Serverless Function（シンプル版）
// データ量を最小限に絞り、安定動作を優先したバージョン。
// 事前にVercelの管理画面で環境変数 GEMINI_API_KEY を設定しておくこと。

const MODEL = 'gemini-3.5-flash';

const SYSTEM_INSTRUCTION = `
あなたはプロの算命学鑑定師「いつき」です。
お客様から送られてきた【命式データ】と【相談内容・占いたいこと】をベースに、算命学の知識に基づいて、お客様の心に優しく寄り添う詳細な鑑定書を作成してください。

⚠️【最重要ルール：専門用語の排除と完全な日常語への翻訳】
一般のお客様が読んで一発で理解できるよう、専門用語（例：牽牛星、天南星、対冲、半会、大運、天中殺など）はできる限りそのまま使わないか、使う場合は必ず分かりやすい日常の言葉に完全に翻訳して文章に織り込んでください。

🌟【最重要マインド：前向きな提案と乗り越え方の提示】
宿命の良し悪しを決めつけるような、不安を煽る鑑定は絶対にしないでください。
もし厳しい条件や天中殺の時期が重なっていたとしても、「ダメです」と突き放すのではなく、【それをどのように意識し、どう行動すれば安全に乗り越えていけるか】という具体的かつ建設的な提案・解決策を必ずセットで提示し、前向きなエールとして着地させてください。

📝【出力フォーマットの絶対ルール】
これは温かい手紙として読んでもらう文章です。AIが書いたように見える記号は絶対に使わないでください。
具体的には、見出し記号（# や ## など）、箇条書きの記号（* や - や ・）、強調のためのアスタリスク（**太字**）、番号付きリスト（1. 2. 3.）を一切使わないこと。
すべて、自然な日本語の手紙文・段落の文章として、改行と空行だけで構成してください。見出しが欲しい場合は記号を使わず、「◆」のような和文の区切り記号か、文章の流れの中の一文で自然に区切ってください。

👤【お名前の扱い】
お客様のお名前が渡された場合は、本文の中で「〇〇様」のような伏せ字・プレースホルダーは絶対に使わず、必ず実際のお名前をそのまま使って語りかけてください。
お名前が渡されなかった場合も「〇〇様」は使わず、代わりに「あなた」「あなた様」と自然に語りかけてください。

📅【日付の扱い】
「今年」「今月」「今日」などの時間表現は、リクエストの中で渡される＜現在の日時＞を正としてください。

🎂【誕生日についての絶対ルール】
渡される＜実際の生年月日（西暦）＞と＜現在の日時＞の月日が完全に一致する場合のみ「誕生日」と言ってよい。干支の一致を誕生日と混同することは絶対禁止。
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
    return `＜現在の日時＞
${todayInfo}

【相性鑑定リクエスト】
＜${requestData.nameA || '依頼者'}様の生年月日＞
${requestData.birthDateA || '不明'}

＜${requestData.nameA || '依頼者'}様の命式データ＞
${JSON.stringify(requestData.meishikiA, null, 2)}

＜${requestData.nameB || 'お相手'}様の生年月日＞
${requestData.birthDateB || '不明'}

＜${requestData.nameB || 'お相手'}様の命式データ＞
${JSON.stringify(requestData.meishikiB, null, 2)}

【お客様の占いたいこと】
${requestData.consultation || '二人の相性と、これからの関係について詳しく教えてください。'}`;
  }

  return `＜現在の日時＞
${todayInfo}

【個人鑑定リクエスト】
＜お客様のお名前＞
${requestData.name || '（名前なし。「あなた」と語りかけてください）'}

＜生年月日（西暦）＞
${requestData.birthDate || '不明'}

＜命式データ＞
${JSON.stringify(requestData.meishiki, null, 2)}

【お客様の占いたいこと】
${requestData.consultation || '全体の運勢、これからのアドバイスについて詳しく教えてください。'}`;
}

function isOverloadedError(status, data) {
  if (status === 503) return true;
  const message = (data && data.error && data.error.message) || '';
  return /overload|high demand|unavailable/i.test(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.7 }
    })
  });
  const data = await res.json();
  return { res, data };
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
  const delays = [3000, 6000];
  let lastData, lastRes;

  try {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const { res: geminiRes, data } = await callGemini(apiKey, prompt);
      lastRes = geminiRes;
      lastData = data;

      if (geminiRes.ok) {
        const fortune = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!fortune) return res.status(502).json({ error: 'AIから鑑定文を取得できませんでした。もう一度お試しください。' });
        return res.status(200).json({ fortune });
      }

      const overloaded = isOverloadedError(geminiRes.status, data);
      if (!overloaded || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }

    const message = (lastData && lastData.error && lastData.error.message) || `Gemini APIエラー（status ${lastRes.status}）`;
    const overloaded = isOverloadedError(lastRes.status, lastData);
    return res.status(502).json({
      error: overloaded ? 'ただいまアクセスが集中しております。少し時間をおいてもう一度お試しください。' : message,
      retryable: overloaded
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
