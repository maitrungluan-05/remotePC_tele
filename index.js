// == TELEGRAM BOT: Điều khiển máy tính từ xa ==
const TelegramBot = require("node-telegram-bot-api");
const { exec } = require("child_process");
const fs = require("fs");
const NodeWebcam = require("node-webcam");
const path = require("path");

const token = process.env.TELEGRAM_BOT_TOKEN || "7161920088:AAHbueHOVCdNsBSa1Cs6HaLgN102vueMTFs";
const OWNER_IDS = [6687413975, 111111]; // <-- sửa ID tại đây
const WALLPAPER_DIR = "D:\\maitrungluan\\wallpapers";
const IMAGE_VIDEO_DIR = "D:\\maitrungluan\\img_video";
const NIRCMD_PATH = "D:\\maitrungluan\\nircmd.exe";

const bot = new TelegramBot(token, { polling: true });

let monitoring = false;
let monitoringInterval = null;
let pendingWallpaperChange = false;
const COMMAND_COOLDOWN = 5 * 1000; // 5 giây
let lastCommandTimes = {};

if (!fs.existsSync(NIRCMD_PATH)) {
  console.warn("⚠️ Không tìm thấy nircmd.exe. Một số chức năng sẽ không hoạt động.");
}

function sendLog(message) {
  OWNER_IDS.forEach((id) => bot.sendMessage(id, `📋 ${message}`));
  fs.appendFileSync("bot_logs.txt", `${new Date().toISOString()} - ${message}\n`);
}

function isRecentMessage(msg) {
  const now = Date.now();
  const msgDate = msg.date * 1000;
  return (now - msgDate) <= COMMAND_COOLDOWN;
}

function isCoolingDown(command) {
  const now = Date.now();
  const last = lastCommandTimes[command] || 0;
  return (now - last) < COMMAND_COOLDOWN;
}

function markCommandExecuted(command) {
  lastCommandTimes[command] = Date.now();
}

function startMonitoring() {
  if (monitoring) return;
  monitoring = true;
  sendLog("🚨 Bật theo dõi mượn máy");

  monitoringInterval = setInterval(() => {
    exec("tasklist", (err, stdout) => {
      if (stdout.toLowerCase().includes("chrome.exe")) {
        sendLog("⚠️ Phát hiện mở Chrome!");
      }
      if (stdout.toLowerCase().includes("cmd.exe") || stdout.toLowerCase().includes("taskmgr.exe")) {
        sendLog("⚠️ Có dấu hiệu sử dụng cmd hoặc Task Manager");
      }
    });

    fs.readdir("D:\\download", (err, files) => {
      if (!err && files.length > 0) {
        sendLog(`📁 Truy cập D:\\download (${files.length} file)`);
      }
    });
  }, 5000);
}

function stopMonitoring() {
  if (!monitoring) return;
  clearInterval(monitoringInterval);
  monitoring = false;
  sendLog("🛑 Tắt theo dõi mượn máy");
}

