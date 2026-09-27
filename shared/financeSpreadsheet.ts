function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`
}

/** Excel 2003 XML. No dependency. Sheet name stays ASCII so older Excel opens it. */
export function financeSheetXml(headers: string[], rows: Array<Array<string | number>>) {
  const head = `<Row>${headers.map((header) => cell(header)).join('')}</Row>`
  const body = rows.map((row) => `<Row>${row.map((value) => cell(value)).join('')}</Row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Finance"><Table>
${head}
${body}
</Table></Worksheet>
</Workbook>`
}

export function saveFinanceSheet(filename: string, xml: string) {
  if (typeof document === 'undefined') return
  const blob = new Blob(['\uFEFF', xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
