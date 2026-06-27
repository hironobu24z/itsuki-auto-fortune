const MODEL = 'gemini-3.1-flash-lite';

const SYSTEM_INSTRUCTION = `
あなたはプロの算命学鑑定師「いつき」です。
お客様から送られてきた【命式データ】と【相談内容・占いたいこと】をベースに、算命学の知識に基づいて、お客様の心に優しく寄り添う詳細な鑑定書を作成してください。

専門用語はできる限り日常の言葉に翻訳してください。不安を煽る鑑定は絶対にしないでください。見出し記号や箇条書きは使わず、自然な手紙文で書いてください。名前がある場合はそのまま使い、伏せ字は禁止。現在日時は渡されたものを使用。運勢データは自分で計算せずそのまま使用。誕生日は月日が完全一致する場合のみ言及可。
`.trim();

function getTodayInfoJP() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'});
  return `本日は${formatter.format(now)}です。`;
}

function buildPrompt(d) {
  const today = getTodayInfoJP();
  if (d.meishikiA && d.meishikiB) {
    return `<現在の日時>\n${today}\n\n【相性鑑定】\n${d.nameA||'依頼者'}様 生年月日: ${d.birthDateA||'不明'}\n命式: ${JSON.stringify(d.meishikiA)}\n運勢: ${JSON.stringify(d.rangeDataA||{})}\n\n${d.nameB||'お相手'}様 生年月日: ${d.birthDateB||'不明'}\n命式: ${JSON.stringify(d.meishikiB)}\n運勢: ${JSON.stringify(d.rangeDataB||{})}\n\n相談: ${d.consultation||'二人の相性について'}`;
  }
  return `<現在の日時>\n${today}\n\n【個人鑑定】\nお名前: ${d.name||'（名前なし）'}\n生年月日: ${d.birthDate||'不明'}\n命式: ${JSON.stringify(d.meishiki)}\n運勢: ${JSON.stringify(d.rangeData||{})}\n\n相談: ${d.consultation||'全体運について'}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({error: 'GEMINI_API_KEY未設定'});

  let d;
  try { d = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch (e) { return res.status(400).json({error: 'リクエスト形式エラー'}); }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{role: 'user', parts: [{text: buildPrompt(d)}]}],
    systemInstruction: {parts: [{text: SYSTEM_INSTRUCTION}]},
    generationConfig: {temperature: 0.7}
  });

  try {
    const geminiRes = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
    if (!geminiRes.ok) {
      const e = await geminiRes.json();
      return res.status(502).json({error: e?.error?.message || 'Gemini APIエラー'});
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buf += decoder.decode(value, {stream: true});
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === '[' || t === ']' || t === ',') continue;
        try {
          const chunk = JSON.parse(t.replace(/^,/, ''));
          const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) res.write(text);
        } catch(e) {}
      }
    }
    res.end();
  } catch(e) {
    return res.status(500).json({error: e.message});
  }
};
