' Convierte un .xls antiguo a .xlsx (solo para la demo local): cscript //nologo xls-a-xlsx.vbs entrada.xls salida.xlsx
Set xl = CreateObject("Excel.Application")
xl.DisplayAlerts = False
Set wb = xl.Workbooks.Open(WScript.Arguments(0), 0, True)
wb.SaveAs WScript.Arguments(1), 51
wb.Close False
xl.Quit
