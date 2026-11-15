Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Verifica si node.exe ya esta corriendo; si no lo esta, lo inicia oculto
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'node.exe'")

If colProcesses.Count = 0 Then
    WshShell.Run "cmd /c cd /d """ & strPath & """ && node server.js", 0, False
    WScript.Sleep 1500
End If

' Abre la aplicacion en ventana limpia (Edge o Chrome)
On Error Resume Next
WshShell.Run "msedge --app=http://localhost:3000", 1, False
If Err.Number <> 0 Then
    WshShell.Run "chrome --app=http://localhost:3000", 1, False
End If