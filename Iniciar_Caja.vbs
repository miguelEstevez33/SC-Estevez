Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Reinicia procesos previos de server.js para asegurar que tome los ultimos cambios
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'node.exe'")

For Each objProcess in colProcesses
    If InStr(LCase(objProcess.CommandLine), "server.js") > 0 Then
        objProcess.Terminate()
    End If
Next

WScript.Sleep 500
WshShell.Run "cmd /c cd /d """ & strPath & """ && node server.js", 0, False
WScript.Sleep 1500

' Abre la aplicacion en ventana limpia (Edge o Chrome)
On Error Resume Next
WshShell.Run "msedge --app=http://localhost:3000", 1, False
If Err.Number <> 0 Then
    WshShell.Run "chrome --app=http://localhost:3000", 1, False
End If