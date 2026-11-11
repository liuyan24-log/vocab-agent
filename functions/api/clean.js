// 替代 app.py：把前端的单词清洗请求转发给 DeepSeek。
// 路由由文件路径决定：functions/api/clean.js -> POST /api/clean

const PROMPT = `你是一个专业的英语单词数据清洗助手。请从用户提供的脏文本中提取【英文原词】、【音标】和【中文核心释义】。
必须遵守以下规则：
1. 彻底去除序号、长例句、HTML标签以及其他与词条无关的内容。
2. 音标必须保留原文的包裹符号：方括号 [] 或斜杠 //，例如 [ˈprɑfɪtəbəl] 或 /prəˈfɪtəbl/。
3. 如果同时出现英式、美式两套音标，用空格分隔后放在同一列；如果原文没有音标，音标列留空，但不能省略制表符。
4. 必须保留中文释义前面的词性（如 n. v. adj. adv. 等）。
5. 输出格式必须严格为：英文单词<Tab键>音标<Tab键>中文释义，每行一个，共三列。
6. 绝对不要输出任何多余的解释、问候语或代码块标记。
示例：profitable\t[ˈprɑfɪtəbəl]\tadj. 有益的；有利可图的
示例（无音标）：apple\t\tn. 苹果`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function clean(request) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "请求体不是合法的 JSON" }, 400);
  }

  const rawText = data?.text ?? "";
  const provider = data?.provider ?? "deepseek";
  const apiKey = data?.apiKey ?? "";

  if (!rawText) {
    return json({ error: "没有收到文本" }, 400);
  }
  if (!apiKey) {
    return json(
      { error: "未配置 API Key，请点击网页右上角设置进行配置" },
      400,
    );
  }
  if (provider !== "deepseek") {
    return json({ error: "暂不支持此模型" }, 400);
  }

  try {
    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: rawText },
          ],
          temperature: 0.1,
        }),
      },
    );

    const result = await response.json();

    if (result.error) {
      return json(
        { error: `API 报错: ${result.error.message ?? "未知错误"}` },
        400,
      );
    }

    const cleaned = (result.choices?.[0]?.message?.content ?? "")
      .replace("```text\n", "")
      .replace("```\n", "")
      .replace(/```/g, "");

    return json({ result: cleaned });
  } catch (e) {
    console.error("报错详情:", e);
    return json({ error: "后端请求 API 失败，请检查网络或密钥" }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return clean(context.request);
  }
  return json({ error: "Method Not Allowed" }, 405);
}
