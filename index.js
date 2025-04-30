const TelegramBot = require("node-telegram-bot-api");
const { exec } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");
const NodeWebcam = require("node-webcam");

const token =
  process.env.TELEGRAM_BOT_TOKEN ||
  "THAY TOKEN TELEGRAM CỦA BẠN VÀO ĐÂY";
const OWNER_IDS = [ID , ID];  // Thay ID của bạn vào đây (có thể là nhiều ID)
const STATE_FILE = "state.json";
const WALLPAPER_DIR = path.join("D:", "maitrungluan", "wallpapers"); 
const IMAGE_VIDEO_DIR = path.join("D:", "maitrungluan", "img_video");
const NIRCMD_PATH = path.join("D:", "maitrungluan", "nircmd.exe");

const bot = new TelegramBot(token, { polling: true });

if (!fs.existsSync(WALLPAPER_DIR)) fs.mkdirSync(WALLPAPER_DIR, { recursive: true });
if (!fs.existsSync(IMAGE_VIDEO_DIR)) fs.mkdirSync(IMAGE_VIDEO_DIR, { recursive: true });

let monitoring = false;
let monitoringInterval = null;
let pendingWallpaperChange = false;
let lastCommandTimes = {};

if (!fs.existsSync(NIRCMD_PATH)) {
  console.warn("⚠️ Không tìm thấy nircmd.exe. Một số chức năng sẽ không hoạt động.");
}

// --- Load & Save State ---
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
}
let commandsExecuted = loadState();

function sendLog(message) {
  OWNER_IDS.forEach((id) => bot.sendMessage(id, `📋 ${message}`));
  fs.appendFileSync(
    "bot_logs.txt",
    `${new Date().toISOString()} - ${message}\n`
  );
}

function resetCommandState(command, delay = 1000) {
  setTimeout(() => {
    commandsExecuted[command] = false;
    saveState(commandsExecuted);
    sendLog(`⚙️ Lệnh ${command} đã sẵn sàng sử dụng lại`);
  }, delay);
}

// --- Hỗ trợ tải ảnh ---
function downloadImage(url, filepath, callback) {
  const file = fs.createWriteStream(filepath);
  https.get(url, (res) => {
    res.pipe(file);
    file.on("finish", () => {
      file.close(callback);
    });
  });
}

// --- Giao diện lệnh ---
bot.setMyCommands([
  { command: "shutdown", description: "Tắt máy tính" },
  { command: "restart", description: "Khởi động lại máy tính" },
  { command: "lock", description: "Khóa máy tính" },
  { command: "volume_up", description: "Tăng âm lượng" },
  { command: "volume_down", description: "Giảm âm lượng" },
  { command: "mute", description: "Tắt tiếng máy tính" },
  { command: "screenshot", description: "Chụp ảnh màn hình" },
  { command: "webcam", description: "Chụp ảnh từ webcam" },
  { command: "record_video", description: "Quay video 60 giây" },
  { command: "borrow_mode", description: "Bật theo dõi mượn máy" },
  { command: "stop_borrow_mode", description: "Tắt theo dõi mượn máy" },
  { command: "set_wallpaper", description: "Đặt ảnh nền từ ảnh gửi lên" },
  { command: "status", description: "Kiểm tra trạng thái" },
]);

