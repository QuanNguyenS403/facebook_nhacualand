@echo off
chcp 65001 >nul
cd /d "D:\Facebook"
echo ======================================================== >> "data\daily_run.log"
echo [%date% %time%] KHOI DONG CONG TY AI AGENT NHA CUA LAND (NHACUALAND.COM - FULL AUTONOMOUS 100%%) >> "data\daily_run.log"
echo ======================================================== >> "data\daily_run.log"
node scripts\company_orchestrator.js >> "data\daily_run.log" 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] HOAN TAT CHU TRINH XUAT BAN TU DONG DA KENH (EXIT=%EXIT_CODE%). >> "data\daily_run.log"
exit /b %EXIT_CODE%
