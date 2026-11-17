' Solo desarrollo: convierte una hoja de un .xlsx a PDF con Excel local (en producción lo hace Google Sheets).
' Uso: cscript //nologo xlsx-a-pdf.vbs <entrada.xlsx> <salida.pdf> <n hoja 1..n>
Set xl = CreateObject("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
Set wb = xl.Workbooks.Open(WScript.Arguments(0), 0, True)
wb.Worksheets(CInt(WScript.Arguments(2))).ExportAsFixedFormat 0, WScript.Arguments(1)
wb.Close False
xl.Quit
WScript.Echo "ok"
