# 🔮 Rain2 - Discord Quest Auto Completer (Safe Edition)

Công cụ tự động nhận (Accept/Enroll) và hoàn thành 100% tiến độ tất cả nhiệm vụ **Discord Quests** (Xem Video, Chơi Game Desktop/Console/Mobile, Stream...) với giao diện bảng điều khiển trực tiếp (Live CLI Dashboard).

> 🛡️ **An toàn Anti-Cheat**: Tool chỉ chạy hoàn thành 100% tiến độ nhiệm vụ và **KHÔNG tự động bấm Nhận Thưởng (Claim Reward)** qua API để tránh hCaptcha và hệ thống phát hiện gian lận của Discord. Sau khi tool báo `DONE`, bạn chỉ cần vào ứng dụng Discord bấm nút **Nhận Phần Thưởng** bằng tay.

---

## ✨ Tính năng nổi bật
- 🚀 **Tự động lấy Token (1-Click)**: Tự động trích xuất Token từ ứng dụng **Discord Desktop** đang mở trên máy nếu bạn chưa điền vào file `.env`.
- 🎬 **Hỗ trợ mọi loại nhiệm vụ**:
  - `WATCH_VIDEO` / `WATCH_VIDEO_ON_MOBILE` (tự động tính bù thời gian thực khi chạy tiếp video đang xem dở).
  - `PLAY_ON_DESKTOP` / `PLAY_ON_DESKTOP_V2` / `PLAY_ON_CONSOLE` / `PLAY_ON_MOBILE`.
  - `WATCH_STREAM` / `STREAM_ON_DESKTOP` / `PLAY_ACTIVITY`.
- 🚫 **Lọc nhiệm vụ thông minh**: Tự động bỏ qua các nhiệm vụ đã hết hạn (`Expired`) hoặc đã nhận thưởng (`Claimed`), tự động nhận (`Enroll`) các nhiệm vụ mới chưa bấm nhận.
- 📊 **Giao diện Live Dashboard**: Hiển thị tên tài khoản, số dư Orbs hiện tại, thời gian đếm ngược và thanh tiến độ trực quan.

---

## 🛠️ Yêu cầu cài đặt
- Đã cài đặt **[Node.js](https://nodejs.org/)** (phiên bản `18` trở lên).
- Hệ điều hành Windows (để sử dụng `run.bat` và tính năng tự động lấy Token từ Discord Desktop).

---

## 🚀 Hướng dẫn sử dụng

### Cách 1: Tự động 100% (Khuyên dùng)
1. Tải giải nén (hoặc `git clone`) thư mục này về máy.
2. Mở sẵn ứng dụng **Discord Desktop** trên máy tính và đăng nhập tài khoản của bạn.
3. Bấm đúp vào file **`run.bat`**.
   - Lần đầu tiên chạy, tool sẽ tự động cài đặt thư viện (`npm install`), tự động kết nối với Discord Desktop để lấy Token lưu vào file `.env` trên máy của bạn và bắt đầu cày toàn bộ nhiệm vụ!

### Cách 2: Nhập Token thủ công
1. Mở file `.env` (hoặc copy/đổi tên `.env.example` thành `.env`).
2. Thay chữ `your_token_account_discord` bằng Token Discord của bạn:
   ```env
   TOKEN=dan_token_discord_cua_ban_vao_day
   ```
   <details>
   <summary>👉 Xem hướng dẫn 7 bước lấy Token Discord thủ công qua trình duyệt Web</summary>

   1. Mở trình duyệt (**Chrome**, **Edge**...), truy cập `https://discord.com/app` và đăng nhập tài khoản Discord.
   2. Nhấn phím **`F12`** (hoặc **`Ctrl + Shift + I`**) để mở **DevTools**.
   3. Chuyển sang tab **Network**.
   4. Ở ô **Filter**, gõ `/api`, sau đó nhấn **`F5`** tải lại trang (hoặc bấm vào một kênh chat bất kỳ).
   5. Chọn 1 dòng kết nối bất kỳ trong danh sách (ví dụ: `quests`, `@me`, `science`...).
   6. Ở khung bên phải chọn tab **Headers** -> cuộn xuống mục **Request Headers** -> tìm dòng **`authorization`**.
   7. Copy toàn bộ chuỗi ký tự bên cạnh `authorization:` và dán vào file `.env`.

   </details>

3. Bấm đúp vào **`run.bat`** hoặc mở Terminal chạy:
   ```bash
   npm install
   npm run go
   ```

---

## 🔒 Lưu ý bảo mật
- Token của bạn chỉ được lưu cục bộ tại file `.env` ngay trên máy tính của bạn để đăng nhập vào cổng Discord Gateway/REST.
- File `.gitignore` đã chặn sẵn `.env`, tuyệt đối **không chia sẻ file `.env`** của bạn cho bất kỳ ai.
