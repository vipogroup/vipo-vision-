<div align="center">

# 🎬 VIPO Vision

### מערכת ניהול מצלמות חכמה עם GPU-Accelerated Streaming

[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)]()
[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)]()

</div>

---

## ✨ מה זה VIPO Vision?

מערכת ניהול מצלמות אבטחה שרצה על המחשב שלך.  
צפייה בזמן אמת, הקלטה, זיהוי מצלמות אוטומטי — הכל מהדפדפן.

- **🚀 NVENC GPU Encoding** — קידוד וידאו מהיר על NVIDIA GPU
- **📺 Low-Latency HLS** — סטרימינג עם latency של שנייה
- **🔄 Auto Recovery** — זיהוי סטרים תקוע + restart אוטומטי
- **🔍 Auto Discovery** — מזהה מצלמות ברשת אוטומטית (ONVIF, RTSP, HTTP)
- **🎮 PTZ Control** — שליטה במצלמות עם Pan/Tilt/Zoom
- **💾 Recording** — הקלטה לדיסק מקומי
- **📱 PWA** — עובד כאפליקציה בטלפון ובמחשב
- **🔄 Auto Update** — מתעדכן אוטומטית מ-GitHub

---

## 🖥️ התקנה בלחיצה אחת

פתח **PowerShell כ-Administrator** והרץ:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/vipogroup/vipo-vision-/main/install.ps1 | iex"
```

**מה קורה אוטומטית:**
1. מוריד את הקוד מ-GitHub
2. מתקין את כל התלויות
3. בונה את הממשק
4. מתקין כשירות Windows (עולה אוטומטית עם המחשב)
5. יוצר קיצור דרך בדסקטופ
6. פותח את הדשבורד בדפדפן

**אחרי ההתקנה — פתח:**
```
http://localhost:5055
```

---

## 📋 דרישות מערכת

| רכיב | נדרש | הערות |
|-------|-------|-------|
| **Windows** | 10/11 | 64-bit |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Git** | כלשהו | [git-scm.com](https://git-scm.com/) |
| **FFmpeg** | 6+ | [ffmpeg.org](https://ffmpeg.org/) — חייב להיות ב-PATH |
| **NVIDIA GPU** | אופציונלי | ל-NVENC encoding מהיר (נפילה אוטומטית ל-CPU) |

---

## 🌐 גישה מרחוק

אחרי ההתקנה, כל מחשב או טלפון **באותה רשת** יכול לגשת:

```
http://<IP-של-המחשב>:5055
```

לא צריך להתקין כלום — פשוט לפתוח בדפדפן.  
הדפדפן יציע גם "להתקין כאפליקציה" (PWA).

---

## 🔧 פקודות ניהול

| פעולה | פקודה |
|-------|-------|
| הפעלה ידנית | לחיצה כפולה על `VIPO Vision` בדסקטופ |
| עצירת השירות | `Stop-Service "VIPO Vision"` |
| הפעלת השירות | `Start-Service "VIPO Vision"` |
| בדיקת סטטוס | `Get-Service "VIPO Vision"` |
| הסרת השירות | `node install-service.js remove` |
| עדכון ידני | `POST http://localhost:5055/api/update/check` |

---

## 📡 API Endpoints

| Endpoint | תיאור |
|----------|--------|
| `GET /api/health` | סטטוס המערכת |
| `GET /api/cameras` | רשימת מצלמות |
| `GET /api/streams/status` | סטטוס סטרימים |
| `GET /api/streams/diagnostics` | דיאגנוסטיקה מפורטת (כולל health monitor) |
| `GET /api/update/status` | סטטוס עדכונים אוטומטיים |
| `POST /api/update/check` | בדיקת עדכון ידנית |

---

## 📄 License

MIT

---

<div align="center">

**Built with ❤️ by VIPO Group**

</div>
