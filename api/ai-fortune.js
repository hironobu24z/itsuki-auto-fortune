export const config = { runtime: "edge" };

const MODEL = 'gemini-3.1-flash-lite';

const SANMEI_FILES = [
  "files/qcfj5kbgimka",
  "files/scgukjdjq1iq",
  "files/f69y4af56zej",
  "files/kaj7fu0179mh",
  "files/wsivb84wva78",
  "files/2q8zpj63rzp2",
  "files/quz0xgro58qd",
  "files/mznaz97eogqi",
  "files/kqvdd6m7ep1r",
  "files/w2jerzhg5vwb",
  "files/gedudknc7zp7",
  "files/c0bekzg68wj9",
  "files/mh4fay0hrqe3",
  "files/9rzey4e6vqoc",
  "files/fxxre1pu69t4",
  "files/fii56qs59s1u",
  "files/xajikzw95qr8",
  "files/htvtlp7p5b0h",
  "files/8z5fkw4kahf3",
  "files/xy5n7awl0j0m",
  "files/z7os3rh0n3yh",
  "files/lociqfdkuaqd",
  "files/1cwc7vjzc2z9",
  "files/6amy1aolxkav",
  "files/4hf90itnkozv",
  "files/hybjrcdjsxev",
  "files/nx2sz7ugxygx",
  "files/2k2ug8i84bvi",
  "files/uuahr6fm9kpp",
];

const SYSTEM_INSTRUCTION = `
あなたはプロの算命学鑑定師「いつき」です。
添付された算命学の教科書・資料を必ず参照し、その知識に基づいて鑑定してください。
お客様から送られてきた命式データと相談内容をベースに、算命学の知識に基づいて、お客様の心に優しく寄り添う詳細な鑑定書を作成してください。
専門用語は必ず日常の言葉に言い換えてください。例えば「車騎星」なら「目標に向かって猛進する情熱のエネルギー」のように、お客様が直感的に理解できる言葉で表現してください。専門用語を使う場合は必ずカッコ内に日常語の説明を添えてください。
不安を煽る鑑定は絶対にしないでください。見出し記号や箇条書きは使わず、自然な手紙文で書いてください。名前がある場合はそのまま使い、伏せ字は禁止。現在日時は渡されたものを使用。運勢データは自分で計算せずそのまま使用。誕生日は月日が完全一致する場合のみ言及可。
`.trim();

function getTodayInfoJP() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("ja-JP", {timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "long"});
  return `本日は${formatter.format(now)}です。`;
}

function buildPrompt(d) {
  const today = getTodayInfoJP();
  if (d.meishikiA && d.meishikiB) {
    return `<現在の日時>\n${today}\n\n【相性鑑定】\n${d.nameA||"依頼者"}様 生年月日: ${d.birthDateA||"不明"}\n命式: ${JSON.stringify(d.meishikiA)}\n運勢: ${JSON.stringify(d.rangeDataA||{})}\n\n${d.nameB||"お相手"}様 生年月日: ${d.birthDateB||"不明"}\n命式: ${JSON.stringify(d.meishikiB)}\n運勢: ${JSON.stringify(d.rangeDataB||{})}\n\n相談: ${d.consultation||"二人の相性について"}`;
  }
  return `<現在の日時>\n${today}\n\n【個人鑑定】\nお名前: ${d.name||"（名前なし）"}\n生年月日: ${d.birthDate||"不明"}\n命式: ${JSON.stringify(d.meishiki)}\n運勢: ${JSON.stringify(d.rangeData||{})}\n\n相談: ${d.consultation||"全体運について"}`;
}

function buildFileParts() {
  return SANMEI_FILES.map(fileId => ({
    fileData: {
      fileUri: `https://generativelanguage.googleapis.com/v1beta/${fileId}`
    }
  }));
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({error: "Method Not Allowed"}), {status: 405});
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({error: "GEMINI_API_KEY未設定"}), {status: 500});

  let d;
  try {
    d = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({error: "リクエスト形式エラー"}), {status: 400});
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        ...buildFileParts(),
        {text: buildPrompt(d)}
      ]
    }],
    systemInstruction: {parts: [{text: SYSTEM_INSTRUCTION}]},
    generationConfig: {temperature: 0.7}
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // 即座に挨拶を送信してタイムアウトをリセット
      controller.enqueue(enc.encode("ただいま命式を拝見しております。少々お待ちください...\n\n"));

      const geminiRes = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body
      });

      if (!geminiRes.ok) {
        const e = await geminiRes.json();
        controller.enqueue(enc.encode(`エラー: ${e?.error?.message || "Gemini APIエラー"}`));
        controller.close();
        return;
      }

      const reader = geminiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
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
      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
