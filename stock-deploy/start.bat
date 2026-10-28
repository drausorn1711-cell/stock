@echo off
chcp 65001 >nul
title StockMaster - ระบบคลังสินค้า
echo ===================================================
echo       StockMaster - ระบบคลังและจัดการสต็อกสินค้า
echo ===================================================
echo กำลังเริ่มต้นระบบ...
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Node.js ในเครื่อง กรุณาติดตั้ง Node.js ก่อนใช้งาน: https://nodejs.org/
    pause
    exit /b
)

echo เปิดเว็บที่ http://localhost:3000
start http://localhost:3000
node server.js
pause
