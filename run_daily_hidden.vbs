Option Explicit
Dim WshShell, exitCode
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Facebook"
exitCode = WshShell.Run("cmd.exe /c ""D:\Facebook\run_daily.cmd""", 0, True)
WScript.Quit exitCode
