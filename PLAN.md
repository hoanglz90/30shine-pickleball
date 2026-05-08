# 30Shine PickleBall Club — Plan & Architecture

## Tổng quan
App quản lý tỷ số, xếp hạng, quỹ nhóm pickleball nội bộ 30Shine.
Nhóm 6 người cố định, chơi 1-2 buổi/tuần.

**Live**: https://hoanglz90.github.io/30shine-pickleball/
**Repo**: https://github.com/hoanglz90/30shine-pickleball
**Google Sheet**: https://docs.google.com/spreadsheets/d/1CR8zeeEU5arddROKvjKwzB3NHGDhdBATCWo8_gY4CDQ/

---

## Kiến trúc

| Hạng mục | Công nghệ | Ghi chú |
|----------|-----------|---------|
| Frontend | Vanilla HTML/CSS/JS (single file) | Không framework, không build step |
| Backend | Google Apps Script (GAS) | REST API, doGet/doPost |
| Database | Google Sheets (5 tabs) | Members, Sessions, Matches, Fund_Transactions, Config |
| Deploy | GitHub Pages | Auto-deploy via Actions workflow |
| Cache | localStorage (5 phút TTL) | Offline fallback + fund data persist |

---

## File Structure

```
Du_An_Ca_Nhan/PickleBall/
├── index.html                    # Main SPA (~3500 dòng, CSS+JS embedded)
├── apps-script/
│   └── Code.gs                   # Google Apps Script backend
├── .github/workflows/
│   └── deploy.yml                # GitHub Pages auto-deploy
├── PLAN.md                       # File này
└── README.md                     # Hướng dẫn setup & sử dụng
```

---

## Thành viên & Phân quyền

| Tên | Role | PIN | Quyền |
|-----|------|-----|-------|
| Trung Béo | Admin | 2222 | Xác nhận CK, ghi chi, sửa thành viên, sửa quy chế, xóa trận hôm nay, hoàn tác |
| Hoàng BD | Member | 1234 | Ghi trận, báo CK, xem thống kê |
| Hoàng | Member | 1234 | Như trên |
| Huyền | Member | 1234 | Như trên |
| Oanh | Member | 1234 | Như trên |
| Hà | Member | 1234 | Như trên |

Session login lưu 7 ngày, sau đó cần nhập lại PIN.

---

## UI — 5 Tabs (Admin thấy 5, Member thấy 4)

### Tab 1: Hôm nay
- Session card (ngày, quỹ buổi, số trận, có mặt)
- Attendance chips (toggle tên) + nút Khách mời
- Nút "+ Ghi trận mới" → Modal ghi trận
- Nút "Recap" → tạo text copy vào Zalo
- Danh sách trận hôm nay + lịch sử theo ngày
- Xóa trận: chỉ admin, chỉ trận hôm nay

### Tab 2: Bảng vàng
- Filter: Tuần / Tháng / Năm / Tất cả
- Top 3 podium
- Bảng xếp hạng (thắng, thua, % win, tổng trận)
- Chú thích: W = Thắng, L = Thua, % win = Tỷ lệ thắng
- 8 danh hiệu tự động

### Tab 3: Quỹ
- Số dư = Tồn đầu + Đã thu (CK donation) - Đã chi
- Thua độ: tracking riêng, KHÔNG ảnh hưởng quỹ
- 2 luồng chờ xác nhận:
  - 🎰 Thua độ · chờ xác nhận (Admin bấm "Đã xong")
  - 💳 Chuyển khoản · chờ xác nhận (Admin bấm "Đã nhận")
- Lịch sử thu (admin có nút hoàn tác ↩)
- Lịch sử chi
- Nhật ký thay đổi (minh bạch, public)
- QR ngân hàng MB Bank

### Tab 4: Quy chế & Hướng dẫn
- Nội quy nhóm (admin sửa được):
  - Địa điểm: 107 Ngụy Như Kon Tum
  - Thời gian: 19h-22h Thứ 4 hàng tuần
  - Phí: 1tr/tháng, đánh ít 500k
  - Quy định báo trước, độ 100% vào quỹ
- Hướng dẫn sử dụng app
- Giải thích danh hiệu
- Nút đăng xuất