function changeWallpaper(imagePath) {
  exec(
    `reg add "HKCU\\Control Panel\\Desktop" /v Wallpaper /t REG_SZ /d "${imagePath}" /f && RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters`,
    (err) => {
      if (err) sendLog("❌ Lỗi thay ảnh nền");
      else sendLog("🖼️ Đã thay ảnh nền thành công!");
    }
  );
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!OWNER_IDS.includes(chatId)) return bot.sendMessage(chatId, "⛔ Không có quyền!");
  if (!isRecentMessage(msg)) return bot.sendMessage(chatId, "⛔ Lệnh quá cũ, vui lòng gửi lại!");

  const screenshotPath = path.join(IMAGE_VIDEO_DIR, "screenshot.png");
  const webcamPath = path.join(IMAGE_VIDEO_DIR, "webcam.jpg");

  if (pendingWallpaperChange) {
    if (msg.photo && msg.photo.length > 0) {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      bot.downloadFile(photoId, WALLPAPER_DIR).then((downloadedPath) => {
        changeWallpaper(downloadedPath);
        pendingWallpaperChange = false;
      }).catch(() => {
        bot.sendMessage(chatId, "❌ Không thể tải ảnh");
        pendingWallpaperChange = false;
      });
    } else {
      bot.sendMessage(chatId, "❌ Vui lòng gửi ảnh!");
    }
    return;
  }

  switch (text) {
    case "/shutdown":
      if (isCoolingDown("shutdown")) return bot.sendMessage(chatId, "⛔ Đã gửi gần đây!");
      markCommandExecuted("shutdown");
      bot.sendMessage(chatId, "💀 Đang tắt máy...");
      exec("shutdown /s /f /t 0");
      break;

    case "/restart":
      if (isCoolingDown("restart")) return bot.sendMessage(chatId, "⛔ Đã gửi gần đây!");
      markCommandExecuted("restart");
      bot.sendMessage(chatId, "🔄 Đang khởi động lại...");
      exec("shutdown /r /f /t 0");
      break;

    case "/lock":
      if (isCoolingDown("lock")) return bot.sendMessage(chatId, "⛔ Đã gửi gần đây!");
      markCommandExecuted("lock");
      exec("rundll32.exe user32.dll,LockWorkStation");
      bot.sendMessage(chatId, "🔒 Đã khóa máy");
      break;

    case "/screenshot":
      if (isCoolingDown("screenshot")) return bot.sendMessage(chatId, "⛔ Gần đây đã chụp!");
      markCommandExecuted("screenshot");
      if (!fs.existsSync(NIRCMD_PATH)) return bot.sendMessage(chatId, "❌ Không có nircmd.exe!");
      exec(`${NIRCMD_PATH} savescreenshot "${screenshotPath}"`, () => {
        bot.sendPhoto(chatId, screenshotPath);
      });
      break;

    case "/webcam":
      if (isCoolingDown("webcam")) return bot.sendMessage(chatId, "⛔ Đã dùng gần đây!");
      markCommandExecuted("webcam");
      const Webcam = NodeWebcam.create({ width: 1280, height: 720, quality: 100, output: "jpeg", callbackReturn: "location" });
      Webcam.capture(webcamPath, (err, data) => {
        if (err) return bot.sendMessage(chatId, "❌ Không thể chụp ảnh webcam");
        bot.sendPhoto(chatId, data);
      });
      break;

    case "/volume_up":
      exec(`${NIRCMD_PATH} changesysvolume 5000`);
      bot.sendMessage(chatId, "🔊 Đã tăng âm lượng");
      break;

    case "/volume_down":
      exec(`${NIRCMD_PATH} changesysvolume -5000`);
      bot.sendMessage(chatId, "🔉 Đã giảm âm lượng");
      break;

    case "/mute":
      exec(`${NIRCMD_PATH} mutesysvolume 1`);
      bot.sendMessage(chatId, "🔇 Đã tắt tiếng");
      break;

    case "/record_video":
      if (isCoolingDown("record_video")) return bot.sendMessage(chatId, "⛔ Đã quay gần đây!");
      markCommandExecuted("record_video");
      const videoPath = path.join(IMAGE_VIDEO_DIR, `video_${Date.now()}.mp4`);
      bot.sendMessage(chatId, "🎥 Đang quay video 60s...");
      exec(`ffmpeg -f dshow -i video=\"Integrated Camera\" -t 60 -y \"${videoPath}\"`, (err) => {
        if (err) return bot.sendMessage(chatId, "❌ Không quay được video");
        bot.sendVideo(chatId, videoPath);
      });
      break;

    case "/borrow_mode":
      if (isCoolingDown("borrow_mode")) return bot.sendMessage(chatId, "⛔ Gần đây đã bật!");
      markCommandExecuted("borrow_mode");
      startMonitoring();
      bot.sendMessage(chatId, "📡 Bật theo dõi");
      break;

    case "/stop_borrow_mode":
      if (isCoolingDown("stop_borrow_mode")) return bot.sendMessage(chatId, "⛔ Gần đây đã tắt!");
      markCommandExecuted("stop_borrow_mode");
      stopMonitoring();
      bot.sendMessage(chatId, "🛑 Đã tắt theo dõi");
      break;

    case "/set_wallpaper":
      pendingWallpaperChange = true;
      bot.sendMessage(chatId, "🖼️ Gửi ảnh để đổi hình nền trong 10s");
      break;

    case "/status":
      bot.sendMessage(chatId, "✅ Máy đang hoạt động!");
      break;

    default:
      bot.sendMessage(chatId, "❓ Lệnh không hợp lệ hoặc đã xử lý trước đó.");
  }
});
