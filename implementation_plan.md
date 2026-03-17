# Pixel Art Processor — App tự động hoá cho Draw by Pixel

Web app chạy 100% client-side, tự động biến ảnh thường/ảnh AI-gen thành pixel art data chuẩn. Thay thế toàn bộ workflow Photoshop. Đóng gói bằng **Electron** để phân phối cài đặt trên Windows.

## Hiểu đúng đầu vào & đầu ra

| | Mô tả |
|---|---|
| **Input** | Ảnh PNG/JPG bất kỳ, có thể đã xoá nền (transparent) hoặc có nền đồng nhất 1 màu |
| **Output** | Ảnh PNG rất nhỏ (VD: 24×24, 52×52, 256×360...) — mỗi pixel = 1 chấm màu chính xác, palette giới hạn |

## Pipeline xử lý

```
Input Image(s) ──→ [1. Remove BG] ──→ [2. Auto Crop] 
                          │
         (Photo Mode = tắt)     (Photo Mode = bật)
[3a. Detect Pixel Grid & Downscale]   [3b. Downscale bằng Target Width]
                          │
                  [4. Median Filter]
                          │
                  [5. Color Quantize] (Có ưu tiên màu đã khóa)
                          │
                  [6. Thêm Outline] (Tùy chọn)
                          │
       [Output] (Export 1 hình hoặc Batch Export ZIP)
```

**Bước 1 — Remove Background:** Xoá nền tự động bằng flood-fill.
**Bước 2 — Auto Crop:** Tìm bounding box của tất cả pixel không-trong-suốt, cắt sát.
**Bước 3 — Mode Xử lý:**
- **Pixel Mode (Mặc định):** Detect kích thước 1 ô pixel và downscale bằng Nearest Neighbor.
- **Photo Mode (Mới):** Bỏ qua detect grid, ép kích thước xuống `Target Width` bằng Bilinear resampling để hình mềm mại.
**Bước 4 — Median Filter:** Khử noise.
**Bước 5 — Color Quantization (Median Cut):** Giảm số màu dựa vào `Max Colors` và giữ lại những màu do user khóa (Locked Colors). Có thể thêm Dithering (Tùy chọn tương lai).
**Bước 6 — Outline (Mới):** Viền 1 pixel quanh nhân vật (màu do user chỉnh).

## Cấu trúc dự án

```
pixel-art-processor/
├── package.json          ← Electron + electron-builder
├── main.js               ← Electron main process
├── preload.js            ← Bridge cho file system
├── src/
│   ├── index.html        ← UI chính (Thêm JSZip CDN)
│   ├── index.css         ← Material 3 dark theme
│   ├── app.js            ← UI controller (Thêm Drag-drop Multiple, Queue, ZIP)
│   └── processor.js      ← Image processing engine (Thêm Outline, Photo Mode)
```

### Thiết kế UI — Material 3

- **Control panel** bổ sung:
  - Checkbox **Chế độ ảnh thường (Photo Mode)**
  - Checkbox **Tạo viền (Outline)** + Color picker
  - Section **Màu được giữ lại (Locked Colors)**
  - Section **Batch Export:**
    - Nút **Thêm ảnh vào danh sách**
    - Input **Tên tiền tố (Prefix)** + Input **Số bắt đầu (Start Index)**
    - Nút **Export ALL (ZIP)**
- M3 components: Filled buttons, sliders, chips, cards, elevated surfaces

### Phân phối

- Cài qua **Electron**, hoặc dùng trực tiếp trên Web (ảnh, JSZip chạy 100% trong trình duyệt).

## Verification Plan

### Automated
- Chạy app, kéo thả ảnh test → kiểm tra output PNG kích thước đúng, palette giới hạn

### Manual (yêu cầu bạn test)
- So sánh output với ảnh xử lý thủ công bằng Photoshop
- Xác nhận dùng được cho Draw by Pixel