// --- Giám sát mượn máy ---
function startMonitoring() {
  if (monitoring) return;
  monitoring = true;
  sendLog("🚨 Bật theo dõi mượn máy");
  bot.sendMessage(OWNER_IDS[0], "🔒 Đã bật chế độ theo dõi mượn máy");

  monitoringInterval = setInterval(() => {
    exec("tasklist", (err, stdout) => {
      if (stdout.toLowerCase().includes("chrome.exe")) {
        sendLog("⚠️ Phát hiện mở Chrome!");
      }
      if (
        stdout.toLowerCase().includes("cmd.exe") ||
        stdout.toLowerCase().includes("taskmgr.exe")
      ) {
        sendLog("⚠️ Có dấu hiệu sử dụng cmd hoặc Task Manager");
      }
    });

    const watchPath = path.join("D:", "download");
    fs.readdir(watchPath, (err, files) => {
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
  bot.sendMessage(OWNER_IDS[0], "🔓 Đã tắt chế độ theo dõi mượn máy");
  sendLog("🛑 Tắt theo dõi mượn máy");
}

// --- Thay ảnh nền ---
function changeWallpaper(imagePath) {
  exec(
    `reg add "HKCU\\Control Panel\\Desktop" /v Wallpaper /t REG_SZ /d "${imagePath}" /f && RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters`,
    (err) => {
      if (err) sendLog("❌ Lỗi thay ảnh nền");
      else sendLog("🖼️ Đã thay ảnh nền thành công!");
    }
  );
}

// --- Xử lý tin nhắn ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!OWNER_IDS.includes(chatId)) return bot.sendMessage(chatId, "⛔ Không có quyền!");
  if (msg.date && Math.abs(Date.now() / 1000 - msg.date) > 5) return;

  if (pendingWallpaperChange) {
    if (msg.photo && msg.photo.length > 0) {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      try {
        const fileUrl = await bot.getFileLink(photoId);
        const savePath = path.join(WALLPAPER_DIR, `wallpaper_${Date.now()}.jpg`);
        downloadImage(fileUrl, savePath, () => {
          changeWallpaper(savePath);
          pendingWallpaperChange = false;
        });
      } catch (e) {
        bot.sendMessage(chatId, "❌ Không thể tải ảnh");
        pendingWallpaperChange = false;
      }
    } else {
      bot.sendMessage(chatId, "❌ Vui lòng gửi ảnh!");
    }
    return;
  }

  const text = msg.text;
  const screenshotPath = path.join(IMAGE_VIDEO_DIR, "screenshot.png");
  const webcamPath = path.join(IMAGE_VIDEO_DIR, "webcam.jpg");

  switch (text) {
    case "/status":
      bot.sendMessage(chatId, "✅ Máy đang hoạt động!");
      break;

    case "/shutdown":
      if (!commandsExecuted.shutdown) {
        commandsExecuted.shutdown = true;
        saveState(commandsExecuted);
        bot.sendMessage(chatId, "💀 Đang tắt máy...");
        exec("shutdown /s /f /t 0");
      } else {
        bot.sendMessage(chatId, "⛔ Lệnh shutdown đã thực hiện trước đó!");
      }
      break;

    case "/restart":
      if (!commandsExecuted.restart) {
        commandsExecuted.restart = true;
        saveState(commandsExecuted);
        bot.sendMessage(chatId, "🔄 Đang khởi động lại...");
        exec("shutdown /r /f /t 0");
      } else {
        bot.sendMessage(chatId, "⛔ Lệnh restart đã thực hiện trước đó!");
      }
      break;

    case "/lock":
      if (!commandsExecuted.lock) {
        commandsExecuted.lock = true;
        saveState(commandsExecuted);
        bot.sendMessage(chatId, "🔒 Đang khóa máy...");
        exec("rundll32.exe user32.dll,LockWorkStation");
        resetCommandState("lock", 4000);
      } else {
        bot.sendMessage(chatId, "⛔ Lệnh lock đã thực hiện trước đó!");
      }
      break;

    case "/screenshot":
      if (!commandsExecuted.screenshot && fs.existsSync(NIRCMD_PATH)) {
        bot.sendMessage(chatId, "📸 Đang chụp màn hình...");
        exec(`${NIRCMD_PATH} savescreenshot "${screenshotPath}"`, () => {
          bot.sendPhoto(chatId, screenshotPath);
          commandsExecuted.screenshot = true;
          saveState(commandsExecuted);
          resetCommandState("screenshot", 4000);
        });
      } else {
        bot.sendMessage(chatId, "⛔ Không thể chụp màn hình hoặc đã thực hiện trước đó!");
      }
      break;

    case "/webcam":
      if (!commandsExecuted.webcam) {
        bot.sendMessage(chatId, "📷 Đang mở webcam...");
        const Webcam = NodeWebcam.create({
          width: 1280,
          height: 720,
          quality: 100,
          output: "jpeg",
          callbackReturn: "location",
        });
        Webcam.capture(webcamPath, (err, data) => {
          if (err) {
            bot.sendMessage(chatId, "❌ Không thể chụp ảnh webcam");
            return;
          }
          bot.sendPhoto(chatId, data);
          commandsExecuted.webcam = true;
          saveState(commandsExecuted);
          resetCommandState("webcam", 4000);
        });
      } else {
        bot.sendMessage(chatId, "⛔ Lệnh webcam đã thực hiện trước đó!");
      }
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

    case "/borrow_mode":
      if (!commandsExecuted.borrow_mode) {
        startMonitoring();
        commandsExecuted.borrow_mode = true;
        saveState(commandsExecuted);
        resetCommandState("borrow_mode");
      } else {
        bot.sendMessage(chatId, "⛔ Chế độ theo dõi đã bật!");
      }
      break;

    case "/stop_borrow_mode":
      if (!commandsExecuted.stop_borrow_mode) {
        stopMonitoring();
        commandsExecuted.stop_borrow_mode = true;
        saveState(commandsExecuted);
        resetCommandState("stop_borrow_mode");
      } else {
        bot.sendMessage(chatId, "⛔ Chế độ theo dõi đã tắt!");
      }
      break;

    case "/set_wallpaper":
      pendingWallpaperChange = true;
      bot.sendMessage(chatId, "🖼️ Gửi ảnh bạn muốn đặt làm nền trong vòng 10s!");
      break;

    case "/record_video":
      if (!commandsExecuted.record_video) {
        commandsExecuted.record_video = true;
        saveState(commandsExecuted);

        const videoPath = path.join(
          IMAGE_VIDEO_DIR,
          `video_${Date.now()}.mp4`
        );

        bot.sendMessage(chatId, "🎥 Đang quay video webcam trong 60 giây...");

        const cameraName = "Integrated Camera"; // <-- Cần thay bằng tên thiết bị nếu khác
        const cmd = `ffmpeg -f dshow -i video="${cameraName}" -t 60 -y "${videoPath}"`;

        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            bot.sendMessage(chatId, "❌ Lỗi khi quay video hoặc không nhận diện được webcam.");
            console.error(stderr);
          } else {
            bot.sendVideo(chatId, videoPath);
            sendLog("📹 Đã quay xong video webcam và gửi về Telegram");
          }
          commandsExecuted.record_video = false;
          saveState(commandsExecuted);
        });
      } else {
        bot.sendMessage(chatId, "⛔ Đang quay hoặc đã thực hiện trước đó!");
      }
      break;

    default:
      bot.sendMessage(chatId, "❓ Lệnh không hợp lệ hoặc đã xử lý gần đây.");
  }
});