### Tab 5: Admin (chỉ admin thấy)
- Tồn đầu quỹ (nhập/sửa)
- Quản lý thành viên (thêm/đổi tên/xóa)
- Ghi khoản chi
- Sửa quy chế (free text)
- Thông tin ngân hàng
- Đăng xuất

---

## Logic Quỹ (quan trọng!)

```
Quỹ tăng (+): chỉ khi admin xác nhận CK nộp quỹ/donate
Quỹ giảm (-): chỉ khi admin ghi chi
Thua độ:      tracking riêng, "Đã xong" = settle xong, KHÔNG cộng/trừ quỹ
Số dư = Tồn đầu + Tổng thu (donation confirmed) - Tổng chi (expense)
```

---

## Hệ thống danh hiệu

| Danh hiệu | Icon | Điều kiện |
|-----------|------|----------|
| Vua trận | 👑 | Nhiều trận nhất kỳ |
| Chuỗi Bất Bại | 🔥 | Win streak ≥ 3 |
| Chuỗi Thất Bại | 🥶 | Loss streak ≥ 3 |
| Cặp đôi vàng | 💎 | Cặp doubles win rate cao nhất (≥3 trận) |
| Cạ Cứng | 🤝 | Cặp đánh chung nhiều nhất |
| Mạnh thường quân | 💵 | Tổng đóng góp nhiều nhất (mọi loại) |
| Khắc tinh | 👿 | Thắng 1 đối thủ ≥70% (≥3 trận) |
| Tướng gà | 🐔 | Thua nhiều nhất kỳ |

---

## Google Sheets Schema

### Members
| id | name | role | status | join_date | avatar_emoji |

### Matches
| match_id | session_date | type | team_a | team_b | scores | winner | best_of | bet_amount | recorded_by | created_at |

### Fund_Transactions
| tx_id | date | member | amount | type | status | match_id | note | confirmed_by | confirmed_at |

- type: `match_fee` (thua độ), `donation` (nộp quỹ), `expense` (chi)
- status: `pending` → `reported` → `confirmed`

### Sessions
| session_id | date | attendees | notes | created_by |

### Config
| key | value | (bank_name, bank_account, account_holder, default_bet)

---

## API Endpoints (Google Apps Script)

### GET
- `?action=getMembers`
- `?action=getMatches&filter=today|month|all`
- `?action=getLeaderboard&period=week|month|year|all`
- `?action=getFund`
- `?action=getBadges&period=month|all`
- `?action=getConfig`

### POST (body JSON)
- `recordMatch` — ghi trận + auto tạo fund tx cho đội thua
- `deleteMatch` — admin only
- `reportPayment` — member báo CK
- `confirmPayment` — admin xác nhận
- `addGuest` — thêm khách/thành viên
- `updateAttendance` — cập nhật có mặt

---

## Ngân hàng
- MB Bank
- STK: 5000199991996
- Chủ TK: NGUYEN THANH TRUNG
- QR tự generate từ VietQR API

---

## Ghi chú kỹ thuật

### localStorage keys
- `pb_user` — session user {name, role}
- `pb_login_ts` — timestamp login (session 7 ngày)
- `pb_members` — local member list
- `pb_config` — bank config
- `pb_fund_txs` — fund transactions (persist)
- `pb_fund_init` — tồn đầu quỹ
- `pb_all_matches` — lịch sử trận đấu
- `pb_quyche` — nội dung quy chế
- `pb_audit_log` — nhật ký admin actions
- `pb_guest_date` — ngày cuối có khách (auto-clear)

### Concurrency
- GAS dùng `LockService.getScriptLock()` cho mọi write operation
- Frontend dùng localStorage cache 5 phút TTL

### Khách mời
- Thêm qua nút "+ Khách mời" trong attendance
- Tồn tại trong ngày, qua ngày tự xóa
- Không thống kê vào bảng xếp hạng
- Thua độ: không tạo fund transaction

---

## Cần cải thiện (TODO)

- [ ] Sync localStorage ↔ Google Sheets 2 chiều
- [ ] Profile chi tiết khi tap tên trong bảng xếp hạng
- [ ] Thống kê head-to-head giữa 2 người
- [ ] Push notification khi có trận mới / CK cần duyệt
- [ ] Export báo cáo tháng PDF
- [ ] Dark mode
