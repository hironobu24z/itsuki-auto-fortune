export const config = { runtime: "edge" };

const MODEL = 'gemini-2.5-flash';

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

function buildPrompt(d) {
  const today = getTodayInfoJP();
  if (d.meishikiA && d.meishikiB) {
    return `＜現在の日時＞\n${today}\n\n【相性鑑定リクエスト】\n＜${d.nameA||'依頼者'}様の生年月日＞\n${d.birthDateA||'不明'}\n\n＜${d.nameA||'依頼者'}様の命式データ＞\n${JSON.stringify(d.meishikiA, null, 2)}\n\n＜運勢データ＞\n${JSON.stringify(d.rangeDataA||{}, null, 2)}\n\n＜${d.nameB||'お相手'}様の生年月日＞\n${d.birthDateB||'不明'}\n\n＜${d.nameB||'お相手'}様の命式データ＞\n${JSON.stringify(d.meishikiB, null, 2)}\n\n＜運勢データ＞\n${JSON.stringify(d.rangeDataB||{}, null, 2)}\n\n【お客様の占いたいこと】\n${d.consultation||'二人の相性と、これからの関係について詳しく教えてください。'}`;
  }
  return `＜現在の日時＞\n${today}\n\n【個人鑑定リクエスト】\n＜お客様のお名前＞\n${d.name||'（名前なし。「あなた」と語りかけてください）'}\n\n＜生年月日（西暦）＞\n${d.birthDate||'不明'}\n\n＜命式データ＞\n${JSON.stringify(d.meishiki, null, 2)}\n\n＜運勢データ＞\n${JSON.stringify(d.rangeData||{}, null, 2)}\n\n【お客様の占いたいこと】\n${d.consultation||'全体の運勢、これからのアドバイスについて詳しく教えてください。'}`;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {status: 200, headers: {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS"}});
  }
  if (req.method !== "POST") return new Response(JSON.stringify({error: "Method Not Allowed"}), {status: 405});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({error: "GEMINI_API_KEY未設定"}), {status: 500});

  let d;
  try { d = await req.json(); }
  catch (e) { return new Response(JSON.stringify({error: "リクエスト形式エラー"}), {status: 400}); }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{role: "user", parts: [{text: buildPrompt(d)}]}],
    systemInstruction: {parts: [{text: SYSTEM_INSTRUCTION}]},
    generationConfig: {temperature: 0.7}
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let done = false;

      // 45秒ごとにゼロ幅スペースを送るだけ。Geminiへのリクエストは一切リセットしない。
      const keepAlive = setInterval(() => {
        if (!done) controller.enqueue(enc.encode("\u200B"));
      }, 45000);

      // 即座に待機メッセージを送信
      controller.enqueue(enc.encode("ただいま命式を拝見しております。資料を確認しながら鑑定書を作成しております。しばらくお待ちください...\n\n"));

      // Geminiへのリクエストは1回だけ。リトライなし。回答が来るまでひたすら待つ。
      try {
        const geminiRes = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body});
        if (!geminiRes.ok) {
          const e = await geminiRes.json();
          controller.enqueue(enc.encode(`エラー: ${e?.error?.message || "Gemini APIエラー"}`));
          done = true; clearInterval(keepAlive); controller.close(); return;
        }
        const reader = geminiRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const {done: rdone, value} = await reader.read();
          if (rdone) break;
          buf += decoder.decode(value, {stream: true});
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data: ")) continue;
            const json = t.slice(6).trim();
            if (json === "[DONE]") continue;
            try {
              const chunk = JSON.parse(json);
              const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (text) controller.enqueue(enc.encode(text));
            } catch(e) {}
          }
        }
      } catch(e) {
        controller.enqueue(enc.encode(`エラー: ${e.message}`));
      }
      done = true; clearInterval(keepAlive); controller.close();
    }
  });

  return new Response(stream, {status: 200, headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"}});
}
