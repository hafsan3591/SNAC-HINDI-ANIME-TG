// api/telegram.js

let userStates = {};

export default async function handler(req, res) {
  // CORS হেডার (ওয়েব অ্যাডমিন প্যানেল থেকে রিকোয়েস্ট আসলে)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).send("OK");

  const body = req.body;

  // ১. ওয়েব অ্যাডমিন প্যানেল থেকে আসা ডেটা
  if (body.webAdmin && body.anime) {
    try {
      await addAnimeToGitHub(body.anime);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ২. টেলিগ্রাম থেকে আসা ডেটা
  const message = body.message;
  if (!message || !message.text) return res.status(200).send("OK");

  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

  if (chatId !== ADMIN_CHAT_ID) {
    return sendMessage(chatId, "❌ আপনি অ্যাডমিন নন।");
  }

  if (text === "/hk") {
    userStates[chatId] = { step: 1, data: {} };
    return sendMessage(chatId, "🎬 নতুন Anime যোগ করা শুরু!\n\n**ধাপ ১:** Anime-এর ID দিন (যেমন: `solo-leveling`)।\n\nবাতিল: /cancel", { parse_mode: "Markdown" });
  }

  if (text === "/cancel") {
    delete userStates[chatId];
    return sendMessage(chatId, "❌ বাতিল করা হয়েছে।");
  }

  if (userStates[chatId]) {
    const state = userStates[chatId];
    const step = state.step;

    if (step === 1) {
      state.data.id = text.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      state.step = 2;
      return sendMessage(chatId, "✅ ID সেভ হয়েছে।\n\n**ধাপ ২:** Anime-এর নাম দিন (Title)।");
    }
    if (step === 2) {
      state.data.title = text; state.data.titleBn = text; state.step = 3;
      return sendMessage(chatId, "✅ নাম সেভ হয়েছে।\n\n**ধাপ ৩:** জেনার দিন (কমা দিয়ে)।");
    }
    if (step === 3) {
      state.data.genre = text.split(",").map(g => g.trim()); state.step = 4;
      return sendMessage(chatId, "✅ জেনার সেভ হয়েছে।\n\n**ধাপ ৪:** বছর দিন (Year)।");
    }
    if (step === 4) {
      state.data.year = parseInt(text) || 2024;
      state.data.language = "Hindi Dubbed";
      state.data.status = "Ongoing";
      state.data.rating = 0; state.data.trending = false; state.data.latest = true;
      state.step = 5;
      return sendMessage(chatId, "✅ বছর সেভ হয়েছে।\n\n**ধাপ ৫:** Poster ইমেজ পাঠান অথবা ইমেজের `https` লিংক দিন।");
    }
    if (step === 5) {
      if (message.photo) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        state.data.poster = await getTelegramFileUrl(fileId);
        state.step = 6;
        return sendMessage(chatId, "✅ ছবি সেভ হয়েছে।\n\n**ধাপ ৬:** Anime-এর Description দিন।");
      } else if (text.startsWith("http")) {
        state.data.poster = text; state.step = 6;
        return sendMessage(chatId, "✅ লিংক সেভ হয়েছে।\n\n**ধাপ ৬:** Anime-এর Description দিন।");
      } else {
        return sendMessage(chatId, "⚠️ শুধু ছবি বা লিংক দিন।");
      }
    }
    if (step === 6) {
      state.data.description = text; state.step = 7;
      return sendMessage(chatId, "✅ সেভ হয়েছে।\n\n**ধাপ ৭ (শেষ):** Telegram পোস্টের লিংক দিন। না থাকলে `skip` লিখুন।");
    }
    if (step === 7) {
      state.data.telegramUrl = text === "skip" ? "https://t.me/SNAC_hindi_anime" : text;
      try {
        await sendMessage(chatId, "⏳ GitHub-এ সেভ হচ্ছে...");
        await addAnimeToGitHub(state.data);
        delete userStates[chatId];
        return sendMessage(chatId, `🎉 সফলভাবে **${state.data.title}** যোগ হয়েছে!\n⏳ ১ মিনিট পর ওয়েবসাইটে দেখা যাবে।`);
      } catch (err) {
        return sendMessage(chatId, `❌ সমস্যা: ${err.message}`);
      }
    }
  }

  return sendMessage(chatId, "🤖 নতুন Anime যোগ করতে /hk দিন।");
}

async function sendMessage(chatId, text, options = {}) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, ...options })
  });
}

async function getTelegramFileUrl(fileId) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  return data.ok ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}` : "";
}

async function addAnimeToGitHub(newAnime) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO; 
  const FILE_PATH = "anime-data.js";
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  const getRes = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }
  });
  if (!getRes.ok) throw new Error("GitHub থেকে ফাইল পড়া যায়নি।");
  
  const fileData = await getRes.json();
  const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
  
  const newAnimeString = JSON.stringify(newAnime, null, 2);
  const updatedContent = content.replace(/const animeList = \[([\s\S]*?)\];/, (match, p1) => {
    const items = p1.trim().endsWith(',') ? p1 : p1 + ',';
    return `const animeList = [${items}\n${newAnimeString}\n];`;
  });

  const updateRes = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
    body: JSON.stringify({
      message: `New anime added: ${newAnime.title}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileData.sha
    })
  });
  if (!updateRes.ok) throw new Error("GitHub-এ ডেটা সেভ করা যায়নি।");
}