// Lists every run of a PDF's text with its font, one per line: page, size, B/I/BI (or nothing),
// baseline offset and the text (newlines written \n). The committee-report PDFs carry the sizes and
// styles that separate headings, notes, note numbers and italics. macOS only (PDFKit):
//
//   swiftc -O -o pdf-runs scripts/pdf-runs.swift
//   ./pdf-runs report.pdf 2>/dev/null > creation-runs.tsv
import AppKit
import PDFKit

let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
func esc(_ s: String) -> String {
    s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\t", with: "\\t").replacingOccurrences(of: "\n", with: "\\n")
}
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i), let a = page.attributedString else { continue }
    let s = a.string as NSString
    a.enumerateAttributes(in: NSRange(location: 0, length: a.length)) { attrs, r, _ in
        let f = attrs[.font] as? NSFont
        let off = (attrs[.baselineOffset] as? NSNumber)?.doubleValue ?? 0
        let n = f?.fontName ?? ""
        let kind = (n.contains("Bold") ? "B" : "") + (n.contains("Italic") ? "I" : "")
        print("\(i + 1)\t\(String(format: "%.1f", f?.pointSize ?? 0))\t\(kind)\t\(off)\t" + esc(s.substring(with: r)))
    }
}
