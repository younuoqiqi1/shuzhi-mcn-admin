import Foundation
import Vision
import AppKit

struct OCRItem: Codable {
    let text: String
    let confidence: Float
    let bbox: [Double] // [normX, normY, normW, normH] top-left normalized
    let is_bottom_subtitle: Bool
}

struct SingleImageOCRResult: Codable {
    let image_path: String
    let status: String // "success", "blank", "error"
    let items: [OCRItem]
    let subtitle_text: String
    let full_text: String
    let error_msg: String?
}

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: vision_ocr <image_path_1> [image_path_2 ...]\n", stderr)
    exit(1)
}

let imagePaths = Array(CommandLine.arguments.dropFirst())
var results: [SingleImageOCRResult] = []

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false

for imagePath in imagePaths {
    let fileURL = URL(fileURLWithPath: imagePath)
    guard let image = NSImage(contentsOf: fileURL),
          let tiffData = image.tiffRepresentation,
          let bitmapImage = NSBitmapImageRep(data: tiffData),
          let cgImage = bitmapImage.cgImage else {
        results.append(SingleImageOCRResult(
            image_path: imagePath,
            status: "error",
            items: [],
            subtitle_text: "",
            full_text: "",
            error_msg: "Failed to load image or convert to CGImage"
        ))
        continue
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        results.append(SingleImageOCRResult(
            image_path: imagePath,
            status: "error",
            items: [],
            subtitle_text: "",
            full_text: "",
            error_msg: error.localizedDescription
        ))
        continue
    }

    var items: [OCRItem] = []
    var subtitleTokens: [String] = []
    var allTokens: [String] = []

    if let observations = request.results {
        for obs in observations {
            guard let candidate = obs.topCandidates(1).first else { continue }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }

            let conf = candidate.confidence
            let normX = Double(obs.boundingBox.origin.x)
            let normY = Double(1.0 - obs.boundingBox.origin.y - obs.boundingBox.size.height)
            let normW = Double(obs.boundingBox.size.width)
            let normH = Double(obs.boundingBox.size.height)

            // 底部 ROI 判定
            let isBottom = (normY >= 0.70 && normY <= 0.98) && (normX >= 0.05 && (normX + normW) <= 0.98)

            items.append(OCRItem(
                text: text,
                confidence: conf,
                bbox: [normX, normY, normW, normH],
                is_bottom_subtitle: isBottom
            ))

            allTokens.append(text)
            if isBottom {
                subtitleTokens.append(text)
            }
        }
    }

    let status = items.isEmpty ? "blank" : "success"
    results.append(SingleImageOCRResult(
        image_path: imagePath,
        status: status,
        items: items,
        subtitle_text: subtitleTokens.joined(separator: " "),
        full_text: allTokens.joined(separator: " "),
        error_msg: nil
    ))
}

let encoder = JSONEncoder()
encoder.outputFormatting = .prettyPrinted
if let jsonData = try? encoder.encode(results),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("[]")
}
