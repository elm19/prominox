import type { IssuedCredentials } from "@/lib/api"

function pdfBlob(issued: IssuedCredentials) {
  const bytes = Uint8Array.from(atob(issued.pdfBase64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: "application/pdf" })
}

export function downloadCredentialsPdf(issued: IssuedCredentials) {
  const url = URL.createObjectURL(pdfBlob(issued))
  const link = document.createElement("a")
  link.href = url
  link.download = issued.pdfFilename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Opens the browser print dialog for the sheet without leaving the page. */
export function printCredentialsPdf(issued: IssuedCredentials) {
  const url = URL.createObjectURL(pdfBlob(issued))
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  frame.src = url
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    // Keep the frame around long enough for the dialog, then clean up
    window.setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }
  document.body.appendChild(frame)
}
