// OCR helper for tools/wpp.py — do not run by hand, wpp.py compiles and drives it.
//
//   wpp_ocr <image> [<image>…]
//
// Prints one TSV row per line of text Apple's Vision framework finds in each image:
//   path  minX  minY  width  height  confidence  text
// Boxes are normalized to the image (0–1) with the origin at the bottom-left, which is
// how Vision reports them; wpp.py does all the filtering and counting.
import Foundation
import Vision
import AppKit

let paths = CommandLine.arguments.dropFirst()
if paths.isEmpty {
    FileHandle.standardError.write("usage: wpp_ocr <image> [<image>…]\n".data(using: .utf8)!)
    exit(2)
}
for path in paths {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        FileHandle.standardError.write("cannot load \(path)\n".data(using: .utf8)!)
        continue
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false   // keep the printed words, not Vision's guesses
    req.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch {
        FileHandle.standardError.write("ocr failed \(path): \(error)\n".data(using: .utf8)!)
        continue
    }
    for obs in req.results ?? [] {
        guard let top = obs.topCandidates(1).first else { continue }
        let b = obs.boundingBox
        let text = top.string
            .replacingOccurrences(of: "\t", with: " ")
            .replacingOccurrences(of: "\n", with: " ")
        print("\(path)\t\(b.minX)\t\(b.minY)\t\(b.width)\t\(b.height)\t\(top.confidence)\t\(text)")
    }
}
